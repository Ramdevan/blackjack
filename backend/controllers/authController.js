import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPool } from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret_blackjack_key_123';

export const register = async (req, res) => {
  const { username, password, name, email, phone } = req.body;
  try {
    const pool = getPool();
    const cleanUsername = username && username.trim() !== '' ? username : null;
    
    // Check if user exists (by email, or username if provided)
    let query = 'SELECT * FROM users WHERE email = ?';
    let params = [email];
    
    if (cleanUsername) {
      query += ' OR username = ?';
      params.push(cleanUsername);
    }

    const [existing] = await pool.query(query, params);
    
    if (existing.length > 0) {
      const isEmailTaken = existing.some(u => u.email === email);
      const errorMsg = isEmailTaken ? 'Email already taken' : 'Username already taken';
      return res.status(400).json({ error: errorMsg });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, password, name, email, phone) VALUES (?, ?, ?, ?, ?)', 
      [cleanUsername, hashedPassword, name, email, phone]
    );
    const userId = result.insertId;

    // Create wallet with default 1000 balance
    await pool.query('INSERT INTO wallets (user_id, balance) VALUES (?, 1000.00)', [userId]);

    res.status(201).json({ message: 'Registration successful. Please login.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const login = async (req, res) => {
  const { emailOrPhone, password } = req.body;
  try {
    const pool = getPool();
    const [users] = await pool.query(
      'SELECT * FROM users WHERE email = ? OR phone = ?', 
      [emailOrPhone, emailOrPhone]
    );
    
    if (users.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const [wallets] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [user.id]);
    const balance = wallets.length > 0 ? wallets[0].balance : 0;

    const token = jwt.sign({ id: user.id, username: user.username || user.email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username || user.name || user.email, balance, walletAddress: user.wallet_address } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getUser = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const pool = getPool();
    
    const [users] = await pool.query('SELECT name, username, wallet_address FROM users WHERE id = ?', [decoded.id]);
    const user = users[0];

    const [wallets] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [decoded.id]);
    
    res.json({ 
      user: { 
        id: decoded.id, 
        username: user.username || user.name, 
        balance: wallets[0].balance,
        walletAddress: user.wallet_address
      } 
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const linkWallet = async (req, res) => {
  const { walletAddress } = req.body;
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const pool = getPool();

    await pool.query('UPDATE users SET wallet_address = ? WHERE id = ?', [walletAddress, decoded.id]);
    
    res.json({ message: 'Wallet linked successfully', walletAddress });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
