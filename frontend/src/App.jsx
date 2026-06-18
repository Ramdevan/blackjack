import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import toast, { Toaster } from 'react-hot-toast';
import { BlackjackWeb2 } from './components/BlackjackWeb2';
import { BlackjackMultiplayer } from './components/BlackjackMultiplayer';
import AdminPanel from './components/AdminPanel';
import Deposit from './components/Deposit';
import PlayerHistoryPage from './components/PlayerHistoryPage';
import { getTokenContract, CONTRACT_ADDRESS } from './utils/contract';
import singlePlayerImg from './assets/single_player_card.png';
import multiplayerImg from './assets/multiplayer_card.png';

import avatarPlayer from './assets/avatar_player.png';
import avatarJack from './assets/avatar_jack.png';
import avatarLady from './assets/avatar_lady.png';
import avatarGentleman from './assets/avatar_gentleman.png';
import avatarCyber from './assets/avatar_cyber.png';

const AVATAR_MAP = {
  avatar_player: avatarPlayer,
  avatar_jack: avatarJack,
  avatar_lady: avatarLady,
  avatar_gentleman: avatarGentleman,
  avatar_cyber: avatarCyber
};

const AVATARS = [avatarJack, avatarLady, avatarGentleman, avatarCyber];
const NICKNAMES = ["Jack", "Sarah", "Victor", "Elena"];

const getPlayerAvatar = (address) => {
  if (!address) return avatarJack;
  const hash = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATARS[hash % AVATARS.length];
};

const getPlayerNickname = (address) => {
  if (!address) return "Guest";
  const hash = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return NICKNAMES[hash % NICKNAMES.length];
};

const getAvatarAsset = (avatarKey, address) => {
  if (avatarKey && AVATAR_MAP[avatarKey]) {
    return AVATAR_MAP[avatarKey];
  }
  return getPlayerAvatar(address);
};

const getNicknameToShow = (customName, address) => {
  if (customName && customName.trim() !== '') {
    return customName;
  }
  return getPlayerNickname(address);
};

