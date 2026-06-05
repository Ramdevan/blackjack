import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { CONTRACT_ADDRESS, blackjackABI } from '../../utils/contract';

const PlatformFee = ({ address }) => {
  const [currentFeeBps, setCurrentFeeBps] = useState(null);
  const [newFeeInput, setNewFeeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (address) {
      fetchCurrentFee();
    }
  }, [address]);

  const fetchCurrentFee = async () => {
    if (!window.ethereum || !address) return;
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const blackjackContract = new ethers.Contract(CONTRACT_ADDRESS, blackjackABI, provider);
      const bps = await blackjackContract.platformFeeBps();
      setCurrentFeeBps(Number(bps));
    } catch (err) {
      console.error("Failed to fetch platform fee:", err);
      toast.error("Could not fetch current platform fee from contract.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateFeeForm = async (e) => {
    e.preventDefault();
    if (!newFeeInput || isNaN(newFeeInput) || Number(newFeeInput) < 0 || Number(newFeeInput) > 10) {
      toast.error("Please enter a valid percentage between 0% and 10%!");
      return;
    }
    if (!window.ethereum) return;

    setUpdating(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const blackjackContract = new ethers.Contract(CONTRACT_ADDRESS, blackjackABI, signer);

      // Convert percentage to basis points (bps)
      const bpsValue = Math.round(Number(newFeeInput) * 100);

      const tx = await blackjackContract.setPlatformFee(bpsValue);
      toast.loading("Update fee transaction submitted! Waiting for confirmation...", { id: 'fee_tx' });
      await tx.wait();
      toast.success(`Platform fee successfully updated to ${newFeeInput}% (${bpsValue} BPS)!`, { id: 'fee_tx' });
      setNewFeeInput('');
      fetchCurrentFee();
    } catch (err) {
      console.error("Failed to update platform fee:", err);
      toast.error("Transaction failed: " + (err.reason || err.message), { id: 'fee_tx' });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-300 max-w-2xl">
      <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-red-600/5 rounded-full blur-[100px] pointer-events-none"></div>
        
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-3">
          <span className="p-2 bg-red-600/20 text-red-500 rounded-xl">🎟️</span>
          Platform Fee Configuration
        </h3>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          Set the platform commission fee charged on winning hands. This fee is automatically deducted from payouts on-chain and remains in the dealer contract for administrative withdrawal.
        </p>

        {/* Current Fee Card */}
        <div className="p-5 rounded-xl border border-white/5 bg-white/5 mb-6">
          <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest block mb-1">Active On-Chain Fee</span>
          <div className="text-3xl font-black text-emerald-400 tracking-tighter">
            {loading ? (
              <span className="animate-pulse">Loading fee...</span>
            ) : currentFeeBps !== null ? (
              `${(currentFeeBps / 100).toFixed(2)}% (${currentFeeBps} BPS)`
            ) : (
              'Disconnected'
            )}
          </div>
        </div>

        <form onSubmit={handleUpdateFeeForm} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">New Fee Percentage (0% to 10%)</label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                max="10"
                placeholder="e.g. 1.5"
                value={newFeeInput}
                onChange={(e) => setNewFeeInput(e.target.value)}
                disabled={updating || loading}
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-4 pr-12 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-500 transition-colors disabled:opacity-50"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-slate-400 text-sm font-bold">%</div>
            </div>
          </div>
          <button
            type="submit"
            disabled={updating || loading || !newFeeInput || isNaN(newFeeInput)}
            className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-xl hover:scale-[1.01] active:scale-95 shadow-xl shadow-red-600/10 flex items-center justify-center gap-2 uppercase tracking-widest transition-all disabled:opacity-20 disabled:pointer-events-none"
          >
            {updating ? "Updating..." : "Update Platform Fee"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PlatformFee;
