import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { initDB, getPool } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import { createDeck, calculateScore, isBlackjack } from './utils/gameEngine.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'secret_blackjack_key_123';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);

initDB().then(() => console.log('Database initialized')).catch(err => console.error(err));

const tables = {};

function getOrCreateTable(tableId) {
  if (!tables[tableId]) {
    tables[tableId] = {
      id: tableId,
      players: [],
      dealerCards: [],
      deck: [],
      turnIndex: -1,
      status: 'betting'
    };
  }
  return tables[tableId];
}

function broadcastTable(tableId) {
  const table = tables[tableId];
  if (!table) return;

  const publicState = {
    id: table.id,
    players: table.players.map(p => ({
      userId: p.userId,
      username: p.displayName, // Use displayName instead of raw username/email
      bet: p.bet,
      hands: p.hands,
      status: p.status
    })),
    dealerCards: table.status === 'playing' ? [table.dealerCards[0], { hidden: true }] : table.dealerCards,
    dealerScore: table.status === 'settled' ? calculateScore(table.dealerCards) : (table.status === 'playing' ? calculateScore([table.dealerCards[0]]) : 0),
    turnIndex: table.turnIndex,
    status: table.status
  };

  io.to(tableId).emit('tableUpdate', publicState);
}

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Invalid token'));
    socket.userId = decoded.id;
    socket.username = decoded.username;
    next();
  });
});

io.on('connection', (socket) => {
  const pool = getPool();
  let currentTableId = null;

  socket.on('joinTable', async ({ mode }) => {
    if (currentTableId) {
      socket.leave(currentTableId);
      const oldTable = tables[currentTableId];
      if (oldTable) {
        oldTable.players = oldTable.players.filter(p => p.userId !== socket.userId);
        if (oldTable.players.length === 0) delete tables[currentTableId];
        else broadcastTable(currentTableId);
      }
    }

    currentTableId = mode === 'single' ? `private_${socket.userId}` : 'public_lobby';
    socket.join(currentTableId);
    
    const table = getOrCreateTable(currentTableId);
    const existingPlayer = table.players.find(p => p.userId === socket.userId);
    
    if (!existingPlayer) {
      // Fetch the actual NAME from the database to show instead of email
      const [userRows] = await pool.query('SELECT name, username FROM users WHERE id = ?', [socket.userId]);
      const user = userRows[0];
      const displayName = user?.name || user?.username || socket.username;

      table.players.push({
        userId: socket.userId,
        username: socket.username,
        displayName: displayName, // Store the name for display
        socketId: socket.id,
        bet: 0,
        hands: [],
        status: 'waiting'
      });
    } else {
      existingPlayer.socketId = socket.id;
    }

    broadcastTable(currentTableId);
  });

  socket.on('placeBet', async ({ betAmount }) => {
    if (!currentTableId) return;
    const table = tables[currentTableId];
    const player = table.players.find(p => p.userId === socket.userId);
    if (!player || table.status !== 'betting') return;

    try {
      const [rows] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [socket.userId]);
      const currentBalance = rows[0]?.balance || 0;
      if (currentBalance < betAmount) return socket.emit('gameError', 'Insufficient balance');
      
      await pool.query('UPDATE wallets SET balance = ? WHERE user_id = ?', [currentBalance - betAmount, socket.userId]);
      socket.emit('walletUpdate', currentBalance - betAmount);

      player.bet = betAmount;
      player.status = 'ready';
      broadcastTable(currentTableId);

      const allReady = table.players.every(p => p.bet > 0);
      if (allReady) startRound(currentTableId);
    } catch (err) {
      socket.emit('gameError', 'Transaction failed');
    }
  });

  socket.on('hit', () => {
    if (!currentTableId) return;
    const table = tables[currentTableId];
    if (table.status !== 'playing') return;
    const player = table.players[table.turnIndex];
    if (!player || player.userId !== socket.userId) return;

    player.hands[0].cards.push(table.deck.pop());
    if (calculateScore(player.hands[0].cards) > 21) {
      player.status = 'busted';
      nextTurn(currentTableId);
    } else {
      broadcastTable(currentTableId);
    }
  });

  socket.on('stand', () => {
    if (!currentTableId) return;
    const table = tables[currentTableId];
    if (table.status !== 'playing') return;
    const player = table.players[table.turnIndex];
    if (!player || player.userId !== socket.userId) return;

    player.status = 'stood';
    nextTurn(currentTableId);
  });

  socket.on('doubleDown', async () => {
    if (!currentTableId) return;
    const table = tables[currentTableId];
    if (table.status !== 'playing') return;
    const player = table.players[table.turnIndex];
    if (!player || player.userId !== socket.userId) return;
    if (player.hands[0].cards.length !== 2) return;

    try {
      const [rows] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [socket.userId]);
      const currentBalance = rows[0]?.balance || 0;
      if (currentBalance < player.bet) return socket.emit('gameError', 'Insufficient balance to double down');

      await pool.query('UPDATE wallets SET balance = ? WHERE user_id = ?', [currentBalance - player.bet, socket.userId]);
      socket.emit('walletUpdate', currentBalance - player.bet);

      player.bet *= 2;
      player.hands[0].cards.push(table.deck.pop());
      const score = calculateScore(player.hands[0].cards);
      player.status = score > 21 ? 'busted' : 'stood';
      nextTurn(currentTableId);
    } catch (err) {
      socket.emit('gameError', 'Double down failed');
    }
  });

  socket.on('split', async () => {
    if (!currentTableId) return;
    const table = tables[currentTableId];
    if (table.status !== 'playing') return;
    const player = table.players[table.turnIndex];
    if (!player || player.userId !== socket.userId) return;
    if (player.hands[0].cards.length !== 2) return;

    const val1 = ['K','Q','J','10'].includes(player.hands[0].cards[0].value) ? '10' : player.hands[0].cards[0].value;
    const val2 = ['K','Q','J','10'].includes(player.hands[0].cards[1].value) ? '10' : player.hands[0].cards[1].value;
    if (val1 !== val2) return socket.emit('gameError', 'Can only split matching values');

    try {
      const [rows] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [socket.userId]);
      const currentBalance = rows[0]?.balance || 0;
      if (currentBalance < player.bet) return socket.emit('gameError', 'Insufficient balance to split');

      await pool.query('UPDATE wallets SET balance = ? WHERE user_id = ?', [currentBalance - player.bet, socket.userId]);
      socket.emit('walletUpdate', currentBalance - player.bet);

      const card1 = player.hands[0].cards[0];
      const card2 = player.hands[0].cards[1];
      player.hands = [
        { cards: [card1, table.deck.pop()], bet: player.bet },
        { cards: [card2, table.deck.pop()], bet: player.bet }
      ];
      broadcastTable(currentTableId);
    } catch (err) {
      socket.emit('gameError', 'Split failed');
    }
  });

  socket.on('disconnect', () => {
    if (currentTableId) {
      const table = tables[currentTableId];
      if (table) {
        table.players = table.players.filter(p => p.userId !== socket.userId);
        if (table.players.length === 0) delete tables[currentTableId];
        else {
          if (table.turnIndex >= table.players.length) nextTurn(currentTableId);
          broadcastTable(currentTableId);
        }
      }
    }
  });
});

