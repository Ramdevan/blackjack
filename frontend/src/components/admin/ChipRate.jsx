import React from 'react';

const ChipRate = ({ settings, newPriceInput, setNewPriceInput, handleUpdatePriceForm }) => {
  return (
    <div className="animate-in fade-in duration-300 max-w-2xl">
      <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-red-600/5 rounded-full blur-[100px] pointer-events-none"></div>
        
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-3">
          <span className="p-2 bg-red-600/20 text-red-500 rounded-xl">🪙</span>
          Chip Rate Configuration
        </h3>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          Configure the exchange rate of standard stablecoins (USDT) to in-game Chips. Players purchasing chips will receive them according to this rate.
        </p>

        {/* Current Price Card */}
        <div className="p-5 rounded-xl border border-white/5 bg-white/5 mb-6">
          <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest block mb-1">Active Exchange Rate</span>
          <div className="text-3xl font-black text-emerald-400 tracking-tighter">
            1 USDT = {Number(settings.token_price).toLocaleString()} Chips
          </div>
        </div>

        <form onSubmit={handleUpdatePriceForm} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">New Exchange Rate (Chips per 1 USDT)</label>
            <input
              type="number"
              placeholder="e.g. 1000"
              value={newPriceInput}
              onChange={(e) => setNewPriceInput(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={!newPriceInput || isNaN(newPriceInput)}
            className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-xl hover:scale-[1.01] active:scale-95 shadow-xl shadow-red-600/10 flex items-center justify-center gap-2 uppercase tracking-widest transition-all disabled:opacity-20 disabled:pointer-events-none"
          >
            Update Exchange Rate
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChipRate;
