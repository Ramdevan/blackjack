import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = 'http://localhost:5000/api';

export const Leaderboard = () => {
  const [leaders, setLeaders] = useState([]);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/leaderboard`);
        setLeaders(res.data);
      } catch (err) {
        console.error("Failed to fetch leaderboard", err);
      }
    };
    
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass-panel p-8 rounded-2xl w-full max-w-4xl mx-auto mb-8">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <span className="text-yellow-400">🏆</span> Leaderboard
      </h2>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="p-3">Rank</th>
              <th className="p-3">Player</th>
              <th className="p-3">Games Played</th>
              <th className="p-3 text-right">Total Won</th>
            </tr>
          </thead>
          <tbody>
            {leaders.length === 0 ? (
              <tr>
                <td colSpan="4" className="p-4 text-center text-slate-500">No games played yet</td>
              </tr>
            ) : (
              leaders.map((leader, i) => (
                <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                  <td className="p-3">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </td>
                  <td className="p-3 font-mono text-sm">
                    {leader.player_address.substring(0, 6)}...{leader.player_address.substring(38)}
                  </td>
                  <td className="p-3">{leader.games_played}</td>
                  <td className="p-3 text-right font-bold text-emerald-400">
                    {leader.total_won}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
