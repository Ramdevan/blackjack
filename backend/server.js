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
const BSC_RPC = "https://bsc-testnet-rpc.publicnode.com";
const ABI = [
  "event GameSettled(address indexed player, uint256 indexed gameId, uint256 betAmount, uint256 payout)"
];

async function startBlockchainWatcher() {
  console.log('Starting Robust Blockchain Watcher (Polling Mode on PublicNode)...');

  const provider = new ethers.JsonRpcProvider(BSC_RPC);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  const pool = getPool();

  let lastCheckedBlock = null;
  try {
    lastCheckedBlock = await provider.getBlockNumber();
    console.log(`Watching from block: ${lastCheckedBlock}`);
  } catch (err) {
    console.error("Initial block fetch failed:", err.message || err);
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

      // Clamp the checked range to maximum of 100 blocks to prevent RPC rate-limits and high load
      let fromBlock = lastCheckedBlock + 1;
      if (currentBlock - fromBlock > 100) {
        fromBlock = currentBlock - 100;
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

let tableState = 'betting'; // betting, playing, dealer-turn, settled
let tableDealerHand = [];
let currentTurnIndex = 0;

const connectedPlayers = new Map(); // socketId -> playerDetails

io.on('connection', (socket) => {
  console.log(`User connected to socket relay: ${socket.id}`);

  socket.on('join-table', ({ address }) => {
    if (!address) return;
    console.log(`Player ${address} joined table on socket ${socket.id}`);

    // Deduplicate players with same address on reconnects
    for (const [sid, p] of connectedPlayers.entries()) {
      if (p.address.toLowerCase() === address.toLowerCase()) {
        connectedPlayers.delete(sid);
      }
    }

    connectedPlayers.set(socket.id, {
      socketId: socket.id,
      address: address,
      bet: 0,
      cards: [],
      score: 0,
      status: 'Waiting'
    });

    broadcastTableState();
  });

  socket.on('player-action', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    if (data.action === 'bet') {
      player.bet = data.bet;
      player.cards = data.cards || [];
      player.score = data.score || 0;
      player.status = 'Ready';

      // Check if all connected players have placed a bet
      const activePlayers = Array.from(connectedPlayers.values());
      const allBettingDone = activePlayers.every(p => p.bet > 0);
      if (allBettingDone && activePlayers.length > 0) {
        tableState = 'playing';
        currentTurnIndex = 0;
        activePlayers.forEach((p, idx) => {
          if (idx === 0) {
            p.status = 'Playing';
          } else {
            p.status = 'Waiting Turn';
          }
        });
      }
    } else if (data.action === 'hit') {
      player.cards = data.cards || [];
      player.score = data.score || 0;
      if (data.score > 21) {
        player.status = 'Bust!';
        advanceTurn();
      } else {
        player.status = 'Playing';
      }
    } else if (data.action === 'stand') {
      player.status = 'Stood';
      advanceTurn();
    } else if (data.action === 'finished') {
      player.cards = data.cards || player.cards;
      player.score = data.score || player.score;
      player.status = data.statusText || 'Finished';
      advanceTurn();
    } else if (data.action === 'dealer-sync') {
      tableDealerHand = data.dealerCards || [];
      if (data.status) {
        tableState = data.status;
      }
    } else if (data.action === 'settle') {
      player.status = data.outcome === 'win' ? '🏆 Winner!' : data.outcome === 'push' ? '🤝 Push' : '❌ Lost';
    } else if (data.action === 'reset') {
      player.bet = 0;
      player.cards = [];
      player.score = 0;
      player.status = 'Waiting';

      // Reset table parameters when all players reset
      const activePlayers = Array.from(connectedPlayers.values());
      const allReset = activePlayers.every(p => p.bet === 0);
      if (allReset) {
        tableState = 'betting';
        tableDealerHand = [];
        currentTurnIndex = 0;
      }
    }

    broadcastTableState();
  });

  socket.on('disconnect', () => {
    if (connectedPlayers.has(socket.id)) {
      const address = connectedPlayers.get(socket.id).address;
      console.log(`Player ${address} disconnected on socket ${socket.id}`);
      connectedPlayers.delete(socket.id);
      
      // If table becomes empty, reset state
      if (connectedPlayers.size === 0) {
        tableState = 'betting';
        tableDealerHand = [];
        currentTurnIndex = 0;
      } else {
        // Recalculate turn if active player disconnected
        const activePlayers = Array.from(connectedPlayers.values());
        if (currentTurnIndex >= activePlayers.length) {
          tableState = 'dealer-turn';
        }
      }
      broadcastTableState();
    }
  });

  function advanceTurn() {
    const activePlayers = Array.from(connectedPlayers.values());
    currentTurnIndex++;
    if (currentTurnIndex < activePlayers.length) {
      activePlayers.forEach((p, idx) => {
        if (idx === currentTurnIndex) {
          p.status = 'Playing';
        }
      });
    } else {
      tableState = 'dealer-turn';
    }
  }

  function broadcastTableState() {
    const playersList = Array.from(connectedPlayers.values());
    io.emit('table-sync', {
      players: playersList,
      tableState: tableState,
      tableDealerHand: tableDealerHand,
      currentTurnIndex: currentTurnIndex
    });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Blockchain Indexer & API running on port ${PORT}`));