function startRound(tableId) {
  const table = tables[tableId];
  if (!table) return;
  table.status = 'playing';
  table.deck = createDeck(6);
  table.dealerCards = [table.deck.pop(), table.deck.pop()];

  table.players.forEach(p => {
    p.hands = [{ cards: [table.deck.pop(), table.deck.pop()], bet: p.bet }];
    p.status = isBlackjack(p.hands[0].cards) ? 'blackjack' : 'playing';
  });

  table.turnIndex = 0;
  while (table.turnIndex < table.players.length && table.players[table.turnIndex].status === 'blackjack') {
    table.turnIndex++;
  }

  if (table.turnIndex >= table.players.length) settleTable(tableId);
  else broadcastTable(tableId);
}

function nextTurn(tableId) {
  const table = tables[tableId];
  if (!table) return;
  table.turnIndex++;
  while (table.turnIndex < table.players.length && table.players[table.turnIndex].status === 'blackjack') {
    table.turnIndex++;
  }
  if (table.turnIndex >= table.players.length) settleTable(tableId);
  else broadcastTable(tableId);
}

async function settleTable(tableId) {
  const table = tables[tableId];
  if (!table) return;
  table.status = 'settled';
  const pool = getPool();

  let dealerScore = calculateScore(table.dealerCards);
  if (table.players.some(p => p.status !== 'busted')) {
    while (dealerScore < 17) {
      table.dealerCards.push(table.deck.pop());
      dealerScore = calculateScore(table.dealerCards);
    }
  }

  for (const p of table.players) {
    let totalPayout = 0;
    for (const hand of p.hands) {
      const playerScore = calculateScore(hand.cards);
      let payout = 0;
      if (p.status === 'blackjack') {
        payout = isBlackjack(table.dealerCards) ? hand.bet : hand.bet * 2.5;
      } else if (p.status !== 'busted') {
        if (dealerScore > 21 || playerScore > dealerScore) payout = hand.bet * 2;
        else if (playerScore === dealerScore) payout = hand.bet;
      }
      totalPayout += payout;
    }

    if (totalPayout > 0) {
      const [rows] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [p.userId]);
      const newBal = (rows[0]?.balance || 0) + totalPayout;
      await pool.query('UPDATE wallets SET balance = ? WHERE user_id = ?', [newBal, p.userId]);
      io.to(p.socketId).emit('walletUpdate', newBal);
    }
  }

  broadcastTable(tableId);
  setTimeout(() => resetTable(tableId), 5000);
}

function resetTable(tableId) {
  const table = tables[tableId];
  if (!table) return;
  table.status = 'betting';
  table.dealerCards = [];
  table.turnIndex = -1;
  table.players.forEach(p => {
    p.bet = 0;
    p.hands = [];
    p.status = 'waiting';
  });
  broadcastTable(tableId);
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
