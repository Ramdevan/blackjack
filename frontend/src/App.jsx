import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import toast, { Toaster } from 'react-hot-toast';
import { BlackjackWeb2 } from './components/BlackjackWeb2';
import { BlackjackMultiplayer } from './components/BlackjackMultiplayer';
import AdminPanel from './components/AdminPanel';
import Deposit from './components/Deposit';
import { getTokenContract } from './utils/contract';

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
  }, []);

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

  const handleLogout = () => {
    sessionStorage.removeItem('web3_auth');
    setAddress(null);
    setAuthData(null);
    changeGameMode(null);
    toast.success("User Disconnected");
    navigate('/');
  };

  const handleAdminLogout = () => {
    sessionStorage.removeItem('admin_auth');
    setAdminAddress(null);
    setAdminAuthData(null);
    toast.success("Admin Logged Out");
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

  // Header Component
  const Header = () => {
    if (location.pathname === '/admin') return null;

    return (
      <header className="w-full max-w-6xl mx-auto mt-6 bg-black/80 backdrop-blur-xl rounded-3xl px-8 py-4 flex justify-between items-center z-10 border border-white/5 shadow-2xl">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-xl font-black text-white tracking-tighter hover:scale-105 transition-transform">BLACKJACK</Link>
        </div>

        <div className="hidden md:flex items-center gap-12">
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-yellow-500 font-black uppercase tracking-widest mb-0.5">Balance</span>
            <span className="text-lg font-black text-white tracking-tight">{Number(balance).toLocaleString()} <span className="text-[10px] text-slate-500">TKN</span></span>
          </div>
          {gameMode && (
            <>
              <div className="flex flex-col items-center">
                <span className="text-[9px] text-yellow-500 font-black uppercase tracking-widest mb-0.5">Bet</span>
                <span className="text-lg font-black text-white tracking-tight">{Number(currentBet).toLocaleString()}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[9px] text-yellow-500 font-black uppercase tracking-widest mb-0.5">Win</span>
                <span className="text-lg font-black text-emerald-400 tracking-tight">{Number(lastWin).toLocaleString()}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleBuyChipsClick}
            className="bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] px-5 py-2 rounded-xl transition-all uppercase tracking-widest shadow-lg shadow-emerald-500/20 mr-2"
          >
            Buy Chips
          </button>

          {address ? (
            <div className="flex items-center gap-3 pl-4 border-l border-white/10">
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-2">
                  {isAdmin && <span className="text-[8px] bg-red-600 text-white font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">Admin</span>}
                  <span className="text-xs font-black text-white">{address.slice(0, 6)}...{address.slice(-4)}</span>
                </div>
                <button onClick={handleLogout} className="text-[9px] text-slate-500 hover:text-red-400 font-bold uppercase transition-colors">Disconnect</button>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-inner border border-white/10 ${isAdmin ? 'bg-red-600/20 text-red-500' : 'bg-blue-600/20 text-blue-500'}`}>
                {isAdmin ? '🛡️' : '👤'}
              </div>
              {isAdmin && (
                <Link to="/admin" className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center transition-all border border-white/5">
                  ⚙️
                </Link>
              )}
            </div>
          ) : (
            <button onClick={connectWallet} className="bg-white text-black font-black text-[10px] px-6 py-2 rounded-xl hover:scale-105 transition-all uppercase tracking-widest">Connect</button>
          )}
        </div>
      </header>
    );
  };

  return (
    <div className="min-h-screen relative flex flex-col items-center overflow-x-hidden">
      <div className="table-edge"></div>
      <div className="table-leather"></div>

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

      <Header />

      {/* Background Decor */}
      <div className="absolute top-[25%] text-center opacity-[0.05] pointer-events-none z-0">
        <h1 className="text-[12rem] font-black text-white font-serif tracking-widest uppercase">
          Blackjack
        </h1>
      </div>

      {/* Main Content */}
      <main className="w-full max-w-7xl mx-auto flex-1 z-10 flex flex-col items-center justify-center pb-20 pt-12">
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
                <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
                  <h2 className="text-5xl font-black text-white mb-12 tracking-tight">Select Table</h2>
                  <div className="flex gap-8">
                    <ModeCard
                      title="Single Player"
                      desc="Private table. Fast rounds."
                      icon="🃏"
                      onClick={() => changeGameMode('single')}
                      color="from-blue-600 to-indigo-700"
                    />
                    <ModeCard
                      title="Multiplayer"
                      desc="Shared table. Play with others."
                      icon="👥"
                      onClick={() => changeGameMode('multiplayer')}
                      color="from-purple-600 to-pink-700"
                    />
                  </div>
                </div>
              ) : (
                <div className="w-full relative">
                  <button
                    onClick={() => changeGameMode(null)}
                    className="absolute top-[-40px] left-4 text-slate-400 hover:text-white flex items-center gap-2 text-xs font-bold transition-all"
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
              connectWallet={connectAdminWallet}
              isConnecting={isAdminConnecting}
              handleLogout={handleAdminLogout}
            />
          } />
          <Route path="/deposit" element={<Deposit address={address} connectWallet={connectWallet} isConnecting={isConnecting} setBalance={setBalance} />} />
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

const ModeCard = ({ title, desc, icon, onClick, color }) => (
  <button
    onClick={onClick}
    className={`group relative w-72 h-96 rounded-3xl overflow-hidden p-8 flex flex-col items-center justify-center text-center transition-all duration-500 hover:scale-105 hover:shadow-[0_0_50px_rgba(255,255,255,0.1)] border border-white/10`}
  >
    <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-20 group-hover:opacity-40 transition-opacity`}></div>
    <span className="text-7xl mb-6 transform group-hover:scale-110 transition-transform duration-500">{icon}</span>
    <h3 className="text-2xl font-black text-white mb-2">{title}</h3>
    <p className="text-slate-400 text-sm font-medium">{desc}</p>
    <div className="mt-8 px-6 py-2 rounded-full border border-white/20 text-white text-xs font-black uppercase tracking-widest group-hover:bg-white group-hover:text-black transition-all">Select</div>
  </button>
);

export default App;
