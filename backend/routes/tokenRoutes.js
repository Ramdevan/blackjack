import express from 'express';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { getPool } from '../config/db.js';

dotenv.config();
const router = express.Router();

const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;
const BSC_RPC = "https://data-seed-prebsc-1-s1.binance.org:8545";

const tokenABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

router.post('/credit', async (req, res) => {
  const { address, amount } = req.body;

  if (!address || !amount) {
    return res.status(400).json({ error: "Missing address or amount" });
  }

  try {
    if (!PRIVATE_KEY || PRIVATE_KEY === 'your_private_key_here') {
      throw new Error("Admin private key not configured in backend .env");
    }

    const provider = new ethers.JsonRpcProvider(BSC_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(TOKEN_ADDRESS, tokenABI, wallet);

    console.log(`Backend: Transferring ${amount} chips to ${address}...`);
    
    // Convert amount to BigInt with decimals
    const decimals = await contract.decimals().catch(() => 18);
    const amountInWei = ethers.parseUnits(amount.toString(), decimals);

    // Check admin balance first
    const adminBal = await contract.balanceOf(wallet.address);
    if (adminBal < amountInWei) {
      throw new Error(`Insufficient chips in Admin wallet. Admin has ${ethers.formatUnits(adminBal, decimals)} TKN`);
    }

    const tx = await contract.transfer(address, amountInWei);
    console.log(`Backend: Transfer TX sent: ${tx.hash}`);
    
    await tx.wait();
    console.log(`Backend: Transfer TX confirmed!`);

    // --- Sync with Database ---
    try {
      const pool = getPool();
      const [users] = await pool.query('SELECT id FROM users WHERE wallet_address = ?', [address]);
      let userId;
      
      if (users.length === 0) {
        const [result] = await pool.query('INSERT INTO users (wallet_address) VALUES (?)', [address]);
        userId = result.insertId;
        await pool.query('INSERT INTO wallets (user_id, balance) VALUES (?, 0)', [userId]);
      } else {
        userId = users[0].id;
      }

      await pool.query('UPDATE wallets SET balance = balance + ? WHERE user_id = ?', [amount, userId]);
      console.log(`Backend: Database balance updated for ${address} (+${amount})`);
    } catch (dbError) {
      console.error("Backend Database Sync Error:", dbError);
    }

    res.json({ success: true, txHash: tx.hash });
  } catch (error) {
    console.error("Backend Credit Error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
