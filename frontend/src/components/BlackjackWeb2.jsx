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

  // Persistence: Restore game on load
  useEffect(() => {
    const savedGameId = localStorage.getItem('bj_active_game_id');
    const savedStatus = localStorage.getItem('bj_status');

    if (savedGameId && savedStatus === 'playing') {
      setGameId(savedGameId);
      setStatus('playing');

      const savedPlayerHand = localStorage.getItem('bj_player_hand');
      const savedDealerHand = localStorage.getItem('bj_dealer_hand');

      if (savedPlayerHand && savedDealerHand) {
        setPlayerHand(JSON.parse(savedPlayerHand));
        setDealerHand(JSON.parse(savedDealerHand));
      }
    }
  }, []);

  // Persistence: Save state changes
  useEffect(() => {
    if (status === 'playing' && gameId) {
      localStorage.setItem('bj_active_game_id', gameId);
      localStorage.setItem('bj_status', 'playing');
      localStorage.setItem('bj_player_hand', JSON.stringify(playerHand));
      localStorage.setItem('bj_dealer_hand', JSON.stringify(dealerHand));
    } else if (status === 'betting') {
      localStorage.removeItem('bj_active_game_id');
      localStorage.removeItem('bj_status');
      localStorage.removeItem('bj_player_hand');
      localStorage.removeItem('bj_dealer_hand');
    }
  }, [status, gameId, playerHand, dealerHand]);

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
        if (savedGameId) {
          bj.games(savedGameId).then(game => {
            if (game.settled) {
              console.log("Game was already settled on-chain. Clearing local state.");
              setStatus('betting');
              setPlayerHand([]);
              setDealerHand([]);
            }
          }).catch(console.error);
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

        const card1 = Math.floor(Math.random() * 52) + 1;
        const card2 = Math.floor(Math.random() * 52) + 1;
        const dCard = Math.floor(Math.random() * 52) + 1;

        setPlayerHand([formatCard(card1), formatCard(card2)]);
        setDealerHand([formatCard(dCard), { hidden: true }]);
        setCurrentBet(betAmount);

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

          // Get final game state from contract
          const gameInfo = await contract.games(newId);
          const finalDealerScore = Number(gameInfo.dealerScore);

          const initialPlayerHand = [formatCard(card1), formatCard(card2)];
          const { adjustedPlayerHand, adjustedDealerHand } = adjustHandsForSettlement(
            initialPlayerHand,
            finalDealerScore,
            payout,
            betAmount
          );
          setPlayerHand(adjustedPlayerHand);
          setDealerHand(adjustedDealerHand);

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
            toast.error("Dealer Blackjack! House wins!", { duration: 3000 });
          }

          setTimeout(() => {
            setStatus(currentStatus => {
              if (currentStatus === 'settled') {
                setPlayerHand([]);
                setDealerHand([]);
                setOutcome(null);
                return 'betting';
              }
              return currentStatus;
            });
          }, 5000);
        } else {
          setStatus('playing'); // Update status LAST to ensure other states are set
          const initialPlayerHand = [formatCard(card1), formatCard(card2)];
          const initialScore = calculateScore(initialPlayerHand);
          if (initialScore === 21) {
            toast.success("Blackjack! Auto-standing...", { duration: 2500 });
            setTimeout(() => {
              stand();
            }, 1000);
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

      const newCardVal = Math.floor(Math.random() * 52) + 1;
      const updatedHand = [...playerHand, formatCard(newCardVal)];
      setPlayerHand(updatedHand);
      toast.success("Hit successful!");

      const score = calculateScore(updatedHand);
      if (score > 21) {
        toast.error("Bust!");
      } else if (score === 21) {
        toast.success("Exactly 21! Auto-standing...", { duration: 2500 });
        setTimeout(() => {
          stand();
        }, 1000);
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

        // Get final game state from contract
        const gameInfo = await contract.games(gameId);
        const finalDealerScore = Number(gameInfo.dealerScore);

        const { adjustedPlayerHand, adjustedDealerHand } = adjustHandsForSettlement(
          updatedHand,
          finalDealerScore,
          payout,
          betAmount
        );
        setPlayerHand(adjustedPlayerHand);
        setDealerHand(adjustedDealerHand);

        setLastWin(payout);
        setStatus('settled');

        const betVal = Number(betAmount);
        if (payout > betVal) {
          setOutcome('win');
          toast.success(`You won ${payout} chips!`, { duration: 5000 });
        } else if (payout === betVal) {
          setOutcome('push');
          toast.success("Push! Bet returned.", { duration: 5000 });
        } else {
          setOutcome('loss');
          toast.error("House wins!", { duration: 3000 });
        }

        setTimeout(() => {
          setStatus(currentStatus => {
            if (currentStatus === 'settled') {
              setPlayerHand([]);
              setDealerHand([]);
              setOutcome(null);
              return 'betting';
            }
            return currentStatus;
          });
        }, 5000);
      }
    } catch (err) {
      console.error(err);
      if (err.reason === "Settled" || (err.message && err.message.includes("Settled"))) {
        toast.error("Game already settled! Refreshing table...");
        setStatus('betting');
        setPlayerHand([]);
        setDealerHand([]);
        setOutcome(null);
      } else {
        toast.error("Hit failed");
      }
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

        // Get final game state from contract
        const gameInfo = await contract.games(gameId);
        const finalDealerScore = Number(gameInfo.dealerScore);

        const { adjustedPlayerHand, adjustedDealerHand } = adjustHandsForSettlement(
          playerHand,
          finalDealerScore,
          payout,
          betAmount
        );
        setPlayerHand(adjustedPlayerHand);
        setDealerHand(adjustedDealerHand);

        setLastWin(payout);
        setStatus('settled');

        const betVal = Number(betAmount);
        if (payout > betVal) {
          setOutcome('win');
          toast.success(`You won ${payout} chips!`, { duration: 5000 });
        } else if (payout === betVal) {
          setOutcome('push');
          toast.success("Push! Bet returned.", { duration: 5000 });
        } else {
          setOutcome('loss');
          toast.error("House wins!", { duration: 3000 });
        }

        // Keep cards visible for 5 seconds so user can see the result
        setTimeout(() => {
          setStatus(currentStatus => {
            if (currentStatus === 'settled') {
              setPlayerHand([]);
              setDealerHand([]);
              setOutcome(null);
              return 'betting';
            }
            return currentStatus;
          });
        }, 5000);
      } else {
        // Fallback: Query the game state directly from contract
        const gameInfo = await contract.games(gameId);
        if (gameInfo.settled) {
          const finalDealerScore = Number(gameInfo.dealerScore);
          const initialDealerCard = dealerHand[0];
          const updatedDealerHand = generateDealerHandForScore(initialDealerCard, finalDealerScore);
          setDealerHand(updatedDealerHand);

          setStatus('settled');
          const playerVal = calculateScore(playerHand);
          if (playerVal > 21) {
            setOutcome('loss');
          } else if (finalDealerScore > 21 || playerVal > finalDealerScore) {
            setOutcome('win');
          } else if (playerVal === finalDealerScore) {
            setOutcome('push');
          } else {
            setOutcome('loss');
          }
        } else {
          setStatus('playing');
        }
      }
    } catch (err) {
      console.error(err);
      if (err.reason === "Settled" || (err.message && err.message.includes("Settled"))) {
        toast.error("Game already settled! Refreshing table...");
        setStatus('betting');
        setPlayerHand([]);
        setDealerHand([]);
        setOutcome(null);
      } else {
        toast.error("Stand transaction failed");
      }
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

      const newCardVal = Math.floor(Math.random() * 52) + 1;
      const updatedHand = [...playerHand, formatCard(newCardVal)];
      setPlayerHand(updatedHand);
      toast.success("Double Down successful!");

      setCurrentBet(prev => prev * 2);

      const event = receipt.logs.find(log => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed?.name === 'GameSettled';
        } catch (e) { return false; }
      });

      if (event) {
        const parsed = contract.interface.parseLog(event);
        const payout = Number(ethers.formatUnits(parsed.args.payout, tokenDecimals));

        // Get final game state from contract
        const gameInfo = await contract.games(gameId);
        const finalDealerScore = Number(gameInfo.dealerScore);

        const { adjustedPlayerHand, adjustedDealerHand } = adjustHandsForSettlement(
          updatedHand,
          finalDealerScore,
          payout,
          betAmount * 2
        );
        setPlayerHand(adjustedPlayerHand);
        setDealerHand(adjustedDealerHand);

        setLastWin(payout);
        setStatus('settled');

        const betVal = Number(betAmount) * 2;
        if (payout > betVal) {
          setOutcome('win');
          toast.success(`You won ${payout} chips!`, { duration: 5000 });
        } else if (payout === betVal) {
          setOutcome('push');
          toast.success("Push! Bet returned.", { duration: 5000 });
        } else {
          setOutcome('loss');
          toast.error("House wins!", { duration: 3000 });
        }

        setTimeout(() => {
          setStatus(currentStatus => {
            if (currentStatus === 'settled') {
              setPlayerHand([]);
              setDealerHand([]);
              setOutcome(null);
              return 'betting';
            }
            return currentStatus;
          });
        }, 5000);
      } else {
        // Fallback: Query the game state directly from contract
        const gameInfo = await contract.games(gameId);
        if (gameInfo.settled) {
          const finalDealerScore = Number(gameInfo.dealerScore);
          const initialDealerCard = dealerHand[0];
          const updatedDealerHand = generateDealerHandForScore(initialDealerCard, finalDealerScore);
          setDealerHand(updatedDealerHand);

          setStatus('settled');
          const playerVal = calculateScore(updatedHand);
          if (playerVal > 21) {
            setOutcome('loss');
          } else if (finalDealerScore > 21 || playerVal > finalDealerScore) {
            setOutcome('win');
          } else if (playerVal === finalDealerScore) {
            setOutcome('push');
          } else {
            setOutcome('loss');
          }
        } else {
          setStatus('playing');
        }
      }
    } catch (err) {
      console.error(err);
      if (err.reason === "Settled" || (err.message && err.message.includes("Settled"))) {
        toast.error("Game already settled! Refreshing table...");
        setStatus('betting');
        setPlayerHand([]);
        setDealerHand([]);
        setOutcome(null);
      } else {
        toast.error("Double Down failed");
      }
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

      toast.success("Split successful!");
      // Splitting logic requires handling two hands in UI. We will add visual indication for now.
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
            {outcome === 'loss' && "❌ House Wins"}
          </div>
        </div>
      )}

      {/* Player Area */}
      <div className="flex flex-col items-center mb-12">
        <div className="flex min-h-[120px] mb-4">
          {playerHand.map((c, i) => (
            <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-50px' : '0', zIndex: i }}>
              <Web2Card suit={c.suit} value={c.value} />
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="px-4 py-1 bg-blue-600/20 border border-blue-500 rounded-full text-white text-xs font-bold">
            Score: {calculateScore(playerHand)}
          </div>
          <div className="px-4 py-2 bg-black/40 border border-slate-700 rounded-xl text-white font-bold text-xs">
            {authData.address.slice(0, 6)}...{authData.address.slice(-4)}
          </div>
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
            <ActionBtn icon="⏬" label="Double" onClick={doubleDown} disabled={loading || status !== 'playing'} />
            <ActionBtn icon="✂️" label="Split" onClick={split} disabled={loading || status !== 'playing'} />
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
