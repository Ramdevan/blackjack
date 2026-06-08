import React, { useState } from 'react';

const StatCard = ({ title, value, icon, color }) => (
  <div className={`relative overflow-hidden p-5 rounded-2xl border border-white/10 bg-gradient-to-br ${color} group hover:scale-[1.02] transition-all`}>
    <div className="absolute top-0 right-0 p-4 opacity-10 text-5xl transform group-hover:scale-110 transition-transform">{icon}</div>
    <div className="relative z-10">
      <div className="text-white/60 text-xs font-black uppercase tracking-widest mb-1">{title}</div>
      <div className="text-2xl font-black text-white tracking-tighter">{value}</div>
    </div>
  </div>
);

const Dashboard = ({ stats, history }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Calculate pagination bounds
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = history.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(history.length / itemsPerPage);

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  return (
    <div className="animate-in fade-in duration-300 flex flex-col gap-6">
      {/* Main Dashboard Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-2">
        <StatCard title="Total Players" value={stats.totalUsers} icon="👥" color="from-blue-600 to-indigo-700" />
        <StatCard title="Total Volume" value={`${Number(stats.totalBets).toLocaleString()} Chips`} icon="💰" color="from-emerald-600 to-teal-700" />
        <StatCard title="House Profit" value={`${Number(stats.houseProfit).toLocaleString()} Chips`} icon="🏛️" color="from-orange-600 to-red-700" />
        <StatCard title="Platform Fees" value={`${Number(stats.totalFees || 0).toLocaleString()} Chips`} icon="🎟️" color="from-violet-600 to-fuchsia-700" />
      </div>

      {/* Recent History / Live Activity spanning wide */}
      <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
        <h3 className="text-lg font-bold text-white mb-4">Live Activity</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-white/5">
                <th className="pb-3 text-left pl-3">Game Mode</th>
                <th className="pb-3 text-left">Player Address</th>
                <th className="pb-3 text-center">Outcome</th>
                <th className="pb-3 text-right">Net Payout</th>
                <th className="pb-3 text-right pr-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {history.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-8 text-xs text-slate-500 uppercase tracking-widest font-mono">
                    No recent games logged
                  </td>
                </tr>
              ) : (
                currentItems.map((h) => (
                  <tr key={h.id} className="hover:bg-white/[2%] transition-all">
                    {/* Game Mode */}
                    <td className="py-3 text-left pl-3">
                      <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border inline-block ${
                        h.game_mode === 'multiplayer' 
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
                          : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                      }`}>
                        {h.game_mode === 'multiplayer' ? 'Multiplayer' : 'Single Player'}
                      </span>
                    </td>

                    {/* Player Address */}
                    <td className="py-3 text-left font-mono text-xs text-slate-300">
                      {h.wallet_address ? `${h.wallet_address.slice(0, 6)}...${h.wallet_address.slice(-4)}` : 'Unknown'}
                    </td>

                    {/* Outcome */}
                    <td className="py-3 text-center">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border inline-block min-w-[70px] ${
                        h.result === 'win' 
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' 
                          : h.result === 'push'
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                          : 'bg-red-500/15 text-red-400 border-red-500/20'
                      }`}>
                        {h.result}
                      </span>
                    </td>

                    {/* Net Payout */}
                    <td className={`py-3 text-right text-xs font-black ${h.payout > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {h.payout > 0 ? `+${Number(h.payout).toFixed(2)} Chips` : `-${Number(h.bet_amount).toFixed(2)} Chips`}
                    </td>

                    {/* Time */}
                    <td className="py-3 text-right text-[10px] text-white font-medium pr-3">
                      {new Date(h.created_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/5">
            <button
              onClick={prevPage}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest text-slate-300 disabled:opacity-30 disabled:pointer-events-none rounded-xl border border-white/5 transition-all"
            >
              Previous
            </button>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-black">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={nextPage}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest text-slate-300 disabled:opacity-30 disabled:pointer-events-none rounded-xl border border-white/5 transition-all"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
