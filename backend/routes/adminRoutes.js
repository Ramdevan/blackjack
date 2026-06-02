import express from 'express';
import { ethers } from 'ethers';
import { getPool } from '../config/db.js';

const router = express.Router();

// Middleware to verify admin signature
const verifyAdmin = (req, res, next) => {
  try {
    const signature = req.headers['x-admin-signature'];
    const message = req.headers['x-admin-message'];
    const address = req.headers['x-admin-address'];

    if (!signature || !message || !address) {
      return res.status(401).json({ error: "Admin authorization headers missing" });
    }

    // Get expected admin address from environment or fallback
    let expectedAdmin = "0x2818ba353dff5cb15310b438f122110d41d7b995".toLowerCase();
    if (process.env.ADMIN_PRIVATE_KEY) {
      try {
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY);
        expectedAdmin = wallet.address.toLowerCase();
      } catch (e) {
        console.error("Error deriving admin address from private key:", e);
      }
    }

    if (address.toLowerCase() !== expectedAdmin) {
      return res.status(403).json({ error: "Unauthorized admin address" });
    }

    // Verify signature
    const recoveredAddress = ethers.verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== expectedAdmin) {
      return res.status(401).json({ error: "Invalid admin signature" });
    }

    next();
  } catch (error) {
    console.error("verifyAdmin middleware error:", error);
    return res.status(500).json({ error: "Internal authorization error: " + error.message });
  }
};

// Get Admin Stats
router.get('/stats', verifyAdmin, async (req, res) => {
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

// Get User List (with automatic real-time blockchain balance syncing!)
router.get('/users', verifyAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT u.id, u.wallet_address, w.balance, 
      (SELECT COUNT(*) FROM game_history WHERE user_id = u.id) as gamesPlayed
      FROM users u
      JOIN wallets w ON u.id = w.user_id
      ORDER BY w.balance DESC
    `);

    // Synchronize balances with actual on-chain ERC20 contract state
    const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
    if (TOKEN_ADDRESS && rows.length > 0) {
      try {
        const { fallbackProvider } = await import('../utils/provider.js');
        const tokenContract = new ethers.Contract(
          TOKEN_ADDRESS,
          [
            "function balanceOf(address account) view returns (uint256)",
            "function decimals() view returns (uint8)"
          ],
          fallbackProvider
        );

        const decimals = await tokenContract.decimals().catch(() => 18);

        // Concurrently fetch active on-chain balances for each player
        await Promise.all(rows.map(async (row) => {
          if (row.wallet_address && row.wallet_address !== 'No Wallet Address' && ethers.isAddress(row.wallet_address)) {
            try {
              const onChainBalRaw = await tokenContract.balanceOf(row.wallet_address);
              const onChainBal = Number(ethers.formatUnits(onChainBalRaw, decimals));
              
              // Self-heal: If local DB record is desynchronized, correct it immediately
              if (Number(row.balance) !== onChainBal) {
                row.balance = onChainBal;
                await pool.query('UPDATE wallets SET balance = ? WHERE user_id = ?', [onChainBal, row.id]);
              }
            } catch (balErr) {
              console.warn(`Failed to fetch on-chain balance for ${row.wallet_address}:`, balErr.message);
            }
          }
        }));
      } catch (chainErr) {
        console.error("Failed to sync on-chain balances:", chainErr);
      }
    }

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Recent History
router.get('/history', verifyAdmin, async (req, res) => {
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
router.post('/settings', verifyAdmin, async (req, res) => {
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
