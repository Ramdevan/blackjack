import express from 'express';
import { getPool } from '../config/db.js';

const router = express.Router();

// Get Admin Stats
router.get('/stats', async (req, res) => {
  try {
    const pool = getPool();
    const [[{ totalUsers }]] = await pool.query('SELECT COUNT(*) as totalUsers FROM users');
    const [[{ totalBets }]] = await pool.query('SELECT SUM(bet_amount) as totalBets FROM game_history');
    const [[{ houseProfit }]] = await pool.query('SELECT SUM(bet_amount - payout) as houseProfit FROM game_history');
    
    res.json({ totalUsers, totalBets: totalBets || 0, houseProfit: houseProfit || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get User List
router.get('/users', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT u.id, u.wallet_address, w.balance, 
      (SELECT COUNT(*) FROM game_history WHERE user_id = u.id) as gamesPlayed
      FROM users u
      JOIN wallets w ON u.id = w.user_id
      ORDER BY w.balance DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Recent History
router.get('/history', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT h.*, u.wallet_address 
      FROM game_history h 
      JOIN users u ON h.user_id = u.id 
      ORDER BY h.created_at DESC 
      LIMIT 50
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get User Specific Game History
router.get('/history/:address', async (req, res) => {
  const { address } = req.params;
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT h.* 
      FROM game_history h 
      JOIN users u ON h.user_id = u.id 
      WHERE LOWER(u.wallet_address) = ? 
      ORDER BY h.created_at DESC 
      LIMIT 20
    `, [address.toLowerCase()]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Settings
router.get('/settings', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM settings');
    const settings = rows.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Settings
router.post('/settings', async (req, res) => {
  const { key, value } = req.body;
  try {
    const pool = getPool();
    await pool.query('INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?', [key, value, value]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
