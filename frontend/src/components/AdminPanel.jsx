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

const TABS = [
  { id: 'dashboard',    label: 'Dashboard',     icon: '📊' },
  { id: 'players',      label: 'Player List',   icon: '👥' },
  { id: 'chip_rate',    label: 'Chip Rate',     icon: '🪙' },
  { id: 'funds',        label: 'On-Chain Funds',icon: '💸' },
  { id: 'platform_fee', label: 'Platform Fee',  icon: '🎟️' },
];

const AdminPanel = ({ address, adminAuthData, connectWallet, isConnecting, handleLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState({ totalUsers: 0, totalBets: 0, houseProfit: 0, totalFees: 0 });
  const [settings, setSettings] = useState({ token_price: '1000' });
  const [users, setUsers] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [fundsLoading, setFundsLoading] = useState(false);
  const [onChainStats, setOnChainStats] = useState({ dealerBalance: '0', adminBalance: '0', totalSupply: '0', decimals: 18 });
  const [fundAmount, setFundAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [newPriceInput, setNewPriceInput] = useState('');

  useEffect(() => {
    if (address && adminAuthData) { fetchData(); fetchOnChainBalances(); }
    else setLoading(false);
  }, [address, adminAuthData]);

  useEffect(() => {
    if (activeTab === 'funds' && address) fetchOnChainBalances();
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
      setStats(sRes.data); setUsers(uRes.data); setHistory(hRes.data); setSettings(setRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
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
    } catch (err) { console.error(err); }
    finally { setFundsLoading(false); }
  };

  const handleFundDealer = async (e) => {
    e.preventDefault();
    if (!fundAmount || isNaN(fundAmount) || Number(fundAmount) <= 0 || !window.ethereum) return;
    setFundsLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const tokenContract = new ethers.Contract(TOKEN_ADDRESS, tokenABI, signer);
      const tx = await tokenContract.transfer(CONTRACT_ADDRESS, ethers.parseUnits(fundAmount, onChainStats.decimals));
      toast.loading('Transfer submitted! Waiting...', { id: 'funds_tx' });
      await tx.wait();
      toast.success(`Transferred ${fundAmount} Chips to Dealer Contract!`, { id: 'funds_tx' });
      setFundAmount(''); fetchOnChainBalances();
    } catch (err) { toast.error('Transaction failed: ' + (err.reason || err.message), { id: 'funds_tx' }); }
    finally { setFundsLoading(false); }
  };

  const handleWithdrawChips = async (e) => {
    e.preventDefault();
    if (!withdrawAmount || isNaN(withdrawAmount) || Number(withdrawAmount) <= 0 || !window.ethereum) return;
    setFundsLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const blackjackContract = new ethers.Contract(CONTRACT_ADDRESS, blackjackABI, signer);
      const tx = await blackjackContract.withdrawTokens(TOKEN_ADDRESS, ethers.parseUnits(withdrawAmount, onChainStats.decimals));
      toast.loading('Withdraw submitted! Waiting...', { id: 'funds_tx' });
      await tx.wait();
      toast.success(`Withdrew ${withdrawAmount} Chips to Admin Wallet!`, { id: 'funds_tx' });
      setWithdrawAmount(''); fetchOnChainBalances();
    } catch (err) { toast.error('Transaction failed: ' + (err.reason || err.message), { id: 'funds_tx' }); }
    finally { setFundsLoading(false); }
  };

  const handleAddChips = async (userAddress) => {
    if (!address || !adminAuthData) { toast.error('Connect admin wallet first!'); return; }
    const amount = prompt(`Chip amount to add for ${userAddress.slice(0, 6)}...:`);
    if (!amount || isNaN(amount) || Number(amount) <= 0) return;
    try {
      const headers = { 'x-admin-signature': adminAuthData.signature, 'x-admin-message': adminAuthData.message, 'x-admin-address': adminAuthData.address };
      const res = await axios.post('http://localhost:5000/api/token/credit', { address: userAddress, amount }, { headers });
      if (res.data.success) { toast.success(`Added ${amount} chips!`); fetchData(); }
    } catch (err) { toast.error('Failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleUpdatePriceForm = async (e) => {
    e.preventDefault();
    if (!newPriceInput || isNaN(newPriceInput) || Number(newPriceInput) <= 0) { toast.error('Enter a valid chip rate!'); return; }
    try {
      const headers = { 'x-admin-signature': adminAuthData.signature, 'x-admin-message': adminAuthData.message, 'x-admin-address': adminAuthData.address };
      await axios.post('http://localhost:5000/api/admin/settings', { key: 'token_price', value: newPriceInput }, { headers });
      setSettings({ ...settings, token_price: newPriceInput });
      setNewPriceInput('');
      toast.success('Token price updated!');
    } catch (err) { toast.error('Failed: ' + (err.response?.data?.error || err.message)); }
  };

  /* ---- Login screen ---- */
  if (!address || !adminAuthData) {
    return (
      <div className="w-full flex items-center justify-center py-16 animate-in fade-in zoom-in-95 duration-500">
        <div className="admin-login-card">
          <div className="admin-login-glow"></div>
          <div className="admin-login-icon">🛡️</div>
          <h2 className="admin-login-title">Admin Access Restricted</h2>
          <p className="admin-login-desc">
            This control panel requires cryptographic authorization. Connect the authorized administrator wallet to proceed.
          </p>
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="admin-connect-btn"
          >
            {isConnecting
              ? <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin"></div>
              : 'Connect Admin Wallet'}
          </button>
          <Link to="/" className="admin-back-link">← Back to Lobby</Link>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="admin-loading">
        <div className="admin-loading-spinner"></div>
        <span>Loading Admin Data...</span>
      </div>
    </div>
  );

  return (
    <div className="w-full min-h-screen py-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ---- Admin Header ---- */}
      <div className="admin-panel-header">
        <div className="flex items-center gap-4">
          <div className="admin-shield-icon">🛡️</div>
          <div>
            <h2 className="admin-panel-title">Admin Control</h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="https://testnet.bnbchain.org/faucet-smart"
            target="_blank"
            rel="noreferrer"
            className="admin-faucet-btn"
          >
            BSC Faucet ↗
          </a>
          {address && (
            <div className="admin-wallet-badge">
              <span className="admin-wallet-dot"></span>
              <div className="flex flex-col">
                <span className="admin-wallet-addr">{address.slice(0, 6)}...{address.slice(-4)}</span>
                <button onClick={handleLogout} className="admin-logout-btn">Logout</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---- Body: Sidebar + Content ---- */}
      <div className="admin-body">

        {/* Sidebar Navigation */}
        <nav className="admin-sidebar">
          <div className="admin-sidebar-label"></div>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`admin-nav-btn ${activeTab === tab.id ? 'admin-nav-btn--active' : ''}`}
            >
              <span className="text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content Panel */}
        <div className="admin-content">
          {activeTab === 'dashboard'    && <Dashboard stats={stats} history={history} />}
          {activeTab === 'players'      && <PlayerList users={users} handleAddChips={handleAddChips} />}
          {activeTab === 'chip_rate'    && <ChipRate settings={settings} newPriceInput={newPriceInput} setNewPriceInput={setNewPriceInput} handleUpdatePriceForm={handleUpdatePriceForm} />}
          {activeTab === 'funds'        && <OnChainFunds onChainStats={onChainStats} fundAmount={fundAmount} setFundAmount={setFundAmount} withdrawAmount={withdrawAmount} setWithdrawAmount={setWithdrawAmount} fundsLoading={fundsLoading} handleFundDealer={handleFundDealer} handleWithdrawChips={handleWithdrawChips} CONTRACT_ADDRESS={CONTRACT_ADDRESS} TOKEN_ADDRESS={TOKEN_ADDRESS} address={address} />}
          {activeTab === 'platform_fee' && <PlatformFee address={address} />}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
