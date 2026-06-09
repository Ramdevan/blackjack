import React from 'react';

const FundStatCard = ({ label, value, unit, addr, accent, icon, badge, badgeClass }) => (
  <div style={{
    position: 'relative', overflow: 'hidden', padding: '20px', borderRadius: '16px',
    background: 'rgba(8,4,20,0.85)', border: `1px solid ${accent}33`,
    boxShadow: `0 0 20px ${accent}18`, backdropFilter: 'blur(12px)'
  }}>
    <div style={{ position: 'absolute', top: 0, right: 0, padding: '14px', fontSize: '38px', opacity: 0.8, pointerEvents: 'none' }}>{icon}</div>
    <div style={{ position: 'relative', zIndex: 1 }}>
      <div style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(230, 230, 230, 1)', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', marginBottom: '10px' }}>
        {Number(value).toLocaleString()} <span style={{ fontSize: '14px', color: 'rgba(249, 243, 243, 0.95)' }}>{unit}</span>
      </div>
      {badge && <span className={`admin-badge ${badgeClass}`}>{badge}</span>}
      {addr && <div style={{ marginTop: '10px', fontSize: '13px', fontFamily: 'monospace', color: 'rgba(240, 243, 247, 1)' }}>{addr.slice(0,14)}...{addr.slice(-10)}</div>}
    </div>
  </div>
);

const OnChainFunds = ({
  onChainStats, fundAmount, setFundAmount, withdrawAmount, setWithdrawAmount,
  fundsLoading, handleFundDealer, handleWithdrawChips, CONTRACT_ADDRESS, TOKEN_ADDRESS, address
}) => (
  <div className="animate-in fade-in duration-300" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

    {/* Stat cards */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
      <FundStatCard
        label="Dealer Balance" value={onChainStats.dealerBalance} unit="Chips" icon="🃏"
        accent="#10b981" addr={CONTRACT_ADDRESS}
        badge={Number(onChainStats.dealerBalance) < 100 ? '⚠️ Low — Fund Now' : '🟢 Healthy'}
        badgeClass={Number(onChainStats.dealerBalance) < 100 ? 'admin-badge--amber' : 'admin-badge--green'}
      />
      <FundStatCard
        label="Admin Wallet" value={onChainStats.adminBalance} unit="Chips" icon="💼"
        accent="#3b82f6" addr={address}
        badge="Connected Admin" badgeClass="admin-badge--blue"
      />
      <FundStatCard
        label="Circulating Supply" value={onChainStats.totalSupply} unit="Chips" icon="🌐"
        accent="#8b5cf6" addr={TOKEN_ADDRESS}
        badge="Total Supply" badgeClass="admin-badge--purple"
      />
    </div>

    {/* Action forms */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>

      {/* Fund dealer */}
      <div className="admin-panel" style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '160px', height: '160px', background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)', pointerEvents: 'none' }}></div>
        <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#fff', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ padding: '5px', background: 'rgba(16,185,129,0.15)', borderRadius: '8px' }}>➕</span>
          Fund Dealer Contract
        </h3>
        <p style={{ fontSize: '15px', color: 'rgba(100,116,139,0.65)', marginBottom: '16px', lineHeight: 1.5 }}>
          Transfer chips from your admin wallet into the Blackjack smart contract.
        </p>
        <form onSubmit={handleFundDealer} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 900, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(100,116,139,0.6)', marginBottom: '6px' }}>Amount (Chips)</label>
            <input type="number" placeholder="e.g. 5000" value={fundAmount} onChange={e => setFundAmount(e.target.value)} disabled={fundsLoading} className="admin-input" />
          </div>
          <button type="submit" disabled={fundsLoading || !fundAmount} className="admin-btn-green">
            {fundsLoading ? 'Processing...' : 'Transfer & Fund Dealer'}
          </button>
        </form>
      </div>

      {/* Withdraw */}
      <div className="admin-panel" style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '160px', height: '160px', background: 'radial-gradient(circle, rgba(249,115,22,0.08) 0%, transparent 70%)', pointerEvents: 'none' }}></div>
        <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#fff', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ padding: '5px', background: 'rgba(249,115,22,0.15)', borderRadius: '8px' }}>💸</span>
          Withdraw Excess Profits
        </h3>
        <p style={{ fontSize: '15px', color: 'rgba(100,116,139,0.65)', marginBottom: '16px', lineHeight: 1.5 }}>
          Retrieve outstanding profits from the contract back to your admin wallet.
        </p>
        <form onSubmit={handleWithdrawChips} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 900, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(100,116,139,0.6)', marginBottom: '6px' }}>Amount (Chips)</label>
            <input type="number" placeholder="e.g. 2000" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} disabled={fundsLoading} className="admin-input" />
          </div>
          <button type="submit" disabled={fundsLoading || !withdrawAmount || Number(withdrawAmount) > Number(onChainStats.dealerBalance)} className="admin-btn-orange">
            {fundsLoading ? 'Processing...' : 'Withdraw Excess Profits'}
          </button>
        </form>
      </div>
    </div>
  </div>
);

export default OnChainFunds;
