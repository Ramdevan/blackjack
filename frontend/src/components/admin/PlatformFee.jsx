import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { CONTRACT_ADDRESS, blackjackABI } from '../../utils/contract';

const PlatformFee = ({ address }) => {
  const [currentFeeBps, setCurrentFeeBps] = useState(null);
  const [newFeeInput, setNewFeeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => { if (address) fetchCurrentFee(); }, [address]);

  const fetchCurrentFee = async () => {
    if (!window.ethereum || !address) return;
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const blackjackContract = new ethers.Contract(CONTRACT_ADDRESS, blackjackABI, provider);
      const bps = await blackjackContract.platformFeeBps();
      setCurrentFeeBps(Number(bps));
    } catch (err) { toast.error('Could not fetch platform fee.'); }
    finally { setLoading(false); }
  };

  const handleUpdateFeeForm = async (e) => {
    e.preventDefault();
    if (!newFeeInput || isNaN(newFeeInput) || Number(newFeeInput) < 0 || Number(newFeeInput) > 10) {
      toast.error('Enter a valid percentage between 0% and 10%!');
      return;
    }
    if (!window.ethereum) return;
    setUpdating(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const blackjackContract = new ethers.Contract(CONTRACT_ADDRESS, blackjackABI, signer);
      const bpsValue = Math.round(Number(newFeeInput) * 100);
      const tx = await blackjackContract.setPlatformFee(bpsValue);
      toast.loading('Updating fee...', { id: 'fee_tx' });
      await tx.wait();
      toast.success(`Fee updated to ${newFeeInput}% (${bpsValue} BPS)!`, { id: 'fee_tx' });
      setNewFeeInput('');
      fetchCurrentFee();
    } catch (err) { toast.error('Transaction failed: ' + (err.reason || err.message), { id: 'fee_tx' }); }
    finally { setUpdating(false); }
  };

  return (
    <div className="animate-in fade-in duration-300" style={{ maxWidth: '600px' }}>
      <div className="admin-panel" style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-80px', right: '-80px', width: '220px', height: '220px', background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)', pointerEvents: 'none' }}></div>

        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ padding: '6px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px' }}>🎟️</span>
          Platform Fee Configuration
        </h3>
        <p style={{ fontSize: '15px', color: 'rgba(100,116,139,0.7)', marginBottom: '24px', lineHeight: 1.6 }}>
          Set the platform commission fee charged on winning hands. Automatically deducted from payouts on-chain.
        </p>

        {/* Current fee display */}
        <div style={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.06)', marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(100,116,139,0.6)', marginBottom: '6px' }}>Active On-Chain Fee</div>
          <div style={{ fontSize: '30px', fontWeight: 900, color: '#c4b5fd', letterSpacing: '-0.5px' }}>
            {loading ? (
              <span style={{ fontSize: '14px', color: 'rgba(196,181,253,0.5)', animation: 'pulse 1.5s infinite' }}>Loading...</span>
            ) : currentFeeBps !== null ? (
              `${(currentFeeBps / 100).toFixed(2)}% (${currentFeeBps} BPS)`
            ) : 'Disconnected'}
          </div>
        </div>

        <form onSubmit={handleUpdateFeeForm} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 900, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(100,116,139,0.7)', marginBottom: '8px' }}>
              New Fee Percentage (0% to 10%)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="number" step="0.01" min="0" max="10"
                placeholder="e.g. 1.5"
                value={newFeeInput}
                onChange={e => setNewFeeInput(e.target.value)}
                disabled={updating || loading}
                className="admin-input"
                style={{ paddingRight: '40px' }}
              />
              <div style={{ position: 'absolute', inset: '0', right: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '16px', pointerEvents: 'none', color: 'rgba(148,163,184,0.5)', fontWeight: 700 }}>%</div>
            </div>
          </div>
          <button type="submit" disabled={updating || loading || !newFeeInput || isNaN(newFeeInput)} className="admin-btn-red">
            {updating ? 'Updating...' : 'Update Platform Fee'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PlatformFee;
