import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BlackjackWeb2 } from './components/BlackjackWeb2';
import { Login } from './components/Login';

function App() {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [currentBet, setCurrentBet] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [showLogin, setShowLogin] = useState(false);
  const [gameMode, setGameMode] = useState(null); // 'single', 'multiplayer', or null

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      checkAuth(token);
    } else {
      setShowLogin(true);
    }
  }, []);

  const checkAuth = async (token) => {
    try {
      const res = await axios.get('http://localhost:5000/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(res.data.user);
      setBalance(res.data.user.balance);
      setShowLogin(false);
    } catch (err) {
      localStorage.removeItem('token');
      setShowLogin(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setBalance(0);
    setGameMode(null);
    setShowLogin(true);
  };

  return (
    <div className="min-h-screen relative flex flex-col items-center">
      <div className="table-edge"></div>
      <div className="table-leather"></div>

      {/* Top Header */}
      <header className="w-full max-w-4xl mx-auto mt-4 bg-black/90 rounded-full px-6 py-3 flex justify-between items-center z-10 border border-slate-800 shadow-2xl">
        <div className="flex items-center gap-4">
          <button className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs px-4 py-1.5 rounded-full transition-colors">RULES</button>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-white text-sm font-bold bg-slate-800 px-3 py-1 rounded-md border border-slate-700">{user.username}</span>
              <button onClick={handleLogout} className="text-slate-500 hover:text-white transition-colors text-[10px] uppercase font-bold">Logout</button>
            </div>
          ) : (
            <button onClick={() => setShowLogin(true)} className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-1.5 rounded-full">SIGN IN</button>
          )}
        </div>
        
        <div className="flex items-center gap-8 text-sm font-semibold tracking-wide">
          <div className="flex gap-2 text-yellow-500"><span>BALANCE</span><span className="text-white">${Number(balance).toFixed(2)}</span></div>
          {gameMode && (
            <>
              <div className="flex gap-2 text-yellow-500"><span>BET</span><span className="text-white">${Number(currentBet).toFixed(2)}</span></div>
              <div className="flex gap-2 text-yellow-500"><span>WIN</span><span className="text-white">${Number(lastWin).toFixed(2)}</span></div>
            </>
          )}
        </div>
      </header>

      {/* Background Decor */}
      <div className="absolute top-[25%] text-center opacity-[0.05] pointer-events-none z-0">
        <h1 className="text-9xl font-black text-white font-serif tracking-widest">CASINO</h1>
      </div>

      {/* Main Content */}
      <main className="w-full max-w-6xl mx-auto flex-1 z-10 flex flex-col items-center justify-center pb-20">
        {user ? (
          !gameMode ? (
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
              <h2 className="text-5xl font-black text-white mb-12 tracking-tight">Select Table</h2>
              <div className="flex gap-8">
                <ModeCard 
                  title="Single Player" 
                  desc="Private table. Fast rounds." 
                  icon="🃏" 
                  onClick={() => setGameMode('single')} 
                  color="from-blue-600 to-indigo-700"
                />
                <ModeCard 
                  title="Multiplayer" 
                  desc="Shared table. Play with others." 
                  icon="👥" 
                  onClick={() => setGameMode('multiplayer')} 
                  color="from-purple-600 to-pink-700"
                />
              </div>
            </div>
          ) : (
            <div className="w-full relative">
              <button 
                onClick={() => setGameMode(null)}
                className="absolute top-[-40px] left-4 text-slate-400 hover:text-white flex items-center gap-2 text-xs font-bold transition-all"
              >
                ← BACK TO LOBBY
              </button>
              <BlackjackWeb2 
                currentUser={user}
                gameMode={gameMode}
                setBalance={setBalance} 
                setCurrentBet={setCurrentBet} 
                setLastWin={setLastWin} 
              />
            </div>
          )
        ) : (
          <div className="text-center space-y-6">
            <h2 className="text-5xl font-serif text-white/30 italic">Step into the High Stakes</h2>
            <button onClick={() => setShowLogin(true)} className="bg-yellow-500 hover:bg-yellow-400 text-black font-black px-12 py-4 rounded-full transition-all transform hover:scale-110 shadow-2xl shadow-yellow-500/20">GET STARTED</button>
          </div>
        )}
      </main>

      {showLogin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="relative w-full max-w-md">
            <button onClick={() => setShowLogin(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white z-10">✕</button>
            <Login setAuth={(u) => { setUser(u); setBalance(u.balance); setShowLogin(false); }} />
          </div>
        </div>
      )}
    </div>
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
