import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const SOCKET_URL = 'http://localhost:5000';

const CHIPS = [
  { value: 1, label: '1', className: 'chip-1' },
  { value: 10, label: '10', className: 'chip-10' },
  { value: 100, label: '100', className: 'chip-100' },
  { value: 1000, label: '1K', className: 'chip-1k' },
  { value: 10000, label: '10K', className: 'chip-10k' },
];

export const BlackjackWeb2 = ({ setBalance, setCurrentBet, setLastWin, currentUser, gameMode }) => {
  const [socket, setSocket] = useState(null);
  const [betAmount, setBetAmount] = useState(0);
  const [selectedChip, setSelectedChip] = useState(null);
  const [tableState, setTableState] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const newSocket = io(SOCKET_URL, { auth: { token } });
    
    newSocket.on('connect', () => {
      newSocket.emit('joinTable', { mode: gameMode });
    });

    newSocket.on('tableUpdate', (state) => {
      setTableState(state);
      const myPlayer = state.players.find(p => p.userId === currentUser?.id);
      if (myPlayer) {
        setCurrentBet(myPlayer.bet);
      }
    });

    newSocket.on('walletUpdate', (newBalance) => {
      setBalance(newBalance);
    });

    newSocket.on('gameError', (msg) => {
      alert(msg);
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, [setBalance, setCurrentBet, currentUser, gameMode]);

  const placeBet = () => {
    if (socket && betAmount > 0) {
      socket.emit('placeBet', { betAmount });
    }
  };

  const hit = () => { if (socket) socket.emit('hit'); };
  const stand = () => { if (socket) socket.emit('stand'); };
  const doubleDown = () => { if (socket) socket.emit('doubleDown'); };
  const split = () => { if (socket) socket.emit('split'); };

  const calcScore = (cards) => {
    let total = 0, aces = 0;
    cards.forEach(c => {
      if (c.hidden) return;
      if (c.value === 'A') { aces++; total += 11; }
      else if (['K', 'Q', 'J', '10'].includes(c.value)) total += 10;
      else total += parseInt(c.value);
    });
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  };

  const isMyTurn = tableState && 
                   tableState.status === 'playing' && 
                   tableState.players[tableState.turnIndex]?.userId === currentUser?.id;

  const myPlayer = tableState?.players.find(p => p.userId === currentUser?.id);
  const canDouble = isMyTurn && myPlayer?.hands[0]?.cards.length === 2;
  const canSplit = isMyTurn && myPlayer?.hands[0]?.cards.length === 2 && 
                   myPlayer.hands[0].cards[0].value === myPlayer.hands[0].cards[1].value;

  return (
    <div className="w-full flex flex-col items-center relative mt-8 min-h-[600px] animate-in fade-in slide-in-from-bottom-8 duration-700">
      
      {/* Dealer Area */}
      <div className="flex flex-col items-center w-full relative mb-16">
        <div className="bg-black/80 px-4 py-1 text-white text-[10px] uppercase font-bold rounded tracking-widest border border-slate-700 mb-4">Dealer</div>
        <div className="flex justify-center relative min-h-[120px]">
          {tableState && tableState.dealerCards.length > 0 && (
            <>
              <div className="score-badge !left-[-40px] !top-[20px]">{tableState.dealerScore}</div>
              <div className="flex">
                {tableState.dealerCards.map((c, i) => (
                  <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-50px' : '0', zIndex: i }}>
                    {c.hidden ? <div className="playing-card card-hidden"></div> : <Web2Card suit={c.suit} value={c.value} />}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Table Layout */}
      <div className="flex justify-center items-end gap-6 w-full max-w-6xl px-4 flex-wrap">
        {tableState ? (
          tableState.players.map((player, index) => {
            const isCurrent = tableState.turnIndex === index && tableState.status === 'playing';
            const isMe = player.userId === currentUser?.id;
            
            return (
              <div key={player.userId} className={`flex flex-col items-center transition-all duration-500 ${isCurrent ? 'scale-110' : 'opacity-70'} ${!isMe && gameMode === 'single' ? 'hidden' : ''}`}>
                <div className="relative group">
                  <div className="flex min-h-[120px] mb-2">
                    {player.hands.map((hand, hIdx) => (
                      <div key={hIdx} className="flex">
                        {hand.cards.map((c, i) => (
                          <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-50px' : '0', zIndex: i }}>
                            <Web2Card suit={c.suit} value={c.value} />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  {player.hands[0] && (
                    <div className="score-badge !left-[-35px] !top-[20px]">{calcScore(player.hands[0].cards)}</div>
                  )}
                </div>

                <div className={`mt-2 px-4 py-2 rounded-xl border flex flex-col items-center min-w-[120px] ${isMe ? 'bg-blue-600/20 border-blue-500' : 'bg-black/60 border-slate-700'} ${isCurrent ? 'ring-2 ring-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.3)]' : ''}`}>
                  <span className="text-[10px] text-slate-400 uppercase font-black tracking-tighter mb-1">{player.username} {isMe && "(You)"}</span>
                  <span className="text-white font-bold text-sm">Bet ${player.bet}</span>
                  {player.status !== 'waiting' && player.status !== 'ready' && player.status !== 'playing' && (
                    <span className={`text-[10px] font-black uppercase mt-1 ${player.status === 'blackjack' || player.status === 'won' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {player.status}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-slate-500 font-bold italic animate-pulse">Connecting to table...</div>
        )}
      </div>

      {/* Controls */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-6 w-full max-w-4xl px-4">
        {!tableState || tableState.status === 'betting' ? (
          <div className="flex flex-col items-center w-full">
            <div className="flex gap-4 mb-6">
              {CHIPS.map(chip => (
                <div
                  key={chip.value}
                  onClick={() => { setSelectedChip(chip.value); setBetAmount(prev => prev + chip.value); }}
                  className={`casino-chip ${chip.className} ${selectedChip === chip.value ? 'chip-selected ring-2 ring-white' : ''}`}
                >
                  {chip.label}
                </div>
              ))}
            </div>
            <div className="flex gap-4">
              <button onClick={() => setBetAmount(0)} className="px-6 py-2 bg-red-500/20 text-red-400 rounded-lg font-bold border border-red-500/20 hover:bg-red-500/30 transition-all">Clear</button>
              <button onClick={placeBet} className="px-12 py-2 bg-emerald-500 text-black rounded-lg font-black shadow-xl shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all">PLACE BET (${betAmount})</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 items-end">
            <ActionBtn icon="+" label="Hit" onClick={hit} disabled={!isMyTurn} />
            <ActionBtn icon="✋" label="Stand" onClick={stand} disabled={!isMyTurn} />
            <ActionBtn icon="x2" label="Double" onClick={doubleDown} disabled={!canDouble} />
            <ActionBtn icon="⑂" label="Split" onClick={split} disabled={!canSplit} />
            {!isMyTurn && tableState.status === 'playing' && (
              <div className="absolute top-[-40px] left-1/2 -translate-x-1/2 whitespace-nowrap text-slate-400 text-xs font-bold bg-black/60 px-4 py-2 rounded-full border border-white/5 backdrop-blur-md">
                Waiting for {tableState.players[tableState.turnIndex]?.username}...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Web2Card = ({ suit, value }) => {
  const isRed = suit === '♥' || suit === '♦';
  return (
    <div className={`playing-card overflow-hidden shadow-2xl ${isRed ? 'card-red' : 'text-slate-900'}`}>
      <div className="absolute top-1 left-2 flex flex-col items-center leading-none">
        <span className="text-xl font-black">{value}</span>
        <span className="text-xl mt-[-2px]">{suit}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.1] pointer-events-none">
        <span className="text-7xl">{suit}</span>
      </div>
      <div className="absolute bottom-1 right-2 flex flex-col items-center leading-none rotate-180">
        <span className="text-xl font-black">{value}</span>
        <span className="text-xl mt-[-2px]">{suit}</span>
      </div>
    </div>
  );
};

const ActionBtn = ({ icon, label, onClick, disabled }) => (
  <div className={`action-btn-wrapper transition-all duration-300 ${disabled ? 'opacity-30 grayscale pointer-events-none' : 'hover:scale-110'}`}>
    <button className="action-btn" onClick={onClick} disabled={disabled}>
      {icon}
    </button>
    <span className="action-label">{label}</span>
  </div>
);
