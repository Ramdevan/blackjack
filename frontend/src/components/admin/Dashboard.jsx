import React, { useState } from 'react';

const STAT_VARIANTS = [
  { color: '--blue',   glow: 'rgba(59,130,246,0.35)'  },
  { color: '--green',  glow: 'rgba(16,185,129,0.35)'  },
  { color: '--orange', glow: 'rgba(249,115,22,0.35)'  },
  { color: '--purple', glow: 'rgba(139,92,246,0.35)'  },
];

const StatCard = ({ title, value, icon, variantIndex }) => {
  const v = STAT_VARIANTS[variantIndex % 4];
  return (
    <div className={`admin-stat-card admin-stat-card${v.color}`}>
      <div style={{
        position: 'absolute', top: 0, right: 0, padding: '14px',
        fontSize: '40px', opacity: 0.8, pointerEvents: 'none',
        filter: `drop-shadow(0 0 8px ${v.glow})`
      }}>{icon}</div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(230, 230, 230, 1)', marginBottom: '6px' }}>{title}</div>
        <div style={{ fontSize: '26px', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>{value}</div>
      </div>
    </div>
  );
};

const Dashboard = ({ stats, history }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const indexOfLastItem = currentPage * itemsPerPage;
  const currentItems = history.slice(indexOfLastItem - itemsPerPage, indexOfLastItem);
  const totalPages = Math.ceil(history.length / itemsPerPage);

  return (
    <div className="animate-in fade-in duration-300" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
        <StatCard title="Total Players" value={stats.totalUsers} icon="👥" variantIndex={0} />
        <StatCard title="Total Volume" value={`${Number(stats.totalBets).toLocaleString()} Chips`} icon="💰" variantIndex={1} />
        <StatCard title="House Profit" value={`${Number(stats.houseProfit).toLocaleString()} Chips`} icon="🏛️" variantIndex={2} />
        <StatCard title="Platform Fees" value={`${Number(stats.totalFees || 0).toLocaleString()} Chips`} icon="🎟️" variantIndex={3} />
      </div>

      {/* Live Activity Table */}
      <div className="admin-panel">
        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', marginBottom: '16px', letterSpacing: '1px', textTransform: 'uppercase' }}>
          Live Activity
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingLeft: '8px' }}>Game Mode</th>
                <th style={{ textAlign: 'left' }}>Player</th>
                <th style={{ textAlign: 'center' }}>Outcome</th>
                <th style={{ textAlign: 'right' }}>Net Payout</th>
                <th style={{ textAlign: 'right', paddingRight: '8px' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '32px 0', fontSize: '13px', color: 'rgba(100,116,139,0.6)', letterSpacing: '2px', textTransform: 'uppercase' }}>
                    No recent games logged
                  </td>
                </tr>
              ) : (
                currentItems.map((h) => (
                  <tr key={h.id}>
                    <td style={{ paddingLeft: '8px' }}>
                      <span className={`admin-badge ${h.game_mode === 'multiplayer' ? 'admin-badge--purple' : 'admin-badge--blue'}`}>
                        {h.game_mode === 'multiplayer' ? 'Multiplayer' : 'Single'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '15px' }}>
                      {h.wallet_address ? `${h.wallet_address.slice(0, 6)}...${h.wallet_address.slice(-4)}` : 'Unknown'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`admin-badge ${h.result === 'win' ? 'admin-badge--green' : h.result === 'push' ? 'admin-badge--amber' : 'admin-badge--red'}`}>
                        {h.result}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: h.payout > 0 ? '#10e590ff' : '#f9385eff' }}>
                      {h.payout > 0 ? `+${Number(h.payout).toFixed(2)}` : `-${Number(h.bet_amount).toFixed(2)}`} Chips
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: '8px', fontSize: '15px', color: 'rgba(244, 245, 246, 0.91)' }}>
                      {new Date(h.created_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '16px', marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#94a3b8', fontSize: '13px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer', opacity: currentPage === 1 ? 0.3 : 1 }}>
              Previous
            </button>
            <span style={{ fontSize: '13px', color: 'rgba(100,116,139,0.7)', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 700 }}>
              Page {currentPage} of {totalPages}
            </span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#94a3b8', fontSize: '13px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer', opacity: currentPage === totalPages ? 0.3 : 1 }}>
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
