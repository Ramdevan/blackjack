import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool;

export async function initDB() {
  try {
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password
    });
    
    const dbName = process.env.DB_NAME || 'blackjack_db';
    
    // Create database if it doesn't exist
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await connection.end();

    // Re-create pool with database selected
    pool = mysql.createPool({
      ...dbConfig,
      database: dbName
    });
    
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        wallet_address VARCHAR(255) UNIQUE,
        username VARCHAR(255),
        password VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create wallets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        balance DECIMAL(15,2) DEFAULT 0.00,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create game history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        table_id INT DEFAULT NULL,
        is_split TINYINT DEFAULT 0,
        bet_amount DECIMAL(15,2) NOT NULL,
        payout DECIMAL(15,2) NOT NULL,
        result VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Add game_mode column if it does not exist
    try {
      const [columns] = await pool.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'game_history' AND COLUMN_NAME = 'game_mode'
      `, [dbName]);
      if (columns.length === 0) {
        await pool.query("ALTER TABLE game_history ADD COLUMN game_mode VARCHAR(50) DEFAULT 'single';");
        console.log('Database: Added game_mode column to game_history table');
      }
    } catch (colErr) {
      console.error('Error adding game_mode column:', colErr);
    }

    // Create settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(255) PRIMARY KEY,
        \`value\` TEXT
      )
    `);

    // Seed default token price if not exists
    await pool.query(`
      INSERT IGNORE INTO settings (\`key\`, \`value\`) VALUES ('token_price', '1000')
    `);

    // Retroactive game mode migration for historical multiplayer tables
    try {
      await pool.query(`
        UPDATE game_history 
        SET game_mode = 'multiplayer' 
        WHERE table_id IN (
          SELECT table_id FROM (
            SELECT table_id FROM game_history 
            WHERE table_id IS NOT NULL AND table_id > 0
            GROUP BY table_id 
            HAVING COUNT(DISTINCT user_id) > 1 OR COUNT(id) > 2
          ) as temp
        )
      `);
      console.log('Database: Retroactively migrated game modes for historical tables');
    } catch (migErr) {
      console.error('Failed to run retroactive game_mode migration:', migErr.message);
    }
    
    console.log('Database initialized successfully with Web2 schema');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

export const getPool = () => pool;
