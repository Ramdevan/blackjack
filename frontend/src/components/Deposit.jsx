import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import axios from 'axios';
import { getUSDTContract, getTokenContract, ADMIN_WALLET } from '../utils/contract';

const Deposit = ({ address, connectWallet, isConnecting, setBalance }) => {
  const navigate = useNavigate();
  const [usdtAmount, setUsdtAmount] = useState('');
  const [usdtBalance, setUsdtBalance] = useState('0');
  const [tknBalance, setTknBalance] = useState('0');
  const [loading, setLoading] = useState(false);

  const [chipRate, setChipRate] = useState(1000); // Default: 1 USDT = 1000 Chips

  useEffect(() => {
    if (!address) {
      // If someone visits /deposit directly without wallet, send them back
      navigate('/');
      return;
    }
    fetchData();
  }, [address, navigate]);

  const fetchData = async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const usdt = getUSDTContract(provider);
      const tkn = getTokenContract(provider);

      const [uBal, tBal, uDec, tDec] = await Promise.all([
        usdt.balanceOf(address),
        tkn.balanceOf(address),
        usdt.decimals().catch(() => 18),
        tkn.decimals().catch(() => 18)
      ]);

      const formattedTkn = ethers.formatUnits(tBal, tDec);
      setUsdtBalance(ethers.formatUnits(uBal, uDec));
      setTknBalance(formattedTkn);
      
      // Update global balance in App.jsx header
      if (setBalance) setBalance(formattedTkn);

      // Fetch dynamic chip rate
      const setRes = await axios.get('http://localhost:5000/api/admin/settings');
      if (setRes.data.token_price) {
        setChipRate(Number(setRes.data.token_price));
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };

  const handleDeposit = async () => {
    if (!usdtAmount || Number(usdtAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    
    setLoading(true);
    const toastId = toast.loading("Initializing transaction...");

    try {
      if (!window.ethereum) throw new Error("No crypto wallet found");
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const usdt = getUSDTContract(signer);
      const tkn = getTokenContract(signer);

      // Fetch decimals dynamically to ensure correct parsing
      const uDec = await usdt.decimals().catch(() => 18);
      const amount = ethers.parseUnits(usdtAmount, uDec);

      // Check balance before transfer
      const currentBal = await usdt.balanceOf(address);
      if (currentBal < amount) {
        throw new Error(`Insufficient USDT balance. You have ${ethers.formatUnits(currentBal, uDec)} USDT`);
      }

      // 1. Transfer USDT to Admin
      console.log("Starting USDT transfer...");
      toast.loading("Sending USDT to House...", { id: toastId });
      const tx1 = await usdt.transfer(ADMIN_WALLET, amount);
      console.log("Transfer TX sent:", tx1.hash);
      await tx1.wait();
      console.log("Transfer TX confirmed");

      // 2. Transfer Chips via Backend
      toast.loading("Crediting your chips...", { id: toastId });
      const chipAmountRaw = (Number(usdtAmount) * chipRate).toFixed(0);
      
      try {
        console.log("Notifying backend to credit chips...");
        const response = await axios.post('http://localhost:5000/api/token/credit', {
          address: address,
          amount: chipAmountRaw
        });

        if (response.data.success) {
          toast.success(`Success! Received ${Number(usdtAmount) * chipRate} Chips.`, { id: toastId });
        } else {
          throw new Error(response.data.error || "Backend failed to credit chips");
        }
      } catch (mintErr) {
        console.error("Backend Minting Error:", mintErr);
        toast.error("USDT Sent! But chip credit failed. Contact admin.", { id: toastId });
      }

      fetchData();
      setUsdtAmount('');
    } catch (err) {
      console.error("Deposit error:", err);
      const errorMsg = err.reason || err.message || "Transaction failed";
      toast.error(errorMsg, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  if (!address) return null; // Component handles redirect in useEffect

  return (
    <div className="w-full max-w-xl mx-auto p-8 animate-in fade-in zoom-in duration-500 relative">
      <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-[40px] p-10 shadow-2xl overflow-hidden relative">
        
        {/* Close Button */}
        <button 
          onClick={() => navigate('/')}
          className="absolute top-6 right-6 w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-all z-20 border border-white/5"
        >
          ✕
        </button>

        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl -mr-16 -mt-16"></div>

        <h2 className="text-3xl font-black text-white mb-2">Buy Chips</h2>
        <p className="text-slate-400 text-sm mb-8 font-medium italic">Fixed Rate: 1 USDT = {chipRate.toLocaleString()} Chips</p>

        {/* Balance Display */}
        <div className="grid grid-cols-2 gap-4 mb-10">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
            <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Your USDT</div>
            <div className="text-xl font-bold text-white">{Number(usdtBalance).toFixed(2)}</div>
          </div>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
            <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Your Chips</div>
            <div className="text-xl font-bold text-emerald-400">{Number(tknBalance).toLocaleString()}</div>
          </div>
        </div>

        {/* Input Area */}
        <div className="space-y-6">
          <div className="relative">
            <input
              type="number"
              placeholder="0.00"
              value={usdtAmount}
              onChange={(e) => setUsdtAmount(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-5 text-2xl font-bold text-white outline-none focus:border-emerald-500 transition-all placeholder:text-slate-800"
            />
            <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 font-black text-sm">USDT</div>
          </div>

          <div className="flex items-center justify-center">
            <div className="w-full h-[1px] bg-white/5"></div>
            <div className="px-4 text-slate-600 text-xs font-black">GETS YOU</div>
            <div className="w-full h-[1px] bg-white/5"></div>
          </div>

          <div className="w-full bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 text-center">
            <div className="text-4xl font-black text-emerald-400 tracking-tighter">
              {usdtAmount ? (Number(usdtAmount) * chipRate).toLocaleString() : '0'}
            </div>
            <div className="text-[10px] text-emerald-500/60 font-black uppercase tracking-widest mt-1">Game Chips</div>
          </div>

          <button
            onClick={handleDeposit}
            disabled={loading || !usdtAmount}
            className="w-full py-5 bg-white text-black font-black rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-white/5 flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-6 h-6 border-4 border-black/20 border-t-black rounded-full animate-spin"></div>
            ) : (
              "EXCHANGE FOR CHIPS"
            )}
          </button>
        </div>

        <p className="mt-8 text-[10px] text-slate-600 text-center leading-relaxed">
          Transactions are processed on the BSC Testnet.<br />
          Make sure you have enough tBNB for gas fees.
        </p>
      </div>
    </div>
  );
};

export default Deposit;
