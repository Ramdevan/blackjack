import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getContract, getTokenContract, CONTRACT_ADDRESS } from '../utils/contract';
import { Card } from './Card';
import axios from 'axios';

const BACKEND_URL = 'http://localhost:5000/api';

export const BlackjackGame = ({ account, provider }) => {
  const [betAmount, setBetAmount] = useState('10');
  const [gameActive, setGameActive] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Dummy state for demonstration, since reading complex structs from contract needs full ABI
  // In a real app, we'd fetch the Game struct using the current game ID.
  const [playerCards, setPlayerCards] = useState([]);
  const [dealerCards, setDealerCards] = useState([]);
  const [gameId, setGameId] = useState(null);

  const startGame = async () => {
    if (!account || !provider) return;
    try {
      setLoading(true);
      setMessage('Approving tokens...');
      const signer = await provider.getSigner();
      const token = await getTokenContract(signer);
      const blackjack = await getContract(signer);
      
      const betWei = ethers.parseEther(betAmount);
      
      // Check allowance
      const allowance = await token.allowance(account, CONTRACT_ADDRESS);
      if (allowance < betWei) {
        const txApprove = await token.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
        await txApprove.wait();
      }

      setMessage('Placing bet...');
      const tx = await blackjack.placeBet(betWei);
      const receipt = await tx.wait();
      
      // Parse GameStarted event
      const event = receipt.logs.find(log => {
        try {
          const parsed = blackjack.interface.parseLog(log);
          return parsed.name === 'GameStarted';
        } catch (e) { return false; }
      });

      if (event) {
        const parsed = blackjack.interface.parseLog(event);
        const newGameId = parsed.args.gameId.toString();
        setGameId(newGameId);
        
        // Notify backend
        await axios.post(`${BACKEND_URL}/games`, {
          gameId: newGameId,
          playerAddress: account,
          betAmount: betAmount
        });

        // Initialize mock cards for visual (in real DApp, we fetch from contract state)
        setPlayerCards([Math.floor(Math.random() * 13) + 1, Math.floor(Math.random() * 13) + 1]);
        setDealerCards([Math.floor(Math.random() * 13) + 1]);
        setGameActive(true);
        setMessage('Game started! Your turn.');
      }
    } catch (err) {
      console.error(err);
      setMessage('Error: ' + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
  };

  const hit = async () => {
    if (!gameId) return;
    try {
      setLoading(true);
      const signer = await provider.getSigner();
      const blackjack = await getContract(signer);
      
      setMessage('Hitting...');
      const tx = await blackjack.hit(gameId);
      await tx.wait();
      
      // Mock update
      setPlayerCards([...playerCards, Math.floor(Math.random() * 13) + 1]);
      setMessage('Hit successful.');
      
      // In real app, we check if player busted by reading contract state
    } catch (err) {
      console.error(err);
      setMessage('Error: ' + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
  };

  const stand = async () => {
    if (!gameId) return;
    try {
      setLoading(true);
      const signer = await provider.getSigner();
      const blackjack = await getContract(signer);
      
      setMessage('Standing & Dealer turn...');
      const tx = await blackjack.stand(gameId);
      const receipt = await tx.wait();
      
      // Check GameSettled event
      const event = receipt.logs.find(log => {
        try {
          const parsed = blackjack.interface.parseLog(log);
          return parsed.name === 'GameSettled';
        } catch (e) { return false; }
      });

      if (event) {
        const parsed = blackjack.interface.parseLog(event);
        const payout = ethers.formatEther(parsed.args.payout);
        
        // Mock dealer cards
        setDealerCards([...dealerCards, Math.floor(Math.random() * 13) + 1]);
        
        setMessage(Number(payout) > 0 ? `You won ${payout} tokens!` : 'Dealer wins!');
        setGameActive(false);

        // Notify backend
        await axios.post(`${BACKEND_URL}/games/settle`, {
          gameId: gameId,
          payout: payout
        });
      }
    } catch (err) {
      console.error(err);
      setMessage('Error: ' + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel p-8 rounded-2xl w-full max-w-4xl mx-auto my-8">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
          Casino Blackjack
        </h2>
        {!gameActive && (
          <div className="flex gap-4">
            <input 
              type="number" 
              value={betAmount} 
              onChange={(e) => setBetAmount(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded px-4 py-2 w-32 focus:outline-none focus:border-blue-500"
              placeholder="Bet Amount"
            />
            <button 
              onClick={startGame} 
              disabled={loading || !account}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2 px-6 rounded shadow-lg transition-all"
            >
              Place Bet
            </button>
          </div>
        )}
      </div>

      {message && (
        <div className="bg-slate-800 border-l-4 border-blue-500 p-4 mb-8 rounded">
          <p>{message}</p>
        </div>
      )}

      {gameActive && (
        <div className="space-y-12">
          {/* Dealer's Hand */}
          <div>
            <h3 className="text-xl text-slate-400 mb-4 font-semibold uppercase tracking-wider">Dealer's Hand</h3>
            <div className="flex gap-4">
              {dealerCards.map((c, i) => <Card key={i} cardId={c} />)}
              {gameActive && dealerCards.length === 1 && <Card hidden />}
            </div>
          </div>

          {/* Player's Hand */}
          <div>
            <h3 className="text-xl text-slate-400 mb-4 font-semibold uppercase tracking-wider">Your Hand</h3>
            <div className="flex gap-4">
              {playerCards.map((c, i) => <Card key={i} cardId={c} />)}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4 border-t border-slate-700">
            <button 
              onClick={hit} 
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 px-8 rounded shadow-lg transition-all"
            >
              Hit
            </button>
            <button 
              onClick={stand} 
              disabled={loading}
              className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-bold py-3 px-8 rounded shadow-lg transition-all"
            >
              Stand
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
