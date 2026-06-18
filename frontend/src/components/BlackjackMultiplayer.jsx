import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { io } from 'socket.io-client';
import { getContract, getTokenContract, CONTRACT_ADDRESS } from '../utils/contract';
import toast from 'react-hot-toast';

// Custom Avatars
import avatarPlayer from '../assets/avatar_player.png';
import avatarJack from '../assets/avatar_jack.png';
import avatarLady from '../assets/avatar_lady.png';
import avatarGentleman from '../assets/avatar_gentleman.png';
import avatarCyber from '../assets/avatar_cyber.png';

const AVATARS = [avatarJack, avatarLady, avatarGentleman, avatarCyber];
const NICKNAMES = ["Jack", "Sarah", "Victor", "Elena"];

const AVATAR_MAP = {
  avatar_player: avatarPlayer,
  avatar_jack: avatarJack,
  avatar_lady: avatarLady,
  avatar_gentleman: avatarGentleman,
  avatar_cyber: avatarCyber
};

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

const CHIPS = [
  { value: 10, label: '10', className: 'chip-10' },
  { value: 25, label: '25', className: 'chip-25' },
  { value: 50, label: '50', className: 'chip-50' },
  { value: 100, label: '100', className: 'chip-100' },
  { value: 250, label: '250', className: 'chip-250' },
];

// ─── Pure helpers at module level (no remount on re-render) ─────────────────

