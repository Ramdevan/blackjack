import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import { ethers } from 'ethers';
import dns from 'dns';
import { initDB, getPool } from './config/db.js';
import adminRoutes from './routes/adminRoutes.js';
import tokenRoutes from './routes/tokenRoutes.js';

dns.setDefaultResultOrder('ipv4first');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/api/admin', adminRoutes);
app.use('/api/token', tokenRoutes);

initDB().then(() => {
  console.log('Database initialized');
  startBlockchainWatcher();
}).catch(err => console.error(err));

// --- Blockchain Watcher Configuration ---
const CONTRACT_ADDRESS = "0x7a506b8d0De0Ebb328BBF5821B808de6E9a77219";
const BSC_RPC = "https://bnb-testnet.api.onfinality.io/public"; // Non-Cloudflare stable HTTPS Port 443 public RPC
const ABI = [
  "event GameSettled(address indexed player, uint256 indexed gameId, uint256 betAmount, uint256 payout)"
];

async function startBlockchainWatcher() {
  console.log('Starting Robust Blockchain Watcher (Polling Mode)...');
  
  // Bypass local DNS64 IPv6-only transition issues by using direct IPv4 with custom Host header
  const req = new ethers.FetchRequest("http://154.91.1.175/public");
  req.setHeader("Host", "bnb-testnet.api.onfinality.io");
  
  const provider = new ethers.JsonRpcProvider(req);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  const pool = getPool();

  let lastCheckedBlock = null;
  try {
    lastCheckedBlock = await provider.getBlockNumber();
    console.log(`Watching from block: ${lastCheckedBlock}`);
  } catch (err) {
    console.error("Initial block fetch failed:", err);
  }

  // Poll every 15 seconds for new events
  setInterval(async () => {
    try {
      const currentBlock = await provider.getBlockNumber();
      
      // If we haven't successfully initialized the starting block, do it now
      if (lastCheckedBlock === null) {
        lastCheckedBlock = currentBlock;
        console.log(`Watching from block (initialized dynamically): ${lastCheckedBlock}`);
        return;
      }

      if (currentBlock <= lastCheckedBlock) return;

      // Cap the checked range to maximum of 5000 blocks to avoid RPC "exceed maximum block range" error
      let fromBlock = lastCheckedBlock + 1;
      if (currentBlock - fromBlock > 5000) {
        fromBlock = currentBlock - 5000;
        console.log(`[Watcher] Range too wide. Clamping from-block to ${fromBlock}`);
      }

      console.log(`Checking blocks ${fromBlock} to ${currentBlock}`);
      const events = await contract.queryFilter("GameSettled", fromBlock, currentBlock);

      for (const event of events) {
        const { player, gameId, betAmount, payout } = event.args;
        console.log(`[SYNC] On-Chain Settlement: Player ${player}, ID ${gameId}, Bet ${betAmount}, Payout ${payout}`);
        
        // Find or create user
        const [users] = await pool.query('SELECT id FROM users WHERE wallet_address = ?', [player]);
        let userId;
        if (users.length === 0) {
          const [result] = await pool.query('INSERT INTO users (wallet_address) VALUES (?)', [player]);
          userId = result.insertId;
          await pool.query('INSERT INTO wallets (user_id, balance) VALUES (?, 0)', [userId]);
        } else {
          userId = users[0].id;
        }

        // Save to game_history
        const betFormatted = Number(ethers.formatUnits(betAmount, 18));
        const payoutFormatted = Number(ethers.formatUnits(payout, 18));
        await pool.query(
          'INSERT INTO game_history (user_id, bet_amount, payout, result) VALUES (?, ?, ?, ?)',
          [userId, betFormatted, payoutFormatted, payoutFormatted > 0 ? 'win' : 'loss']
        );
        console.log(`[OK] Game ${gameId} synced to DB.`);
      }

      lastCheckedBlock = currentBlock;
    } catch (err) {
      console.error("Watcher Polling Error:", err.message || err);
    }
  }, 15000); // 15 second interval is safe for public RPCs
}

io.on('connection', (socket) => {
  console.log('User connected to socket relay');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Blockchain Indexer & API running on port ${PORT}`));
