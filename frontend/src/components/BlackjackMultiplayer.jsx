import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { io } from 'socket.io-client';
import { getContract, getTokenContract, CONTRACT_ADDRESS } from '../utils/contract';
import toast from 'react-hot-toast';

const CHIPS = [
  { value: 1, label: '1', className: 'chip-1' },
  { value: 10, label: '10', className: 'chip-10' },
  { value: 100, label: '100', className: 'chip-100' },
  { value: 1000, label: '1K', className: 'chip-1k' },
  { value: 10000, label: '10K', className: 'chip-10k' },
];

export const BlackjackMultiplayer = ({ setBalance, setCurrentBet, setLastWin, authData, gameMode }) => {
  const [betAmount, setBetAmount] = useState(0);
  const [selectedChip, setSelectedChip] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [playerHand, setPlayerHand] = useState([]);
  const [dealerHand, setDealerHand] = useState([]);
  const [status, setStatus] = useState('betting'); // betting, playing, settled
  const [outcome, setOutcome] = useState(null); // 'win', 'loss', 'push'
  const [loading, setLoading] = useState(false);
  const [allowance, setAllowance] = useState(0n);
  const [tokenDecimals, setTokenDecimals] = useState(18);

  // Split-hand state additions
  const [isSplit, setIsSplit] = useState(false);
  const [activeHandIndex, setActiveHandIndex] = useState(0); // 0 = Left Hand, 1 = Right Hand
  const [playerHandLeft, setPlayerHandLeft] = useState([]);
  const [playerHandRight, setPlayerHandRight] = useState([]);

  // Multiplayer Connection States
  const [socket, setSocket] = useState(null);
  const [otherPlayers, setOtherPlayers] = useState([]);

  // Sequential Multiplayer Turn States
  const [tableState, setTableState] = useState('betting');
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [isTableLeader, setIsTableLeader] = useState(false);
  const [sharedDealerCards, setSharedDealerCards] = useState([]);

  // Pending Settlement States
  const [pendingOutcome, setPendingOutcome] = useState(null);
  const [pendingPayout, setPendingPayout] = useState(null);
  const [isTurnFinished, setIsTurnFinished] = useState(false);

  // Persistence: Restore game on load
  useEffect(() => {
    const savedGameId = localStorage.getItem('bj_active_game_id');
    const savedStatus = localStorage.getItem('bj_status');

    if (savedGameId && (savedStatus === 'playing' || savedStatus === 'settled')) {
      setGameId(savedGameId);
      setStatus(savedStatus);

      const savedPlayerHand = localStorage.getItem('bj_player_hand');
      const savedDealerHand = localStorage.getItem('bj_dealer_hand');
      const savedIsSplit = localStorage.getItem('bj_is_split') === 'true';
      const savedActiveHandIndex = parseInt(localStorage.getItem('bj_active_hand_index') || '0');
      const savedPlayerHandLeft = localStorage.getItem('bj_player_hand_left');
      const savedPlayerHandRight = localStorage.getItem('bj_player_hand_right');
      const savedOutcome = localStorage.getItem('bj_outcome');
      const savedPendingOutcome = localStorage.getItem('bj_pending_outcome');
      const savedPendingPayout = localStorage.getItem('bj_pending_payout');
      const savedIsTurnFinished = localStorage.getItem('bj_is_turn_finished') === 'true';

      if (savedPlayerHand && savedDealerHand) {
        setPlayerHand(JSON.parse(savedPlayerHand));
        setDealerHand(JSON.parse(savedDealerHand));
      }
      setIsSplit(savedIsSplit);
      setActiveHandIndex(savedActiveHandIndex);
      if (savedPlayerHandLeft) setPlayerHandLeft(JSON.parse(savedPlayerHandLeft));
      if (savedPlayerHandRight) setPlayerHandRight(JSON.parse(savedPlayerHandRight));
      if (savedOutcome) setOutcome(savedOutcome);
      if (savedPendingOutcome) setPendingOutcome(savedPendingOutcome);
      if (savedPendingPayout) setPendingPayout(Number(savedPendingPayout));
      setIsTurnFinished(savedIsTurnFinished);
    }
  }, []);

  // Persistence: Save state changes
  useEffect(() => {
    if ((status === 'playing' || status === 'settled') && gameId) {
      localStorage.setItem('bj_active_game_id', gameId);
      localStorage.setItem('bj_status', status);
      localStorage.setItem('bj_player_hand', JSON.stringify(playerHand));
      localStorage.setItem('bj_dealer_hand', JSON.stringify(dealerHand));
      localStorage.setItem('bj_is_split', isSplit.toString());
      localStorage.setItem('bj_active_hand_index', activeHandIndex.toString());
      localStorage.setItem('bj_player_hand_left', JSON.stringify(playerHandLeft));
      localStorage.setItem('bj_player_hand_right', JSON.stringify(playerHandRight));
      localStorage.setItem('bj_is_turn_finished', isTurnFinished.toString());
      if (outcome) {
        localStorage.setItem('bj_outcome', outcome);
      } else {
        localStorage.removeItem('bj_outcome');
      }
      if (pendingOutcome) {
        localStorage.setItem('bj_pending_outcome', pendingOutcome);
      } else {
        localStorage.removeItem('bj_pending_outcome');
      }
      if (pendingPayout !== null) {
        localStorage.setItem('bj_pending_payout', pendingPayout.toString());
      } else {
        localStorage.removeItem('bj_pending_payout');
      }
    } else if (status === 'betting') {
      localStorage.removeItem('bj_active_game_id');
      localStorage.removeItem('bj_status');
      localStorage.removeItem('bj_player_hand');
      localStorage.removeItem('bj_dealer_hand');
      localStorage.removeItem('bj_is_split');
      localStorage.removeItem('bj_active_hand_index');
      localStorage.removeItem('bj_player_hand_left');
      localStorage.removeItem('bj_player_hand_right');
      localStorage.removeItem('bj_outcome');
      localStorage.removeItem('bj_pending_outcome');
      localStorage.removeItem('bj_pending_payout');
      localStorage.removeItem('bj_is_turn_finished');
    }
  }, [status, gameId, playerHand, dealerHand, isSplit, activeHandIndex, playerHandLeft, playerHandRight, outcome, pendingOutcome, pendingPayout, isTurnFinished]);

  // Provider & Signer
  const [contract, setContract] = useState(null);
  const [tokenContract, setTokenContract] = useState(null);

  // Initialize Socket.io Connection
  useEffect(() => {
    const socketUrl = `http://${window.location.hostname}:5000`;
    const newSocket = io(socketUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('join-table', { address: authData.address });
    });

    newSocket.on('table-sync', (data) => {
      if (data && data.players) {
        const others = data.players.filter(p => p.address.toLowerCase() !== authData.address.toLowerCase());
        setOtherPlayers(others);

        if (data.tableState) {
          setTableState(data.tableState);
        }

        const leader = data.players[0] && data.players[0].address.toLowerCase() === authData.address.toLowerCase();
        setIsTableLeader(leader);

        const activePlayer = data.players[data.currentTurnIndex];
        const myTurn = activePlayer && activePlayer.address.toLowerCase() === authData.address.toLowerCase();
        
        const savedIsTurnFinished = localStorage.getItem('bj_is_turn_finished') === 'true';
        setIsMyTurn((myTurn && !savedIsTurnFinished) || data.tableState === 'betting');

        if (data.tableDealerHand && data.tableDealerHand.length > 0) {
          setSharedDealerCards(data.tableDealerHand);
          setDealerHand(data.tableDealerHand);
        }
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [authData.address]);

  // Handle transition when the table state transitions to settled
  useEffect(() => {
    if (tableState === 'settled' && status === 'playing' && gameId && contract) {
      const handleTableSettled = async () => {
        // Force reveal dealer cards locally (reveals second card and gets entire final dealer hand)
        await syncCardsFromChain(gameId, true);
        
        // Update balance from token contract
        if (tokenContract) {
          try {
            const balance = await tokenContract.balanceOf(authData.address);
            setBalance(ethers.formatUnits(balance, tokenDecimals));
          } catch (e) {
            console.error("Failed to update balance:", e);
          }
        }
        
        const savedPendingOutcome = localStorage.getItem('bj_pending_outcome') || pendingOutcome;
        const savedPendingPayout = localStorage.getItem('bj_pending_payout') || pendingPayout;
        
        if (savedPendingOutcome) {
          setOutcome(savedPendingOutcome);
          if (savedPendingPayout !== null) {
            setLastWin(Number(savedPendingPayout));
          }
          setStatus('settled');
          
          // Emit settle action to backend to display correct badge (🏆 Winner / ❌ Lost) for other players
          if (socket) {
            socket.emit('player-action', {
              action: 'settle',
              outcome: savedPendingOutcome
            });
          }
        }
      };
      handleTableSettled();
    }
  }, [tableState, status, gameId, contract, tokenContract, pendingOutcome, pendingPayout, socket, authData.address, tokenDecimals]);

  // Automated dealer turn execution driven by the Table Leader
  useEffect(() => {
    if (tableState === 'dealer-turn' && isTableLeader && gameId) {
      const handleDealerTurn = async () => {
        if (contract) {
          try {
            const gameInfo = await contract.games(gameId);
            if (gameInfo.settled) {
              toast.success("All players finished! Revealing dealer cards...", { duration: 3000 });
              await syncCardsFromChain(gameId, true);
            } else {
              toast.success("All players finished. Dealer playing round...", { duration: 3000 });
              await stand();
            }
          } catch (err) {
            console.error("Error automating dealer turn:", err);
          }
        }
      };
      handleDealerTurn();
    }
  }, [tableState, isTableLeader, gameId, contract]);

  useEffect(() => {
    if (window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      provider.getSigner().then(signer => {
        const bj = getContract(signer);
        const tk = getTokenContract(signer);
        setContract(bj);
        setTokenContract(tk);

        tk.decimals().then(d => setTokenDecimals(d));
        checkAllowance(tk, authData.address);

        const savedGameId = localStorage.getItem('bj_active_game_id');
        if (savedGameId) {
          bj.games(savedGameId).then(game => {
            if (!game.player || game.player === "0x0000000000000000000000000000000000000000" || game.player.toLowerCase() !== authData.address.toLowerCase()) {
              localStorage.removeItem('bj_active_game_id');
              localStorage.removeItem('bj_status');
              setGameId(null);
              setStatus('betting');
              return;
            }

            if (game.settled) {
              setStatus('settled');
              setOutcome('loss');
            } else {
              setTimeout(() => {
                syncCardsFromChain(savedGameId);
              }, 500);
            }
          }).catch(err => {
            console.error(err);
            localStorage.removeItem('bj_active_game_id');
            localStorage.removeItem('bj_status');
            setGameId(null);
            setStatus('betting');
          });
        }
      });
    }
  }, [authData.address]);

  const checkAllowance = async (tk, owner) => {
    const allow = await tk.allowance(owner, CONTRACT_ADDRESS);
    setAllowance(allow);
  };

  const approveTokens = async () => {
    if (!tokenContract) return;
    setLoading(true);
    try {
      const tx = await tokenContract.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
      await tx.wait();
      await checkAllowance(tokenContract, authData.address);
      toast.success('Tokens approved!');
    } catch (err) {
      console.error(err);
      toast.error('Token approval failed');
    } finally {
      setLoading(false);
    }
  };

  const syncCardsFromChain = async (activeId, forceRevealDealer = false) => {
    if (!contract || !activeId) return null;
    try {
      const gameInfo = await contract.games(activeId);
      const isSettled = gameInfo.settled;

      const onChainDealerCards = await contract.getDealerCards(activeId);
      const revealDealer = forceRevealDealer || tableState === 'dealer-turn' || tableState === 'settled';
      const formattedDealerCards = onChainDealerCards.map((c, idx) => {
        if (idx === 1 && !revealDealer) {
          return { hidden: true };
        }
        return formatCard(Number(c));
      });
      setDealerHand(formattedDealerCards);

      // Broadcast dealer hand from the Table Leader
      if (socket && isTableLeader) {
        socket.emit('player-action', {
          action: 'dealer-sync',
          dealerCards: formattedDealerCards,
          status: (isSettled && revealDealer) ? 'settled' : undefined
        });
      }

      const isSplitGame = gameInfo.isSplit;
      let formattedPlayerCards = [];
      let formattedLeftCards = [];
      let formattedRightCards = [];

      if (isSplitGame) {
        const leftCards = await contract.getPlayerCards(activeId, 0);
        formattedLeftCards = leftCards.map(c => formatCard(Number(c)));
        setPlayerHandLeft(formattedLeftCards);

        const rightCards = await contract.getPlayerCards(activeId, 1);
        formattedRightCards = rightCards.map(c => formatCard(Number(c)));
        setPlayerHandRight(formattedRightCards);

        setIsSplit(true);
        setActiveHandIndex(Number(gameInfo.currentHand));
      } else {
        const playerCards = await contract.getPlayerCards(activeId, 0);
        formattedPlayerCards = playerCards.map(c => formatCard(Number(c)));
        setPlayerHand(formattedPlayerCards);
        setIsSplit(false);
      }

      return {
        isSplit: isSplitGame,
        currentHand: Number(gameInfo.currentHand),
        playerHand: formattedPlayerCards,
        playerHandLeft: formattedLeftCards,
        playerHandRight: formattedRightCards,
        dealerHand: formattedDealerCards
      };
    } catch (err) {
      console.error("Failed to sync on-chain cards:", err);
      return null;
    }
  };

  const placeBet = async () => {
    if (!contract || !tokenContract) return;
    if (betAmount <= 0) {
      toast.error("Please select chips to bet!");
      return;
    }

    setLoading(true);
    setOutcome(null);
    try {
      const betWei = ethers.parseUnits(betAmount.toString(), tokenDecimals);
      const tx = await contract.placeBet(betWei);
      toast.success("Placing bet on BSC Testnet...", { duration: 3000 });
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed.name === 'GameStarted';
        } catch (e) { return false; }
      });

      if (event) {
        const parsed = contract.interface.parseLog(event);
        const newId = parsed.args.gameId.toString();
        setGameId(newId);

        // Fetch balance update
        const balance = await tokenContract.balanceOf(authData.address);
        setBalance(ethers.formatUnits(balance, tokenDecimals));

        // Sync player and dealer hands
        const synced = await syncCardsFromChain(newId);

        if (socket) {
          socket.emit('player-action', {
            action: 'bet',
            bet: Number(betAmount),
            cards: synced ? synced.playerHand : [],
            score: synced ? calculateScore(synced.playerHand) : 0
          });
        }

        const settledEvent = receipt.logs.find(log => {
          try {
            const parsed = contract.interface.parseLog(log);
            return parsed.name === 'GameSettled';
          } catch (e) { return false; }
        });

        if (settledEvent) {
          const parsedSettled = contract.interface.parseLog(settledEvent);
          const payout = Number(ethers.formatUnits(parsedSettled.args.payout, tokenDecimals));

          await syncCardsFromChain(newId);
          const betVal = Number(betAmount);
          let outcomeVal = 'loss';
          if (payout > betVal) {
            outcomeVal = 'win';
            toast.success(`Natural Blackjack!`, { duration: 5000 });
          } else if (payout === betVal) {
            outcomeVal = 'push';
            toast.success("Push! Bet returned.", { duration: 5000 });
          } else {
            toast.error("Dealer wins!", { duration: 3000 });
          }

          setPendingOutcome(outcomeVal);
          setPendingPayout(payout);
          setIsTurnFinished(true);

          if (socket) {
            socket.emit('player-action', {
              action: 'finished',
              cards: synced ? synced.playerHand : [],
              score: synced ? calculateScore(synced.playerHand) : 0,
              statusText: 'Blackjack!'
            });
          }
        } else {
          setStatus('playing');
          toast.success("Cards dealt! Hit or Stand.");
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || "Failed to start game.");
    } finally {
      setLoading(false);
    }
  };

  const hit = async () => {
    if (!contract || !gameId) return;
    setLoading(true);
    try {
      const gasEstimate = await contract.hit.estimateGas(gameId).catch(() => 150000n);
      const tx = await contract.hit(gameId, { gasLimit: (gasEstimate * 130n) / 100n });
      toast.success("Dealing card...", { duration: 2000 });
      const receipt = await tx.wait();

      const synced = await syncCardsFromChain(gameId);
      if (!synced) throw new Error("On-chain card sync failed.");

      const activeHand = synced.isSplit
        ? (synced.currentHand === 0 ? synced.playerHandLeft : synced.playerHandRight)
        : synced.playerHand;

      toast.success("Hit successful!");

      const score = calculateScore(activeHand);
      if (score > 21) {
        toast.error("Bust!");
        if (synced.isSplit && synced.currentHand === 0) {
          setActiveHandIndex(1);
          toast.success("Left hand busted! Playing right hand.", { duration: 3000 });
        }
      } else if (score === 21) {
        toast.success("Exactly 21!", { duration: 2000 });
        if (synced.isSplit && synced.currentHand === 0) {
          setActiveHandIndex(1);
          toast.success("Left hand got 21! Playing right hand.", { duration: 3000 });
        } else {
          toast.success("Auto-standing...", { duration: 2000 });
          setTimeout(() => {
            stand();
          }, 1000);
        }
      }

      if (socket) {
        socket.emit('player-action', {
          action: 'hit',
          cards: activeHand,
          score: score
        });
      }

      // Check if game was auto-settled (e.g. bust or hit exactly 21)
      const event = receipt.logs.find(log => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed?.name === 'GameSettled';
        } catch (e) { return false; }
      });

      if (event) {
        const parsed = contract.interface.parseLog(event);
        const payout = Number(ethers.formatUnits(parsed.args.payout, tokenDecimals));

        await syncCardsFromChain(gameId);

        const betVal = isSplit ? Number(betAmount) * 2 : Number(betAmount);
        let outcomeVal = 'loss';
        if (payout > betVal) {
          outcomeVal = 'win';
          toast.success(`You won ${payout} chips!`, { duration: 5000 });
        } else if (payout === betVal) {
          outcomeVal = 'push';
          toast.success("Push! Bet returned.", { duration: 5000 });
        } else {
          toast.error("Dealer wins!", { duration: 3000 });
        }

        setPendingOutcome(outcomeVal);
        setPendingPayout(payout);
        setIsTurnFinished(true);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || "Hit failed");
    } finally {
      setLoading(false);
    }
  };

  const stand = async () => {
    if (!contract || !gameId) return;
    setLoading(true);
    try {
      const gasEstimate = await contract.stand.estimateGas(gameId).catch(() => 250000n);
      const tx = await contract.stand(gameId, {
        gasLimit: gasEstimate > 250000n ? (gasEstimate * 150n) / 100n : 350000n
      });
      toast.success("Dealer round starting...", { duration: 2500 });
      const receipt = await tx.wait();

      if (socket) {
        socket.emit('player-action', {
          action: 'stand'
        });
      }

      // Find GameSettled event
      const event = receipt.logs.find(log => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed?.name === 'GameSettled';
        } catch (e) { return false; }
      });

      if (event) {
        const parsed = contract.interface.parseLog(event);
        const payout = Number(ethers.formatUnits(parsed.args.payout, tokenDecimals));

        await syncCardsFromChain(gameId);

        const betVal = isSplit ? Number(betAmount) * 2 : Number(betAmount);
        let outcomeVal = 'loss';
        if (payout > betVal) {
          outcomeVal = 'win';
          toast.success(`You won ${payout} chips!`, { duration: 5000 });
        } else if (payout === betVal) {
          outcomeVal = 'push';
          toast.success("Push! Bet returned.", { duration: 5000 });
        } else {
          toast.error("Dealer wins!", { duration: 3000 });
        }

        setPendingOutcome(outcomeVal);
        setPendingPayout(payout);
        setIsTurnFinished(true);
      } else {
        // Fallback or intermediate transition: Query the game state directly from contract
        const gameInfo = await contract.games(gameId);
        if (gameInfo.settled) {
          await syncCardsFromChain(gameId);
          setPendingOutcome('loss');
          setPendingPayout(0);
          setIsTurnFinished(true);
        } else {
          if (isSplit) {
            await syncCardsFromChain(gameId);
            toast.success("Stood on Left Hand. Playing Right Hand!", { duration: 3000 });
          }
          setStatus('playing');
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || "Stand failed");
    } finally {
      setLoading(false);
    }
  };

  const doubleDown = async () => {
    if (!contract || !gameId) return;
    setLoading(true);
    try {
      const gasEstimate = await contract.doubleDown.estimateGas(gameId).catch(() => 250000n);
      const tx = await contract.doubleDown(gameId, {
        gasLimit: gasEstimate > 250000n ? (gasEstimate * 150n) / 100n : 350000n
      });
      const receipt = await tx.wait();

      const synced = await syncCardsFromChain(gameId);

      if (socket) {
        socket.emit('player-action', {
          action: 'hit',
          cards: synced ? (isSplit ? (activeHandIndex === 0 ? synced.playerHandLeft : synced.playerHandRight) : synced.playerHand) : [],
          score: synced ? calculateScore(isSplit ? (activeHandIndex === 0 ? synced.playerHandLeft : synced.playerHandRight) : synced.playerHand) : 0
        });
      }

      toast.success("Double Down successful!");
      setCurrentBet(prev => Number(prev) + Number(betAmount));

      const event = receipt.logs.find(log => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed?.name === 'GameSettled';
        } catch (e) { return false; }
      });

      if (event) {
        const parsed = contract.interface.parseLog(event);
        const payout = Number(ethers.formatUnits(parsed.args.payout, tokenDecimals));

        await syncCardsFromChain(gameId);
        const betVal = isSplit ? Number(betAmount) * 3 : Number(betAmount) * 2;
        let outcomeVal = 'loss';
        if (payout > betVal) {
          outcomeVal = 'win';
          toast.success(`You won ${payout} chips!`, { duration: 5000 });
        } else if (payout === betVal) {
          outcomeVal = 'push';
          toast.success("Push! Bet returned.", { duration: 5000 });
        } else {
          toast.error("Dealer wins!", { duration: 3000 });
        }

        const isFinalHand = !isSplit || activeHandIndex === 1;
        if (isFinalHand) {
          setPendingOutcome(outcomeVal);
          setPendingPayout(payout);
          setIsTurnFinished(true);

          if (socket) {
            socket.emit('player-action', {
              action: 'finished',
              cards: synced ? (isSplit ? (activeHandIndex === 0 ? synced.playerHandLeft : synced.playerHandRight) : synced.playerHand) : [],
              score: synced ? calculateScore(isSplit ? (activeHandIndex === 0 ? synced.playerHandLeft : synced.playerHandRight) : synced.playerHand) : 0,
              statusText: 'Double Down'
            });
          }
        } else {
          setActiveHandIndex(1);
        }
      } else {
        const gameInfo = await contract.games(gameId);
        if (gameInfo.settled) {
          await syncCardsFromChain(gameId);
          setPendingOutcome('loss');
          setPendingPayout(0);
          setIsTurnFinished(true);

          if (socket) {
            socket.emit('player-action', {
              action: 'finished',
              cards: synced ? (isSplit ? (activeHandIndex === 0 ? synced.playerHandLeft : synced.playerHandRight) : synced.playerHand) : [],
              score: synced ? calculateScore(isSplit ? (activeHandIndex === 0 ? synced.playerHandLeft : synced.playerHandRight) : synced.playerHand) : 0,
              statusText: 'Double Down'
            });
          }
        } else {
          if (isSplit) {
            await syncCardsFromChain(gameId);
            toast.success("Double Down successful! Playing Right Hand.", { duration: 3000 });
            setActiveHandIndex(1);
          }
          setStatus('playing');
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const split = async () => {
    if (!contract || !gameId) return;
    setLoading(true);
    try {
      const gasEstimate = await contract.split.estimateGas(gameId).catch(() => 200000n);
      const tx = await contract.split(gameId, { gasLimit: (gasEstimate * 130n) / 100n });
      await tx.wait();

      const synced = await syncCardsFromChain(gameId);
      toast.success("Split successful! Playing Left Hand.");
      setCurrentBet(prev => Number(prev) * 2);

      if (socket && synced) {
        socket.emit('player-action', {
          action: 'hit',
          cards: synced.playerHandLeft,
          score: calculateScore(synced.playerHandLeft)
        });
      }
    } catch (err) {
      console.error(err);
      toast.error("Split failed");
    } finally {
      setLoading(false);
    }
  };

  const formatCard = (val) => {
    const suits = ['♠', '♥', '♣', '♦'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suitIdx = Math.floor(val / 13) % 4;
    const valIdx = val % 13;
    return { suit: suits[suitIdx], value: values[valIdx] };
  };

  const calculateScore = (hand) => {
    let score = 0;
    let aces = 0;
    for (const card of hand) {
      if (card.hidden) continue;
      if (card.value === 'A') {
        aces += 1;
        score += 11;
      } else if (['J', 'Q', 'K'].includes(card.value)) {
        score += 10;
      } else {
        score += parseInt(card.value);
      }
    }
    while (score > 21 && aces > 0) {
      score -= 10;
      aces -= 1;
    }
    return score;
  };

  const needsApproval = allowance < ethers.parseUnits(betAmount.toString() || "0", tokenDecimals);

  return (
    <div className="w-full flex flex-col items-center relative mt-8 min-h-[600px] animate-in fade-in slide-in-from-bottom-8 duration-700">

      {/* Dealer Area */}
      <div className="flex flex-col items-center w-full relative mb-16">
        <div className="bg-black/80 px-4 py-1 text-white text-[10px] uppercase font-bold rounded tracking-widest border border-slate-700 mb-4">
          Dealer {status !== 'betting' && `(${calculateScore(dealerHand)})`}
        </div>
        <div className="flex justify-center relative min-h-[120px]">
          <div className="flex">
            {dealerHand.map((c, i) => (
              <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-50px' : '0', zIndex: i }}>
                {c.hidden ? <div className="playing-card card-hidden"></div> : <Web2Card suit={c.suit} value={c.value} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Outcome Banner */}
      {status === 'settled' && outcome && (
        <div className="my-4 animate-in zoom-in-50 duration-500 flex flex-col items-center">
          <div className={`px-8 py-3 rounded-2xl border text-2xl font-black tracking-widest uppercase shadow-[0_0_35px_rgba(0,0,0,0.8)] ${outcome === 'win'
            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-emerald-500/20'
            : outcome === 'push'
              ? 'bg-amber-500/20 border-amber-500 text-amber-400 shadow-amber-500/20'
              : 'bg-red-500/20 border-red-500 text-red-400 shadow-red-500/20'
            }`}>
            {outcome === 'win' && "🏆 You Win!"}
            {outcome === 'push' && "🤝 Push / Tie"}
            {outcome === 'loss' && "❌ Dealer Wins"}
          </div>
        </div>
      )}

      {/* 3-Seat Semicircular Table Layout */}
      <div className="w-full max-w-6xl px-4 flex flex-col md:flex-row justify-between items-center mb-16 gap-8 z-10">

        {/* Left Seat: Other Player 1 */}
        <div className="w-[200px] min-h-[220px] flex flex-col items-center justify-center">
          {otherPlayers[0] ? (
            <div className="flex flex-col items-center p-4 bg-slate-900/60 border border-slate-800 rounded-2xl w-full shadow-lg relative animate-in fade-in slide-in-from-left-8 duration-500">
              <span className="text-[10px] font-black text-slate-400 tracking-tight mb-1.5">
                {otherPlayers[0].address.slice(0, 6)}...{otherPlayers[0].address.slice(-4)}
              </span>
              <span className={`text-[8px] uppercase font-black px-2 py-0.5 rounded border mb-3 ${otherPlayers[0].status.includes('Winner') ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                otherPlayers[0].status.includes('Lost') || otherPlayers[0].status.includes('Bust') ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                  'bg-slate-800 border-slate-750 text-slate-400'
                }`}>{otherPlayers[0].status}</span>

              {/* Compact hand rendering */}
              <div className="flex justify-center min-h-[85px] mb-3 relative w-full scale-90">
                <div className="flex">
                  {otherPlayers[0].cards && otherPlayers[0].cards.map((c, i) => (
                    <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-40px' : '0', zIndex: i }}>
                      <Web2Card suit={c.suit} value={c.value} />
                    </div>
                  ))}
                </div>
              </div>

              {otherPlayers[0].bet > 0 && (
                <div className="text-[10px] font-bold text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                  Bet: {otherPlayers[0].bet} chips
                </div>
              )}
            </div>
          ) : (
            <div className="text-slate-500/20 text-[10px] uppercase font-black tracking-widest border border-dashed border-slate-800/40 rounded-2xl p-8 text-center w-full select-none">
              Empty Seat (Left)
            </div>
          )}
        </div>

        {/* Center Seat: YOU */}
        <div className="flex-1 flex flex-col items-center px-4">
          {isSplit ? (
            <div className="flex flex-row justify-around w-full gap-8">
              {/* Left Hand */}
              <div className={`flex flex-col items-center p-6 rounded-2xl border transition-all duration-300 w-[220px] bg-slate-900/60 ${activeHandIndex === 0 && status === 'playing' ? 'border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.2)] bg-slate-900/90 scale-105' : 'border-slate-800 opacity-60'}`}>
                <div className="bg-black/40 px-3 py-0.5 text-white text-[10px] uppercase font-bold rounded tracking-wider mb-4 border border-slate-700">
                  Left Hand {activeHandIndex === 0 && status === 'playing' && "✏️ Active"}
                </div>
                <div className="flex min-h-[120px] mb-4 relative justify-center">
                  <div className="flex">
                    {playerHandLeft.map((c, i) => (
                      <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-50px' : '0', zIndex: i }}>
                        <Web2Card suit={c.suit} value={c.value} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-4 py-1 bg-amber-500/20 border border-amber-500 rounded-full text-white text-xs font-bold">
                  Score: {calculateScore(playerHandLeft)}
                </div>
              </div>

              {/* Right Hand */}
              <div className={`flex flex-col items-center p-6 rounded-2xl border transition-all duration-300 w-[220px] bg-slate-900/60 ${activeHandIndex === 1 && status === 'playing' ? 'border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.2)] bg-slate-900/90 scale-105' : 'border-slate-800 opacity-60'}`}>
                <div className="bg-black/40 px-3 py-0.5 text-white text-[10px] uppercase font-bold rounded tracking-wider mb-4 border border-slate-700">
                  Right Hand {activeHandIndex === 1 && status === 'playing' && "✏️ Active"}
                </div>
                <div className="flex min-h-[120px] mb-4 relative justify-center">
                  <div className="flex">
                    {playerHandRight.map((c, i) => (
                      <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-50px' : '0', zIndex: i }}>
                        <Web2Card suit={c.suit} value={c.value} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-4 py-1 bg-amber-500/20 border border-amber-500 rounded-full text-white text-xs font-bold">
                  Score: {calculateScore(playerHandRight)}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="flex min-h-[120px] mb-4">
                {playerHand.map((c, i) => (
                  <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-50px' : '0', zIndex: i }}>
                    <Web2Card suit={c.suit} value={c.value} />
                  </div>
                ))}
              </div>
              <div className="px-4 py-1 bg-blue-600/20 border border-blue-500 rounded-full text-white text-xs font-bold mb-2">
                Score: {calculateScore(playerHand)}
              </div>
            </div>
          )}

          <div className="px-4 py-1.5 mt-4 bg-black/40 border border-slate-700 rounded-xl text-white font-bold text-xs">
            {authData.address.slice(0, 6)}...{authData.address.slice(-4)}
          </div>
        </div>

        {/* Right Seat: Other Player 2 */}
        <div className="w-[200px] min-h-[220px] flex flex-col items-center justify-center">
          {otherPlayers[1] ? (
            <div className="flex flex-col items-center p-4 bg-slate-900/60 border border-slate-800 rounded-2xl w-full shadow-lg relative animate-in fade-in slide-in-from-right-8 duration-500">
              <span className="text-[10px] font-black text-slate-400 tracking-tight mb-1.5">
                {otherPlayers[1].address.slice(0, 6)}...{otherPlayers[1].address.slice(-4)}
              </span>
              <span className={`text-[8px] uppercase font-black px-2 py-0.5 rounded border mb-3 ${otherPlayers[1].status.includes('Winner') ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                otherPlayers[1].status.includes('Lost') || otherPlayers[1].status.includes('Bust') ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                  'bg-slate-800 border-slate-750 text-slate-400'
                }`}>{otherPlayers[1].status}</span>

              {/* Compact hand rendering */}
              <div className="flex justify-center min-h-[85px] mb-3 relative w-full scale-90">
                <div className="flex">
                  {otherPlayers[1].cards && otherPlayers[1].cards.map((c, i) => (
                    <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-40px' : '0', zIndex: i }}>
                      <Web2Card suit={c.suit} value={c.value} />
                    </div>
                  ))}
                </div>
              </div>

              {otherPlayers[1].bet > 0 && (
                <div className="text-[10px] font-bold text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                  Bet: {otherPlayers[1].bet} chips
                </div>
              )}
            </div>
          ) : (
            <div className="text-slate-500/20 text-[10px] uppercase font-black tracking-widest border border-dashed border-slate-800/40 rounded-2xl p-8 text-center w-full select-none">
              Empty Seat (Right)
            </div>
          )}
        </div>

      </div>

      {/* Controls */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-6 w-full max-w-4xl px-4 z-25">
        {status === 'betting' ? (
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

              {needsApproval ? (
                <button
                  onClick={approveTokens}
                  disabled={loading}
                  className="px-12 py-2 bg-orange-500 text-black rounded-lg font-black shadow-xl hover:scale-105 active:scale-95 transition-all"
                >
                  {loading ? "APPROVING..." : "APPROVE TOKENS"}
                </button>
              ) : (
                <button
                  onClick={placeBet}
                  disabled={loading || betAmount <= 0}
                  className="px-12 py-2 bg-emerald-500 text-black rounded-lg font-black shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:grayscale"
                >
                  {loading ? "TRANSACTING..." : (betAmount > 0 ? `PLACE ON-CHAIN BET (${betAmount})` : "SELECT CHIPS TO BET")}
                </button>
              )}
            </div>
          </div>
        ) : status === 'settled' ? (
          <div className="flex flex-col items-center gap-4 animate-bounce">
            <button
              onClick={() => {
                setStatus('betting');
                setPlayerHand([]);
                setDealerHand([]);
                setOutcome(null);
                setPendingOutcome(null);
                setPendingPayout(null);
                setIsTurnFinished(false);
                setIsSplit(false);
                setActiveHandIndex(0);
                setPlayerHandLeft([]);
                setPlayerHandRight([]);
                setBetAmount(0);
                setSelectedChip(null);
                if (socket) {
                  socket.emit('player-action', { action: 'reset' });
                }
              }}
              className="px-16 py-3 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-500 text-black font-black text-lg rounded-xl shadow-[0_0_30px_rgba(234,179,8,0.5)] hover:scale-105 active:scale-95 transition-all uppercase tracking-wider"
            >
              Play Another Hand
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {!isMyTurn && (
              <div className="px-4 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-xs font-bold animate-pulse mb-2">
                ⏳ Waiting for active player to take action...
              </div>
            )}
            <div className="flex gap-4 items-end">
              <ActionBtn icon="+" label="Hit" onClick={hit} disabled={loading || status !== 'playing' || !isMyTurn} />
              <ActionBtn icon="✋" label="Stand" onClick={stand} disabled={loading || status !== 'playing' || !isMyTurn} />
              <ActionBtn icon="⏬" label="Double" onClick={doubleDown} disabled={loading || status !== 'playing' || !isMyTurn || (isSplit ? (activeHandIndex === 0 ? playerHandLeft : playerHandRight).length !== 2 : playerHand.length !== 2)} />
              <ActionBtn icon="✂️" label="Split" onClick={split} disabled={loading || status !== 'playing' || !isMyTurn || !(!isSplit && playerHand.length === 2 && (playerHand[0]?.value === playerHand[1]?.value || (['10', 'J', 'Q', 'K'].includes(playerHand[0]?.value) && ['10', 'J', 'Q', 'K'].includes(playerHand[1]?.value))))} />
              {loading && (
                <div className="absolute top-[-40px] left-1/2 -translate-x-1/2 text-white font-bold animate-pulse">Waiting for BSC Testnet...</div>
              )}
            </div>
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
