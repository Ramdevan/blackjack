import React from 'react';

const OnChainFunds = ({
  onChainStats,
  fundAmount,
  setFundAmount,
  withdrawAmount,
  setWithdrawAmount,
  fundsLoading,
  handleFundDealer,
  handleWithdrawChips,
  CONTRACT_ADDRESS,
  TOKEN_ADDRESS,
  address
}) => {
  return (
    <div className="animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        
        {/* Dealer Contract Balance Card */}
        <div className="relative overflow-hidden p-5 rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-600 to-teal-700 shadow-xl">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-5xl">🃏</div>
          <div className="relative z-10">
            <div className="text-white/60 text-xs font-black uppercase tracking-widest mb-1">Dealer Balance</div>
            <div className="text-3xl font-black text-white tracking-tighter mb-3">
              {Number(onChainStats.dealerBalance).toLocaleString()} <span className="text-xs">Chips</span>
            </div>
            {Number(onChainStats.dealerBalance) < 100 ? (
              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-[9px] font-black rounded-full border border-amber-500/30 uppercase tracking-widest">
                ⚠️ Low Balance: Fund Now
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-white/20 text-white text-[9px] font-black rounded-full border border-white/10 uppercase tracking-widest">
                🟢 Healthy Balance
              </span>
            )}
            <div className="mt-3 text-[9px] font-mono text-white/50">{CONTRACT_ADDRESS.slice(0, 14)}...{CONTRACT_ADDRESS.slice(-10)}</div>
          </div>
        </div>

        {/* Admin Wallet Balance Card */}
        <div className="relative overflow-hidden p-5 rounded-2xl border border-white/10 bg-gradient-to-br from-blue-600 to-indigo-700 shadow-xl">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-5xl">💼</div>
          <div className="relative z-10">
            <div className="text-white/60 text-xs font-black uppercase tracking-widest mb-1">Admin Wallet Balance</div>
            <div className="text-3xl font-black text-white tracking-tighter mb-3">
              {Number(onChainStats.adminBalance).toLocaleString()} <span className="text-xs">Chips</span>
            </div>
            <span className="px-2 py-0.5 bg-white/20 text-white text-[9px] font-black rounded-full border border-white/10 uppercase tracking-widest">
              Connected Admin
            </span>
            <div className="mt-3 text-[9px] font-mono text-white/50">{address.slice(0, 14)}...{address.slice(-10)}</div>
          </div>
        </div>

        {/* Total supply card */}
        <div className="relative overflow-hidden p-5 rounded-2xl border border-white/10 bg-gradient-to-br from-purple-600 to-fuchsia-700 shadow-xl">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-5xl">🌐</div>
          <div className="relative z-10">
            <div className="text-white/60 text-xs font-black uppercase tracking-widest mb-1">Circulating Supply</div>
            <div className="text-3xl font-black text-white tracking-tighter mb-3">
              {Number(onChainStats.totalSupply).toLocaleString()} <span className="text-xs">Chips</span>
            </div>
            <span className="px-2 py-0.5 bg-white/20 text-white text-[9px] font-black rounded-full border border-white/10 uppercase tracking-widest">
              Total Circulating
            </span>
            <div className="mt-3 text-[9px] font-mono text-white/50">{TOKEN_ADDRESS.slice(0, 14)}...{TOKEN_ADDRESS.slice(-10)}</div>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Fund Dealer (Transfer) Form */}
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>
          <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            <span className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">➕</span>
            Fund Dealer Contract
          </h3>
          <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
            Transfer game chips directly from your connected MetaMask admin wallet balance into the Blackjack smart contract balance.
          </p>

          <form onSubmit={handleFundDealer} className="space-y-3">
            <div>
              <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Amount to Fund (Chips)</label>
              <input
                type="number"
                placeholder="e.g. 5000"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                disabled={fundsLoading}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={fundsLoading || !fundAmount}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs rounded-xl hover:scale-[1.01] active:scale-95 shadow-xl shadow-emerald-500/10 flex items-center justify-center gap-2 uppercase tracking-widest transition-all disabled:opacity-20 disabled:pointer-events-none"
            >
              {fundsLoading ? (
                <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
              ) : (
                "Transfer & Fund Dealer"
              )}
            </button>
          </form>
        </div>

        {/* Withdraw Dealer Profit Form */}
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-500/5 rounded-full blur-[100px] pointer-events-none"></div>
          <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            <span className="p-1.5 bg-orange-500/20 text-orange-400 rounded-lg">💸</span>
            Withdraw Excess Profits
          </h3>
          <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
            Tolerate or retrieve outstanding game chip profits accumulated inside the Blackjack smart contract directly back into your authorized admin wallet.
          </p>

          <form onSubmit={handleWithdrawChips} className="space-y-3">
            <div>
              <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Amount to Withdraw (Chips)</label>
              <input
                type="number"
                placeholder="e.g. 2000"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                disabled={fundsLoading}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={fundsLoading || !withdrawAmount || Number(withdrawAmount) > Number(onChainStats.dealerBalance)}
              className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-black font-black text-xs rounded-xl hover:scale-[1.01] active:scale-95 shadow-xl shadow-orange-500/10 flex items-center justify-center gap-2 uppercase tracking-widest transition-all disabled:opacity-20 disabled:pointer-events-none"
            >
              {fundsLoading ? (
                <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
              ) : (
                "Withdraw Excess Profits"
              )}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default OnChainFunds;
