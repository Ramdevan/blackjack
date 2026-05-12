import express from 'express';
import { createGame, settleGame, getLeaderboard } from '../controllers/gameController.js';

const router = express.Router();

router.post('/games', createGame);
router.post('/games/settle', settleGame);
router.get('/leaderboard', getLeaderboard);

export default router;
