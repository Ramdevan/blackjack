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
const CONTRACT_ADDRESS = "0x0A9d1704ff312F90F745996C2f35eb2dFfcf69d4";
const BSC_RPC = "https://bsc-testnet-rpc.publicnode.com";
const ABI = [
  "event TableSettled(uint256 indexed tableId, uint8[] dealerCards, uint8 dealerScore)",
  "function getActivePlayers(uint256 tableId) view returns (address[] memory)",
  "function getPlayerBetDetails(uint256 tableId, address player) view returns (address playerAddress, uint256 betAmount, uint8[] memory cards, uint8 score, bool stood, bool busted, bool settled, bool doubledDown)",
  "function getPlayerSplitDetails(uint256 tableId, address player) view returns (bool isSplit, uint8[] memory splitCards, uint8 splitScore, bool splitStood, bool splitBusted, uint256 splitBetAmount, uint8 activeHandIndex)"
];

async function startBlockchainWatcher() {
  console.log('Starting Robust Blockchain Watcher (Polling Mode for Multiplayer)...');

  const provider = new ethers.JsonRpcProvider(BSC_RPC);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  const pool = getPool();

  let lastCheckedBlock = null;
  try {
    const currentBlock = await provider.getBlockNumber();
    // Scan the last 5000 blocks on startup to catch up on missed rounds
    lastCheckedBlock = currentBlock - 5000;
    console.log(`Watching from block (startup scan range: ${lastCheckedBlock} to ${currentBlock}): ${lastCheckedBlock}`);
  } catch (err) {
    console.error("Initial block fetch failed:", err.message || err);
  }

  // Poll every 15 seconds for new events
  setInterval(async () => {
    try {
      const currentBlock = await provider.getBlockNumber();

      // If we haven't successfully initialized the starting block, do it now
      if (lastCheckedBlock === null) {
        lastCheckedBlock = currentBlock - 5000;
        console.log(`Watching from block (initialized dynamically): ${lastCheckedBlock}`);
        return;
      }

      if (currentBlock <= lastCheckedBlock) return;

      // Scan up to 500 blocks per poll tick to catch up progressively
      let fromBlock = lastCheckedBlock + 1;
      let toBlock = currentBlock;
      if (toBlock - fromBlock > 500) {
        toBlock = fromBlock + 500;
        console.log(`[Watcher] Catching up... Scanning chunk: ${fromBlock} to ${toBlock} (Current: ${currentBlock})`);
      } else {
        console.log(`Checking blocks ${fromBlock} to ${currentBlock} on contract: ${CONTRACT_ADDRESS}`);
      }

      const events = await contract.queryFilter("TableSettled", fromBlock, toBlock);

      for (const event of events) {
        const { tableId, dealerCards, dealerScore } = event.args;
        console.log(`[SYNC] On-Chain Table Settled: Table ID ${tableId}, Dealer Score ${dealerScore}`);

        // Fetch active players for this table
        let players = [];
        try {
          players = await contract.getActivePlayers(tableId);
        } catch (err) {
          console.error(`Failed to get active players for table ${tableId}:`, err.message);
          continue;
        }

        const dealerScoreNum = Number(dealerScore);
        const isDealerBlackjack = (dealerCards.length === 2 && dealerScoreNum === 21);

        for (const playerAddress of players) {
          try {
            const playerDetails = await contract.getPlayerBetDetails(tableId, playerAddress);
            const betAmount = playerDetails.betAmount; // bigint
            const cards = playerDetails.cards;
            const score = Number(playerDetails.score);
            const busted = playerDetails.busted;
            
            if (betAmount === 0n) continue; // No bet placed on this table

            // Calculate payout
            let payout = 0n;
            let resultType = 'loss';

            if (!busted) {
              const isPlayerBlackjack = (cards.length === 2 && score === 21);

              if (isPlayerBlackjack) {
                if (isDealerBlackjack) {
                  payout = betAmount; // Push
                  resultType = 'push';
                } else {
                  // Premium 3:2 payout: payout = betAmount + (betAmount * 3 / 2)
                  payout = betAmount + (betAmount * 3n) / 2n;
                  resultType = 'win';
                }
              } else {
                if (isDealerBlackjack) {
                  payout = 0n;
                  resultType = 'loss';
                } else if (dealerScoreNum > 21) {
                  payout = betAmount * 2n; // Win
                  resultType = 'win';
                } else if (score > dealerScoreNum) {
                  payout = betAmount * 2n; // Win
                  resultType = 'win';
                } else if (score === dealerScoreNum) {
                  payout = betAmount; // Push
                  resultType = 'push';
                } else {
                  payout = 0n;
                  resultType = 'loss';
                }
              }
            }

            console.log(`[SYNC-PLAYER] Table ${tableId} Player ${playerAddress}: Bet ${betAmount}, Payout ${payout}, Result: ${resultType}`);

            // Find or create user
            const [users] = await pool.query('SELECT id FROM users WHERE wallet_address = ?', [playerAddress]);
            let userId;
            if (users.length === 0) {
              const [result] = await pool.query('INSERT INTO users (wallet_address, password) VALUES (?, ?)', [playerAddress, 'web3_auth_placeholder']);
              userId = result.insertId;
              await pool.query('INSERT INTO wallets (user_id, balance) VALUES (?, 0)', [userId]);
            } else {
              userId = users[0].id;
            }

            // Save primary hand to game_history if not already saved to prevent duplicates
            const betFormatted = Number(ethers.formatUnits(betAmount, 18));
            const payoutFormatted = Number(ethers.formatUnits(payout, 18));
            
            const [existing] = await pool.query(
              'SELECT id FROM game_history WHERE user_id = ? AND table_id = ? AND is_split = 0',
              [userId, tableId]
            );

            if (existing.length === 0) {
              await pool.query(
                'INSERT INTO game_history (user_id, table_id, is_split, bet_amount, payout, result) VALUES (?, ?, 0, ?, ?, ?)',
                [userId, tableId, betFormatted, payoutFormatted, resultType]
              );
            }

            // Process split hand if applicable
            try {
              const splitInfo = await contract.getPlayerSplitDetails(tableId, playerAddress);
              if (splitInfo.isSplit) {
                const splitBet = splitInfo.splitBetAmount;
                const splitBusted = splitInfo.splitBusted;
                const splitScore = Number(splitInfo.splitScore);

                let splitPayout = 0n;
                let splitResult = 'loss';

                if (!splitBusted) {
                  if (isDealerBlackjack) {
                    splitPayout = 0n;
                    splitResult = 'loss';
                  } else if (dealerScoreNum > 21) {
                    splitPayout = splitBet * 2n;
                    splitResult = 'win';
                  } else if (splitScore > dealerScoreNum) {
                    splitPayout = splitBet * 2n;
                    splitResult = 'win';
                  } else if (splitScore === dealerScoreNum) {
                    splitPayout = splitBet;
                    splitResult = 'push';
                  } else {
                    splitPayout = 0n;
                    splitResult = 'loss';
                  }
                }

                const splitBetFormatted = Number(ethers.formatUnits(splitBet, 18));
                const splitPayoutFormatted = Number(ethers.formatUnits(splitPayout, 18));

                const [existingSplit] = await pool.query(
                  'SELECT id FROM game_history WHERE user_id = ? AND table_id = ? AND is_split = 1',
                  [userId, tableId]
                );

                if (existingSplit.length === 0) {
                  await pool.query(
                    'INSERT INTO game_history (user_id, table_id, is_split, bet_amount, payout, result) VALUES (?, ?, 1, ?, ?, ?)',
                    [userId, tableId, splitBetFormatted, splitPayoutFormatted, splitResult]
                  );
                  console.log(`[SYNC-SPLIT] Table ${tableId} Player ${playerAddress}: Bet ${splitBetFormatted}, Payout ${splitPayoutFormatted}, Result: ${splitResult}`);
                }
              }
            } catch (splitErr) {
              console.log(`[Watcher] Split details not queried (legacy contract or no split): ${splitErr.message}`);
            }

            console.log(`[OK] Table ${tableId} Player ${playerAddress} synced to DB.`);
          } catch (err) {
            console.error(`Failed to sync player ${playerAddress} details for table ${tableId}:`, err.message);
          }
        }
      }

      lastCheckedBlock = toBlock;
    } catch (err) {
      console.error("Watcher Polling Error:", err.message || err);
    }
  }, 15000); // 15 second interval is safe for public RPCs
}

