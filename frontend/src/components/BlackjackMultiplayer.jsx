import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { io } from 'socket.io-client';
import { getContract, getTokenContract, CONTRACT_ADDRESS } from '../utils/contract';
import toast from 'react-hot-toast';

const CHIPS = [
  { value: 10, label: '10', className: 'chip-10' },
  { value: 25, label: '25', className: 'chip-25' },
  { value: 50, label: '50', className: 'chip-50' },
  { value: 100, label: '100', className: 'chip-100' },
  { value: 250, label: '250', className: 'chip-250' },
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
  const [minBetLimit, setMinBetLimit] = useState(10);
  const [maxBetLimit, setMaxBetLimit] = useState(10000);

  // Split-hand state additions
  const [isSplit, setIsSplit] = useState(false);
  const [activeHandIndex, setActiveHandIndex] = useState(0); // 0 = Left Hand, 1 = Right Hand
  const [playerHandLeft, setPlayerHandLeft] = useState([]);
  const [playerHandRight, setPlayerHandRight] = useState([]);
  const [betPlaced, setBetPlaced] = useState(false);

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

  const tableStateRef = useRef(tableState);
  useEffect(() => {
    tableStateRef.current = tableState;
  }, [tableState]);

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
        setOtherPlayers(prevOthers => {
          return data.players
            .filter(p => p.address.toLowerCase() !== authData.address.toLowerCase())
            .map(p => {
              const existing = prevOthers.find(op => op.address.toLowerCase() === p.address.toLowerCase());
              if (existing && (!p.cards || p.cards.length === 0) && existing.cards && existing.cards.length > 0) {
                return {
                  ...p,
                  cards: existing.cards,
                  score: existing.score
                };
              }
              return p;
            });
        });

        if (data.tableState) {
          setTableState(data.tableState);
        }

        const leader = data.players[0] && data.players[0].address.toLowerCase() === authData.address.toLowerCase();
        setIsTableLeader(leader);

        if (data.tableState === 'betting') {
          setIsMyTurn(true);
        }

        if (data.tableDealerHand && data.tableDealerHand.length > 0) {
          setSharedDealerCards(data.tableDealerHand);
          setDealerHand(data.tableDealerHand);
        }

        if (data.activeTableId && Number(data.activeTableId) > 0) {
          const tIdStr = data.activeTableId.toString();
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
        
        try {
          const synced = await syncCardsFromChain(gameId, true);
          const finalPlayerHand = synced ? synced.playerHand : playerHand;
          const finalDealerHand = synced ? synced.dealerHand : dealerHand;

          const score = calculateScore(finalPlayerHand);
          const dealerScoreNum = calculateScore(finalDealerHand);
          const busted = score > 21;
          
          let outcomeVal = 'loss';
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

          setOutcome(outcomeVal);
          setStatus('settled');
          
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
            // If backend is in dealer-turn state but RPC is lagging and still registers Playing, wait for catch-up
            if (Number(initialTableInfo.state) === 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              initialTableInfo = await contract.tables(gameId);
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
            const finalPlayerHand = synced ? synced.playerHand : playerHand;
            const finalDealerHand = synced ? synced.dealerHand : dealerHand;
            
            const score = calculateScore(finalPlayerHand);
            const dealerScoreNum = calculateScore(finalDealerHand);
            const busted = score > 21;
            
            let outcomeVal = 'loss';
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

            setOutcome(outcomeVal);
            setIsTurnFinished(true);
            setStatus('settled');

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
    const activeContract = contract || contractRef.current;
    if (!activeContract || !activeId) return null;
    try {
      let tableInfo = await activeContract.tables(activeId);
      let onChainDealerCards = await activeContract.getDealerCards(activeId);
      
      const currentTableState = tableStateRef.current || tableState;
      const expectSettled = forceRevealDealer || currentTableState === 'settled' || currentTableState === 'dealer-turn';

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

      const revealDealer = expectSettled || isSettled;
      const formattedDealerCards = onChainDealerCards.map((c, idx) => {
        if (idx === 1 && !revealDealer) {
          return { hidden: true };
        }
        return formatCard(Number(c));
      });
      setDealerHand(formattedDealerCards);
      setSharedDealerCards(formattedDealerCards);

      // Fetch on-chain turn index and active players
      const currentTurnIndex = Number(tableInfo.currentTurnIndex);
      const activePlayers = await activeContract.getActivePlayers(activeId);
      const activePlayerAddress = (activePlayers && currentTurnIndex < activePlayers.length) 
        ? activePlayers[currentTurnIndex] 
        : null;
      
      const myTurn = activePlayerAddress && activePlayerAddress.toLowerCase() === authData.address.toLowerCase();
      const savedIsTurnFinished = localStorage.getItem('bj_is_turn_finished') === 'true';
      setIsMyTurn((myTurn && !savedIsTurnFinished && !isSettled) || currentTableState === 'betting');

      // Broadcast dealer hand from the Table Leader
      if (socket && isTableLeader) {
        socket.emit('player-action', {
          action: 'dealer-sync',
          dealerCards: formattedDealerCards,
          status: (isSettled && revealDealer) ? 'settled' : undefined
        });
      }

      // Sync active player's cards
      const playerDetails = await activeContract.getPlayerBetDetails(activeId, authData.address);
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
              
              // On-chain status determination
              let statusText = 'Waiting Turn';
              const isActivePlayer = activePlayerAddress && activePlayerAddress.toLowerCase() === p.address.toLowerCase();
              if (isActivePlayer && !isSettled) {
                if (otherIsSplit) {
                  statusText = otherActiveHandIndex === 0 ? 'Playing Left' : 'Playing Right';
                } else {
                  statusText = 'Playing';
                }
              }
              if (details.busted) {
                statusText = otherIsSplit ? 'Bust Primary!' : 'Bust!';
              } else if (details.stood) {
                statusText = otherIsSplit ? 'Stood Primary' : 'Stood';
              } else if (details.settled) {
                statusText = 'Settled';
              }

              return {
                ...p,
                cards,
                score,
                bet: Number(ethers.formatUnits(details.betAmount, 18)),
                status: statusText,
                isSplit: otherIsSplit,
                cardsLeft: otherCardsLeft,
                cardsRight: otherCardsRight,
                activeHandIndex: otherActiveHandIndex
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
        gasLimit: (betGasEstimate * 130n) / 100n
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

      const tx = await contract.hit(activeId, { gasLimit: (gasEstimate * 130n) / 100n });
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

      if (socket) {
        socket.emit('player-action', {
          action: 'hit',
          cards: synced.playerHand,
          score: score,
          isSplit: splitInfo.isSplit,
          cardsRight: playerHandRight,
          scoreRight: calculateScore(playerHandRight),
          activeHandIndex: Number(splitInfo.activeHandIndex)
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

      if (socket) {
        const splitInfo = await contract.getPlayerSplitDetails(activeId, authData.address).catch(() => ({ isSplit: false, activeHandIndex: 0 }));
        if (splitInfo.isSplit && Number(splitInfo.activeHandIndex) === 1) {
          // Transitioned from left hand to right hand turn
          socket.emit('player-action', {
            action: 'hit',
            cards: synced ? synced.playerHand : [],
            score: synced ? calculateScore(synced.playerHand) : 0,
            isSplit: true,
            cardsRight: playerHandRight,
            scoreRight: calculateScore(playerHandRight),
            activeHandIndex: 1
          });
        } else {
          socket.emit('player-action', {
            action: 'stand',
            activeHandIndex: Number(splitInfo.activeHandIndex)
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
      if (allowance < additionalBet) {
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

      if (socket) {
        const splitInfo = await contract.getPlayerSplitDetails(activeId, authData.address).catch(() => ({ isSplit: false, activeHandIndex: 0 }));
        const finalScore = synced ? calculateScore(synced.playerHand) : 0;
        const isBust = finalScore > 21;
        
        if (splitInfo.isSplit && Number(splitInfo.activeHandIndex) === 1) {
          // Transitioned to right hand
          socket.emit('player-action', {
            action: 'hit',
            cards: synced ? synced.playerHand : [],
            score: finalScore,
            isSplit: true,
            cardsRight: playerHandRight,
            scoreRight: calculateScore(playerHandRight),
            activeHandIndex: 1
          });
        } else {
          socket.emit('player-action', {
            action: 'finished',
            cards: synced ? synced.playerHand : [],
            score: finalScore,
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
      if (allowance < additionalBet) {
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
      const tx = await contract.split(activeId, { gasLimit: (gasEstimate * 130n) / 100n });
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
          cards: synced.playerHand,
          score: calculateScore(synced.playerHand),
          isSplit: true,
          cardsRight: playerHandRight,
          scoreRight: calculateScore(playerHandRight),
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

  // Auto-start round once all connected players have placed their bets on-chain
  useEffect(() => {
    const triggerAutoStart = async () => {
      const activeId = gameId || localStorage.getItem('bj_active_game_id');
      if (status === 'betting' && isTableLeader && betPlaced && !loading && activeId) {
        const allOthersReady = otherPlayers.length === 0 || otherPlayers.every(p => p.bet > 0);
        if (allOthersReady) {
          // Prevent double trigger
          setLoading(true);
          await startRound();
        }
      }
    };
    triggerAutoStart();
  }, [status, isTableLeader, betPlaced, otherPlayers, loading, gameId]);

  const formatCard = (val) => {
    if (val === 0) return { hidden: true };
    const suits = ['♠', '♥', '♣', '♦'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    // val is 1..13 from the smart contract. Map to 0-indexed values array
    const valIdx = (val - 1) % 13;
    // Map suits deterministically
    const suitIdx = (val * 7) % 4;
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
            {status !== 'betting' && dealerHand.map((c, i) => (
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
              <div className="flex flex-col items-center gap-1.5 w-full mb-3">
                {status !== 'betting' && otherPlayers[0].isSplit ? (
                  <div className="flex flex-row justify-around w-full gap-2 scale-90">
                    <div className="flex flex-col items-center">
                      <span className="text-[7px] text-slate-400 mb-1">Left ({calculateScore(otherPlayers[0].cardsLeft || [])})</span>
                      <div className="flex justify-center min-h-[45px] relative">
                        <div className="flex">
                          {otherPlayers[0].cardsLeft && otherPlayers[0].cardsLeft.map((c, idx) => (
                            <div key={idx} className="transform transition-transform" style={{ marginLeft: idx > 0 ? '-25px' : '0', zIndex: idx }}>
                              <div className="scale-75 origin-top-left">
                                <Web2Card suit={c.suit} value={c.value} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[7px] text-slate-400 mb-1">Right ({calculateScore(otherPlayers[0].cardsRight || [])})</span>
                      <div className="flex justify-center min-h-[45px] relative">
                        <div className="flex">
                          {otherPlayers[0].cardsRight && otherPlayers[0].cardsRight.map((c, idx) => (
                            <div key={idx} className="transform transition-transform" style={{ marginLeft: idx > 0 ? '-25px' : '0', zIndex: idx }}>
                              <div className="scale-75 origin-top-left">
                                <Web2Card suit={c.suit} value={c.value} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center min-h-[85px] relative w-full scale-90">
                    <div className="flex">
                      {status !== 'betting' && otherPlayers[0].cards && otherPlayers[0].cards.map((c, i) => (
                        <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-50px' : '0', zIndex: i }}>
                          <Web2Card suit={c.suit} value={c.value} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
              <div className="flex flex-col items-center gap-1.5 w-full mb-3">
                {status !== 'betting' && otherPlayers[1].isSplit ? (
                  <div className="flex flex-row justify-around w-full gap-2 scale-90">
                    <div className="flex flex-col items-center">
                      <span className="text-[7px] text-slate-400 mb-1">Left ({calculateScore(otherPlayers[1].cardsLeft || [])})</span>
                      <div className="flex justify-center min-h-[45px] relative">
                        <div className="flex">
                          {otherPlayers[1].cardsLeft && otherPlayers[1].cardsLeft.map((c, idx) => (
                            <div key={idx} className="transform transition-transform" style={{ marginLeft: idx > 0 ? '-25px' : '0', zIndex: idx }}>
                              <div className="scale-75 origin-top-left">
                                <Web2Card suit={c.suit} value={c.value} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[7px] text-slate-400 mb-1">Right ({calculateScore(otherPlayers[1].cardsRight || [])})</span>
                      <div className="flex justify-center min-h-[45px] relative">
                        <div className="flex">
                          {otherPlayers[1].cardsRight && otherPlayers[1].cardsRight.map((c, idx) => (
                            <div key={idx} className="transform transition-transform" style={{ marginLeft: idx > 0 ? '-25px' : '0', zIndex: idx }}>
                              <div className="scale-75 origin-top-left">
                                <Web2Card suit={c.suit} value={c.value} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center min-h-[85px] relative w-full scale-90">
                    <div className="flex">
                      {status !== 'betting' && otherPlayers[1].cards && otherPlayers[1].cards.map((c, i) => (
                        <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-50px' : '0', zIndex: i }}>
                          <Web2Card suit={c.suit} value={c.value} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
          <div className="flex flex-col items-center w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            {betPlaced && status === 'betting' ? (
              <div className="flex flex-col items-center gap-4">
                <div className="px-6 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 font-bold animate-pulse">
                  ✅ Bet of {betAmount} chips placed successfully on-chain!
                </div>
                {isTableLeader ? (
                  (otherPlayers.length === 0 || otherPlayers.every(p => p.bet > 0)) ? (
                    <div className="px-6 py-2 bg-teal-500/10 border border-teal-500/30 rounded-xl text-teal-400 font-bold animate-pulse text-center">
                      ⚡ Starting round automatically on-chain...
                    </div>
                  ) : (
                    <div className="px-6 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 font-bold animate-pulse text-center">
                      ⏳ Waiting for other players to place bets...
                    </div>
                  )
                ) : (
                  <div className="text-slate-400 text-sm font-semibold animate-pulse text-center">
                    ⏳ Waiting for the Table Leader to deal the cards...
                  </div>
                )}
              </div>
            ) : (
              <>
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
              </>
            )}
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
                setBetPlaced(false);
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
              <div className="flex flex-col items-center gap-2 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="px-4 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-xs font-bold animate-pulse">
                  ⏳ Waiting for active player to take action...
                </div>
                <button
                  onClick={forceTimeout}
                  disabled={loading}
                  className="px-4 py-1 bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 rounded-lg text-red-400 text-[10px] font-bold transition-all uppercase tracking-wider"
                >
                  ⚠️ Force Timeout (If Stalled)
                </button>
              </div>
            )}
            <div className="flex gap-4 items-end">
              <ActionBtn icon="+" label="Hit" onClick={hit} disabled={loading || status !== 'playing' || !isMyTurn} />
              <ActionBtn icon="✋" label="Stand" onClick={stand} disabled={loading || status !== 'playing' || !isMyTurn} />
              <ActionBtn icon="⏬" label="Double" onClick={doubleDown} disabled={loading || status !== 'playing' || !isMyTurn || playerHand.length !== 2} />
              <ActionBtn icon="✂️" label="Split" onClick={split} disabled={loading || status !== 'playing' || !isMyTurn || isSplit || playerHand.length !== 2 || (playerHand[0] && playerHand[1] && playerHand[0].value !== playerHand[1].value)} />
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
