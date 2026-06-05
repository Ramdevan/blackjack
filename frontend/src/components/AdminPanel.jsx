import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { TOKEN_ADDRESS, CONTRACT_ADDRESS, tokenABI, blackjackABI } from '../utils/contract';
import Dashboard from './admin/Dashboard';
import PlayerList from './admin/PlayerList';
import ChipRate from './admin/ChipRate';
import OnChainFunds from './admin/OnChainFunds';
import PlatformFee from './admin/PlatformFee';

const AdminPanel = ({ address, adminAuthData, connectWallet, isConnecting, handleLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState({ totalUsers: 0, totalBets: 0, houseProfit: 0, totalFees: 0 });
  const [settings, setSettings] = useState({ token_price: '1000' });
  const [users, setUsers] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- On-Chain Funds State ---
  const [fundsLoading, setFundsLoading] = useState(false);
  const [onChainStats, setOnChainStats] = useState({
    dealerBalance: '0',
    adminBalance: '0',
    totalSupply: '0',
    decimals: 18
  });
  const [fundAmount, setFundAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [newPriceInput, setNewPriceInput] = useState('');

  useEffect(() => {
    if (address && adminAuthData) {
      fetchData();
      fetchOnChainBalances();
    } else {
      setLoading(false);
    }
  }, [address, adminAuthData]);

  useEffect(() => {
    if (activeTab === 'funds' && address) {
      fetchOnChainBalances();
    }
  }, [activeTab, address]);

  const fetchData = async () => {
    if (!address || !adminAuthData) return;
    setLoading(true);
    try {
      const headers = {
        'x-admin-signature': adminAuthData.signature,
        'x-admin-message': adminAuthData.message,
        'x-admin-address': adminAuthData.address
      };

      const [sRes, uRes, hRes, setRes] = await Promise.all([
        axios.get('http://localhost:5000/api/admin/stats', { headers }),
        axios.get('http://localhost:5000/api/admin/users', { headers }),
        axios.get('http://localhost:5000/api/admin/history', { headers }),
        axios.get('http://localhost:5000/api/admin/settings', { headers })
      ]);
      setStats(sRes.data);
      setUsers(uRes.data);
      setHistory(hRes.data);
      setSettings(setRes.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const fetchOnChainBalances = async () => {
    if (!window.ethereum || !address) return;
    setFundsLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const tokenContract = new ethers.Contract(TOKEN_ADDRESS, tokenABI, provider);

      const [dBal, aBal, tSupply, decs] = await Promise.all([
        tokenContract.balanceOf(CONTRACT_ADDRESS),
        tokenContract.balanceOf(address),
        tokenContract.totalSupply(),
        tokenContract.decimals()
      ]);

      setOnChainStats({
        dealerBalance: ethers.formatUnits(dBal, decs),
        adminBalance: ethers.formatUnits(aBal, decs),
        totalSupply: ethers.formatUnits(tSupply, decs),
        decimals: Number(decs)
      });
    } catch (err) {
      console.error("Failed to fetch on-chain balances:", err);
    } finally {
      setFundsLoading(false);
    }
  };

  const handleFundDealer = async (e) => {
    e.preventDefault();
    if (!fundAmount || isNaN(fundAmount) || Number(fundAmount) <= 0) return;
    if (!window.ethereum) return;

    setFundsLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const tokenContract = new ethers.Contract(TOKEN_ADDRESS, tokenABI, signer);

      const parsedAmount = ethers.parseUnits(fundAmount, onChainStats.decimals);

      const tx = await tokenContract.transfer(CONTRACT_ADDRESS, parsedAmount);
      toast.loading("Transfer transaction submitted! Waiting for confirmation...", { id: 'funds_tx' });
      await tx.wait();
      toast.success(`Successfully transferred ${fundAmount} Chips to the Dealer Contract!`, { id: 'funds_tx' });
      setFundAmount('');
      fetchOnChainBalances();
    } catch (err) {
      console.error("Failed to fund contract:", err);
      toast.error("Transaction failed: " + (err.reason || err.message), { id: 'funds_tx' });
    } finally {
      setFundsLoading(false);
    }
  };

  const handleWithdrawChips = async (e) => {
    e.preventDefault();
    if (!withdrawAmount || isNaN(withdrawAmount) || Number(withdrawAmount) <= 0) return;
    if (!window.ethereum) return;

    setFundsLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const blackjackContract = new ethers.Contract(CONTRACT_ADDRESS, blackjackABI, signer);

      const parsedAmount = ethers.parseUnits(withdrawAmount, onChainStats.decimals);

      const tx = await blackjackContract.withdrawTokens(TOKEN_ADDRESS, parsedAmount);
      toast.loading("Withdraw transaction submitted! Waiting for confirmation...", { id: 'funds_tx' });
      await tx.wait();
      toast.success(`Successfully withdrew ${withdrawAmount} Chips back to Admin Wallet!`, { id: 'funds_tx' });
      setWithdrawAmount('');
      fetchOnChainBalances();
    } catch (err) {
      console.error("Failed to withdraw:", err);
      toast.error("Transaction failed: " + (err.reason || err.message), { id: 'funds_tx' });
    } finally {
      setFundsLoading(false);
    }
  };

  const handleAddChips = async (userAddress) => {
    if (!address || !adminAuthData) {
      toast.error("Please connect your admin wallet first!");
      return;
    }
    const amount = prompt(`Enter chip amount to add for ${userAddress.slice(0, 6)}...:`);
    if (!amount || isNaN(amount) || Number(amount) <= 0) return;

    try {
      const headers = {
        'x-admin-signature': adminAuthData.signature,
        'x-admin-message': adminAuthData.message,
        'x-admin-address': adminAuthData.address
      };
      const res = await axios.post('http://localhost:5000/api/token/credit', {
        address: userAddress,
        amount: amount
      }, { headers });
      if (res.data.success) {
        toast.success(`Successfully added ${amount} chips!`);
        fetchData(); // Refresh user list
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to add chips: " + (err.response?.data?.error || err.message));
    }
  };

  const handleUpdatePrice = async () => {
    if (!address || !adminAuthData) {
      toast.error("Please connect your admin wallet first!");
      return;
    }
    const newPrice = prompt("Enter new chip rate (Chips per 1 USDT):", settings.token_price);
    if (!newPrice || isNaN(newPrice) || Number(newPrice) <= 0) return;

    try {
      const headers = {
        'x-admin-signature': adminAuthData.signature,
        'x-admin-message': adminAuthData.message,
        'x-admin-address': adminAuthData.address
      };
      await axios.post('http://localhost:5000/api/admin/settings', {
        key: 'token_price',
        value: newPrice
      }, { headers });
      setSettings({ ...settings, token_price: newPrice });
      toast.success("Token price updated!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update price: " + (err.response?.data?.error || err.message));
    }
  };

  const handleUpdatePriceForm = async (e) => {
    e.preventDefault();
    if (!newPriceInput || isNaN(newPriceInput) || Number(newPriceInput) <= 0) {
      toast.error("Please enter a valid chip rate!");
      return;
    }
    try {
      const headers = {
        'x-admin-signature': adminAuthData.signature,
        'x-admin-message': adminAuthData.message,
        'x-admin-address': adminAuthData.address
      };
      await axios.post('http://localhost:5000/api/admin/settings', {
        key: 'token_price',
        value: newPriceInput
      }, { headers });
      setSettings({ ...settings, token_price: newPriceInput });
      setNewPriceInput('');
      toast.success("Token price updated successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update price: " + (err.response?.data?.error || err.message));
    }
  };

  if (!address || !adminAuthData) {
    return (
      <div className="w-full max-w-xl mx-auto mt-12 p-8 text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-[40px] p-12 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-red-500/10 rounded-full blur-[100px] pointer-events-none"></div>

          <div className="w-24 h-24 bg-gradient-to-br from-red-500 to-rose-700 rounded-[32px] flex items-center justify-center text-5xl mb-8 mx-auto shadow-xl shadow-red-500/20">🛡️</div>
          <h2 className="text-3xl font-black text-white mb-4 tracking-tight uppercase">Admin Access Restricted</h2>
          <p className="text-slate-400 text-sm max-w-sm mx-auto mb-10 leading-relaxed">This control panel requires cryptographic authorization. Please connect the authorized administrator wallet to proceed.</p>

          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="w-full py-4 bg-white text-black font-black text-xs rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10 flex items-center justify-center gap-3 uppercase tracking-widest"
          >
            {isConnecting ? (
              <div className="w-6 h-6 border-4 border-black/20 border-t-black rounded-full animate-spin"></div>
            ) : (
              <>Connect Admin Wallet</>
            )}
          </button>

          <Link to="/" className="mt-8 inline-block text-xs font-black text-slate-500 hover:text-white uppercase tracking-wider transition-colors">← Back to Lobby</Link>
        </div>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen text-white text-2xl animate-pulse">Loading Admin Data...</div>;

  return (
    <div className="w-full min-h-screen py-8 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col gap-12">
      
      {/* Top Header matching screenshot exactly */}
      <div className="w-full flex flex-col md:flex-row justify-between items-center mb-8 gap-8 border-b border-white/5 pb-6">
        <div className="flex items-center gap-6">
          <h2 className="text-4xl font-black text-white flex items-center gap-4">
            <span className="p-3 bg-red-600 rounded-2xl shadow-xl shadow-red-600/20">🛡️</span>
            Admin Control
          </h2>
        </div>

        <div className="flex items-center gap-6">
          <a
            href="https://testnet.bnbchain.org/faucet-smart"
            target="_blank"
            rel="noreferrer"
            className="px-6 py-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-yellow-500/20 transition-all"
          >
            BSC Faucet ↗
          </a>

          {address ? (
            <div className="flex items-center gap-3 bg-black/40 border border-white/10 px-4 py-2 rounded-2xl">
              <div className="flex flex-col items-end">
                <span className="text-white text-[10px] font-black tracking-tighter uppercase">{address.slice(0, 6)}...{address.slice(-4)}</span>
                <button onClick={handleLogout} className="text-[9px] text-slate-500 hover:text-red-400 font-bold uppercase transition-colors">Logout</button>
              </div>
              <div className="w-8 h-8 bg-emerald-500/20 text-emerald-500 rounded-lg flex items-center justify-center text-xs">🛡️</div>
            </div>
          ) : (
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className="px-8 py-3 bg-white text-black font-black text-[10px] rounded-xl hover:scale-105 active:scale-95 transition-all uppercase tracking-widest shadow-xl shadow-white/5"
            >
              {isConnecting ? "Connecting..." : "Connect Admin Wallet"}
            </button>
          )}
        </div>
      </div>
 
      {/* Main Content Body */}
      <div className="flex flex-col lg:flex-row gap-4">
        
        {/* Left Side Navigation (Tabs Only!) */}
        <div className="w-full lg:w-60 flex flex-col gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all text-left ${
              activeTab === 'dashboard'
                ? 'bg-red-600 text-white shadow-xl shadow-red-600/10'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="text-base">📊</span>
            Dashboard View
          </button>

          <button
            onClick={() => setActiveTab('players')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all text-left ${
              activeTab === 'players'
                ? 'bg-red-600 text-white shadow-xl shadow-red-600/10'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="text-base">👥</span>
            Player List
          </button>

          <button
            onClick={() => setActiveTab('chip_rate')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all text-left ${
              activeTab === 'chip_rate'
                ? 'bg-red-600 text-white shadow-xl shadow-red-600/10'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="text-base">🪙</span>
            Chip Rate
          </button>
          
          <button
            onClick={() => setActiveTab('funds')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all text-left ${
              activeTab === 'funds'
                ? 'bg-red-600 text-white shadow-xl shadow-red-600/10'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="text-base">💸</span>
            On-Chain Funds
          </button>
          
          <button
            onClick={() => setActiveTab('platform_fee')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all text-left ${
              activeTab === 'platform_fee'
                ? 'bg-red-600 text-white shadow-xl shadow-red-600/10'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="text-base">🎟️</span>
            Platform Fee
          </button>
        </div>

        {/* Right Side Content Panel */}
        <div className="flex-1">
          {activeTab === 'dashboard' && (
            <Dashboard stats={stats} history={history} />
          )}

          {activeTab === 'players' && (
            <PlayerList users={users} handleAddChips={handleAddChips} />
          )}

          {activeTab === 'chip_rate' && (
            <ChipRate
              settings={settings}
              newPriceInput={newPriceInput}
              setNewPriceInput={setNewPriceInput}
              handleUpdatePriceForm={handleUpdatePriceForm}
            />
          )}

          {activeTab === 'funds' && (
            <OnChainFunds
              onChainStats={onChainStats}
              fundAmount={fundAmount}
              setFundAmount={setFundAmount}
              withdrawAmount={withdrawAmount}
              setWithdrawAmount={setWithdrawAmount}
              fundsLoading={fundsLoading}
              handleFundDealer={handleFundDealer}
              handleWithdrawChips={handleWithdrawChips}
              CONTRACT_ADDRESS={CONTRACT_ADDRESS}
              TOKEN_ADDRESS={TOKEN_ADDRESS}
              address={address}
            />
          )}

          {activeTab === 'platform_fee' && (
            <PlatformFee address={address} />
          )}
        </div>
      </div>

    </div>
  );
};

export default AdminPanel;
