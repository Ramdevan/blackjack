import React from 'react';

const PlayerList = ({ users, handleAddChips }) => (
  <div className="animate-in fade-in duration-300">
    <div className="admin-panel">
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Player List</h3>
        <p style={{ fontSize: '15px', color: 'rgba(100,116,139,0.7)' }}>Overview of registered wallets, active game counts, and chip balances.</p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Wallet Address</th>
              <th style={{ textAlign: 'right' }}>Balance</th>
              <th style={{ textAlign: 'right' }}>Games Played</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', padding: '32px 0', fontSize: '11px', color: 'rgba(100,116,139,0.6)', letterSpacing: '2px', textTransform: 'uppercase' }}>
                  No players registered yet
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '15px' }}>
                    {u.wallet_address || 'No Wallet Address'}
                  </td>
                  <td style={{ textAlign: 'right', color: '#6ee7b7', fontWeight: 700 }}>
                    {Number(u.balance).toFixed(2)} Chips
                  </td>
                  <td style={{ textAlign: 'right', color: '#94a3b8' }}>{u.gamesPlayed}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      onClick={() => handleAddChips(u.wallet_address)}
                      style={{ padding: '5px 12px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', fontSize: '9px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(16,185,129,0.25)'}
                      onMouseOut={e => e.currentTarget.style.background = 'rgba(16,185,129,0.12)'}
                    >
                      + Add Chips
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default PlayerList;
