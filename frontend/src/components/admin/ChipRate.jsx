import React from 'react';

const ChipRate = ({ settings, newPriceInput, setNewPriceInput, handleUpdatePriceForm }) => (
  <div className="animate-in fade-in duration-300" style={{ maxWidth: '600px' }}>
    <div className="admin-panel" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-80px', right: '-80px', width: '220px', height: '220px', background: 'radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)', pointerEvents: 'none' }}></div>

      <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ padding: '6px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px' }}>🪙</span>
        Chip Rate Configuration
      </h3>
      <p style={{ fontSize: '15px', color: 'rgba(100,116,139,0.7)', marginBottom: '24px', lineHeight: 1.6 }}>
        Configure the exchange rate of stablecoins (USDT) to in-game Chips.
      </p>

      {/* Current rate */}
      <div style={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.06)', marginBottom: '24px' }}>
        <div style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(100,116,139,0.6)', marginBottom: '6px' }}>Active Exchange Rate</div>
        <div style={{ fontSize: '30px', fontWeight: 900, color: '#6ee7b7', letterSpacing: '-0.5px' }}>
          1 USDT = {Number(settings.token_price).toLocaleString()} Chips
        </div>
      </div>

      <form onSubmit={handleUpdatePriceForm} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 900, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(100,116,139,0.7)', marginBottom: '8px' }}>
            New Exchange Rate (Chips per 1 USDT)
          </label>
          <input
            type="number"
            placeholder="e.g. 1000"
            value={newPriceInput}
            onChange={e => setNewPriceInput(e.target.value)}
            className="admin-input"
          />
        </div>
        <button
          type="submit"
          disabled={!newPriceInput || isNaN(newPriceInput)}
          className="admin-btn-red"
        >
          Update Exchange Rate
        </button>
      </form>
    </div>
  </div>
);

export default ChipRate;
