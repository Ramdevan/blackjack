import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getContract, getTokenContract, CONTRACT_ADDRESS } from '../utils/contract';
import toast from 'react-hot-toast';

const CHIPS = [
  { value: 1, label: '1', className: 'chip-1' },
  { value: 10, label: '10', className: 'chip-10' },
  { value: 100, label: '100', className: 'chip-100' },
  { value: 1000, label: '1K', className: 'chip-1k' },
  { value: 10000, label: '10K', className: 'chip-10k' },
];

export const BlackjackWeb2 = ({ setBalance, setCurrentBet, setLastWin, authData, gameMode }) => {
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

      if (savedPlayerHand && savedDealerHand) {
        setPlayerHand(JSON.parse(savedPlayerHand));
        setDealerHand(JSON.parse(savedDealerHand));
      }
      setIsSplit(savedIsSplit);
      setActiveHandIndex(savedActiveHandIndex);
      if (savedPlayerHandLeft) setPlayerHandLeft(JSON.parse(savedPlayerHandLeft));
      if (savedPlayerHandRight) setPlayerHandRight(JSON.parse(savedPlayerHandRight));
      if (savedOutcome) setOutcome(savedOutcome);
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
      if (outcome) {
        localStorage.setItem('bj_outcome', outcome);
      } else {
        localStorage.removeItem('bj_outcome');
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
    }
  }, [status, gameId, playerHand, dealerHand, isSplit, activeHandIndex, playerHandLeft, playerHandRight, outcome]);

  // Provider & Signer
  const [contract, setContract] = useState(null);
  const [tokenContract, setTokenContract] = useState(null);

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
        const savedStatus = localStorage.getItem('bj_status');
        if (savedGameId) {
          bj.games(savedGameId).then(game => {
            // Safety validation: Reset local state if game session is legacy, invalid, or belongs to a different account
            if (!game.player || game.player === "0x0000000000000000000000000000000000000000" || game.player.toLowerCase() !== authData.address.toLowerCase()) {
              console.log("Legacy, invalid, or different account game session detected. Resetting local table state.");
              localStorage.removeItem('bj_active_game_id');
              localStorage.removeItem('bj_status');
              localStorage.removeItem('bj_player_hand');
              localStorage.removeItem('bj_dealer_hand');
              localStorage.removeItem('bj_is_split');
              localStorage.removeItem('bj_active_hand_index');
              localStorage.removeItem('bj_player_hand_left');
              localStorage.removeItem('bj_player_hand_right');
              localStorage.removeItem('bj_outcome');
              setGameId(null);
              setStatus('betting');
              return;
            }

            if (game.settled) {
              if (savedStatus === 'settled') {
                console.log("Game is settled on-chain and locally marked as settled. Keeping visual state.");
              } else {
                console.log("Game is settled on-chain but was active locally. Syncing to show final result.");
                handleGameRevertSync("Game was completed on-chain.", savedGameId);
              }
            } else {
              // Retrieve active hands and cards from the upgraded contract directly!
              setTimeout(() => {
                syncCardsFromChain(savedGameId);
              }, 500);
            }
          }).catch(err => {
            console.error("Error querying active game:", err);
            // Self-heal on error (e.g. invalid query parameter/ID on the new contract)
            localStorage.removeItem('bj_active_game_id');
            localStorage.removeItem('bj_status');
            setGameId(null);
            setStatus('betting');
          });
        }
      });
    }
  }, [authData.address]);

  const syncCardsFromChain = async (activeId, forceRevealDealer = false) => {
    if (!contract || !activeId) return null;
    try {
      const gameInfo = await contract.games(activeId);
      const isSplitGame = gameInfo.isSplit;
      const isSettled = gameInfo.settled;

      // 1. Fetch dealer's cards from the upgraded smart contract
      const onChainDealerCards = await contract.getDealerCards(activeId);
      const formattedDealerCards = onChainDealerCards.map((c, idx) => {
        if (idx === 1 && !isSettled && !forceRevealDealer) {
          return { hidden: true };
        }
        return formatCard(Number(c));
      });
      setDealerHand(formattedDealerCards);

      let formattedPlayerCards = [];
      let formattedLeftCards = [];
      let formattedRightCards = [];

      // 2. Fetch player's cards
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
      alert('Tokens approved!');
    } catch (err) {
      console.error(err);
      alert('Approval failed');
    } finally {
      setLoading(false);
    }
  };

  const placeBet = async () => {
    if (!contract || betAmount <= 0) return;
    setLoading(true);
    try {
      // Clear split-hand states
      setIsSplit(false);
      setActiveHandIndex(0);
      setPlayerHandLeft([]);
      setPlayerHandRight([]);

      const amount = ethers.parseUnits(betAmount.toString(), tokenDecimals);
      if (allowance < amount) {
        return alert('Insufficient allowance. Please approve tokens.');
      }

      const gasEstimate = await contract.placeBet.estimateGas(amount).catch(() => 150000n);
      const tx = await contract.placeBet(amount, { gasLimit: (gasEstimate * 130n) / 100n });
      const receipt = await tx.wait();

      // Find GameStarted event to get initial cards and ID
      // Robust event finding
      let gameStartedEvent = null;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          console.log("Checking Log:", parsed?.name);
          if (parsed?.name === 'GameStarted') {
            gameStartedEvent = parsed;
            break;
          }
        } catch (e) { continue; }
      }

      if (gameStartedEvent) {
        const newId = gameStartedEvent.args.gameId.toString();
        setGameId(newId);
        setCurrentBet(betAmount);

        // Retrieve authentic cards from contract
        const synced = await syncCardsFromChain(newId);

        // Check if game was auto-settled on the initial deal (Natural Blackjack)
        const settledEvent = receipt.logs.find(log => {
          try {
            const parsed = contract.interface.parseLog(log);
            return parsed?.name === 'GameSettled';
          } catch (e) { return false; }
        });

        if (settledEvent) {
          const parsed = contract.interface.parseLog(settledEvent);
          const payout = Number(ethers.formatUnits(parsed.args.payout, tokenDecimals));

          // Retrieve final authentic cards and reveal dealer second card
          await syncCardsFromChain(newId, true);

          setLastWin(payout);
          setStatus('settled');

          const betVal = Number(betAmount);
          if (payout > betVal) {
            setOutcome('win');
            toast.success(`Blackjack! You won ${payout} chips!`, { duration: 5000 });
          } else if (payout === betVal) {
            setOutcome('push');
            toast.success("Push! Bet returned.", { duration: 5000 });
          } else {
            setOutcome('loss');
            toast.error("Dealer Blackjack! Dealer wins!", { duration: 3000 });
          }
        } else {
          setStatus('playing'); // Update status LAST to ensure other states are set
          if (synced && synced.playerHand) {
            const initialScore = calculateScore(synced.playerHand);
            if (initialScore === 21) {
              toast.success("Blackjack! Auto-standing...", { duration: 2500 });
              setTimeout(() => {
                stand();
              }, 1000);
            } else {
              toast.success("Game Started!");
            }
          } else {
            toast.success("Game Started!");
          }
        }
      } else {
        console.warn("GameStarted event not found!");
        alert("Bet placed, but cards couldn't be loaded automatically. Please refresh.");
      }
    } catch (err) {
      console.error(err);
      alert('Transaction failed');
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
      const receipt = await tx.wait();

      // Retrieve authentic card state from contract
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

        // Sync final authentic state and reveal dealer's second card
        await syncCardsFromChain(gameId, true);

        setLastWin(payout);
        setStatus('settled');

        const betVal = isSplit ? Number(betAmount) * 2 : Number(betAmount);
        if (payout > betVal) {
          setOutcome('win');
          toast.success(`You won ${payout} chips!`, { duration: 5000 });
        } else if (payout === betVal) {
          setOutcome('push');
          toast.success("Push! Bet returned.", { duration: 5000 });
        } else {
          setOutcome('loss');
          toast.error("Dealer wins!", { duration: 3000 });
        }
      }
    } catch (err) {
      console.error(err);
      await handleGameRevertSync("Hit failed");
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
      const receipt = await tx.wait();

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

        // Sync final authentic state and reveal dealer's second card
        await syncCardsFromChain(gameId, true);

        setLastWin(payout);
        setStatus('settled');

        const betVal = isSplit ? Number(betAmount) * 2 : Number(betAmount);
        if (payout > betVal) {
          setOutcome('win');
          toast.success(`You won ${payout} chips!`, { duration: 5000 });
        } else if (payout === betVal) {
          setOutcome('push');
          toast.success("Push! Bet returned.", { duration: 5000 });
        } else {
          setOutcome('loss');
          toast.error("Dealer wins!", { duration: 3000 });
        }
      } else {
        // Fallback or intermediate transition: Query the game state directly from contract
        const gameInfo = await contract.games(gameId);
        if (gameInfo.settled) {
          await syncCardsFromChain(gameId, true);
          setStatus('settled');
          setOutcome('loss');
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
      await handleGameRevertSync("Stand transaction failed");
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

      // Retrieve real cards from contract after double down transaction completes
      await syncCardsFromChain(gameId);

      toast.success("Double Down successful!");

      // Visually double active bet (if split, adding another bet, so bet is increased by original bet)
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

        // Sync final authentic state and reveal dealer's second card
        await syncCardsFromChain(gameId, true);

        setLastWin(payout);
        setStatus('settled');

        const betVal = isSplit ? Number(betAmount) * 3 : Number(betAmount) * 2;
        if (payout > betVal) {
          setOutcome('win');
          toast.success(`You won ${payout} chips!`, { duration: 5000 });
        } else if (payout === betVal) {
          setOutcome('push');
          toast.success("Push! Bet returned.", { duration: 5000 });
        } else {
          setOutcome('loss');
          toast.error("Dealer wins!", { duration: 3000 });
        }
      } else {
        // Fallback: Query the game state directly from contract
        const gameInfo = await contract.games(gameId);
        if (gameInfo.settled) {
          await syncCardsFromChain(gameId, true);
          setStatus('settled');
          setOutcome('loss');
        } else {
          if (isSplit) {
            await syncCardsFromChain(gameId);
            toast.success("Double Down successful! Playing Right Hand.", { duration: 3000 });
          }
          setStatus('playing');
        }
      }
    } catch (err) {
      console.error(err);
      await handleGameRevertSync("Double Down failed");
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

      // Retrieve the real split hand cards from the contract!
      await syncCardsFromChain(gameId);

      toast.success("Split successful! Playing Left Hand.");

      // Update bet visually to double the active bet
      setCurrentBet(prev => Number(prev) * 2);
    } catch (err) {
      console.error(err);
      toast.error("Split failed");
    } finally {
      setLoading(false);
    }
  };

  const generateDealerHandForScore = (initialCard, targetScore) => {
    const hand = [initialCard];
    let currentScore = calculateScore(hand);

    // Keep drawing cards until we match the targetScore or bust
    while (currentScore < targetScore && hand.length < 5) {
      const cardVal = Math.floor(Math.random() * 52) + 1;
      const card = formatCard(cardVal);
      hand.push(card);
      currentScore = calculateScore(hand);
    }
    return hand;
  };

  const generateHandForScore = (targetScore) => {
    if (targetScore <= 0) return [];

    const hand = [];
    let currentScore = 0;

    while (currentScore < targetScore) {
      const remaining = targetScore - currentScore;

      let cardVal;
      if (remaining > 11) {
        cardVal = [10, 10, 10, 10, 11, 9, 8, 7][Math.floor(Math.random() * 8)];
      } else if (remaining === 11) {
        cardVal = 11;
      } else if (remaining === 1) {
        cardVal = 11; // counts as 1 if score > 21
      } else {
        cardVal = remaining;
      }

      let possibleRanks = [];
      for (let r = 1; r <= 52; r++) {
        const valIdx = r % 13;
        let cardScore = 0;
        if (valIdx === 0) cardScore = 11;
        else if (valIdx >= 10) cardScore = 10;
        else cardScore = valIdx + 1;

        if (cardScore === cardVal) {
          possibleRanks.push(r);
        }
      }

      const chosenRank = possibleRanks[Math.floor(Math.random() * possibleRanks.length)] || (Math.floor(Math.random() * 52) + 1);
      const card = formatCard(chosenRank);
      hand.push(card);

      currentScore = calculateScore(hand);
      if (hand.length >= 5 && currentScore !== targetScore) {
        break;
      }
    }

    return hand;
  };

  const getRandomCardForScore = (targetScore) => {
    let possibleRanks = [];
    for (let r = 1; r <= 52; r++) {
      const valIdx = r % 13;
      let cardScore = 0;
      if (valIdx === 0) cardScore = 11;
      else if (valIdx >= 10) cardScore = 10;
      else cardScore = valIdx + 1;

      if (cardScore === targetScore) possibleRanks.push(r);
    }
    const chosenRank = possibleRanks[Math.floor(Math.random() * possibleRanks.length)] || 10;
    return formatCard(chosenRank);
  };

  const adjustSplitHandsForSettlement = (leftH, rightH, dealerScoreOnChain, payoutAmount, totalBetVal) => {
    let newLeftHand = [...leftH];
    let newRightHand = [...rightH];
    let newDealerHand = [];

    let trueOutcome = 'loss';
    if (payoutAmount > totalBetVal) {
      trueOutcome = 'win';
    } else if (payoutAmount === totalBetVal && payoutAmount > 0) {
      trueOutcome = 'push';
    }

    let leftScore = calculateScore(newLeftHand);
    let rightScore = calculateScore(newRightHand);
    let dScore = dealerScoreOnChain;

    if (trueOutcome === 'loss') {
      if (leftScore <= 21 && dScore <= 21 && dScore > leftScore) {
        // Keep left hand
      } else if (leftScore <= 21) {
        const needed = 22 - leftScore;
        newLeftHand.push(getRandomCardForScore(Math.max(needed, 10)));
      }

      if (rightScore <= 21 && dScore <= 21 && dScore > rightScore) {
        // Keep right hand
      } else if (rightScore <= 21) {
        const needed = 22 - rightScore;
        newRightHand.push(getRandomCardForScore(Math.max(needed, 10)));
      }

      newDealerHand = generateDealerHandForScore(dealerHand[0] || formatCard(Math.floor(Math.random() * 52) + 1), dScore);
    } else if (trueOutcome === 'win') {
      if (dScore > 21) {
        if (leftScore > 21) { newLeftHand = generateHandForScore(20); }
        if (rightScore > 21) { newRightHand = generateHandForScore(20); }
      } else {
        newLeftHand = generateHandForScore(Math.max(dScore + 1, 20));
        if (rightScore <= 21) {
          newRightHand = generateHandForScore(Math.max(17, dScore - 1));
        }
      }
      newDealerHand = generateDealerHandForScore(dealerHand[0] || formatCard(Math.floor(Math.random() * 52) + 1), dScore);
    } else {
      if (dScore > 21) {
        newLeftHand = generateHandForScore(20);
        newRightHand = generateHandForScore(20);
      } else {
        newLeftHand = generateHandForScore(dScore);
        newRightHand = generateHandForScore(dScore);
      }
      newDealerHand = generateDealerHandForScore(dealerHand[0] || formatCard(Math.floor(Math.random() * 52) + 1), dScore);
    }

    return { adjustedLeftHand: newLeftHand, adjustedRightHand: newRightHand, adjustedDealerHand: newDealerHand };
  };

  const adjustHandsForSettlement = (playerH, dealerScoreOnChain, payoutAmount, currentBetVal) => {
    let newPlayerHand = [...playerH];
    let newDealerHand = [];

    let trueOutcome = 'loss';
    if (payoutAmount > currentBetVal) {
      trueOutcome = 'win';
    } else if (payoutAmount === currentBetVal && payoutAmount > 0) {
      trueOutcome = 'push';
    }

    let pScore = calculateScore(newPlayerHand);
    let dScore = dealerScoreOnChain;

    console.log("adjustHandsForSettlement inputs:", {
      playerHandScore: pScore,
      dealerScoreOnChain: dScore,
      payoutAmount,
      currentBetVal,
      trueOutcome
    });

    if (trueOutcome === 'loss') {
      if (pScore > 21) {
        newDealerHand = generateDealerHandForScore(dealerHand[0] || formatCard(Math.floor(Math.random() * 52) + 1), dScore);
      } else {
        if (dScore > 21) {
          const neededToBust = 22 - pScore;
          const bustCardVal = Math.max(neededToBust, Math.floor(Math.random() * 5) + 6);

          let possibleRanks = [];
          for (let r = 1; r <= 52; r++) {
            const valIdx = r % 13;
            let cardScore = 0;
            if (valIdx === 0) cardScore = 11;
            else if (valIdx >= 10) cardScore = 10;
            else cardScore = valIdx + 1;

            if (cardScore === bustCardVal) possibleRanks.push(r);
          }
          const chosenRank = possibleRanks[Math.floor(Math.random() * possibleRanks.length)] || 10;
          newPlayerHand.push(formatCard(chosenRank));

          newDealerHand = generateDealerHandForScore(dealerHand[0] || formatCard(Math.floor(Math.random() * 52) + 1), dScore);
        } else {
          if (dScore > pScore) {
            newDealerHand = generateDealerHandForScore(dealerHand[0] || formatCard(Math.floor(Math.random() * 52) + 1), dScore);
          } else {
            const neededToBust = 22 - pScore;
            const bustCardVal = Math.max(neededToBust, 10);

            let possibleRanks = [];
            for (let r = 1; r <= 52; r++) {
              const valIdx = r % 13;
              let cardScore = 0;
              if (valIdx === 0) cardScore = 11;
              else if (valIdx >= 10) cardScore = 10;
              else cardScore = valIdx + 1;

              if (cardScore === bustCardVal) possibleRanks.push(r);
            }
            const chosenRank = possibleRanks[Math.floor(Math.random() * possibleRanks.length)] || 10;
            newPlayerHand.push(formatCard(chosenRank));

            newDealerHand = generateDealerHandForScore(dealerHand[0] || formatCard(Math.floor(Math.random() * 52) + 1), dScore);
          }
        }
      }
    } else if (trueOutcome === 'win') {
      if (pScore > 21) {
        newPlayerHand = generateHandForScore(20);
        pScore = 20;
      }

      if (dScore > 21) {
        newDealerHand = generateDealerHandForScore(dealerHand[0] || formatCard(Math.floor(Math.random() * 52) + 1), dScore);
      } else {
        if (pScore > dScore) {
          newDealerHand = generateDealerHandForScore(dealerHand[0] || formatCard(Math.floor(Math.random() * 52) + 1), dScore);
        } else {
          const lowerDScore = Math.max(17, pScore - 1);
          newDealerHand = generateDealerHandForScore(dealerHand[0] || formatCard(Math.floor(Math.random() * 52) + 1), lowerDScore);
        }
      }
    } else {
      if (pScore > 21) {
        newPlayerHand = generateHandForScore(20);
        pScore = 20;
      }

      const pushScore = Math.min(21, Math.max(17, pScore));
      if (pScore !== pushScore) {
        newPlayerHand = generateHandForScore(pushScore);
      }
      newDealerHand = generateDealerHandForScore(dealerHand[0] || formatCard(Math.floor(Math.random() * 52) + 1), pushScore);
    }

    return { adjustedPlayerHand: newPlayerHand, adjustedDealerHand: newDealerHand };
  };

  const handleGameRevertSync = async (fallbackErrorMessage, forcedGameId = null) => {
    const activeId = forcedGameId || gameId;
    if (!contract || !activeId) {
      toast.error(fallbackErrorMessage);
      return;
    }

    try {
      const gameInfo = await contract.games(activeId);
      if (gameInfo && gameInfo.settled) {
        toast.error("Synchronizing table visual state from blockchain...");

        // Sync final authentic cards directly from smart contract and reveal dealer cards
        await syncCardsFromChain(activeId, true);

        setStatus('settled');
        setOutcome('loss');
        return;
      }
    } catch (syncErr) {
      console.error("Self-healing table sync failed:", syncErr);
    }

    toast.error(fallbackErrorMessage);
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

      {/* Player Area */}
      <div className="flex flex-col items-center mb-12 w-full max-w-4xl px-4">
        {isSplit ? (
          <div className="flex flex-row justify-around w-full gap-8">
            {/* Left Hand */}
            <div className={`flex flex-col items-center p-6 rounded-2xl border transition-all duration-300 w-[240px] bg-slate-900/60 ${activeHandIndex === 0 && status === 'playing' ? 'border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.2)] bg-slate-900/90 scale-105' : 'border-slate-800 opacity-60'}`}>
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
            <div className={`flex flex-col items-center p-6 rounded-2xl border transition-all duration-300 w-[240px] bg-slate-900/60 ${activeHandIndex === 1 && status === 'playing' ? 'border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.2)] bg-slate-900/90 scale-105' : 'border-slate-800 opacity-60'}`}>
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

      {/* Controls */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-6 w-full max-w-4xl px-4">
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
                setIsSplit(false);
                setActiveHandIndex(0);
                setPlayerHandLeft([]);
                setPlayerHandRight([]);
              }}
              className="px-16 py-3 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-500 text-black font-black text-lg rounded-xl shadow-[0_0_30px_rgba(234,179,8,0.5)] hover:scale-105 active:scale-95 transition-all uppercase tracking-wider"
            >
              Play Another Hand
            </button>
          </div>
        ) : (
          <div className="flex gap-4 items-end">
            <ActionBtn icon="+" label="Hit" onClick={hit} disabled={loading || status !== 'playing'} />
            <ActionBtn icon="✋" label="Stand" onClick={stand} disabled={loading || status !== 'playing'} />
            <ActionBtn icon="⏬" label="Double" onClick={doubleDown} disabled={loading || status !== 'playing' || (isSplit ? (activeHandIndex === 0 ? playerHandLeft : playerHandRight).length !== 2 : playerHand.length !== 2)} />
            <ActionBtn icon="✂️" label="Split" onClick={split} disabled={loading || status !== 'playing' || !(!isSplit && playerHand.length === 2 && (playerHand[0]?.value === playerHand[1]?.value || (['10', 'J', 'Q', 'K'].includes(playerHand[0]?.value) && ['10', 'J', 'Q', 'K'].includes(playerHand[1]?.value))))} />
            {loading && (
              <div className="absolute top-[-40px] left-1/2 -translate-x-1/2 text-white font-bold animate-pulse">Waiting for BSC Testnet...</div>
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
