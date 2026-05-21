import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const AdminPanel = ({ address, connectWallet, isConnecting, handleLogout }) => {
  const [stats, setStats] = useState({ totalUsers: 0, totalBets: 0, houseProfit: 0 });
  const [settings, setSettings] = useState({ token_price: '1000' });
  const [users, setUsers] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [sRes, uRes, hRes, setRes] = await Promise.all([
        axios.get('http://localhost:5000/api/admin/stats'),
        axios.get('http://localhost:5000/api/admin/users'),
        axios.get('http://localhost:5000/api/admin/history'),
        axios.get('http://localhost:5000/api/admin/settings')
      ]);
      setStats(sRes.data);
      setUsers(uRes.data);
      setHistory(hRes.data);
      setSettings(setRes.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleAddChips = async (userAddress) => {
    const amount = prompt(`Enter chip amount to add for ${userAddress.slice(0, 6)}...:`);
    if (!amount || isNaN(amount) || Number(amount) <= 0) return;

    try {
      const res = await axios.post('http://localhost:5000/api/token/credit', {
        address: userAddress,
        amount: amount
      });
      if (res.data.success) {
        alert(`Successfully added ${amount} chips!`);
        fetchData(); // Refresh user list
      }
    } catch (err) {
      console.error(err);
      alert("Failed to add chips: " + (err.response?.data?.error || err.message));
    }
  };

  const handleUpdatePrice = async () => {
    const newPrice = prompt("Enter new chip rate (Chips per 1 USDT):", settings.token_price);
    if (!newPrice || isNaN(newPrice) || Number(newPrice) <= 0) return;

    try {
      await axios.post('http://localhost:5000/api/admin/settings', { key: 'token_price', value: newPrice });
      setSettings({ ...settings, token_price: newPrice });
      alert("Token price updated!");
    } catch (err) {
      console.error(err);
      alert("Failed to update price");
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen text-white text-2xl animate-pulse">Loading Admin Data...</div>;

  return (
    <div className="w-full max-w-7xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Admin Header with Wallet Connect */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-12 gap-8">
        <div className="flex items-center gap-6">
          <Link to="/" className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-white/5 shadow-lg">← Lobby</Link>
          <h2 className="text-4xl font-black text-white flex items-center gap-4">
            <span className="p-3 bg-red-600 rounded-2xl shadow-xl shadow-red-600/20">🛡️</span>
            Admin Control
          </h2>
        </div>

        <div className="flex items-center gap-6">
          <a 
            href="https://testnet.bnbchain.org/faucet-smart" 
            target="_blank" 
            rel="noreferrer"
            className="hidden lg:block px-6 py-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-yellow-500/20 transition-all"
          >
            BSC Faucet ↗
          </a>

          {address ? (
            <div className="flex items-center gap-3 bg-black/40 border border-white/10 px-4 py-2 rounded-2xl">
              <div className="flex flex-col items-end">
                <span className="text-white text-[10px] font-black tracking-tighter uppercase">{address.slice(0,6)}...{address.slice(-4)}</span>
                <button onClick={handleLogout} className="text-[9px] text-slate-500 hover:text-red-400 font-bold uppercase transition-colors">Logout</button>
              </div>
              <div className="w-8 h-8 bg-emerald-500/20 text-emerald-500 rounded-lg flex items-center justify-center text-xs">🛡️</div>
            </div>
          ) : (
            <button 
              onClick={connectWallet}
              disabled={isConnecting}
              className="px-8 py-3 bg-white text-black font-black text-[10px] rounded-xl hover:scale-105 active:scale-95 transition-all uppercase tracking-widest shadow-xl shadow-white/5"
            >
              {isConnecting ? "Connecting..." : "Connect Admin Wallet"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
        <StatCard title="Total Players" value={stats.totalUsers} icon="👥" color="from-blue-600 to-indigo-700" />
        <StatCard title="Total Volume" value={`$${Number(stats.totalBets).toLocaleString()}`} icon="💰" color="from-emerald-600 to-teal-700" />
        <StatCard title="House Profit" value={`$${Number(stats.houseProfit).toLocaleString()}`} icon="🏛️" color="from-orange-600 to-red-700" />
        <div className="relative overflow-hidden p-8 rounded-[32px] border border-white/10 bg-black/40 group transition-all">
          <div className="text-white/60 text-xs font-black uppercase tracking-widest mb-2">Chip Rate</div>
          <div className="text-3xl font-black text-emerald-400 tracking-tighter">1 USDT = {Number(settings.token_price).toLocaleString()} Chips</div>
          <button onClick={handleUpdatePrice} className="mt-4 text-[10px] text-white/40 hover:text-white font-bold uppercase tracking-widest underline decoration-dotted">Edit Rate</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* User Management */}
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-[32px] p-8">
          <h3 className="text-xl font-bold text-white mb-6">Top Players</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-white/5">
                  <th className="pb-4">Wallet</th>
                  <th className="pb-4 text-right">Balance</th>
                  <th className="pb-4 text-right">Games</th>
                  <th className="pb-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-4 font-mono text-xs text-slate-300">
                      {u.wallet_address ? `${u.wallet_address.slice(0, 8)}...${u.wallet_address.slice(-6)}` : 'No Wallet'}
                    </td>
                    <td className="py-4 text-right text-emerald-400 font-bold">${Number(u.balance).toFixed(2)}</td>
                    <td className="py-4 text-right text-white font-medium">{u.gamesPlayed}</td>
                    <td className="py-4 text-right">
                      <button 
                        onClick={() => handleAddChips(u.wallet_address)}
                        className="px-3 py-1 bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500 hover:text-black rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-emerald-500/20"
                      >
                        Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent History */}
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-[32px] p-8">
          <h3 className="text-xl font-bold text-white mb-6">Live Activity</h3>
          <div className="space-y-4">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">
                    {h.wallet_address ? `${h.wallet_address.slice(0, 6)}...` : 'Unknown'}
                  </span>
                  <span className="text-white text-sm font-bold capitalize">{h.result}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className={`text-sm font-black ${h.payout > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {h.payout > 0 ? `+$${h.payout}` : `-$${h.bet_amount}`}
                  </span>
                  <span className="text-[10px] text-slate-600">{new Date(h.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, color }) => (
  <div className={`relative overflow-hidden p-8 rounded-[32px] border border-white/10 bg-gradient-to-br ${color} group hover:scale-[1.02] transition-all`}>
    <div className="absolute top-0 right-0 p-8 opacity-20 text-6xl transform group-hover:scale-125 transition-transform">{icon}</div>
    <div className="relative z-10">
      <div className="text-white/60 text-xs font-black uppercase tracking-widest mb-2">{title}</div>
      <div className="text-4xl font-black text-white tracking-tighter">{value}</div>
    </div>
  </div>
);

export default AdminPanel;