let tableState = 'betting'; // betting, playing, dealer-turn, settled
let tableDealerHand = [];
let currentTurnIndex = 0;
let activeTableId = 0; // Synchronized on-chain table ID

const connectedPlayers = new Map(); // socketId -> playerDetails

io.on('connection', (socket) => {
  console.log(`User connected to socket relay: ${socket.id}`);

  socket.on('join-table', ({ address }) => {
    if (!address) return;
    console.log(`Player ${address} joined table on socket ${socket.id}`);

    // Check if this player already exists in our connected players list (by address)
    let existingPlayer = null;
    for (const [sid, p] of connectedPlayers.entries()) {
      if (p.address.toLowerCase() === address.toLowerCase()) {
        existingPlayer = { ...p };
        connectedPlayers.delete(sid);
      }
    }

    connectedPlayers.set(socket.id, {
      socketId: socket.id,
      address: address,
      bet: existingPlayer ? existingPlayer.bet : 0,
      cards: existingPlayer ? existingPlayer.cards : [],
      score: existingPlayer ? existingPlayer.score : 0,
      status: existingPlayer ? existingPlayer.status : 'Waiting',
      isSplit: existingPlayer ? (existingPlayer.isSplit || false) : false,
      cardsRight: existingPlayer ? (existingPlayer.cardsRight || []) : [],
      scoreRight: existingPlayer ? (existingPlayer.scoreRight || 0) : 0
    });

    broadcastTableState();
  });

  socket.on('set-table-id', ({ tableId }) => {
    activeTableId = Number(tableId);
    console.log(`[Socket] Active Table ID set to: ${activeTableId}`);
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
    } else if (data.action === 'start-round') {
      tableState = 'playing';
      currentTurnIndex = 0;
      const activePlayers = Array.from(connectedPlayers.values());
      activePlayers.forEach((p, idx) => {
        if (idx === 0) {
          p.status = 'Playing';
        } else {
          p.status = 'Waiting Turn';
        }
      });
    } else if (data.action === 'hit') {
      player.cards = data.cards || [];
      player.score = data.score || 0;
      player.isSplit = data.isSplit || false;
      player.cardsRight = data.cardsRight || [];
      player.scoreRight = data.scoreRight || 0;
      
      const activeIdx = Number(data.activeHandIndex || 0);
      if (player.isSplit && activeIdx === 0) {
        if (data.score > 21) {
          player.status = 'Left Busted';
        } else {
          player.status = 'Playing Left';
        }
      } else {
        if (data.score > 21) {
          player.status = 'Bust!';
          advanceTurn();
        } else {
          player.status = 'Playing';
        }
      }
    } else if (data.action === 'stand') {
      const activeIdx = Number(data.activeHandIndex || 0);
      if (player.isSplit && activeIdx === 0) {
        player.status = 'Left Stood';
      } else {
        player.status = 'Stood';
        advanceTurn();
      }
    } else if (data.action === 'finished') {
      player.cards = data.cards || player.cards;
      player.score = data.score || player.score;
      player.isSplit = data.isSplit || false;
      player.cardsRight = data.cardsRight || [];
      player.scoreRight = data.scoreRight || 0;
      player.status = data.statusText || 'Finished';
      advanceTurn();
    } else if (data.action === 'dealer-sync') {
      tableDealerHand = data.dealerCards || [];
      if (data.status) {
        tableState = data.status;
      }
    } else if (data.action === 'sync-cards') {
      player.cards = data.cards || [];
      player.score = data.score || 0;
      player.isSplit = data.isSplit || false;
      player.cardsRight = data.cardsRight || [];
      player.scoreRight = data.scoreRight || 0;
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
        activeTableId = 0; // Reset active table ID
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
        activeTableId = 0; // Reset active table ID
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
      currentTurnIndex: currentTurnIndex,
      activeTableId: activeTableId
    });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Blockchain Indexer & API running on port ${PORT}`));
