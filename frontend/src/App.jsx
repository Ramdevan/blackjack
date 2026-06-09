import React, { useState, useEffect } from 'react';
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

  // Separate state for Admin
  const [adminAddress, setAdminAddress] = useState(null);
  const [adminAuthData, setAdminAuthData] = useState(null);
  const [isAdminConnecting, setIsAdminConnecting] = useState(false);

  const ADMIN_ADDRESS = "0x2818bA353dFF5CB15310b438f122110d41D7b995".toLowerCase();

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
        'bj_is_turn_finished'
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
    <div className="min-h-screen relative flex flex-col items-center overflow-x-hidden w-full">
      <div className="cyber-bg-cards"></div>
      {location.pathname !== '/admin' && <div className="cyber-table-bottom"></div>}

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
          <Link to="/" className="cyber-brand">BLACKJACK</Link>

          <div className="cyber-header-center">
            {address && (
              <div className="cyber-balance-pill">
                <span className="cyber-balance-label">BALANCE</span>
                <span className="cyber-balance-val">{Number(balance).toLocaleString()} <span className="cyber-balance-unit">TKN</span></span>
              </div>
            )}
            {gameMode && (
              <>
                <div className="cyber-stat-pill">
                  <span className="cyber-balance-label">BET</span>
                  <span className="cyber-balance-val">{Number(currentBet).toLocaleString()}</span>
                </div>
                <div className="cyber-stat-pill">
                  <span className="cyber-balance-label">WIN</span>
                  <span className="cyber-balance-val" style={{ color: '#4ade80' }}>{Number(lastWin).toLocaleString()}</span>
                </div>
              </>
            )}
          </div>

          <div className="cyber-header-right">
            <button onClick={handleBuyChipsClick} className="cyber-buy-chips-btn">BUY CHIPS</button>
            {address ? (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="cyber-wallet-btn"
                >
                  <span className="cyber-wallet-dot"></span>
                  {address.slice(0, 6)}...{address.slice(-4)}
                  {isAdmin && <span className="cyber-admin-badge">Admin</span>}
                </button>
                {showProfileMenu && (
                  <div className="cyber-dropdown">
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
      <main className={`${location.pathname === '/admin' ? 'w-full px-8' : 'w-full max-w-7xl mx-auto items-center justify-center'} flex-1 z-10 flex flex-col pb-20 pt-12`}>
        <Routes>
          <Route path="/" element={
            <div className="w-full flex flex-col items-center">
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
                <div className="w-full relative">
                  <button
                    onClick={() => changeGameMode(null)}
                    className="absolute top-[-40px] left-4 text-slate-400 hover:text-white flex items-center gap-2 text-base font-bold transition-all"
                  >
                    ← BACK TO LOBBY
                  </button>
                  {gameMode === 'single' ? (
                    <BlackjackWeb2
                      authData={authData}
                      gameMode={gameMode}
                      setBalance={setBalance}
                      setCurrentBet={setCurrentBet}
                      setLastWin={setLastWin}
                    />
                  ) : (
                    <BlackjackMultiplayer
                      authData={authData}
                      gameMode={gameMode}
                      setBalance={setBalance}
                      setCurrentBet={setCurrentBet}
                      setLastWin={setLastWin}
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
