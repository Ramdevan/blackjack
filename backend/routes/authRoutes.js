import express from 'express';
import { register, login, getUser, linkWallet } from '../controllers/authController.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', getUser);
router.post('/link-wallet', linkWallet);

export default router;