// Helper component to access navigation inside BrowserRouter
function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [address, setAddress] = useState(null);
  const [balance, setBalance] = useState("0.00");
  const [currentBet, setCurrentBet] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [gameMode, setGameMode] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [authData, setAuthData] = useState(null);
  const [dealerBalance, setDealerBalance] = useState(null);

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };

    if (showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileMenu]);
  const [customNickname, setCustomNickname] = useState(localStorage.getItem('blackjack_nickname') || '');
  const [customAvatar, setCustomAvatar] = useState(localStorage.getItem('blackjack_avatar') || 'avatar_player');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tempNickname, setTempNickname] = useState('');
  const [tempAvatar, setTempAvatar] = useState('avatar_player');

  // Separate state for Admin
  const [adminAddress, setAdminAddress] = useState(null);
  const [adminAuthData, setAdminAuthData] = useState(null);
  const [isAdminConnecting, setIsAdminConnecting] = useState(false);

  const ADMIN_ADDRESS = "0x2818bA353dFF5CB15310b438f122110d41D7b995".toLowerCase();

  const [profileLoaded, setProfileLoaded] = useState(false);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);

  const syncUserProfile = async (userAddress) => {
    try {
      const res = await fetch(`http://${window.location.hostname}:5000/api/user/${userAddress}`);
      const data = await res.json();
      if (data && data.username) {
        setCustomNickname(data.username);
        setCustomAvatar(data.avatar || 'avatar_player');
        localStorage.setItem('blackjack_nickname', data.username);
        localStorage.setItem('blackjack_avatar', data.avatar || 'avatar_player');
        localStorage.setItem(`profile_setup_${userAddress.toLowerCase()}`, 'true');
        setNeedsProfileSetup(false);
      } else {
        const localName = localStorage.getItem('blackjack_nickname') || '';
        const localAvatar = localStorage.getItem('blackjack_avatar') || 'avatar_player';
        const isSetupLocal = localStorage.getItem(`profile_setup_${userAddress.toLowerCase()}`) === 'true';
        
        setTempNickname(localName);
        setTempAvatar(localAvatar);

        if (isSetupLocal && localName) {
          await fetch(`http://${window.location.hostname}:5000/api/user/${userAddress}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: localName, avatar: localAvatar })
          });
          setNeedsProfileSetup(false);
        } else {
          setNeedsProfileSetup(true);
        }
      }
    } catch (err) {
      console.error("Error syncing profile settings:", err);
      const isSetupLocal = localStorage.getItem(`profile_setup_${userAddress.toLowerCase()}`) === 'true';
      if (!isSetupLocal) {
        setNeedsProfileSetup(true);
      }
    } finally {
      setProfileLoaded(true);
    }
  };

  useEffect(() => {
    if (address) {
      syncUserProfile(address);
    } else {
      setNeedsProfileSetup(false);
      setProfileLoaded(false);
    }
  }, [address]);

  const changeGameMode = (mode) => {
    setGameMode(mode);
    if (mode) {
      localStorage.setItem('bj_game_mode', mode);
    } else {
      localStorage.removeItem('bj_game_mode');
      const keys = [
        'bj_active_game_id',
        'bj_status',
        'bj_player_hand',
        'bj_dealer_hand',
        'bj_is_split',
        'bj_active_hand_index',
        'bj_player_hand_left',
        'bj_player_hand_right',
        'bj_outcome',
        'bj_pending_outcome',
        'bj_pending_payout',
        'bj_is_turn_finished',
        'bj_selected_table_id'
      ];
      keys.forEach(k => localStorage.removeItem(k));
    }
  };

  useEffect(() => {
    fetchDealerBalance();
    const interval = setInterval(fetchDealerBalance, 15000);

    const savedAuth = sessionStorage.getItem('web3_auth');
    if (savedAuth) {
      const parsed = JSON.parse(savedAuth);
      setAddress(parsed.address);
      setAuthData(parsed);
      fetchBalance(parsed.address);
    }

    const savedAdminAuth = sessionStorage.getItem('admin_auth');
    if (savedAdminAuth) {
      const parsed = JSON.parse(savedAdminAuth);
      setAdminAddress(parsed.address);
      setAdminAuthData(parsed);
    }

    // Restore game mode from localStorage if active
    const savedMode = localStorage.getItem('bj_game_mode');
    if (savedMode) {
      setGameMode(savedMode);
    }

    return () => clearInterval(interval);
  }, []);

  // Listen to MetaMask account and chain changes dynamically to prevent stale state reverts
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          setAddress(null);
          setAuthData(null);
          sessionStorage.removeItem('web3_auth');
          changeGameMode(null);
          toast.error("Wallet disconnected!");
        } else {
          // If active address in MetaMask differs from auth state, prompt re-connection
          const savedAuth = sessionStorage.getItem('web3_auth');
          const currentSessionAddress = savedAuth ? JSON.parse(savedAuth).address : null;
          if (currentSessionAddress && accounts[0].toLowerCase() !== currentSessionAddress.toLowerCase()) {
            setAddress(null);
            setAuthData(null);
            sessionStorage.removeItem('web3_auth');
            changeGameMode(null);
            toast.error("MetaMask account changed. Please reconnect!");
          }
        }
      };

      const handleChainChanged = (chainId) => {
        // Switch network if user changes network in MetaMask
        if (chainId !== '0x61') {
          switchNetwork();
        }
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, []);

  // Inactivity timeout checking
  const refreshActivity = () => {
    sessionStorage.setItem('bj_last_activity', Date.now().toString());
  };

  useEffect(() => {
    if (!address && !adminAddress) return;

    // Initialize activity timestamp
    refreshActivity();

    // Listen to user interaction events to refresh activity timer
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const handleUserActivity = () => {
      refreshActivity();
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, handleUserActivity);
    });

    const checkInactivity = () => {
      const lastActivity = parseInt(sessionStorage.getItem('bj_last_activity') || '0');
      const timeoutLimit = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

      if (lastActivity && Date.now() - lastActivity > timeoutLimit) {
        if (address) {
          handleLogout(true);
        }
        if (adminAddress) {
          handleAdminLogout(true);
        }
      }
    };

    // Check inactivity every 60 seconds
    const interval = setInterval(checkInactivity, 60000);

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleUserActivity);
      });
      clearInterval(interval);
    };
  }, [address, adminAddress]);

  useEffect(() => {
    setShowProfileMenu(false);
  }, [location.pathname]);

  const fetchBalance = async (userAddress) => {
    try {
      if (!window.ethereum) return;
      const provider = new ethers.BrowserProvider(window.ethereum);
      const tokenContract = getTokenContract(provider);
      const bal = await tokenContract.balanceOf(userAddress);
      const decimals = await tokenContract.decimals();
      setBalance(ethers.formatUnits(bal, decimals));
    } catch (err) {
      console.error("Error fetching balance:", err);
    }
  };

  const fetchDealerBalance = async () => {
    try {
      let provider;
      if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
      } else {
        provider = new ethers.JsonRpcProvider('https://bsc-testnet-rpc.publicnode.com');
      }
      const tokenContract = getTokenContract(provider);
      const bal = await tokenContract.balanceOf(CONTRACT_ADDRESS);
      const decimals = await tokenContract.decimals();
      const formatted = Number(ethers.formatUnits(bal, decimals));
      setDealerBalance(formatted);
    } catch (err) {
      console.error("Error fetching dealer balance:", err);
    }
  };

  const BSC_TESTNET_PARAMS = {
    chainId: '0x61',
    chainName: 'Binance Smart Chain Testnet',
    nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
    rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
    blockExplorerUrls: ['https://testnet.bscscan.com/']
  };

  const switchNetwork = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x61' }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [BSC_TESTNET_PARAMS],
          });
        } catch (addError) {
          console.error(addError);
        }
      }
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      toast.error('Please install MetaMask!');
      return;
    }
    setIsConnecting(true);
    try {
      await switchNetwork();
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const userAddress = accounts[0];

      const signer = await provider.getSigner();
      const message = "Sign this message to play Blackjack and verify your identity.";
      const signature = await signer.signMessage(message);

      // Force lobby (select table) redirect upon fresh connection
      changeGameMode(null);

      setAddress(userAddress);
      setAuthData({ address: userAddress, signature, message });
      sessionStorage.setItem('web3_auth', JSON.stringify({ address: userAddress, signature, message }));
      fetchBalance(userAddress);
      toast.success("Wallet Connected!");
    } catch (err) {
      console.error(err);
      toast.error('Authentication failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const connectAdminWallet = async () => {
    if (!window.ethereum) {
      toast.error('Please install MetaMask!');
      return;
    }
    setIsAdminConnecting(true);
    try {
      await switchNetwork();
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const userAddress = accounts[0];

      if (userAddress.toLowerCase() !== ADMIN_ADDRESS) {
        toast.error("Connected address is not an authorized admin!");
        setIsAdminConnecting(false);
        return;
      }

      const signer = await provider.getSigner();
      const message = "Admin access request for Blackjack Royale.";
      const signature = await signer.signMessage(message);

      setAdminAddress(userAddress);
      setAdminAuthData({ address: userAddress, signature, message });
      sessionStorage.setItem('admin_auth', JSON.stringify({ address: userAddress, signature, message }));
      toast.success("Admin Connected!");
    } catch (err) {
      console.error(err);
      toast.error('Admin authentication failed');
    } finally {
      setIsAdminConnecting(false);
    }
  };

  const handleLogout = (isAuto = false) => {
    sessionStorage.removeItem('web3_auth');
    setAddress(null);
    setAuthData(null);
    changeGameMode(null);
    if (isAuto) {
      toast.error("Session expired due to inactivity.");
    } else {
      toast.success("User Disconnected");
    }
    navigate('/');
  };

  const handleAdminLogout = (isAuto = false) => {
    sessionStorage.removeItem('admin_auth');
    setAdminAddress(null);
    setAdminAuthData(null);
    if (isAuto) {
      toast.error("Admin session expired due to inactivity.");
    } else {
      toast.success("Admin Logged Out");
    }
    navigate('/admin');
  };

  const handleBuyChipsClick = () => {
    if (!address) {
      toast.error("Please connect your wallet first!");
    } else {
      navigate('/deposit');
    }
  };

  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS;

  return (
    <div className={`relative flex flex-col items-center w-full ${location.pathname === '/' && gameMode ? 'h-screen overflow-hidden' : 'min-h-screen overflow-x-hidden'}`}>
      {/* Dynamic Backgrounds based on Game State */}
      <>
        <div className="cyber-bg-cards"></div>
        {location.pathname !== '/admin' && <div className="cyber-table-bottom"></div>}
      </>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
            fontSize: '12px',
            fontWeight: '600',
            borderRadius: '12px',
          },
        }}
      />

      {location.pathname !== '/admin' && (
        <header className="cyber-header">
          {/* Left section: Back button (if in game) + Brand Title + Subtitle */}
          <div className="flex items-center gap-3">
            {gameMode && (
              <button
                onClick={() => {
                  changeGameMode(null);
                  navigate('/');
                }}
                className="cyber-header-back-btn"
                title="Back to Lobby"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
            )}
            <div className="flex flex-col justify-center">
              <Link to="/" className="cyber-brand !mb-0 !pb-0 leading-none">BLACKJACK</Link>
              {gameMode && (
                <span className={`text-[9px] font-black tracking-widest uppercase mt-1 ${gameMode === 'multiplayer' ? 'text-purple-500 text-shadow-purple' : 'text-cyan-400 text-shadow-cyan'}`}>
                  {gameMode === 'multiplayer' ? 'Multiplayer' : 'Single Player'}
                </span>
              )}
            </div>
          </div>

          {/* Center section: Unified Segmented Stats Pill */}
          <div className="cyber-header-center">
            {address && (
              <div className="cyber-header-stats-container">
                {/* Balance Segment */}
                <div className="cyber-header-stat-segment">
                  <div className="flex flex-col items-start">
                    <span className="cyber-stat-label">BALANCE</span>
                    <span className="cyber-stat-value">
                      {Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="cyber-stat-icon-coin ml-1.5"></span>
                    </span>
                  </div>
                </div>

                {/* Current Bet Segment (if in game) */}
                {gameMode && (
                  <div className="cyber-header-stat-segment border-l border-white/10 pl-4">
                    <div className="flex flex-col items-start">
                      <span className="cyber-stat-label">CURRENT BET</span>
                      <span className="cyber-stat-value">
                        {Number(currentBet).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="cyber-stat-icon-chip ml-1.5"></span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Total Win Segment (if in game) */}
                {gameMode && (
                  <div className="cyber-header-stat-segment border-l border-white/10 pl-4">
                    <div className="flex flex-col items-start">
                      <span className="cyber-stat-label">TOTAL WIN</span>
                      <span className="cyber-stat-value text-emerald-400">
                        {Number(lastWin).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="cyber-stat-icon-trophy ml-1.5"></span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right section: Buy Chips + Notification Bell + Profile + Hamburger menu */}
          <div className="cyber-header-right">
            <button onClick={handleBuyChipsClick} className="cyber-buy-chips-btn flex items-center gap-2">
              <span>BUY CHIPS</span>
              <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center font-black text-xs pb-[1px]">+</div>
            </button>

            {address ? (
              <div ref={profileMenuRef} style={{ position: 'relative' }} className="flex items-center gap-2">
                {/* Profile Box */}
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="cyber-header-profile-btn flex items-center gap-3"
                >
                  <div className="w-7 h-7 rounded-full overflow-hidden border border-white/20 flex-shrink-0">
                    <img src={getAvatarAsset(customAvatar, address)} className="w-full h-full object-cover" alt="Avatar" />
                  </div>
                  <span className="text-xs font-bold text-white leading-none">{address.slice(0, 6)}...{address.slice(-4)}</span>
                  {isAdmin && <span className="cyber-admin-badge scale-90 -mr-1">Admin</span>}
                </button>

                {showProfileMenu && (
                  <div className="cyber-dropdown">
                    <div className="px-4 py-2 border-b border-white/5 mb-1 text-xs text-slate-500 uppercase tracking-widest font-bold">
                      {getNicknameToShow(customNickname, address)}
                    </div>
                    <button 
                      onClick={() => { 
                        setShowProfileMenu(false); 
                        setTempNickname(customNickname);
                        setTempAvatar(customAvatar);
                        setShowSettingsModal(true); 
                      }} 
                      className="cyber-dropdown-item" 
                      style={{ width: '100%', textAlign: 'left' }}
                    >
                      👤 Profile Settings
                    </button>
                    <Link to="/history" className="cyber-dropdown-item" onClick={() => setShowProfileMenu(false)}>📜 Game History</Link>
                    {isAdmin && <Link to="/admin" className="cyber-dropdown-item" onClick={() => setShowProfileMenu(false)}>⚙️ Admin Panel</Link>}
                    <button onClick={() => { setShowProfileMenu(false); handleLogout(); }} className="cyber-dropdown-item" style={{ color: '#f87171', width: '100%', textAlign: 'left' }}>⏻ Disconnect</button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={connectWallet} disabled={isConnecting} className="cyber-connect-btn">
                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className={`${location.pathname === '/admin' ? 'w-full px-8' : 'w-full max-w-7xl mx-auto items-center justify-center'} flex-1 z-10 flex flex-col ${location.pathname === '/' && gameMode ? 'pb-2 pt-2 overflow-hidden justify-center' : 'pb-20 pt-12'}`}>
        <Routes>
          <Route path="/" element={
            <div className={`w-full flex flex-col items-center ${gameMode ? 'h-full justify-center overflow-hidden' : ''}`}>
              {!address ? (
                <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500 max-w-md bg-black/60 backdrop-blur-xl p-12 rounded-[40px] border border-white/10 shadow-2xl">
                  <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-3xl flex items-center justify-center text-5xl mb-8 shadow-xl shadow-purple-500/20">💎</div>
                  <h2 className="text-3xl font-black text-white mb-4 text-center">Full Web3 Access</h2>
                  <p className="text-slate-400 text-center mb-10 leading-relaxed">Login with your wallet to play at our decentralized tables. No registration, no passwords. Just you and the game.</p>
                  <button
                    onClick={connectWallet}
                    disabled={isConnecting}
                    className="w-full py-4 bg-white text-black font-black rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10 flex items-center justify-center gap-3"
                  >
                    {isConnecting ? (
                      <div className="w-6 h-6 border-4 border-black/20 border-t-black rounded-full animate-spin"></div>
                    ) : (
                      <>CONNECT WALLET</>
                    )}
                  </button>
                </div>
              ) : needsProfileSetup ? (
                <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500 max-w-md w-full bg-slate-950/80 backdrop-blur-xl p-10 rounded-[40px] border border-amber-500/30 shadow-[0_0_50px_rgba(245,158,11,0.15)]">
                  <h2 className="text-3xl font-black text-amber-500 mb-2 text-center uppercase tracking-wider">Profile Setup</h2>
                  <p className="text-slate-400 text-center text-sm mb-8 leading-relaxed">Choose an avatar and username to represent yourself at the tables.</p>
                  
                  {/* Avatar Picker */}
                  <div className="w-full mb-8">
                    <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-3 text-left">Choose Avatar</label>
                    <div className="grid grid-cols-5 gap-2.5">
                      {Object.keys(AVATAR_MAP).map((key) => (
                        <div
                          key={key}
                          onClick={() => setTempAvatar(key)}
                          className={`aspect-square rounded-full overflow-hidden cursor-pointer border-2 transition-all relative ${tempAvatar === key ? 'border-amber-500 scale-105 shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'border-slate-800 hover:border-slate-600'}`}
                        >
                          <img src={AVATAR_MAP[key]} className="w-full h-full object-cover" alt={key} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Nickname Input */}
                  <div className="w-full mb-8">
                    <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-3 text-left">Username</label>
                    <input
                      type="text"
                      value={tempNickname}
                      onChange={(e) => setTempNickname(e.target.value)}
                      maxLength={12}
                      placeholder="Enter Username"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-4 py-3 text-white font-bold placeholder-slate-600 outline-none transition-all"
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={async () => {
                      const nameToSave = tempNickname.trim();
                      if (!nameToSave) {
                        toast.error("Please enter a username!");
                        return;
                      }
                      
                      try {
                        const res = await fetch(`http://${window.location.hostname}:5000/api/user/${address}`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ username: nameToSave, avatar: tempAvatar })
                        });
                        const data = await res.json();
                        if (data.success) {
                          setCustomNickname(nameToSave);
                          setCustomAvatar(tempAvatar);
                          localStorage.setItem('blackjack_nickname', nameToSave);
                          localStorage.setItem('blackjack_avatar', tempAvatar);
                          localStorage.setItem(`profile_setup_${address.toLowerCase()}`, 'true');
                          setNeedsProfileSetup(false);
                          toast.success("Profile created successfully!");
                        } else {
                          toast.error("Failed to save profile. Please try again.");
                        }
                      } catch (err) {
                        console.error(err);
                        toast.error("Network error. Please try again.");
                      }
                    }}
                    className="w-full py-4 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-500 text-black font-black uppercase tracking-wider rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-all"
                  >
                    Save & Continue
                  </button>
                </div>
              ) : !gameMode ? (
                dealerBalance !== null && dealerBalance < 500 ? (
                  <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500 max-w-md bg-black/60 backdrop-blur-xl p-12 rounded-[40px] border border-red-500/20 shadow-2xl">
                    <div className="w-24 h-24 bg-gradient-to-br from-red-500 to-amber-600 rounded-3xl flex items-center justify-center text-5xl mb-8 shadow-xl shadow-red-500/20">⚠️</div>
                    <h2 className="text-3xl font-black text-white mb-4 text-center">Under Maintenance</h2>
                    <p className="text-slate-400 text-center mb-6 leading-relaxed">
                      The dealer contract is currently running low on reserve chips. Games are temporarily suspended until the administrator refills the contract.
                    </p>
                    <div className="text-[10px] text-red-400 font-black uppercase tracking-widest bg-red-500/10 px-4 py-2 rounded-full border border-red-500/20">
                      Dealer Balance: {dealerBalance.toLocaleString()} / 500 Chips
                    </div>
                  </div>
                ) : (
                  <div className="cyber-lobby">
                    <h2 className="cyber-lobby-title">Select Table</h2>
                    <div className="cyber-mode-cards">
                      <ModeCard
                        title="Single Player"
                        desc="Private table. Fast rounds."
                        img={singlePlayerImg}
                        onClick={() => changeGameMode('single')}
                        accentColor="cyan"
                      />
                      <ModeCard
                        title="Multiplayer"
                        desc="Shared table. Play with others."
                        img={multiplayerImg}
                        onClick={() => changeGameMode('multiplayer')}
                        accentColor="magenta"
                      />
                    </div>
                  </div>
                )
              ) : (
                <div className={`w-full relative ${gameMode ? 'h-full flex flex-col justify-center items-center overflow-hidden' : ''}`}>
                  {gameMode === 'single' ? (
                    <BlackjackWeb2
                      authData={authData}
                      gameMode={gameMode}
                      balance={balance}
                      setBalance={setBalance}
                      setCurrentBet={setCurrentBet}
                      setLastWin={setLastWin}
                      customNickname={customNickname}
                      customAvatar={customAvatar}
                      onOpenSettings={() => {
                        setTempNickname(customNickname);
                        setTempAvatar(customAvatar);
                        setShowSettingsModal(true);
                      }}
                    />
                  ) : (
                    <BlackjackMultiplayer
                      authData={authData}
                      gameMode={gameMode}
                      balance={balance}
                      setBalance={setBalance}
                      setCurrentBet={setCurrentBet}
                      setLastWin={setLastWin}
                      customNickname={customNickname}
                      customAvatar={customAvatar}
                      onOpenSettings={() => {
                        setTempNickname(customNickname);
                        setTempAvatar(customAvatar);
                        setShowSettingsModal(true);
                      }}
                      onSyncSettings={(nickname, avatar) => {
                        if (nickname) {
                          setCustomNickname(nickname);
                          localStorage.setItem('blackjack_nickname', nickname);
                        }
                        if (avatar) {
                          setCustomAvatar(avatar);
                          localStorage.setItem('blackjack_avatar', avatar);
                        }
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          } />
          <Route path="/admin" element={
            <AdminPanel
              address={adminAddress}
              adminAuthData={adminAuthData}
              connectWallet={connectAdminWallet}
              isConnecting={isAdminConnecting}
              handleLogout={handleAdminLogout}
            />
          } />
          <Route path="/deposit" element={<Deposit address={address} connectWallet={connectWallet} isConnecting={isConnecting} setBalance={setBalance} />} />
          <Route path="/history" element={<PlayerHistoryPage address={address} />} />
        </Routes>
      </main>

      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-950 border border-slate-800 rounded-[30px] p-8 w-full max-w-md shadow-2xl relative animate-in zoom-in-95 duration-200 text-left">
            <button
              onClick={() => setShowSettingsModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white text-xl transition-all"
            >
              ✕
            </button>
            <h3 className="text-xl font-black text-amber-500 uppercase tracking-wider mb-6">Profile Settings</h3>
            
            <div className="mb-6">
              <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Nickname</label>
              <input
                type="text"
                value={tempNickname}
                onChange={(e) => setTempNickname(e.target.value)}
                maxLength={12}
                placeholder={getPlayerNickname(address)}
                className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-4 py-2.5 text-white font-bold placeholder-slate-600 outline-none transition-all"
              />
            </div>

            <div className="mb-6">
              <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Choose Avatar</label>
              <div className="grid grid-cols-5 gap-2.5">
                {Object.keys(AVATAR_MAP).map((key) => (
                  <div
                    key={key}
                    onClick={() => setTempAvatar(key)}
                    className={`aspect-square rounded-full overflow-hidden cursor-pointer border-2 transition-all relative ${tempAvatar === key ? 'border-amber-500 scale-105 shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'border-slate-800 hover:border-slate-600'}`}
                  >
                    <img src={AVATAR_MAP[key]} className="w-full h-full object-cover" alt={key} />
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                const nameToSave = tempNickname.trim();
                localStorage.setItem('blackjack_nickname', nameToSave);
                localStorage.setItem('blackjack_avatar', tempAvatar);
                setCustomNickname(nameToSave);
                setCustomAvatar(tempAvatar);
                setShowSettingsModal(false);
                toast.success("Profile updated successfully!");
              }}
              className="w-full py-3 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-500 text-black font-black uppercase tracking-wider rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all"
            >
              Save Changes
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

const ModeCard = ({ title, desc, img, onClick, accentColor }) => {
  const isCyan = accentColor === 'cyan';
  return (
    <button onClick={onClick} className={`cyber-mode-card ${isCyan ? 'cyber-mode-card--cyan' : 'cyber-mode-card--magenta'}`}>
      <div className="cyber-mode-card-glow"></div>
      <div className="cyber-mode-card-inner">
        <div className="cyber-mode-card-img-wrap">
          <img src={img} alt={title} className="cyber-mode-card-img" />
        </div>
        <h3 className={`cyber-mode-card-title ${isCyan ? 'cyber-mode-card-title--cyan' : 'cyber-mode-card-title--magenta'}`}>{title}</h3>
        <p className="cyber-mode-card-desc">{desc}</p>
        <div className={`cyber-select-btn ${isCyan ? 'cyber-select-btn--cyan' : 'cyber-select-btn--magenta'}`}>SELECT</div>
      </div>
    </button>
  );
};

export default App;
