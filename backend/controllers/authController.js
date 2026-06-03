import jwt from 'jsonwebtoken';
import { getPool } from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret_blackjack_key_123';

export const register = async (req, res) => {
  return res.status(400).json({ error: "Web2 registration is deprecated. Please connect your Web3 wallet." });
};

export const login = async (req, res) => {
  return res.status(400).json({ error: "Web2 login is deprecated. Please connect your Web3 wallet." });
};

export const getUser = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const pool = getPool();
    
    const [users] = await pool.query('SELECT wallet_address FROM users WHERE id = ?', [decoded.id]);
    const user = users[0];

    const [wallets] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [decoded.id]);
    
    res.json({ 
      user: { 
        id: decoded.id, 
        balance: wallets && wallets.length > 0 ? wallets[0].balance : 0,
        walletAddress: user ? user.wallet_address : null
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