const formatCard = (val) => {
  if (val === 0) return { hidden: true };
  const suits = ['♠', '♥', '♣', '♦'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const valIdx = (val - 1) % 13;
  const suitIdx = (val * 7) % 4;
  return { suit: suits[suitIdx], value: values[valIdx] };
};

const calculateScore = (hand) => {
  if (!hand || !Array.isArray(hand)) return 0;
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

const getHandOutcome = (handCards, dealerCards) => {
  if (!handCards || handCards.length === 0) return 'loss';
  const score = calculateScore(handCards);
  const dScore = calculateScore(dealerCards);
  if (score > 21) return 'loss';
  if (dScore > 21) return 'win';
  const isDealerBJ = dealerCards.length === 2 && dScore === 21;
  const isPlayerBJ = handCards.length === 2 && score === 21;
  if (isPlayerBJ && !isDealerBJ) return 'win';
  if (!isPlayerBJ && isDealerBJ) return 'loss';
  if (isPlayerBJ && isDealerBJ) return 'push';
  if (score > dScore) return 'win';
  if (score < dScore) return 'loss';
  return 'push';
};

export const BlackjackMultiplayer = ({ balance, setBalance, setCurrentBet, setLastWin, authData, gameMode, customNickname, customAvatar, onOpenSettings, onSyncSettings }) => {
  const [betAmount, setBetAmount] = useState(0);
  const [activePlayerBet, setActivePlayerBet] = useState(0);
  const [selectedChip, setSelectedChip] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [spentTableId, _setSpentTableId] = useState(null);
  const spentTableIdRef = useRef(null);
  const setSpentTableId = (val) => {
    _setSpentTableId(val);
    spentTableIdRef.current = val;
  };
  const [playerHand, setPlayerHand] = useState([]);
  const [dealerHand, setDealerHand] = useState([]);
  const [status, setStatus] = useState('betting'); // betting, playing, settled
  const [outcome, setOutcome] = useState(null); // 'win', 'loss', 'push'
  const [loading, setLoading] = useState(false);
  const [allowance, setAllowance] = useState(0n);
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [minBetLimit, setMinBetLimit] = useState(10);
  const [maxBetLimit, setMaxBetLimit] = useState(10000);

  // Split-hand state additions
  const [isSplit, setIsSplit] = useState(false);
  const [activeHandIndex, setActiveHandIndex] = useState(0); // 0 = Left Hand, 1 = Right Hand
  const [playerHandLeft, setPlayerHandLeft] = useState([]);
  const [playerHandRight, setPlayerHandRight] = useState([]);
  const [betPlaced, setBetPlaced] = useState(false);

  // Dynamic Room Table Selection
  const [selectedTableId, setSelectedTableId] = useState(() => {
    const saved = localStorage.getItem('bj_selected_table_id');
    return saved ? parseInt(saved, 10) : null;
  });
  const [lobbyStatus, setLobbyStatus] = useState([
    { id: 1, playerCount: 0 },
    { id: 2, playerCount: 0 },
    { id: 3, playerCount: 0 },
    { id: 4, playerCount: 0 },
    { id: 5, playerCount: 0 }
  ]);

  // Multiplayer Connection States
  const [socket, setSocket] = useState(null);
  const [otherPlayers, setOtherPlayers] = useState([]);
  const [chatMessages, setChatMessages] = useState([
    { sender: "0xA1b2...3c4D", text: "Good luck everyone! 🍀" },
    { sender: "0xB2c3...4d5E", text: "Dealer is hot today!" },
    { sender: "0xC3d4...5e6F", text: "Let's win some chips!" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [activeTab, setActiveTab] = useState("chat");



  // Sequential Multiplayer Turn States
  const [tableState, setTableState] = useState('betting');
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [isTableLeader, setIsTableLeader] = useState(false);
  const [sharedDealerCards, setSharedDealerCards] = useState([]);

  // Pending Settlement States
  const [pendingOutcome, setPendingOutcome] = useState(null);
  const [pendingPayout, setPendingPayout] = useState(null);
  const [isTurnFinished, setIsTurnFinished] = useState(false);
  const autoStartAttemptedRef = useRef(false);

  // Turn Countdown Timer for active turn player
  const [timeLeft, setTimeLeft] = useState(60);
  const [showTimeoutPopup, setShowTimeoutPopup] = useState(false);

  useEffect(() => {
    let timer;
    if (isMyTurn && status === 'playing') {
      setTimeLeft(60);
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setShowTimeoutPopup(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTimeLeft(60);
      setShowTimeoutPopup(false);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isMyTurn, status, playerHand.length, playerHandRight.length, activeHandIndex]);

  // Persistence: Save selected table ID to localStorage
  useEffect(() => {
    if (selectedTableId !== null) {
      localStorage.setItem('bj_selected_table_id', selectedTableId.toString());
    } else {
      localStorage.removeItem('bj_selected_table_id');
    }
  }, [selectedTableId]);

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

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const contractRef = useRef(contract);
  useEffect(() => {
    contractRef.current = contract;
  }, [contract]);

  const otherPlayersRef = useRef(otherPlayers);
  useEffect(() => {
    otherPlayersRef.current = otherPlayers;
  }, [otherPlayers]);

  const tokenContractRef = useRef(tokenContract);
  useEffect(() => {
    tokenContractRef.current = tokenContract;
  }, [tokenContract]);

  const isTableLeaderRef = useRef(isTableLeader);
  useEffect(() => {
    isTableLeaderRef.current = isTableLeader;
  }, [isTableLeader]);

  const tableStateRef = useRef(tableState);
  useEffect(() => {
    tableStateRef.current = tableState;
  }, [tableState]);

  const socketTurnIndexRef = useRef(-1);
  const socketPlayersRef = useRef([]);

  // Trigger join-table when selectedTableId is updated
  useEffect(() => {
    if (socket && selectedTableId !== null) {
      socket.emit('join-table', {
        tableId: selectedTableId,
        address: authData.address,
        nickname: customNickname || '',
        avatar: customAvatar || 'avatar_player'
      });
    }
  }, [selectedTableId, socket, authData.address, customNickname, customAvatar]);

  // Initialize Socket.io Connection
  useEffect(() => {
    const socketUrl = `http://${window.location.hostname}:5000`;
    const newSocket = io(socketUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('get-lobby-status');
    });

    newSocket.on('lobby-status', (data) => {
      if (Array.isArray(data)) {
        setLobbyStatus(data);
      }
    });

    newSocket.on('settings-synced', ({ nickname, avatar }) => {
      if (onSyncSettings) {
        onSyncSettings(nickname, avatar);
      }
    });

    newSocket.on('table-full', (data) => {
      toast.error(data.message || "Table is full!");
      setSelectedTableId(null);
    });

    newSocket.on('table-sync', (data) => {
      if (data) {
        socketTurnIndexRef.current = data.currentTurnIndex;
        if (data.players) {
          socketPlayersRef.current = data.players;
          setOtherPlayers(prevOthers => {
            return data.players
              .filter(p => p.address.toLowerCase() !== authData.address.toLowerCase())
              .map(p => {
                const existing = prevOthers.find(op => op.address.toLowerCase() === p.address.toLowerCase());
                let mappedPlayer = { ...p };

                // The server stores the left split hand inside `cards`.
                // PlayerSeat expects `cardsLeft`, so we derive it here.
                if (mappedPlayer.isSplit) {
                  mappedPlayer.cardsLeft = mappedPlayer.cardsLeft || mappedPlayer.cards || [];
                }

                if (existing && (!mappedPlayer.cards || mappedPlayer.cards.length === 0) && existing.cards && existing.cards.length > 0) {
                  return {
                    ...mappedPlayer,
                    cards: existing.cards,
                    cardsLeft: existing.cardsLeft || existing.cards || [],
                    score: existing.score
                  };
                }
                return mappedPlayer;
              });
          });

          // Immediately update our own state from socket data to prevent desync during transit
          const myPlayer = data.players.find(p => p.address.toLowerCase() === authData.address.toLowerCase());
          if (myPlayer) {
            if (myPlayer.cards && myPlayer.cards.length > 0) {
              setPlayerHand(myPlayer.cards);
            }
            if (myPlayer.cardsRight && myPlayer.cardsRight.length > 0) {
              setPlayerHandRight(myPlayer.cardsRight);
            }
            setIsSplit(myPlayer.isSplit || false);

            const activePlayingStatuses = ['playing', 'playing left', 'playing right', 'left stood', 'left busted'];
            const myTurn = myPlayer.status && activePlayingStatuses.includes(myPlayer.status.toLowerCase());
            const savedIsTurnFinished = localStorage.getItem('bj_is_turn_finished') === 'true';
            setIsMyTurn((myTurn && !savedIsTurnFinished) || data.tableState === 'betting');
          }

          if (data.tableState) {
            setTableState(data.tableState);
          }

          const leader = data.players[0] && data.players[0].address.toLowerCase() === authData.address.toLowerCase();
          setIsTableLeader(leader);

          if (data.tableDealerHand && data.tableDealerHand.length > 0) {
            setSharedDealerCards(data.tableDealerHand);
            setDealerHand(data.tableDealerHand);
          }

          if (data.activeTableId && Number(data.activeTableId) > 0) {
            const tIdStr = data.activeTableId.toString();
            if (tIdStr !== spentTableIdRef.current) {
              setGameId(tIdStr);
              localStorage.setItem('bj_active_game_id', tIdStr);

              if (data.tableState === 'playing') {
                if (statusRef.current === 'betting') {
                  setStatus('playing');
                }
                setTimeout(() => {
                  syncCardsFromChain(tIdStr);
                }, 500);
              }
            } else {
              setGameId(null);
              localStorage.removeItem('bj_active_game_id');
            }
          } else {
            setGameId(null);
            localStorage.removeItem('bj_active_game_id');
          }
        }
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [authData.address]);

  // Synchronize player settings changes across socket connections in real-time
  useEffect(() => {
    if (socket && authData?.address) {
      socket.emit('update-settings', {
        address: authData.address,
        nickname: customNickname || '',
        avatar: customAvatar || 'avatar_player'
      });
    }
  }, [customNickname, customAvatar, socket, authData?.address]);

  // Fetch other players' correct token balances from the contract when otherPlayers list changes
  useEffect(() => {
    if (!tokenContract || !otherPlayers || otherPlayers.length === 0) return;

    // To prevent infinite loop, only fetch if any player does not have a balance set
    const needsUpdate = otherPlayers.some(p => p.balance === undefined);
    if (!needsUpdate) return;

    const fetchBalances = async () => {
      try {
        const updated = await Promise.all(
          otherPlayers.map(async (p) => {
            if (p.balance !== undefined) return p;
            try {
              const balRaw = await tokenContract.balanceOf(p.address);
              const formatted = ethers.formatUnits(balRaw, tokenDecimals);
              return { ...p, balance: formatted };
            } catch (err) {
              console.error("Error fetching balance for address:", p.address, err);
              return { ...p, balance: "0" };
            }
          })
        );
        // Only set if changed
        const hashBefore = otherPlayers.map(op => `${op.address}:${op.balance}`).join('|');
        const hashAfter = updated.map(op => `${op.address}:${op.balance}`).join('|');
        if (hashBefore !== hashAfter) {
          setOtherPlayers(updated);
        }
      } catch (e) {
        console.error("Failed to fetch other players' balances:", e);
      }
    };

    fetchBalances();
  }, [otherPlayers, tokenContract, tokenDecimals]);

  // Handle transition when the table state transitions to settled
  useEffect(() => {
    if (tableState === 'settled' && (status === 'playing' || status === 'settled') && !outcome && gameId && contract) {
      const handleTableSettled = async () => {
        const synced = await syncCardsFromChain(gameId, true);
        if (!synced || !synced.isSettled) {
          console.warn("Table is not fully settled/revealed on the RPC node yet. Waiting for next sync cycle...");
          return;
        }

        // Update balance from token contract
        if (tokenContract) {
          try {
            const balance = await tokenContract.balanceOf(authData.address);
            setBalance(ethers.formatUnits(balance, tokenDecimals));
          } catch (e) {
            console.error("Failed to update balance:", e);
          }
        }

        try {
          const finalPlayerHand = synced.playerHand;
          const finalDealerHand = synced.dealerHand;
          const dealerScoreNum = calculateScore(finalDealerHand);

          let outcomeVal = 'loss';
          if (synced.isSplit) {
            const leftOutcome = getHandOutcome(synced.playerHandLeft, finalDealerHand);
            const rightOutcome = getHandOutcome(synced.playerHandRight, finalDealerHand);

            if (leftOutcome === 'win' && rightOutcome === 'win') {
              outcomeVal = 'win';
            } else if ((leftOutcome === 'win' && rightOutcome === 'push') || (leftOutcome === 'push' && rightOutcome === 'win')) {
              outcomeVal = 'win';
            } else if (leftOutcome === 'push' && rightOutcome === 'push') {
              outcomeVal = 'push';
            } else if ((leftOutcome === 'win' && rightOutcome === 'loss') || (leftOutcome === 'loss' && rightOutcome === 'win')) {
              outcomeVal = 'push'; // Even money
            } else if ((leftOutcome === 'push' && rightOutcome === 'loss') || (leftOutcome === 'loss' && rightOutcome === 'push')) {
              outcomeVal = 'loss';
            }
          } else {
            const score = calculateScore(finalPlayerHand);
            const busted = score > 21;

            if (!busted && score <= 21) {
              const isDealerBlackjack = (finalDealerHand.length === 2 && dealerScoreNum === 21);
              const isPlayerBlackjack = (finalPlayerHand.length === 2 && score === 21);

              if (isPlayerBlackjack) {
                if (isDealerBlackjack) outcomeVal = 'push';
                else outcomeVal = 'win';
              } else {
                if (isDealerBlackjack) outcomeVal = 'loss';
                else if (dealerScoreNum > 21 || score > dealerScoreNum) outcomeVal = 'win';
                else if (score === dealerScoreNum) outcomeVal = 'push';
              }
            }
          }

          setOutcome(outcomeVal);
          setStatus('settled');
          setSpentTableId(gameId);

          if (socket) {
            socket.emit('player-action', {
              action: 'settle',
              outcome: outcomeVal
            });
          }
        } catch (e) {
          console.error("Failed to calculate player outcome:", e);
        }
      };
      handleTableSettled();
    }
  }, [tableState, status, gameId, contract, tokenContract, tokenDecimals, authData.address, socket]);

  // Automated dealer turn execution driven by the Table Leader
  useEffect(() => {
    if (tableState === 'dealer-turn' && isTableLeader && gameId) {
      const handleDealerTurn = async () => {
        if (contract) {
          try {
            let initialTableInfo = await contract.tables(gameId);
            let checkRetries = 0;
            // If backend is in dealer-turn state but RPC is lagging and still registers Playing, wait for catch-up
            while (Number(initialTableInfo.state) === 1 && checkRetries < 5) {
              console.log(`On-chain table is still in Playing state. Retrying in 1000ms (attempt ${checkRetries + 1}/5)...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
              initialTableInfo = await contract.tables(gameId);
              checkRetries++;
            }
            if (Number(initialTableInfo.state) === 1) {
              console.warn("On-chain table is still in Playing state after 5 attempts. Skipping dealer turn automation.");
              return;
            }
            if (Number(initialTableInfo.state) === 2) {
              toast.success("All players finished! Settling table on-chain...", { duration: 3000 });
              const settleGasEstimate = await contract.settleTable.estimateGas(gameId).catch(() => 350000n);
              const tx = await contract.settleTable(gameId, {
                gasLimit: (settleGasEstimate * 150n) / 100n > 450000n ? (settleGasEstimate * 150n) / 100n : 450000n
              });
              await tx.wait();
            }

            // Sync final cards (revealing all dealer cards)
            const synced = await syncCardsFromChain(gameId, true);
            if (!synced || !synced.isSettled) {
              console.warn("Table is not fully settled/revealed on the RPC node. Waiting for next sync cycle...");
              return;
            }
            const finalPlayerHand = synced.playerHand;
            const finalDealerHand = synced.dealerHand;
            const dealerScoreNum = calculateScore(finalDealerHand);

            let outcomeVal = 'loss';
            if (isSplit) {
              const leftOutcome = getHandOutcome(playerHandLeft, finalDealerHand);
              const rightOutcome = getHandOutcome(playerHandRight, finalDealerHand);

              if (leftOutcome === 'win' && rightOutcome === 'win') {
                outcomeVal = 'win';
              } else if ((leftOutcome === 'win' && rightOutcome === 'push') || (leftOutcome === 'push' && rightOutcome === 'win')) {
                outcomeVal = 'win';
              } else if (leftOutcome === 'push' && rightOutcome === 'push') {
                outcomeVal = 'push';
              } else if ((leftOutcome === 'win' && rightOutcome === 'loss') || (leftOutcome === 'loss' && rightOutcome === 'win')) {
                outcomeVal = 'push'; // Even money
              } else if ((leftOutcome === 'push' && rightOutcome === 'loss') || (leftOutcome === 'loss' && rightOutcome === 'push')) {
                outcomeVal = 'loss';
              }
            } else {
              const score = calculateScore(finalPlayerHand);
              const busted = score > 21;

              if (!busted && score <= 21) {
                const isDealerBlackjack = (finalDealerHand.length === 2 && dealerScoreNum === 21);
                const isPlayerBlackjack = (finalPlayerHand.length === 2 && score === 21);

                if (isPlayerBlackjack) {
                  if (isDealerBlackjack) outcomeVal = 'push';
                  else outcomeVal = 'win';
                } else {
                  if (isDealerBlackjack) outcomeVal = 'loss';
                  else if (dealerScoreNum > 21 || score > dealerScoreNum) outcomeVal = 'win';
                  else if (score === dealerScoreNum) outcomeVal = 'push';
                }
              }
            }

            setOutcome(outcomeVal);
            setIsTurnFinished(true);
            setStatus('settled');
            setSpentTableId(gameId);

            if (socket) {
              socket.emit('player-action', {
                action: 'dealer-sync',
                dealerCards: finalDealerHand,
                status: 'settled'
              });
              socket.emit('player-action', {
                action: 'settle',
                outcome: outcomeVal
              });
            }
          } catch (err) {
            console.error("Error automating dealer turn:", err);
          }
        }
      };
      handleDealerTurn();
    }
  }, [tableState, isTableLeader, gameId, contract]);


  const fetchAllowanceAndBalance = async (tkContract = tokenContract, address = authData?.address) => {
    const activeTk = tkContract || tokenContract;
    const activeAddress = address || authData?.address;
    if (!activeTk || !activeAddress) return;
    try {
      const allow = await activeTk.allowance(activeAddress, CONTRACT_ADDRESS);
      setAllowance(allow);
      const bal = await activeTk.balanceOf(activeAddress);
      setBalance(ethers.formatUnits(bal, tokenDecimals || 18));
    } catch (err) {
      console.error("Error fetching allowance & balance:", err);
    }
  };

  useEffect(() => {
    if (window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      provider.getSigner().then(signer => {
        const bj = getContract(signer);
        const tk = getTokenContract(signer);
        setContract(bj);
        setTokenContract(tk);

        tk.decimals().then(d => {
          setTokenDecimals(d);
          fetchAllowanceAndBalance(tk, authData.address);
        });

        // Fetch dynamic contract boundaries to prevent on-chain revert errors
        bj.minBet().then(mb => setMinBetLimit(Number(ethers.formatUnits(mb, 18)))).catch(console.error);
        bj.maxBet().then(xb => setMaxBetLimit(Number(ethers.formatUnits(xb, 18)))).catch(console.error);

        const savedGameId = localStorage.getItem('bj_active_game_id');
        if (savedGameId) {
          bj.tables(savedGameId).then(table => {
            if (Number(table.tableId) === 0) {
              localStorage.removeItem('bj_active_game_id');
              localStorage.removeItem('bj_status');
              setGameId(null);
              setStatus('betting');
              return;
            }

            bj.getPlayerBetDetails(savedGameId, authData.address).then(details => {
              if (details.betAmount === 0n) {
                localStorage.removeItem('bj_active_game_id');
                localStorage.removeItem('bj_status');
                setGameId(null);
                setStatus('betting');
                return;
              }

              if (Number(table.state) >= 2) {
                setStatus('settled');
                setSpentTableId(savedGameId);
              } else {
                setStatus('playing');
                setTimeout(() => {
                  syncCardsFromChain(savedGameId);
                }, 500);
              }
            }).catch(() => {
              localStorage.removeItem('bj_active_game_id');
              localStorage.removeItem('bj_status');
              setGameId(null);
              setStatus('betting');
            });
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

  // Periodic background synchronization to heal RPC/Socket latency desyncs
  useEffect(() => {
    let intervalId = null;
    const activeId = gameId || localStorage.getItem('bj_active_game_id');
    if (status === 'playing' && activeId && contract) {
      intervalId = setInterval(() => {
        syncCardsFromChain(activeId);
      }, 4000);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [status, gameId, contract]);

  const approveTokens = async () => {
    if (!tokenContract) return;
    setLoading(true);
    try {
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const nativeBalance = await provider.getBalance(authData.address);
        if (nativeBalance < ethers.parseEther("0.001")) {
          toast.error("Insufficient tBNB balance!", { id: 'gas-balance-err' });
          setLoading(false);
          return;
        }
      }
      const tx = await tokenContract.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
      await tx.wait();
      await fetchAllowanceAndBalance(tokenContract, authData.address);
      toast.success('Tokens approved!');
    } catch (err) {
      console.error(err);
      toast.error('Token approval failed');
    } finally {
      setLoading(false);
    }
  };

  const syncCardsFromChain = async (activeId, forceRevealDealer = false) => {
    const activeContract = contractRef.current || contract;
    if (!activeContract || !activeId) return null;
    try {
      let tableInfo = await activeContract.tables(activeId);
      let onChainDealerCards = await activeContract.getDealerCards(activeId);
      let playerDetails = await activeContract.getPlayerBetDetails(activeId, authData.address);

      const currentTableState = tableStateRef.current || tableState;
      const expectSettled = forceRevealDealer || currentTableState === 'settled' || currentTableState === 'dealer-turn';
      const isRoundActive = Number(tableInfo.state) === 1 || currentTableState === 'playing' || expectSettled;

      // Robust stale RPC check & retry loop for initial dealt cards (minimum 2 cards each for player and dealer)
      let initialSyncRetries = 0;
      while (isRoundActive && (onChainDealerCards.length < 2 || playerDetails.cards.length < 2) && initialSyncRetries < 5) {
        console.warn(`[syncCardsFromChain] Stale cards detected (Dealer: ${onChainDealerCards.length}, Player: ${playerDetails.cards.length}). Retrying in 1000ms...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        tableInfo = await activeContract.tables(activeId);
        onChainDealerCards = await activeContract.getDealerCards(activeId);
        playerDetails = await activeContract.getPlayerBetDetails(activeId, authData.address);
        initialSyncRetries++;
      }

      // We only consider the settlement fully synchronized if the second dealer card is non-zero
      let isSettled = Number(tableInfo.state) >= 2 && onChainDealerCards.length >= 2 && Number(onChainDealerCards[1]) > 0;

      // Robust stale RPC check & retry loop for settlement
      if (expectSettled && !isSettled) {
        console.warn("RPC node is stale on settlement cards. Retrying on-chain sync in 1000ms...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        tableInfo = await activeContract.tables(activeId);
        onChainDealerCards = await activeContract.getDealerCards(activeId);
        isSettled = Number(tableInfo.state) >= 2 && onChainDealerCards.length >= 2 && Number(onChainDealerCards[1]) > 0;

        if (!isSettled) {
          console.warn("RPC node still stale on settlement cards. Retrying on-chain sync in 2000ms...");
          await new Promise(resolve => setTimeout(resolve, 2000));
          tableInfo = await activeContract.tables(activeId);
          onChainDealerCards = await activeContract.getDealerCards(activeId);
          isSettled = Number(tableInfo.state) >= 2 && onChainDealerCards.length >= 2 && Number(onChainDealerCards[1]) > 0;
        }
      }

      const revealDealer = isSettled;
      const formattedDealerCards = onChainDealerCards.map((c, idx) => {
        if (idx === 1 && !revealDealer) {
          return { hidden: true };
        }
        return formatCard(Number(c));
      });
      setDealerHand(formattedDealerCards);
      setSharedDealerCards(formattedDealerCards);

      // Fetch on-chain turn index and active players
      const onChainTurnIndex = Number(tableInfo.currentTurnIndex);
      const finalTurnIndex = (socketTurnIndexRef.current !== undefined && socketTurnIndexRef.current >= 0)
        ? Math.max(onChainTurnIndex, socketTurnIndexRef.current)
        : onChainTurnIndex;
      const activePlayers = await activeContract.getActivePlayers(activeId);
      const activePlayerAddress = (activePlayers && finalTurnIndex < activePlayers.length)
        ? activePlayers[finalTurnIndex]
        : null;

      const myTurn = activePlayerAddress && activePlayerAddress.toLowerCase() === authData.address.toLowerCase();
      const savedIsTurnFinished = localStorage.getItem('bj_is_turn_finished') === 'true';
      setIsMyTurn((myTurn && !savedIsTurnFinished && !isSettled) || currentTableState === 'betting');

      // Broadcast dealer hand from the Table Leader
      const activeLeader = isTableLeader || isTableLeaderRef.current;
      if (socket && activeLeader) {
        socket.emit('player-action', {
          action: 'dealer-sync',
          dealerCards: formattedDealerCards,
          status: (isSettled && revealDealer) ? 'settled' : undefined
        });
      }

      // Sync active player's cards
      let onChainIsSplit = false;
      let activeHandIndex = 0;
      let formattedLeft = [];
      let formattedRight = [];

      try {
        const splitInfo = await activeContract.getPlayerSplitDetails(activeId, authData.address);
        onChainIsSplit = splitInfo.isSplit;
        activeHandIndex = Number(splitInfo.activeHandIndex);
        if (onChainIsSplit) {
          formattedLeft = playerDetails.cards.map(c => formatCard(Number(c)));
          formattedRight = splitInfo.splitCards.map(c => formatCard(Number(c)));
        }
      } catch (err) {
        console.warn("Failed to get player split details:", err);
      }

      setIsSplit(onChainIsSplit);
      setActiveHandIndex(activeHandIndex);

      let currentActiveHandCards = [];
      if (onChainIsSplit) {
        setPlayerHandLeft(formattedLeft);
        setPlayerHandRight(formattedRight);
        currentActiveHandCards = activeHandIndex === 0 ? formattedLeft : formattedRight;
        setPlayerHand(currentActiveHandCards);
      } else {
        const formattedPlayerCards = playerDetails.cards.map(c => formatCard(Number(c)));
        currentActiveHandCards = formattedPlayerCards;
        setPlayerHand(formattedPlayerCards);
        setPlayerHandLeft([]);
        setPlayerHandRight([]);
      }

      if (playerDetails && playerDetails.betAmount) {
        const onChainBetFormatted = ethers.formatUnits(playerDetails.betAmount, tokenDecimals);
        setActivePlayerBet(Number(onChainBetFormatted));
      }

      // Broadcast player's own newly synced cards and score to the backend
      if (socket) {
        socket.emit('player-action', {
          action: 'sync-cards',
          cards: currentActiveHandCards,
          score: calculateScore(currentActiveHandCards),
          isSplit: onChainIsSplit,
          cardsRight: formattedRight,
          scoreRight: calculateScore(formattedRight),
          activeHandIndex: activeHandIndex
        });
      }

      // Self-healing: If the table is settled on-chain but frontend state is still 'playing', force settle locally
      if (isSettled && statusRef.current === 'playing') {
        const finalPlayerHand = currentActiveHandCards;
        const finalDealerHand = formattedDealerCards;
        const dealerScoreNum = calculateScore(finalDealerHand);

        let outcomeVal = 'loss';
        if (onChainIsSplit) {
          const leftOutcome = getHandOutcome(formattedLeft, finalDealerHand);
          const rightOutcome = getHandOutcome(formattedRight, finalDealerHand);

          if (leftOutcome === 'win' && rightOutcome === 'win') {
            outcomeVal = 'win';
          } else if ((leftOutcome === 'win' && rightOutcome === 'push') || (leftOutcome === 'push' && rightOutcome === 'win')) {
            outcomeVal = 'win';
          } else if (leftOutcome === 'push' && rightOutcome === 'push') {
            outcomeVal = 'push';
          } else if ((leftOutcome === 'win' && rightOutcome === 'loss') || (leftOutcome === 'loss' && rightOutcome === 'win')) {
            outcomeVal = 'push'; // Even money
          } else if ((leftOutcome === 'push' && rightOutcome === 'loss') || (leftOutcome === 'loss' && rightOutcome === 'push')) {
            outcomeVal = 'loss';
          }
        } else {
          const score = calculateScore(finalPlayerHand);
          const busted = score > 21;

          if (!busted && score <= 21) {
            const isDealerBlackjack = (finalDealerHand.length === 2 && dealerScoreNum === 21);
            const isPlayerBlackjack = (finalPlayerHand.length === 2 && score === 21);

            if (isPlayerBlackjack) {
              if (isDealerBlackjack) outcomeVal = 'push';
              else outcomeVal = 'win';
            } else {
              if (isDealerBlackjack) outcomeVal = 'loss';
              else if (dealerScoreNum > 21 || score > dealerScoreNum) outcomeVal = 'win';
              else if (score === dealerScoreNum) outcomeVal = 'push';
            }
          }
        }

        setOutcome(outcomeVal);
        setStatus('settled');
        setSpentTableId(activeId);

        // Update balance from token contract immediately
        if (tokenContract) {
          tokenContract.balanceOf(authData.address).then(balance => {
            setBalance(ethers.formatUnits(balance, tokenDecimals));
          }).catch(e => console.error("Failed to update balance:", e));
        }

        if (socket) {
          socket.emit('player-action', {
            action: 'settle',
            outcome: outcomeVal
          });
        }
      }

      // Query other players' cards/scores/bets from the smart contract concurrently
      const currentOthers = otherPlayersRef.current || otherPlayers;
      if (currentOthers && currentOthers.length > 0) {
        const updatedOthers = await Promise.all(
          currentOthers.map(async (p) => {
            try {
              const details = await activeContract.getPlayerBetDetails(activeId, p.address);
              let otherIsSplit = false;
              let otherActiveHandIndex = 0;
              let otherCardsLeft = [];
              let otherCardsRight = [];

              try {
                const splitInfo = await activeContract.getPlayerSplitDetails(activeId, p.address);
                otherIsSplit = splitInfo.isSplit;
                otherActiveHandIndex = Number(splitInfo.activeHandIndex);
                if (otherIsSplit) {
                  otherCardsLeft = details.cards.map(c => formatCard(Number(c)));
                  otherCardsRight = splitInfo.splitCards.map(c => formatCard(Number(c)));
                }
              } catch (e) {
                console.warn(e);
              }

              const cards = otherIsSplit
                ? (otherActiveHandIndex === 0 ? otherCardsLeft : otherCardsRight)
                : details.cards.map(c => formatCard(Number(c)));
              const score = Number(details.score);

              // On-chain status determination with socket status fallback to handle RPC replica lag
              let statusText = 'Waiting Turn';
              const socketPlayer = (socketPlayersRef.current || []).find(sp => sp.address.toLowerCase() === p.address.toLowerCase());
              const socketStatus = socketPlayer ? socketPlayer.status : p.status;

              const isStood = details.stood || socketStatus === 'Stood' || socketStatus === 'Left Stood' || socketStatus === 'Stood Primary';
              const isBusted = details.busted || socketStatus === 'Bust!' || socketStatus === 'Left Busted' || socketStatus === 'Bust Primary!';
              const isSettledStatus = details.settled || socketStatus === 'Settled' || socketStatus === 'Finished' || socketStatus === 'Blackjack';

              const isActivePlayer = activePlayerAddress && activePlayerAddress.toLowerCase() === p.address.toLowerCase();

              if (isSettledStatus) {
                statusText = socketStatus === 'Blackjack' ? 'Blackjack' : 'Settled';
              } else if (isBusted) {
                statusText = otherIsSplit ? 'Bust Primary!' : 'Bust!';
              } else if (isStood) {
                statusText = otherIsSplit ? 'Stood Primary' : 'Stood';
              } else if (isActivePlayer && !isSettled) {
                if (otherIsSplit) {
                  statusText = otherActiveHandIndex === 0 ? 'Playing Left' : 'Playing Right';
                } else {
                  statusText = 'Playing';
                }
              } else if (socketStatus) {
                statusText = socketStatus;
              }

              let otherBalance = p.balance;
              const activeTk = tokenContractRef.current || tokenContract;
              if (activeTk) {
                try {
                  const balRaw = await activeTk.balanceOf(p.address);
                  otherBalance = ethers.formatUnits(balRaw, tokenDecimals);
                } catch (balErr) {
                  console.error("Error fetching other player balance:", balErr);
                }
              }

              return {
                ...p,
                nickname: p.nickname || '',
                avatar: p.avatar || '',
                cards,
                score,
                bet: Number(ethers.formatUnits(details.betAmount, 18)),
                status: statusText,
                isSplit: otherIsSplit,
                cardsLeft: otherCardsLeft,
                cardsRight: otherCardsRight,
                activeHandIndex: otherActiveHandIndex,
                balance: otherBalance
              };
            } catch (e) {
              return p;
            }
          })
        );
        setOtherPlayers(updatedOthers);
      }

      return {
        playerHand: currentActiveHandCards,
        dealerHand: formattedDealerCards,
        isSettled: isSettled,
        isSplit: onChainIsSplit,
        playerHandLeft: formattedLeft,
        playerHandRight: formattedRight,
        activeHandIndex: activeHandIndex
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
    if (Number(betAmount) < minBetLimit) {
      toast.error(`Bet amount is below the table minimum of ${minBetLimit} chips.`, { id: 'bet-limit-err' });
      return;
    }
    if (Number(betAmount) > maxBetLimit) {
      toast.error(`Bet amount exceeds the table maximum of ${maxBetLimit} chips.`, { id: 'bet-limit-err' });
      return;
    }

    setLoading(true);
    setOutcome(null);
    try {
      const betWei = ethers.parseUnits(betAmount.toString(), tokenDecimals);

      // Check native tBNB balance for gas fee
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const nativeBalance = await provider.getBalance(authData.address);
        if (nativeBalance < ethers.parseEther("0.002")) {
          toast.error("Insufficient tBNB balance!", { id: 'gas-balance-err' });
          setLoading(false);
          return;
        }
      }

      // Check token/chips balance
      const tokenBal = await tokenContract.balanceOf(authData.address);
      if (tokenBal < betWei) {
        toast.error("Insufficient balance!", { id: 'token-balance-err' });
        setLoading(false);
        return;
      }

      // Double-check active signer address in MetaMask to prevent wallet desync reverts
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const signerAddress = await signer.getAddress();
        if (signerAddress.toLowerCase() !== authData.address.toLowerCase()) {
          toast.error("Wallet desync detected! Account changed in MetaMask. Reconnecting...", { id: 'wallet-desync' });
          setLoading(false);
          sessionStorage.removeItem('web3_auth');
          window.location.reload();
          return;
        }
      }

      // Verify on-chain allowance dynamically in real-time to prevent reverted transactions
      const latestAllowance = await tokenContract.allowance(authData.address, CONTRACT_ADDRESS);
      setAllowance(latestAllowance);
      if (latestAllowance < betWei) {
        toast.error("Insufficient allowance! Please click 'APPROVE TOKENS' first.", { id: 'allowance-err' });
        setLoading(false);
        return;
      }

      let targetTableId = gameId;

      // 1. If there's no active table ID yet, create one
      if (!targetTableId || targetTableId === '0') {

        toast.success("Creating new on-chain Blackjack Table...", { duration: 3000 });
        const createTx = await contract.createTable();
        const createReceipt = await createTx.wait();

        const createEvent = createReceipt.logs.find(log => {
          try {
            const parsed = contract.interface.parseLog(log);
            return parsed.name === 'TableCreated';
          } catch (e) { return false; }
        });

        if (!createEvent) {
          throw new Error("Failed to parse TableCreated event from receipt.");
        }

        const parsedCreate = contract.interface.parseLog(createEvent);
        targetTableId = parsedCreate.args.tableId.toString();
        setGameId(targetTableId);
        localStorage.setItem('bj_active_game_id', targetTableId);

        // Share the new table ID immediately with all players in the room
        if (socket) {
          socket.emit('set-table-id', { tableId: targetTableId });
        }
      }

      // 2. Place the bet on the smart contract
      toast.success(`Placing bet on Table #${targetTableId}...`, { duration: 3000 });
      const betGasEstimate = await contract.placeBet.estimateGas(targetTableId, betWei).catch(() => 150000n);
      const tx = await contract.placeBet(targetTableId, betWei, {
        gasLimit: betGasEstimate > 200000n ? (betGasEstimate * 150n) / 100n : 250000n
      });
      await tx.wait();

      // Update token balance local state
      const balance = await tokenContract.balanceOf(authData.address);
      setBalance(ethers.formatUnits(balance, tokenDecimals));

      // Emit 'bet' socket action so other players see we placed our bet
      if (socket) {
        socket.emit('player-action', {
          action: 'bet',
          bet: Number(betAmount),
          cards: [],
          score: 0
        });
      }

      setBetPlaced(true);
      setActivePlayerBet(Number(betAmount));
      toast.success("Bet placed on-chain successfully! Waiting for other players.");
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || "Failed to place bet.");
    } finally {
      setLoading(false);
    }
  };

  const startRound = async () => {
    const activeId = gameId || localStorage.getItem('bj_active_game_id');
    if (!contract) {
      toast.error("Smart contract not loaded. Please connect your wallet!");
      return;
    }
    if (!activeId) {
      toast.error("No active table session found. Please place a bet first!");
      return;
    }
    setLoading(true);
    try {
      toast.success("Starting Round on BSC Testnet...", { duration: 3000 });
      const startGasEstimate = await contract.startRound.estimateGas(activeId).catch(() => 250000n);
      const tx = await contract.startRound(activeId, {
        gasLimit: (startGasEstimate * 150n) / 100n > 350000n ? (startGasEstimate * 150n) / 100n : 350000n
      });
      await tx.wait();

      setGameId(activeId);

      // Wait 1000ms for RPC node synchronization
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Sync player and dealer hands from chain
      await syncCardsFromChain(activeId);

      if (socket) {
        socket.emit('player-action', {
          action: 'start-round'
        });
      }

      setStatus('playing');
      toast.success("Cards dealt! Hit or Stand.");
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || "Failed to start round.");
    } finally {
      setLoading(false);
    }
  };
  const hit = async () => {
    const activeId = gameId || localStorage.getItem('bj_active_game_id');
    if (!contract || !activeId) return;
    setLoading(true);
    try {
      // 1. Pre-flight check: See if round is already settled, or if turn is completed
      const tableInfo = await contract.tables(activeId);
      if (Number(tableInfo.state) !== 1) {
        toast.error("Action rejected: Game round is not active on-chain!");
        await syncCardsFromChain(activeId);
        setLoading(false);
        return;
      }

      // Check if it is actually our turn on-chain
      const activePlayers = await contract.getActivePlayers(activeId);
      const currentTurnIndex = Number(tableInfo.currentTurnIndex);
      const activePlayerAddress = (activePlayers && currentTurnIndex < activePlayers.length)
        ? activePlayers[currentTurnIndex]
        : null;

      if (!activePlayerAddress || activePlayerAddress.toLowerCase() !== authData.address.toLowerCase()) {
        toast.error("Action rejected: Not your turn on-chain! Syncing table...");
        await syncCardsFromChain(activeId);
        setLoading(false);
        return;
      }

      // Check player hand details
      const playerDetails = await contract.getPlayerBetDetails(activeId, authData.address);
      const splitInfo = await contract.getPlayerSplitDetails(activeId, authData.address).catch(() => ({ isSplit: false, activeHandIndex: 0 }));

      if (splitInfo.isSplit) {
        if (Number(splitInfo.activeHandIndex) === 0) {
          if (playerDetails.stood || playerDetails.busted || Number(playerDetails.score) > 21) {
            toast.error("Left hand turn already completed!");
            await syncCardsFromChain(activeId);
            setLoading(false);
            return;
          }
        } else {
          if (splitInfo.splitStood || splitInfo.splitBusted || Number(splitInfo.splitScore) > 21) {
            toast.error("Right hand turn already completed!");
            await syncCardsFromChain(activeId);
            setLoading(false);
            return;
          }
        }
      } else {
        if (playerDetails.stood || playerDetails.busted || Number(playerDetails.score) > 21) {
          toast.error("Turn already completed!");
          await syncCardsFromChain(activeId);
          setLoading(false);
          return;
        }
      }

      // Safe Gas Estimation: Catch EVM failures before wallet prompt
      let gasEstimate;
      try {
        gasEstimate = await contract.hit.estimateGas(activeId);
      } catch (estErr) {
        console.error("Gas estimation failed:", estErr);
        toast.error("Hit rejected: Transaction would revert on-chain. Syncing...");
        await syncCardsFromChain(activeId);
        setLoading(false);
        return;
      }

      const tx = await contract.hit(activeId, {
        gasLimit: gasEstimate > 250000n ? (gasEstimate * 150n) / 100n : 350000n
      });
      toast.success("Dealing card...", { duration: 2000 });
      await tx.wait();

      // Wait 1000ms for RPC node synchronization
      await new Promise(resolve => setTimeout(resolve, 1000));

      const synced = await syncCardsFromChain(activeId);
      if (!synced) throw new Error("On-chain card sync failed.");

      toast.success("Hit successful!");

      const score = calculateScore(synced.playerHand);
      if (score > 21) {
        toast.error("Bust!");
      } else if (score === 21) {
        toast.success("Exactly 21! Auto-standing...", { duration: 2000 });
        setTimeout(() => {
          stand();
        }, 1000);
      }

      if (socket && synced) {
        socket.emit('player-action', {
          action: 'hit',
          cards: synced.isSplit ? synced.playerHandLeft : synced.playerHand,
          score: calculateScore(synced.isSplit ? synced.playerHandLeft : synced.playerHand),
          isSplit: synced.isSplit,
          cardsRight: synced.isSplit ? synced.playerHandRight : [],
          scoreRight: calculateScore(synced.isSplit ? synced.playerHandRight : []),
          activeHandIndex: Number(synced.activeHandIndex)
        });
      }
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || "Hit failed");
    } finally {
      setLoading(false);
    }
  };

  const stand = async () => {
    const activeId = gameId || localStorage.getItem('bj_active_game_id');
    if (!contract || !activeId) return;
    setLoading(true);
    try {
      // 1. Pre-flight check: See if round is already settled, or if turn is concluded
      const tableInfo = await contract.tables(activeId);
      if (Number(tableInfo.state) !== 1) {
        toast.error("Action rejected: Game round is not active on-chain!");
        await syncCardsFromChain(activeId);
        setLoading(false);
        return;
      }

      // Check if it is actually our turn on-chain
      const activePlayers = await contract.getActivePlayers(activeId);
      const currentTurnIndex = Number(tableInfo.currentTurnIndex);
      const activePlayerAddress = (activePlayers && currentTurnIndex < activePlayers.length)
        ? activePlayers[currentTurnIndex]
        : null;

      if (!activePlayerAddress || activePlayerAddress.toLowerCase() !== authData.address.toLowerCase()) {
        toast.error("Action rejected: Not your turn on-chain! Syncing table...");
        await syncCardsFromChain(activeId);
        setLoading(false);
        return;
      }

      // Safe Gas Estimation: Catch EVM failures before wallet prompt
      let gasEstimate;
      try {
        gasEstimate = await contract.stand.estimateGas(activeId);
      } catch (estErr) {
        console.error("Gas estimation failed:", estErr);
        toast.error("Stand rejected: Transaction would revert on-chain. Syncing...");
        await syncCardsFromChain(activeId);
        setLoading(false);
        return;
      }

      const tx = await contract.stand(activeId, {
        gasLimit: gasEstimate > 250000n ? (gasEstimate * 150n) / 100n : 350000n
      });
      toast.success("Standing...", { duration: 2500 });
      await tx.wait();

      // Wait 1000ms for RPC node synchronization
      await new Promise(resolve => setTimeout(resolve, 1000));

      const synced = await syncCardsFromChain(activeId);

      if (socket && synced) {
        if (synced.isSplit && Number(synced.activeHandIndex) === 1) {
          // Transitioned from left hand to right hand turn
          socket.emit('player-action', {
            action: 'hit',
            cards: synced.playerHandLeft,
            score: calculateScore(synced.playerHandLeft),
            isSplit: true,
            cardsRight: synced.playerHandRight,
            scoreRight: calculateScore(synced.playerHandRight),
            activeHandIndex: 1
          });
        } else {
          socket.emit('player-action', {
            action: 'stand',
            activeHandIndex: Number(synced.activeHandIndex)
          });
        }
      }
      toast.success("Stood successfully!");
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || "Stand failed");
    } finally {
      setLoading(false);
    }
  };

  const doubleDown = async () => {
    const activeId = gameId || localStorage.getItem('bj_active_game_id');
    if (!contract || !activeId) return;
    setLoading(true);
    try {
      // 1. Pre-flight check: See if round is already settled, or if turn is completed
      const tableInfo = await contract.tables(activeId);
      if (Number(tableInfo.state) !== 1) {
        toast.error("Action rejected: Game round is not active on-chain!");
        await syncCardsFromChain(activeId);
        setLoading(false);
        return;
      }

      // Check if it is actually our turn on-chain
      const activePlayers = await contract.getActivePlayers(activeId);
      const currentTurnIndex = Number(tableInfo.currentTurnIndex);
      const activePlayerAddress = (activePlayers && currentTurnIndex < activePlayers.length)
        ? activePlayers[currentTurnIndex]
        : null;

      if (!activePlayerAddress || activePlayerAddress.toLowerCase() !== authData.address.toLowerCase()) {
        toast.error("Action rejected: Not your turn on-chain! Syncing table...");
        await syncCardsFromChain(activeId);
        setLoading(false);
        return;
      }

      // 2. Double check and auto-approve token allowance for the additional bet if needed
      const playerDetailsBefore = await contract.getPlayerBetDetails(activeId, authData.address);
      const additionalBet = playerDetailsBefore.betAmount;
      const currentAllowance = await tokenContract.allowance(authData.address, CONTRACT_ADDRESS);
      setAllowance(currentAllowance);
      if (currentAllowance < additionalBet) {
        toast.success("Approving additional chips for double down...", { id: 'double-allow' });
        const approveTx = await tokenContract.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
        await approveTx.wait();
        const allow = await tokenContract.allowance(authData.address, CONTRACT_ADDRESS);
        setAllowance(allow);
      }

      // Safe Gas Estimation: Catch EVM failures before wallet prompt
      let gasEstimate;
      try {
        gasEstimate = await contract.doubleDown.estimateGas(activeId);
      } catch (estErr) {
        console.error("Gas estimation failed:", estErr);
        toast.error("Double Down rejected: Transaction would revert on-chain. Syncing...");
        await syncCardsFromChain(activeId);
        setLoading(false);
        return;
      }

      const tx = await contract.doubleDown(activeId, {
        gasLimit: gasEstimate > 250000n ? (gasEstimate * 150n) / 100n : 350000n
      });
      await tx.wait();

      // Wait 1000ms for RPC node synchronization
      await new Promise(resolve => setTimeout(resolve, 1000));

      const synced = await syncCardsFromChain(activeId);

      toast.success("Double Down successful!");
      setCurrentBet(prev => Number(prev) + Number(betAmount));
      setActivePlayerBet(prev => prev * 2);

      if (socket && synced) {
        const finalScore = calculateScore(synced.playerHand);
        const isBust = finalScore > 21;

        if (synced.isSplit && Number(synced.activeHandIndex) === 1) {
          // Transitioned to right hand
          socket.emit('player-action', {
            action: 'hit',
            cards: synced.playerHandLeft,
            score: calculateScore(synced.playerHandLeft),
            isSplit: true,
            cardsRight: synced.playerHandRight,
            scoreRight: calculateScore(synced.playerHandRight),
            activeHandIndex: 1
          });
        } else {
          socket.emit('player-action', {
            action: 'finished',
            cards: synced.isSplit ? synced.playerHandLeft : synced.playerHand,
            score: synced.isSplit ? calculateScore(synced.playerHandLeft) : finalScore,
            isSplit: synced.isSplit,
            cardsRight: synced.isSplit ? synced.playerHandRight : [],
            scoreRight: synced.isSplit ? calculateScore(synced.playerHandRight) : 0,
            statusText: isBust ? 'Bust!' : 'Stood'
          });
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || "Double Down failed");
    } finally {
      setLoading(false);
    }
  };

  const forceTimeout = async () => {
    const activeId = gameId || localStorage.getItem('bj_active_game_id');
    if (!contract || !activeId) return;
    setLoading(true);
    try {
      toast.success("Triggering on-chain timeout...", { duration: 3000 });
      const tx = await contract.forceTimeout(activeId);
      await tx.wait();
      toast.success("Stalled player timed out successfully!");

      if (socket) {
        socket.emit('player-action', { action: 'stand' });
      }
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || "Timeout call failed. Still within timeout period?");
    } finally {
      setLoading(false);
    }
  };

  const split = async () => {
    const activeId = gameId || localStorage.getItem('bj_active_game_id');
    if (!contract || !activeId) return;
    setLoading(true);
    try {
      // 1. Pre-flight check: See if round is active
      const tableInfo = await contract.tables(activeId);
      if (Number(tableInfo.state) !== 1) {
        toast.error("Action rejected: Game round is not active on-chain!");
        await syncCardsFromChain(activeId);
        setLoading(false);
        return;
      }

      // Check if it is actually our turn on-chain
      const activePlayers = await contract.getActivePlayers(activeId);
      const currentTurnIndex = Number(tableInfo.currentTurnIndex);
      const activePlayerAddress = (activePlayers && currentTurnIndex < activePlayers.length)
        ? activePlayers[currentTurnIndex]
        : null;

      if (!activePlayerAddress || activePlayerAddress.toLowerCase() !== authData.address.toLowerCase()) {
        toast.error("Action rejected: Not your turn on-chain! Syncing table...");
        await syncCardsFromChain(activeId);
        setLoading(false);
        return;
      }

      // 2. Double check and auto-approve token allowance for the additional bet if needed
      const playerDetailsBefore = await contract.getPlayerBetDetails(activeId, authData.address);
      const additionalBet = playerDetailsBefore.betAmount;
      const currentAllowance = await tokenContract.allowance(authData.address, CONTRACT_ADDRESS);
      setAllowance(currentAllowance);
      if (currentAllowance < additionalBet) {
        toast.success("Approving additional chips for split...", { id: 'split-allow' });
        const approveTx = await tokenContract.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
        await approveTx.wait();
        const allow = await tokenContract.allowance(authData.address, CONTRACT_ADDRESS);
        setAllowance(allow);
      }

      // Safe Gas Estimation: Catch EVM failures before wallet prompt
      let gasEstimate;
      try {
        gasEstimate = await contract.split.estimateGas(activeId);
      } catch (estErr) {
        console.error("Gas estimation failed:", estErr);
        toast.error("Split rejected: Transaction would revert on-chain. Syncing...");
        await syncCardsFromChain(activeId);
        setLoading(false);
        return;
      }

      toast.success("Splitting hands on-chain...", { duration: 2000 });
      const tx = await contract.split(activeId, {
        gasLimit: gasEstimate > 250000n ? (gasEstimate * 150n) / 100n : 350000n
      });
      await tx.wait();

      toast.success("Split successful!");

      // Sync cards immediately
      const synced = await syncCardsFromChain(activeId);

      // Update balance
      if (tokenContract) {
        try {
          const balance = await tokenContract.balanceOf(authData.address);
          setBalance(ethers.formatUnits(balance, tokenDecimals));
        } catch (e) {
          console.error("Failed to update balance:", e);
        }
      }

      // Emit socket event to notify other players that this hand split
      if (socket && synced) {
        socket.emit('player-action', {
          action: 'hit',
          cards: synced.isSplit ? synced.playerHandLeft : synced.playerHand,
          score: calculateScore(synced.isSplit ? synced.playerHandLeft : synced.playerHand),
          isSplit: true,
          cardsRight: synced.isSplit ? synced.playerHandRight : [],
          scoreRight: calculateScore(synced.isSplit ? synced.playerHandRight : []),
          activeHandIndex: 0
        });
      }
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || "Split failed");
    } finally {
      setLoading(false);
    }
  };

  const resetGameState = (isLeaving = false) => {
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
    setBetPlaced(false);
    setActivePlayerBet(0);
    setGameId(null);
    setTableState('betting');
    setIsMyTurn(false);
    setSharedDealerCards([]);
    setTimeLeft(60);
    setShowTimeoutPopup(false);

    if (isLeaving) {
      setIsTableLeader(false);
      setOtherPlayers([]);
      setSelectedTableId(null);
      if (socket) {
        socket.emit('leave-table');
      }
    } else {
      if (socket) {
        socket.emit('player-action', { action: 'reset' });
      }
    }

    // Clean up all local storage items
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
    localStorage.removeItem('bj_selected_table_id');
  };

  // Auto-start round once all connected players have placed their bets on-chain
  useEffect(() => {
    if (status !== 'betting') {
      autoStartAttemptedRef.current = false;
      return;
    }

    const triggerAutoStart = async () => {
      const activeId = gameId || localStorage.getItem('bj_active_game_id');
      if (status === 'betting' && isTableLeader && betPlaced && !loading && activeId && !autoStartAttemptedRef.current) {
        const allOthersReady = otherPlayers.length === 0 || otherPlayers.every(p => p.bet > 0);
        if (allOthersReady) {
          autoStartAttemptedRef.current = true;
          setLoading(true);
          await startRound();
        }
      }
    };
    triggerAutoStart();
  }, [status, isTableLeader, betPlaced, otherPlayers, loading, gameId]);

  const needsApproval = allowance < ethers.parseUnits(betAmount.toString() || "0", tokenDecimals);

  if (selectedTableId === null) {
    return (
      <TableSelector
        lobbyStatus={lobbyStatus}
        onSelectTable={(id) => setSelectedTableId(id)}
      />
    );
  }

  return (
    <div className="w-full h-full relative flex flex-col justify-between items-center select-none pt-2 pb-28 overflow-hidden">

      {/* Top Header Bar */}
      <div className="w-full max-w-5xl px-6 py-2.5 flex justify-between items-center z-20 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl mb-4">
        <button
          onClick={() => resetGameState(true)}
          className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 hover:border-rose-500/65 text-rose-400 font-extrabold text-[11px] tracking-wider uppercase rounded-xl transition-all duration-200"
        >
          ← Leave Table
        </button>
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-white font-black tracking-widest text-[11px] uppercase">
            {selectedTableId === 1 && "Emerald Felt"}
            {selectedTableId === 2 && "Vegas Sapphire"}
            {selectedTableId === 3 && "Cyberpunk Violet"}
            {selectedTableId === 4 && "Royale Gold"}
            {selectedTableId === 5 && "Shadow Obsidian"}
            {" - Table #"}{selectedTableId}
          </span>
        </div>
      </div>

      {/* Curved Table felt container */}
      <TableBackground>

        {/* Dealer area at top-center */}
        <DealerSection status={status} dealerHand={dealerHand} />

        {/* Outcome Banner */}
        {status === 'settled' && outcome && (
          <div className="absolute top-[28%] left-1/2 -translate-x-1/2 z-30 my-4 animate-in zoom-in-50 duration-500 flex flex-col items-center">
            <div className={`px-8 py-3 rounded-2xl border text-xl font-black tracking-widest uppercase shadow-[0_0_35px_rgba(0,0,0,0.8)] ${outcome === 'win'
              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-emerald-500/20'
              : outcome === 'push'
                ? 'bg-amber-500/20 border-amber-500 text-amber-400 shadow-amber-500/20'
                : 'bg-red-500/20 border-red-500 text-red-400 shadow-red-500/20'
              }`}>
              {isSplit ? (
                <>
                  {outcome === 'win' && (
                    getHandOutcome(playerHandLeft, dealerHand) === 'win' && getHandOutcome(playerHandRight, dealerHand) === 'win'
                      ? "🏆 Won Both Hands!"
                      : "🏆 Net Win!"
                  )}
                  {outcome === 'push' && (
                    (getHandOutcome(playerHandLeft, dealerHand) === 'win' && getHandOutcome(playerHandRight, dealerHand) === 'loss') ||
                      (getHandOutcome(playerHandLeft, dealerHand) === 'loss' && getHandOutcome(playerHandRight, dealerHand) === 'win')
                      ? "🤝 Even Money (Win 1, Lose 1)"
                      : getHandOutcome(playerHandLeft, dealerHand) === 'push' && getHandOutcome(playerHandRight, dealerHand) === 'push'
                        ? "🤝 Push Both Hands"
                        : "🤝 Even Money / Push"
                  )}
                  {outcome === 'loss' && (
                    getHandOutcome(playerHandLeft, dealerHand) === 'loss' && getHandOutcome(playerHandRight, dealerHand) === 'loss'
                      ? "❌ Lost Both Hands"
                      : "❌ Net Loss"
                  )}
                </>
              ) : (
                <>
                  {outcome === 'win' && (
                    (playerHand.length === 2 && calculateScore(playerHand) === 21)
                      ? "🃏 Blackjack!"
                      : "🏆 You Win!"
                  )}
                  {outcome === 'push' && "🤝 Push / Tie"}
                  {outcome === 'loss' && "❌ Dealer Wins"}
                </>
              )}
            </div>
          </div>
        )}

        {/* 5-Seat Semicircular Layout */}
        <div className="absolute inset-0 z-10 pointer-events-none">
          {/* Seat 1 (Far Left): otherPlayers[0] */}
          <div className="absolute top-[22%] left-[8%] transform -translate-y-1/2 pointer-events-auto">
            {otherPlayers[0] ? (
              <PlayerSeat player={otherPlayers[0]} idx={0} isMyTurn={isMyTurn} status={status} outcome={outcome} isSplit={isSplit} onOpenSettings={onOpenSettings} activeHandIndex={otherPlayers[0].activeHandIndex || 0} />
            ) : (
              <EmptySeat seatLabel="Seat 1" />
            )}
          </div>

          {/* Seat 2 (Mid Left): otherPlayers[1] */}
          <div className="absolute top-[55%] left-[18%] transform -translate-y-1/2 pointer-events-auto">
            {otherPlayers[1] ? (
              <PlayerSeat player={otherPlayers[1]} idx={1} isMyTurn={isMyTurn} status={status} outcome={outcome} isSplit={isSplit} onOpenSettings={onOpenSettings} activeHandIndex={otherPlayers[1].activeHandIndex || 0} />
            ) : (
              <EmptySeat seatLabel="Seat 2" />
            )}
          </div>

          {/* Seat 3 (Center): YOU */}
          <div className="absolute bottom-[7.5%] left-[50%] transform -translate-x-1/2 pointer-events-auto">
            <PlayerSeat player={{
              isYou: true,
              address: authData.address,
              nickname: customNickname,
              avatar: customAvatar,
              bet: activePlayerBet || betAmount,
              cards: playerHand,
              cardsLeft: playerHandLeft,
              cardsRight: playerHandRight,
              isSplit: isSplit,
              status: isMyTurn && status === 'playing' ? 'playing' : (status === 'playing' ? 'waiting' : outcome || 'waiting')
            }} idx={2} isMyTurn={isMyTurn} status={status} outcome={outcome} isSplit={isSplit} onOpenSettings={onOpenSettings} activeHandIndex={activeHandIndex} />
          </div>

          {/* Seat 4 (Mid Right): otherPlayers[2] */}
          <div className="absolute top-[55%] right-[18%] transform -translate-y-1/2 pointer-events-auto">
            {otherPlayers[2] ? (
              <PlayerSeat player={otherPlayers[2]} idx={2} isMyTurn={isMyTurn} status={status} outcome={outcome} isSplit={isSplit} onOpenSettings={onOpenSettings} activeHandIndex={otherPlayers[2].activeHandIndex || 0} />
            ) : (
              <EmptySeat seatLabel="Seat 4" />
            )}
          </div>

          {/* Seat 5 (Far Right): otherPlayers[3] */}
          <div className="absolute top-[22%] right-[8%] transform -translate-y-1/2 pointer-events-auto">
            {otherPlayers[3] ? (
              <PlayerSeat player={otherPlayers[3]} idx={3} isMyTurn={isMyTurn} status={status} outcome={outcome} isSplit={isSplit} onOpenSettings={onOpenSettings} activeHandIndex={otherPlayers[3].activeHandIndex || 0} />
            ) : (
              <EmptySeat seatLabel="Seat 5" />
            )}
          </div>
        </div>
      </TableBackground>

      {/* Betting / Action bottom fixed panel */}
      <BettingPanel
        status={status}
        betPlaced={betPlaced}
        betAmount={betAmount}
        loading={loading}
        isTableLeader={isTableLeader}
        selectedChip={selectedChip}
        isMyTurn={isMyTurn}
        isSplit={isSplit}
        playerHand={playerHand}
        timeLeft={timeLeft}
        needsApproval={needsApproval}
        setSelectedChip={setSelectedChip}
        setBetAmount={setBetAmount}
        startRound={startRound}
        approveTokens={approveTokens}
        placeBet={placeBet}
        resetGameState={resetGameState}
        forceTimeout={forceTimeout}
        hit={hit}
        stand={stand}
        doubleDown={doubleDown}
        split={split}
      />

      {/* Timeout Action Choice Popup Overlay */}
      {showTimeoutPopup && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center animate-in fade-in duration-300">
          <div className="bg-slate-950 border border-red-500/30 rounded-[30px] p-8 max-w-md w-full mx-4 shadow-[0_0_50px_rgba(239,68,68,0.25)] text-center animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-6 animate-pulse">
              ⚠️
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-wider mb-2">Time Expired!</h3>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              You did not make a choice in time. Please choose an action now to proceed with your hand.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => { setShowTimeoutPopup(false); hit(); }}
                disabled={loading}
                className="flex-1 py-4 bg-gradient-to-r from-cyan-400 to-blue-500 hover:scale-105 active:scale-95 transition-all text-black font-black uppercase tracking-wider rounded-2xl shadow-lg shadow-cyan-500/20 text-sm"
              >HIT</button>
              <button
                onClick={() => { setShowTimeoutPopup(false); stand(); }}
                disabled={loading}
                className="flex-1 py-4 bg-gradient-to-r from-red-500 to-pink-600 hover:scale-105 active:scale-95 transition-all text-white font-black uppercase tracking-wider rounded-2xl shadow-lg shadow-red-500/20 text-sm"
              >STAND</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// ─── Top-level sub-components ─────────────────────────────────────────────────
// Defined OUTSIDE BlackjackMultiplayer so React reuses their DOM nodes
// on every re-render instead of unmounting+remounting them (eliminates the blink).

const TableBackground = ({ children }) => (
  <div className="w-full overflow-hidden py-4 px-2 select-none relative z-10 mt-2 flex justify-center items-center">
    <div className="multiplayer-table-felt flex flex-col justify-between items-center py-8 px-6">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
        <svg className="w-[85%] h-[85%]" viewBox="0 0 1000 600" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path id="bj-curve" d="M 150,220 A 400,250 0 0,0 850,220" fill="none" />
          <text className="font-extrabold text-[24px]" letterSpacing="6" fill="#fff" textAnchor="middle">
            <textPath href="#bj-curve" startOffset="50%">BLACKJACK PAYS 3 TO 2</textPath>
          </text>
          <path id="dealer-curve" d="M 200,280 A 350,220 0 0,0 800,280" fill="none" />
          <text className="font-bold text-[14px]" letterSpacing="4" fill="#fff" textAnchor="middle">
            <textPath href="#dealer-curve" startOffset="50%">Dealer must hit soft 17</textPath>
          </text>
          <path id="ins-curve" d="M 250,340 A 300,190 0 0,0 750,340" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeDasharray="10,6" />
          <text className="font-extrabold text-[15px]" letterSpacing="5" fill="#fff" textAnchor="middle">
            <textPath href="#ins-curve" startOffset="50%">INSURANCE PAYS 2 TO 1</textPath>
          </text>
        </svg>
      </div>
      {children}
    </div>
  </div>
);

const DealerSection = ({ status, dealerHand }) => (
  <div className="flex justify-center items-center w-full relative z-20 mt-2">
    <div className="flex flex-col items-center relative">
      <div className="bg-slate-950/95 px-5 py-1 text-white text-[10px] uppercase font-black rounded-full border border-white/12 tracking-widest mb-3 shadow-lg flex items-center gap-2">
        <span>DEALER</span>
        {status !== 'betting' && dealerHand.length > 0 && (
          <span className="bg-red-500/80 px-2 py-0.5 rounded text-[10px] font-black text-white ml-1">
            {calculateScore(dealerHand)}
          </span>
        )}
      </div>
      <div className="flex justify-center relative min-h-[100px]">
        <div className="flex">
          {status !== 'betting' && dealerHand.map((c, i) => (
            <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-45px' : '0', zIndex: i }}>
              {c.hidden ? (
                <div className="classic-playing-card card-hidden classic-card-tilt-right"></div>
              ) : (
                <Web2Card suit={c.suit} value={c.value} tiltClass={i % 2 === 0 ? 'classic-card-tilt-left' : 'classic-card-tilt-right'} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const EmptySeat = ({ seatLabel }) => (
  <div className="flex flex-col items-center justify-center p-3 min-h-[160px] transition-all duration-300 scale-[0.9] origin-bottom">
    <div className="w-14 h-14 rounded-full border-2 border-dashed border-slate-700/40 flex items-center justify-center text-slate-600 mb-1.5 bg-black/25">👤</div>
    <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-1.5">{seatLabel}</span>
    <button
      onClick={() => toast.success("You are already joined as the player at the center seat!")}
      className="px-3 py-1 bg-slate-900/60 hover:bg-slate-900 border border-slate-800/40 hover:border-slate-600 rounded-lg text-[9px] text-slate-400 hover:text-white font-black uppercase tracking-wider transition-all duration-300 shadow-md"
    >Join Table</button>
  </div>
);

const PlayerSeat = ({ player, idx, isMyTurn, status, outcome, isSplit, onOpenSettings, activeHandIndex = 0 }) => {
  const isPlayerActive = player.isYou
    ? (isMyTurn && status === 'playing')
    : (player.status && (
        player.status.toLowerCase().includes('playing') ||
        player.status.toLowerCase() === 'left stood' ||
        player.status.toLowerCase() === 'left busted'
      ));

  const playerAvatar = getAvatarAsset(player.avatar, player.address);
  const playerNickname = getNicknameToShow(player.nickname, player.address);

  // For other players, the server puts the left-hand split cards in `player.cards`.
  // For the local user, syncCardsFromChain sets `cardsLeft` directly.
  const effectiveCardsLeft = player.cardsLeft || player.cards || [];
  const effectiveCardsRight = player.cardsRight || [];

  let playerScore = 0;
  if (player.isYou) {
    playerScore = isSplit ? 0 : calculateScore(player.cards);
  } else {
    playerScore = player.isSplit ? 0 : (player.cards ? calculateScore(player.cards) : 0);
  }

  let statusClass = "status-badge-waiting";
  let statusLabel = "WAITING";
  if (player.isYou) {
    if (isMyTurn && status === 'playing') { statusClass = "status-badge-yourturn"; statusLabel = "YOUR TURN"; }
    else if (status === 'playing') { statusClass = "status-badge-waiting"; statusLabel = "WAITING"; }
    else if (outcome === 'win') { statusClass = "status-badge-blackjack"; statusLabel = "WINNER"; }
    else if (outcome === 'loss') { statusClass = "bg-red-600/80 border-red-500/50 text-red-200"; statusLabel = "LOST"; }
    else if (outcome === 'push') { statusClass = "status-badge-waiting border-amber-500/55 text-amber-400"; statusLabel = "PUSH"; }
  } else {
    const lowerStatus = player.status ? player.status.toLowerCase() : "";
    if (isPlayerActive) { statusClass = "status-badge-yourturn"; statusLabel = "PLAYING"; }
    else if (lowerStatus.includes('blackjack') || lowerStatus.includes('winner') || lowerStatus.includes('win')) { statusClass = "status-badge-blackjack"; statusLabel = "WINNER"; }
    else if (lowerStatus.includes('lost') || lowerStatus.includes('bust') || lowerStatus.includes('loss')) { statusClass = "bg-red-600/80 border-red-500/50 text-red-200"; statusLabel = "LOST"; }
    else { statusClass = "status-badge-waiting"; statusLabel = player.status ? player.status.toUpperCase() : "WAITING"; }
  }

  return (
    <div className="flex flex-col items-center justify-end min-h-[200px] relative">
      {status !== 'betting' && (
        <div className="relative flex flex-col items-center min-h-[90px] mb-2 z-20">
          {playerScore > 0 && (
            <div className={`bj-score-badge ${player.isYou ? 'bj-score-badge-you' : ''} animate-in zoom-in duration-300`}>
              {playerScore}
            </div>
          )}
          {player.isSplit ? (
            <div className="flex flex-row justify-around w-full gap-8 scale-[0.85] origin-bottom">
              <div className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${activeHandIndex === 0 && isPlayerActive ? 'bg-white/10 ring-2 ring-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)] scale-105' : 'opacity-80'}`}>
                <span className={`text-[12px] font-bold mb-1 ${activeHandIndex === 0 && isPlayerActive ? 'text-emerald-300' : 'text-slate-400'}`}>Left ({calculateScore(effectiveCardsLeft)})</span>
                <div className="flex justify-center min-h-[100px] relative">
                  <div className="flex animate-in slide-in-from-left-2 duration-300">
                    {effectiveCardsLeft && effectiveCardsLeft.map((c, i) => (
                      <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-35px' : '0', zIndex: i }}>
                        <Web2Card suit={c.suit} value={c.value} tiltClass={i % 2 === 0 ? 'classic-card-tilt-left' : 'classic-card-tilt-right'} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-1 bg-black/75 px-2 py-0.5 rounded border border-white/20 text-[9px] font-black text-amber-400 shadow-md">
                  <span className="w-1.5 h-1.5 rounded bg-red-500 border border-white/35"></span>
                  <span>{player.bet || 0}</span>
                </div>
              </div>
              <div className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${activeHandIndex === 1 && isPlayerActive ? 'bg-white/10 ring-2 ring-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)] scale-105' : 'opacity-80'}`}>
                <span className={`text-[12px] font-bold mb-1 ${activeHandIndex === 1 && isPlayerActive ? 'text-emerald-300' : 'text-slate-400'}`}>Right ({calculateScore(effectiveCardsRight)})</span>
                <div className="flex justify-center min-h-[100px] relative">
                  <div className="flex animate-in slide-in-from-right-2 duration-300">
                    {effectiveCardsRight && effectiveCardsRight.map((c, i) => (
                      <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-35px' : '0', zIndex: i }}>
                        <Web2Card suit={c.suit} value={c.value} tiltClass={i % 2 === 0 ? 'classic-card-tilt-left' : 'classic-card-tilt-right'} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-1 bg-black/75 px-2 py-0.5 rounded border border-white/20 text-[9px] font-black text-amber-400 shadow-md">
                  <span className="w-1.5 h-1.5 rounded bg-red-500 border border-white/35"></span>
                  <span>{player.bet || 0}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center min-h-[80px] relative w-full scale-[0.8] origin-bottom">
              <div className="flex">
                {player.cards && player.cards.map((c, i) => (
                  <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-42px' : '0', zIndex: i }}>
                    <Web2Card suit={c.suit} value={c.value} tiltClass={i % 2 === 0 ? 'classic-card-tilt-left' : 'classic-card-tilt-right'} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col items-center z-10 scale-[0.9] origin-bottom">
        <div className={`${player.isYou ? 'avatar-ring-you' : 'avatar-ring-other'} ${isPlayerActive ? 'avatar-active-glow' : ''} mb-1.5 relative group shadow-2xl`}>
          <img src={playerAvatar} className="w-full h-full object-cover rounded-full" alt="Avatar" />
          {player.isYou && (
            <button
              onClick={onOpenSettings}
              className="absolute -bottom-1 -right-1 bg-black/85 hover:bg-black border border-white/20 text-white rounded-full p-1 text-[9px] shadow-lg transition-transform hover:scale-110 active:scale-95"
              title="Edit Profile"
            >⚙️</button>
          )}
        </div>
        <div className="player-info-card">
          <span className="player-name-text">{playerNickname}</span>
          <div className="player-bet-pill">
            <span className="mini-casino-chip"></span>
            <span className="player-bet-value">{player.isSplit ? (player.bet || 0) * 2 : (player.bet || 0)}</span>
          </div>
        </div>
        <span className={`text-[9.5px] font-black px-2.5 py-0.5 rounded uppercase tracking-wider border mt-1.5 shadow-md ${statusClass}`}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
};

const BettingPanel = ({
  status, betPlaced, betAmount, loading, isTableLeader, selectedChip, isMyTurn, isSplit,
  playerHand, timeLeft, needsApproval,
  setSelectedChip, setBetAmount, startRound, approveTokens, placeBet,
  resetGameState, forceTimeout, hit, stand, doubleDown, split
}) => (
  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center justify-between gap-6 px-6 py-4 rounded-[24px] w-[95%] max-w-[960px] betting-glass-panel animate-in slide-in-from-bottom-12 duration-500">

    {/* Left Section */}
    {status === 'betting' ? (
      betPlaced ? (
        <div className="flex items-center gap-3 animate-in fade-in duration-300">
          <span className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-black uppercase tracking-wider animate-pulse flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
            ✅ Bet of {betAmount} chips placed on-chain!
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-2xl border border-white/5">
            <button className="text-slate-500 hover:text-white font-black text-lg">‹</button>
            <div className="flex gap-2.5">
              {CHIPS.map(chip => (
                <div
                  key={chip.value}
                  onClick={() => { setSelectedChip(chip.value); setBetAmount(prev => prev + chip.value); }}
                  className={`casino-chip ${chip.className} ${selectedChip === chip.value ? 'chip-selected ring-2 ring-white scale-110 shadow-lg' : ''}`}
                >{chip.label}</div>
              ))}
            </div>
            <button className="text-slate-500 hover:text-white font-black text-lg">›</button>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold uppercase tracking-wider">
            <span>Total Bet: {betAmount}</span>
            <span className="mini-casino-chip"></span>
          </div>
        </div>
      )
    ) : (
      <div className="flex items-center gap-2">
        {status === 'playing' && !isMyTurn && (
          <div className="flex items-center gap-3 animate-in fade-in duration-300">
            <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-[10px] font-bold animate-pulse">
              ⏳ Waiting for player action...
            </span>
            <button
              onClick={forceTimeout}
              disabled={loading}
              className="px-3 py-1 bg-red-500/15 border border-red-500/20 hover:bg-red-500/25 rounded-lg text-red-400 text-[9px] font-bold transition-all uppercase"
            >⚠️ Force Timeout</button>
          </div>
        )}
        {loading && <span className="text-white text-xs font-bold animate-pulse">Waiting for network transaction...</span>}
      </div>
    )}

    {/* Right Section */}
    {status === 'betting' ? (
      betPlaced ? (
        <div className="flex items-center gap-4">
          {isTableLeader ? (
            <button
              onClick={startRound}
              disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-500 text-black font-black rounded-xl shadow-[0_0_20px_rgba(234,179,8,0.3)] hover:scale-105 active:scale-95 transition-all text-xs uppercase tracking-wider"
            >{loading ? "STARTING ROUND..." : "START GAME"}</button>
          ) : (
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest animate-pulse">
              Waiting for leader to start game...
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setBetAmount(0); setSelectedChip(null); }}
            className="px-6 py-3 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 rounded-xl font-black text-xs uppercase tracking-wider transition-all"
          >Clear</button>
          {needsApproval ? (
            <button
              onClick={approveTokens}
              disabled={loading}
              className="px-8 py-3 bg-orange-500 hover:bg-orange-600 text-black rounded-xl font-black shadow-lg hover:scale-105 active:scale-95 transition-all text-xs uppercase tracking-wider"
            >{loading ? "APPROVING..." : "APPROVE TOKENS"}</button>
          ) : (
            <button
              onClick={placeBet}
              disabled={loading || betAmount <= 0}
              className="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-black rounded-xl font-black shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed text-xs uppercase tracking-wider"
            >{loading ? "TRANSACTING..." : (betAmount > 0 ? `PLACE BET (${betAmount})` : "SELECT CHIPS TO BET")}</button>
          )}
        </div>
      )
    ) : status === 'settled' ? (
      <div className="flex justify-center w-full">
        <button
          onClick={() => resetGameState(false)}
          className="px-12 py-3 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-500 text-black font-black text-sm rounded-xl shadow-[0_0_20px_rgba(234,179,8,0.4)] hover:scale-105 active:scale-95 transition-all uppercase tracking-wider"
        >Play Another Hand</button>
      </div>
    ) : (
      <div className="flex items-center gap-6">
        {isMyTurn && (
          <div className="flex items-center gap-3 animate-in fade-in duration-300">
            <button onClick={hit} disabled={loading || status !== 'playing'} className="btn-action btn-hit flex items-center justify-center gap-2">HIT</button>
            <button onClick={stand} disabled={loading || status !== 'playing'} className="btn-action btn-stand flex items-center justify-center gap-2">STAND</button>
            <button onClick={doubleDown} disabled={loading || status !== 'playing' || playerHand.length !== 2} className="btn-action btn-double flex items-center justify-center gap-2">DOUBLE</button>
            <button onClick={split} disabled={loading || status !== 'playing' || isSplit || playerHand.length !== 2 || (playerHand[0] && playerHand[1] && playerHand[0].value !== playerHand[1].value)} className="btn-action btn-split flex items-center justify-center gap-2">SPLIT</button>
          </div>
        )}
        {isMyTurn && (
          <div className="circular-timer-box animate-in zoom-in duration-300">
            <span className="text-[7.5px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-1">YOUR TURN</span>
            <span className="text-xl font-black text-white leading-none">{timeLeft}</span>
            <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">SEC</span>
          </div>
        )}
      </div>
    )}
  </div>
);


const TableSelector = ({ lobbyStatus, onSelectTable }) => {
  const tablesInfo = [
    { id: 1, name: "Emerald Felt", color: "from-emerald-950/70 to-emerald-900/90", glow: "shadow-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    { id: 2, name: "Vegas Sapphire", color: "from-blue-950/70 to-blue-900/90", glow: "shadow-blue-500/20 text-blue-400 border-blue-500/30" },
    { id: 3, name: "Cyberpunk Violet", color: "from-purple-950/70 to-purple-900/90", glow: "shadow-purple-500/20 text-purple-400 border-purple-500/30" },
    { id: 4, name: "Royale Gold", color: "from-amber-950/70 to-amber-900/90", glow: "shadow-amber-500/20 text-amber-400 border-amber-500/30" },
    { id: 5, name: "Shadow Obsidian", color: "from-slate-950/70 to-slate-900/90", glow: "shadow-slate-500/20 text-slate-400 border-slate-500/30" }
  ];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-12 select-none text-white animate-in fade-in duration-500">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-black tracking-widest bg-gradient-to-r from-emerald-400 via-teal-200 to-emerald-500 bg-clip-text text-transparent uppercase mb-3 drop-shadow-[0_0_15px_rgba(16,185,129,0.25)]">
          Blackjack Multiplayer felt Lobby
        </h1>
        <p className="text-slate-400 text-xs font-bold tracking-widest uppercase">
          Select an active felt table to join or spectate
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 justify-center animate-in zoom-in-95 duration-500">
        {tablesInfo.map((table) => {
          const status = lobbyStatus.find(s => s.id === table.id) || { playerCount: 0 };
          const isFull = status.playerCount >= 5;

          return (
            <div
              key={table.id}
              className={`bg-slate-900/70 backdrop-blur-md border rounded-[30px] p-8 flex flex-col justify-between items-center transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 shadow-[0_20px_40px_rgba(0,0,0,0.6)] ${table.glow}`}
            >
              <div className="w-full text-center">
                {/* Table felt preview */}
                <div className={`w-full h-32 rounded-2xl bg-gradient-to-br ${table.color} border border-white/10 relative overflow-hidden flex items-center justify-center mb-6`}>
                  <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
                  <div className="border border-white/20 rounded-full w-24 h-24 flex items-center justify-center opacity-30 text-[10px] font-black tracking-wider text-center uppercase">
                    Blackjack
                  </div>
                </div>

                <h3 className="text-xl font-black tracking-wider text-white mb-2 uppercase">
                  {table.name}
                </h3>
                
                <div className="flex items-center justify-center gap-2 mb-6">
                  <span className={`w-2 h-2 rounded-full ${isFull ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`}></span>
                  <span className="text-xs font-black text-slate-300 uppercase tracking-widest">
                    {status.playerCount} / 5 Players
                  </span>
                </div>
              </div>

              <button
                disabled={isFull}
                onClick={() => onSelectTable(table.id)}
                className={`w-full py-4 rounded-2xl font-black text-[11px] tracking-widest uppercase transition-all duration-200 ${
                  isFull
                    ? 'bg-rose-500/10 border border-rose-500/20 text-rose-500 cursor-not-allowed'
                    : 'bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/25 hover:border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/5 hover:shadow-emerald-500/15'
                }`}
              >
                {isFull ? 'Table Full' : 'Join Table'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Web2Card = ({ suit, value, tiltClass = '' }) => {
  const isRed = suit === '♥' || suit === '♦';
  return (
    <div className={`classic-playing-card ${tiltClass} ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
      <div className="flex justify-between w-full">
        <span className="card-suit-text">{value}</span>
        <span className="card-suit-text">{suit}</span>
      </div>
      <div className="card-center-suit">
        {suit}
      </div>
      <div className="flex justify-between w-full rotate-180">
        <span className="card-suit-text">{value}</span>
        <span className="card-suit-text">{suit}</span>
      </div>
    </div>
  );
};
