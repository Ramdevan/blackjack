import { getPool } from '../config/db.js';

export const createGame = async (req, res) => {
  const { gameId, playerAddress, betAmount } = req.body;
  try {
    const pool = getPool();
    const [result] = await pool.query(
      'INSERT INTO games (game_id, player_address, bet_amount) VALUES (?, ?, ?)',
      [gameId, playerAddress, betAmount]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const settleGame = async (req, res) => {
  const { gameId, payout } = req.body;
  try {
    const pool = getPool();
    await pool.query(
      'UPDATE games SET payout = ?, settled = TRUE WHERE game_id = ?',
      [payout, gameId]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getLeaderboard = async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT player_address, SUM(CAST(payout AS UNSIGNED)) as total_won, SUM(CAST(bet_amount AS UNSIGNED)) as total_bet, COUNT(*) as games_played
      FROM games
      WHERE settled = TRUE
      GROUP BY player_address
      ORDER BY total_won DESC
      LIMIT 10
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
