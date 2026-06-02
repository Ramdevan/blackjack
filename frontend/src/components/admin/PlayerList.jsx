import React from 'react';

const PlayerList = ({ users, handleAddChips }) => {
  return (
    <div className="animate-in fade-in duration-300">
      {/* User Management */}
      <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-white">Player List</h3>
          <p className="text-xs text-slate-500">Overview of registered wallets, active game counts, and chip balances. Fund individual player accounts directly.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-white/5">
                <th className="pb-3">Wallet Address</th>
                <th className="pb-3 text-right">Balance</th>
                <th className="pb-3 text-right">Games Played</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.length === 0 ? (
                <tr>
                  <td colSpan="3" className="text-center py-8 text-xs text-slate-500 uppercase tracking-widest font-mono">
                    No players registered yet
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 font-mono text-xs text-slate-300">
                      {u.wallet_address ? u.wallet_address : 'No Wallet Address'}
                    </td>
                    <td className="py-3 text-right text-emerald-400 font-bold">{Number(u.balance).toFixed(2)} Chips</td>
                    <td className="py-3 text-right text-white font-medium">{u.gamesPlayed}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PlayerList;
