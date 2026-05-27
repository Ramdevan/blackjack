import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const PlayerHistoryPage = ({ address }) => {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!address) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(`http://localhost:5000/api/admin/history/${address}`);
        if (response.ok) {
          const data = await response.json();
          setHistory(data);
        }
      } catch (err) {
        console.error("Error fetching player history:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [address]);

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
      <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-[32px] p-8 md:p-12 shadow-2xl relative overflow-hidden">
        
        {/* Glow Effects */}
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-yellow-500/10 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="flex flex-col md:flex-row justify-between items-center mb-10 pb-6 border-b border-white/10 gap-4">
          <div>
            <h2 className="text-3xl font-black text-white tracking-tight uppercase">📜 Player Game History</h2>
            <p className="text-slate-400 text-xs mt-1 font-mono">Wallet: {address || 'Not Connected'}</p>
          </div>
          <button 
            onClick={() => navigate('/')}
            className="bg-yellow-500 hover:bg-yellow-400 text-black font-black text-xs px-6 py-3 rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-yellow-500/20 uppercase tracking-wider"
          >
            ← Back to Table
          </button>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center items-center">
            <div className="w-10 h-10 border-4 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin"></div>
          </div>
        ) : !address ? (
          <div className="py-20 text-center text-slate-500">
            <div className="text-5xl mb-4">🔒</div>
            <h3 className="text-lg font-bold text-white mb-2">Wallet Disconnected</h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">Please connect your wallet using the "Connect" button in the header to view your personal game history.</p>
          </div>
        ) : history.length === 0 ? (
          <div className="py-20 text-center text-slate-500">
            <div className="text-5xl mb-4">🎰</div>
            <h3 className="text-lg font-bold text-white mb-2">No Rounds Played Yet</h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">You haven't played any Blackjack rounds on this table yet. Place a bet and start playing!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-[10px] text-yellow-500 uppercase tracking-widest font-black">
                  <th className="pb-4 pl-2">Time</th>
                  <th className="pb-4">Result</th>
                  <th className="pb-4 text-right">Bet Amount</th>
                  <th className="pb-4 text-right pr-2">Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.map((row, idx) => {
                  const resultStr = row.result.replace('_', ' ');
                  return (
                    <tr 
                      key={idx} 
                      className="hover:bg-white/5 transition-all group"
                    >
                      <td className="py-4 pl-2 text-slate-300 font-medium text-xs">
                        {new Date(row.created_at).toLocaleDateString()} {new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="py-4">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                          row.result.includes('win') || row.result.includes('blackjack') 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : row.result.includes('push') 
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {resultStr}
                        </span>
                      </td>
                      <td className="py-4 text-right text-xs font-black text-white font-mono">
                        {Number(row.bet_amount).toLocaleString()} <span className="text-[9px] text-slate-500">TKN</span>
                      </td>
                      <td className="py-4 text-right pr-2 font-mono">
                        <span className={`text-xs font-black ${
                          row.payout > 0 ? 'text-emerald-400' : 'text-slate-500'
                        }`}>
                          {row.payout > 0 ? `+${Number(row.payout).toLocaleString()}` : Number(row.payout).toLocaleString()} <span className="text-[9px] text-slate-500">TKN</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerHistoryPage;
