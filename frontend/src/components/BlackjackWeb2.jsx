import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getContract, getTokenContract, CONTRACT_ADDRESS } from '../utils/contract';
import toast from 'react-hot-toast';

import avatarPlayer from '../assets/avatar_player.png';
import avatarJack from '../assets/avatar_jack.png';
import avatarLady from '../assets/avatar_lady.png';
import avatarGentleman from '../assets/avatar_gentleman.png';
import avatarCyber from '../assets/avatar_cyber.png';

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

const CHIPS = [
  { value: 10, label: '10', className: 'chip-10' },
  { value: 25, label: '25', className: 'chip-25' },
  { value: 50, label: '50', className: 'chip-50' },
  { value: 100, label: '100', className: 'chip-100' },
  { value: 250, label: '250', className: 'chip-250' },
];

export const BlackjackWeb2 = ({ balance, setBalance, setCurrentBet, setLastWin, authData, gameMode, customNickname, customAvatar, onOpenSettings }) => {
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

  const safeGetPlayerBetDetails = async (activeId, playerAddress, bjInstance = contract) => {
    if (!bjInstance) return null;
    try {
      const details = await bjInstance.getPlayerBetDetails(activeId, playerAddress);
      
      let splitDetails = {
        isSplit: false,
        splitCards: [],
        splitScore: 0,
        splitStood: false,
        splitBusted: false,
        splitBetAmount: 0n,
        activeHandIndex: 0
      };
      
      try {
        const splitInfo = await bjInstance.getPlayerSplitDetails(activeId, playerAddress);
        splitDetails = {
          isSplit: splitInfo.isSplit,
          splitCards: splitInfo.splitCards,
          splitScore: splitInfo.splitScore,
          splitStood: splitInfo.splitStood,
          splitBusted: splitInfo.splitBusted,
          splitBetAmount: splitInfo.splitBetAmount,
          activeHandIndex: splitInfo.activeHandIndex
        };
      } catch (splitErr) {
        console.warn("getPlayerSplitDetails call not supported on this contract:", splitErr.message);
      }
      
      return {
        playerAddress: details.playerAddress,
        betAmount: details.betAmount,
        cards: details.cards,
        score: details.score,
        stood: details.stood,
        busted: details.busted,
        settled: details.settled,
        doubledDown: details.doubledDown,
        ...splitDetails
      };
    } catch (decodeErr) {
      console.warn("getPlayerBetDetails new signature failed, falling back to legacy ABI...");
      const legacyInterface = new ethers.Interface([
        "function getPlayerBetDetails(uint256 tableId, address player) view returns (address playerAddress, uint256 betAmount, uint8[] memory cards, uint8 score, bool stood, bool busted, bool settled, bool doubledDown)"
      ]);
      const calldata = legacyInterface.encodeFunctionData("getPlayerBetDetails", [activeId, playerAddress]);
      const result = await bjInstance.getRunner().call({
        to: await bjInstance.getAddress(),
        data: calldata
      });
      const decoded = legacyInterface.decodeFunctionResult("getPlayerBetDetails", result);
      return {
        playerAddress: decoded[0],
        betAmount: decoded[1],
        cards: decoded[2],
        score: decoded[3],
        stood: decoded[4],
        busted: decoded[5],
        settled: decoded[6],
        doubledDown: decoded[7],
        isSplit: false,
        splitCards: [],
        splitScore: 0,
        splitStood: false,
        splitBusted: false,
        splitBetAmount: 0n,
        activeHandIndex: 0
      };
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

            safeGetPlayerBetDetails(savedGameId, authData.address, bj).then(details => {
              if (details.betAmount === 0n) {
                localStorage.removeItem('bj_active_game_id');
                localStorage.removeItem('bj_status');
                setGameId(null);
                setStatus('betting');
                return;
              }

              if (Number(table.state) >= 2) {
                setStatus('settled');
                syncCardsFromChain(savedGameId).then(() => {
                  evaluateGameOutcome(details, table);
                });
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

  const syncCardsFromChain = async (activeId, forceRevealDealer = false) => {
    if (!contract || !activeId) return null;
    try {
      const tableInfo = await contract.tables(activeId);
      const isSettled = Number(tableInfo.state) >= 2;

      const onChainDealerCards = await contract.getDealerCards(activeId);
      const revealDealer = forceRevealDealer || isSettled;
      const formattedDealerCards = onChainDealerCards.map((c, idx) => {
        if (idx === 1 && !revealDealer) {
          return { hidden: true };
        }
        return formatCard(Number(c));
      });
      setDealerHand(formattedDealerCards);

      const playerDetails = await safeGetPlayerBetDetails(activeId, authData.address);
      const onChainIsSplit = playerDetails.isSplit;
      setIsSplit(onChainIsSplit);
      setActiveHandIndex(Number(playerDetails.activeHandIndex));

      if (playerDetails && playerDetails.betAmount) {
        const betNum = Number(ethers.formatUnits(playerDetails.betAmount, tokenDecimals));
        setBetAmount(betNum);
      }

      if (onChainIsSplit) {
        const formattedLeft = playerDetails.cards.map(c => formatCard(Number(c)));
        const formattedRight = playerDetails.splitCards.map(c => formatCard(Number(c)));
        setPlayerHandLeft(formattedLeft);
        setPlayerHandRight(formattedRight);
        setPlayerHand(Number(playerDetails.activeHandIndex) === 0 ? formattedLeft : formattedRight);
      } else {
        const formattedPlayerCards = playerDetails.cards.map(c => formatCard(Number(c)));
        setPlayerHand(formattedPlayerCards);
        setPlayerHandLeft([]);
        setPlayerHandRight([]);
      }

      return {
        playerHand: onChainIsSplit
          ? (Number(playerDetails.activeHandIndex) === 0 ? playerDetails.cards.map(c => formatCard(Number(c))) : playerDetails.splitCards.map(c => formatCard(Number(c))))
          : playerDetails.cards.map(c => formatCard(Number(c))),
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
      await checkAllowance(tokenContract, authData.address);
      toast.success('Tokens approved successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Approval failed');
    } finally {
      setLoading(false);
    }
  };

  const placeBet = async () => {
    if (!contract || betAmount <= 0) return;
    if (Number(betAmount) < minBetLimit) {
      return toast.error(`Bet amount is below the table minimum of ${minBetLimit} chips.`, { id: 'bet-limit-err' });
    }
    if (Number(betAmount) > maxBetLimit) {
      return toast.error(`Bet amount exceeds the table maximum of ${maxBetLimit} chips.`, { id: 'bet-limit-err' });
    }
    setLoading(true);
    setOutcome(null);
    try {
      // Clear split-hand states
      setIsSplit(false);
      setActiveHandIndex(0);
      setPlayerHandLeft([]);
      setPlayerHandRight([]);

      const amount = ethers.parseUnits(betAmount.toString(), tokenDecimals);

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
      if (tokenContract) {
        const tokenBal = await tokenContract.balanceOf(authData.address);
        if (tokenBal < amount) {
          toast.error("Insufficient balance!", { id: 'token-balance-err' });
          setLoading(false);
          return;
        }
      }

      if (allowance < amount) {
        setLoading(false);
        return toast.error('Insufficient allowance. Please approve tokens.');
      }

      // 1. Create a table on-chain
      toast.success("Creating Single Player table session...", { duration: 3000 });
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
      const newTableId = parsedCreate.args.tableId.toString();
      setGameId(newTableId);
      setCurrentBet(betAmount);

      // 2. Place bet
      toast.success("Placing bet on-chain...", { duration: 3000 });
      const gasEstimate = await contract.placeBet.estimateGas(newTableId, amount).catch(() => 150000n);
      const tx = await contract.placeBet(newTableId, amount, {
        gasLimit: gasEstimate > 200000n ? (gasEstimate * 150n) / 100n : 250000n
      });
      await tx.wait();

      // 3. Start round immediately (since it's a single player, no need to wait!)
      toast.success("Dealing cards...", { duration: 3000 });
      const startGasEstimate = await contract.startRound.estimateGas(newTableId).catch(() => 250000n);
      const startTx = await contract.startRound(newTableId, {
        gasLimit: (startGasEstimate * 150n) / 100n > 350000n ? (startGasEstimate * 150n) / 100n : 350000n
      });
      await startTx.wait();

      // Sync authentic cards from contract
      await syncCardsFromChain(newTableId);

      const tableInfo = await contract.tables(newTableId);
      if (Number(tableInfo.state) >= 2) {
        const playerDetails = await safeGetPlayerBetDetails(newTableId, authData.address);
        await evaluateGameOutcome(playerDetails, tableInfo);
        if (tokenContract) {
          const balance = await tokenContract.balanceOf(authData.address);
          setBalance(ethers.formatUnits(balance, tokenDecimals));
        }
      } else {
        setStatus('playing');
        toast.success("Game Started!");
      }
    } catch (err) {
      console.error(err);
      toast.error('Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  const evaluateGameOutcome = async (finalPlayerDetails, finalTableInfo) => {
    const dealerScoreNum = Number(finalTableInfo.dealerScore);
    
    if (finalPlayerDetails.isSplit) {
      const leftScore = Number(finalPlayerDetails.score);
      const leftBusted = finalPlayerDetails.busted;
      const rightScore = Number(finalPlayerDetails.splitScore);
      const rightBusted = finalPlayerDetails.splitBusted;
      
      let leftOutcome = 'loss';
      if (!leftBusted && leftScore <= 21) {
        if (dealerScoreNum > 21 || leftScore > dealerScoreNum) leftOutcome = 'win';
        else if (leftScore === dealerScoreNum) leftOutcome = 'push';
      }
      
      let rightOutcome = 'loss';
      if (!rightBusted && rightScore <= 21) {
        if (dealerScoreNum > 21 || rightScore > dealerScoreNum) rightOutcome = 'win';
        else if (rightScore === dealerScoreNum) rightOutcome = 'push';
      }
      
      // Determine net result
      let outcomeVal = 'loss';
      let message = '❌ Dealer Wins Both Hands!';
      
      if (leftOutcome === 'win' && rightOutcome === 'win') {
        outcomeVal = 'win';
        message = '🏆 Won Both Hands!';
      } else if ((leftOutcome === 'win' && rightOutcome === 'push') || (leftOutcome === 'push' && rightOutcome === 'win')) {
        outcomeVal = 'win';
        message = '🏆 Won Left / Pushed Right!';
      } else if (leftOutcome === 'push' && rightOutcome === 'push') {
        outcomeVal = 'push';
        message = '🤝 Push Both Hands!';
      } else if ((leftOutcome === 'win' && rightOutcome === 'loss') || (leftOutcome === 'loss' && rightOutcome === 'win')) {
        outcomeVal = 'push'; // Even money
        message = '🤝 Even Money (Win 1, Lose 1)!';
      } else if ((leftOutcome === 'push' && rightOutcome === 'loss') || (leftOutcome === 'loss' && rightOutcome === 'push')) {
        outcomeVal = 'loss';
        message = '❌ Pushed Left, Lost Right!';
      }
      
      setOutcome(outcomeVal);
      setStatus('settled');
      toast.success(message, { duration: 4000 });
    } else {
      const score = Number(finalPlayerDetails.score);
      const busted = finalPlayerDetails.busted;
      
      let outcomeVal = 'loss';
      if (!busted && score <= 21) {
        const onChainDealerCards = await contract.getDealerCards(gameId);
        const isDealerBlackjack = (onChainDealerCards.length === 2 && dealerScoreNum === 21);
        const isPlayerBlackjack = (finalPlayerDetails.cards.length === 2 && score === 21);

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
      toast.success(outcomeVal === 'win' ? "🏆 You Won!" : outcomeVal === 'push' ? "🤝 Push!" : "❌ Dealer Wins!");
    }
  };

  const hit = async () => {
    if (!contract || !gameId) return;
    setLoading(true);
    try {
      // Pre-flight check: see if the table or player state is already settled on-chain
      const preTableInfo = await contract.tables(gameId);
      const prePlayerDetails = await safeGetPlayerBetDetails(gameId, authData.address);
      const isSettledOnChain = Number(preTableInfo.state) >= 2 || prePlayerDetails.settled;

      if (isSettledOnChain) {
        toast.success("Round already settled, syncing results...", { duration: 2000 });
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
        
        const finalPlayerDetails = await safeGetPlayerBetDetails(gameId, authData.address);
        const finalTableInfo = await contract.tables(gameId);
        await evaluateGameOutcome(finalPlayerDetails, finalTableInfo);
        return;
      }

      const gasEstimate = await contract.hit.estimateGas(gameId).catch(() => 150000n);
      const tx = await contract.hit(gameId, {
        gasLimit: gasEstimate > 250000n ? (gasEstimate * 150n) / 100n : 350000n
      });
      toast.success("Dealing card...", { duration: 2000 });
      await tx.wait();

      await syncCardsFromChain(gameId);
      
      const finalPlayerDetails = await safeGetPlayerBetDetails(gameId, authData.address);
      const finalTableInfo = await contract.tables(gameId);
      const isSettledAfter = Number(finalTableInfo.state) >= 2 || finalPlayerDetails.settled;

      if (isSettledAfter) {
        await syncCardsFromChain(gameId, true);
        if (tokenContract) {
          try {
            const balance = await tokenContract.balanceOf(authData.address);
            setBalance(ethers.formatUnits(balance, tokenDecimals));
          } catch (e) {
            console.error("Failed to update balance:", e);
          }
        }
        await evaluateGameOutcome(finalPlayerDetails, finalTableInfo);
      } else {
        toast.success("Hit successful!");
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
      // Pre-flight check: see if the table or player state is already settled on-chain
      const preTableInfo = await contract.tables(gameId);
      const prePlayerDetails = await safeGetPlayerBetDetails(gameId, authData.address);
      const isSettledOnChain = Number(preTableInfo.state) >= 2 || prePlayerDetails.settled;

      if (!isSettledOnChain) {
        toast.success("Standing on-chain...", { duration: 2000 });
        const gasEstimate = await contract.stand.estimateGas(gameId).catch(() => 150000n);
        const standTx = await contract.stand(gameId, {
          gasLimit: gasEstimate > 250000n ? (gasEstimate * 150n) / 100n : 350000n
        });
        await standTx.wait();
      } else {
        toast.success("Round already settled, syncing results...", { duration: 2000 });
      }

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

      const finalPlayerDetails = await safeGetPlayerBetDetails(gameId, authData.address);
      const finalTableInfo = await contract.tables(gameId);
      const isSettledAfter = Number(finalTableInfo.state) >= 2 || finalPlayerDetails.settled;

      if (isSettledAfter) {
        await evaluateGameOutcome(finalPlayerDetails, finalTableInfo);
      } else {
        toast.success("Left hand stood, playing right hand...");
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
      // 1. Double check and auto-approve token allowance for the additional bet if needed
      const playerDetailsBefore = await safeGetPlayerBetDetails(gameId, authData.address);
      const additionalBet = playerDetailsBefore.betAmount;
      if (allowance < additionalBet) {
        toast.success("Approving additional chips for double down...", { id: 'double-allow' });
        const approveTx = await tokenContract.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
        await approveTx.wait();
        await checkAllowance(tokenContract, authData.address);
      }

      // Pre-flight check: see if the table or player state is already settled on-chain
      const preTableInfo = await contract.tables(gameId);
      const isSettledOnChain = Number(preTableInfo.state) >= 2 || playerDetailsBefore.settled;

      if (!isSettledOnChain) {
        toast.success("Doubling down on-chain...", { duration: 2000 });
        const gasEstimate = await contract.doubleDown.estimateGas(gameId).catch(() => 150000n);
        const tx = await contract.doubleDown(gameId, {
          gasLimit: gasEstimate > 250000n ? (gasEstimate * 150n) / 100n : 350000n
        });
        await tx.wait();
      } else {
        toast.success("Round already settled, syncing results...", { duration: 2000 });
      }

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

      const finalPlayerDetails = await safeGetPlayerBetDetails(gameId, authData.address);
      const finalTableInfo = await contract.tables(gameId);
      const isSettledAfter = Number(finalTableInfo.state) >= 2 || finalPlayerDetails.settled;

      if (isSettledAfter) {
        await evaluateGameOutcome(finalPlayerDetails, finalTableInfo);
      } else {
        toast.success("Left hand doubled down, playing right hand...");
      }
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || "Double Down failed");
    } finally {
      setLoading(false);
    }
  };

  const split = async () => {
    if (!contract || !gameId) return;
    setLoading(true);
    try {
      // 1. Double check and auto-approve token allowance for the additional bet if needed
      const playerDetailsBefore = await safeGetPlayerBetDetails(gameId, authData.address);
      const additionalBet = playerDetailsBefore.betAmount;
      if (allowance < additionalBet) {
        toast.success("Approving additional chips for split...", { id: 'split-allow' });
        const approveTx = await tokenContract.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
        await approveTx.wait();
        await checkAllowance(tokenContract, authData.address);
      }

      toast.success("Splitting hands on-chain...", { duration: 2000 });
      const gasEstimate = await contract.split.estimateGas(gameId).catch(() => 150000n);
      const tx = await contract.split(gameId, {
        gasLimit: gasEstimate > 250000n ? (gasEstimate * 150n) / 100n : 350000n
      });
      await tx.wait();

      toast.success("Split successful!");
      await syncCardsFromChain(gameId);
      
      // Update balance
      if (tokenContract) {
        try {
          const balance = await tokenContract.balanceOf(authData.address);
          setBalance(ethers.formatUnits(balance, tokenDecimals));
        } catch (e) {
          console.error("Failed to update balance:", e);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.message || "Split failed");
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
      const tableInfo = await contract.tables(activeId);
      const isSettled = Number(tableInfo.state) >= 2;
      if (isSettled) {
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

  const getHandOutcome = (handCards, dealerCards) => {
    if (!handCards || handCards.length === 0) return 'loss';
    const score = calculateScore(handCards);
    const dScore = calculateScore(dealerCards);
    
    if (score > 21) return 'loss'; // Busted
    if (dScore > 21) return 'win'; // Dealer busted
    
    // Check blackjack
    const isDealerBJ = dealerCards.length === 2 && dScore === 21;
    const isPlayerBJ = handCards.length === 2 && score === 21;
    
    if (isPlayerBJ && !isDealerBJ) return 'win';
    if (!isPlayerBJ && isDealerBJ) return 'loss';
    if (isPlayerBJ && isDealerBJ) return 'push';
    
    if (score > dScore) return 'win';
    if (score < dScore) return 'loss';
    return 'push';
  };

  const needsApproval = allowance < ethers.parseUnits(betAmount.toString() || "0", tokenDecimals);

  // Visual sub-component: Curved Blackjack Table Felt & Glow
  const TableBackground = ({ children }) => {
    return (
      <div className="w-full overflow-hidden py-4 px-2 select-none relative z-10 mt-2 flex justify-center items-center">
        <div className="multiplayer-table-felt flex flex-col justify-between items-center py-8 px-6">
          
          {/* Rules printed graphics inside the felt */}
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
  };

  // Visual sub-component: Dealer Section
  const DealerSection = () => {
    return (
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
  };

  // Visual sub-component: Seated Active Player representation
  const PlayerSeat = () => {
    const playerAvatar = getAvatarAsset(customAvatar, authData.address);
    const playerScore = isSplit ? 0 : calculateScore(playerHand);

    return (
      <div className="flex flex-col items-center justify-end min-h-[220px] relative">
        {/* Card Stack & Score - rendered above the avatar */}
        {status !== 'betting' && (
          <div className="relative flex flex-col items-center min-h-[90px] mb-2 z-20">
            {/* Score Badge */}
            {playerScore > 0 && (
              <div className="bj-score-badge bj-score-badge-you animate-in zoom-in duration-300">
                {playerScore}
              </div>
            )}

            {isSplit ? (
              <div className="flex flex-row justify-center gap-35 scale-100 origin-center mb-2">
                {/* Left Hand */}
                <div className={`flex flex-col items-center p-4 rounded-xl border transition-all duration-300 w-[210px] bg-slate-900/60 ${activeHandIndex === 0 && status === 'playing' ? 'border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)] bg-slate-900/90 scale-105' : 'border-slate-800 opacity-60'}`}>
                  <div className="bg-black/40 px-2.5 py-0.5 text-white text-[9px] uppercase font-bold rounded tracking-wider mb-2 border border-slate-700">
                    Left Hand {activeHandIndex === 0 && status === 'playing' && "✏️ Active"}
                  </div>
                  <div className="flex min-h-[112px] mb-2 relative justify-center scale-[1.0] origin-top">
                    <div className="flex">
                      {playerHandLeft.map((c, i) => (
                        <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-35px' : '0', zIndex: i }}>
                          <Web2Card suit={c.suit} value={c.value} tiltClass={i % 2 === 0 ? 'classic-card-tilt-left' : 'classic-card-tilt-right'} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="px-3 py-0.5 bg-amber-500/20 border border-amber-500 rounded-full text-white text-[10px] font-bold">
                    Score: {calculateScore(playerHandLeft)}
                  </div>
                  {status === 'settled' && (
                    <div className={`mt-2 px-2.5 py-0.5 rounded-lg border text-[9px] font-extrabold uppercase tracking-wider ${
                      getHandOutcome(playerHandLeft, dealerHand) === 'win'
                        ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                        : getHandOutcome(playerHandLeft, dealerHand) === 'push'
                          ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                          : 'bg-red-500/20 border-red-500/30 text-red-400'
                    }`}>
                      {getHandOutcome(playerHandLeft, dealerHand) === 'win' && "🏆 Won"}
                      {getHandOutcome(playerHandLeft, dealerHand) === 'push' && "🤝 Pushed"}
                      {getHandOutcome(playerHandLeft, dealerHand) === 'loss' && (calculateScore(playerHandLeft) > 21 ? "💥 Busted" : "❌ Lost")}
                    </div>
                  )}
                </div>

                {/* Right Hand */}
                <div className={`flex flex-col items-center p-4 rounded-xl border transition-all duration-300 w-[210px] bg-slate-900/60 ${activeHandIndex === 1 && status === 'playing' ? 'border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)] bg-slate-900/90 scale-105' : 'border-slate-800 opacity-60'}`}>
                  <div className="bg-black/40 px-2.5 py-0.5 text-white text-[9px] uppercase font-bold rounded tracking-wider mb-2 border border-slate-700">
                    Right Hand {activeHandIndex === 1 && status === 'playing' && "✏️ Active"}
                  </div>
                  <div className="flex min-h-[112px] mb-2 relative justify-center scale-[1.0] origin-top">
                    <div className="flex">
                      {playerHandRight.map((c, i) => (
                        <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-35px' : '0', zIndex: i }}>
                          <Web2Card suit={c.suit} value={c.value} tiltClass={i % 2 === 0 ? 'classic-card-tilt-left' : 'classic-card-tilt-right'} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="px-3 py-0.5 bg-amber-500/20 border border-amber-500 rounded-full text-white text-[10px] font-bold">
                    Score: {calculateScore(playerHandRight)}
                  </div>
                  {status === 'settled' && (
                    <div className={`mt-2 px-2.5 py-0.5 rounded-lg border text-[9px] font-extrabold uppercase tracking-wider ${
                      getHandOutcome(playerHandRight, dealerHand) === 'win'
                        ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                        : getHandOutcome(playerHandRight, dealerHand) === 'push'
                          ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                          : 'bg-red-500/20 border-red-500/30 text-red-400'
                    }`}>
                      {getHandOutcome(playerHandRight, dealerHand) === 'win' && "🏆 Won"}
                      {getHandOutcome(playerHandRight, dealerHand) === 'push' && "🤝 Pushed"}
                      {getHandOutcome(playerHandRight, dealerHand) === 'loss' && (calculateScore(playerHandRight) > 21 ? "💥 Busted" : "❌ Lost")}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex justify-center min-h-[80px] relative w-full scale-[0.8] origin-bottom animate-in zoom-in duration-300">
                <div className="flex">
                  {playerHand.map((c, i) => (
                    <div key={i} className="transform transition-transform" style={{ marginLeft: i > 0 ? '-45px' : '0', zIndex: i }}>
                      <Web2Card suit={c.suit} value={c.value} tiltClass={i % 2 === 0 ? 'classic-card-tilt-left' : 'classic-card-tilt-right'} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Avatar Ring Wrapper (without overflow: hidden) */}
        <div className="relative mb-2">
          {/* Avatar Ring */}
          <div className={`avatar-ring-gold ${status === 'playing' ? 'avatar-active-glow' : ''} shadow-2xl relative group`}>
            <img src={playerAvatar} className="w-full h-full object-cover" alt="Player Avatar" />
            <button 
              onClick={onOpenSettings}
              className="absolute -bottom-1 -right-1 bg-black/80 hover:bg-black border border-white/20 text-white rounded-full p-1.5 text-[10px] shadow-lg transition-transform hover:scale-110 active:scale-95 z-20"
              title="Edit Profile"
            >
              ⚙️
            </button>
          </div>

          {/* Bet Capsule */}
          {betAmount > 0 && (
            <div className="bet-capsule absolute top-1/2 -translate-y-1/2 -right-16 z-25 animate-in zoom-in-50 duration-300">
              <div className="bet-chip-icon"></div>
              <span className="bet-capsule-text">${betAmount >= 1000 ? `${(betAmount / 1000).toFixed(0)}k` : betAmount}</span>
            </div>
          )}
        </div>

        {/* Name & Balance Tag */}
        <div className="player-tag-container mt-1">
          <div className="player-name-badge player-name-badge--you">{getNicknameToShow(customNickname, authData.address)}</div>
          <div className="player-balance-badge player-balance-badge--you">
            <div className="player-coin-icon">$</div>
            {Number(balance).toLocaleString()}
          </div>
        </div>
      </div>
    );
  };

  // Controls Section
  const ControlsSection = () => {
    return (
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
            <ActionBtn label="Hit" onClick={hit} disabled={loading || status !== 'playing'} />
            <ActionBtn label="Stand" onClick={stand} disabled={loading || status !== 'playing'} />
            <ActionBtn label="Double" onClick={doubleDown} disabled={loading || status !== 'playing' || (isSplit ? (activeHandIndex === 0 ? playerHandLeft : playerHandRight).length !== 2 : playerHand.length !== 2)} />
            <ActionBtn label="Split" onClick={split} disabled={loading || status !== 'playing' || !(!isSplit && playerHand.length === 2 && playerHand[0]?.value === playerHand[1]?.value)} />
            {loading && (
              <div className="absolute top-[-40px] left-1/2 -translate-x-1/2 text-white font-bold animate-pulse">Waiting for BSC Testnet...</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full relative flex flex-col justify-between items-center select-none pt-2 pb-28 overflow-hidden">
      
      {/* Curved Table felt container */}
      <TableBackground>

        {/* Dealer Section */}
        <DealerSection />

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

        {/* Center Seat (Single player sits at center Seat 3) */}
        <div className="absolute inset-0 z-10 pointer-events-none">
          {/* Seat 3 (Center): YOU */}
          <div className="absolute bottom-[7.5%] left-[50%] transform -translate-x-1/2 pointer-events-auto">
            <PlayerSeat />
          </div>
        </div>

      </TableBackground>

      {/* Controls Section */}
      <ControlsSection />
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

const ActionBtn = ({ label, onClick, disabled }) => {
  let text = label;
  if (label.toLowerCase() === 'stand') text = 'STAND';
  if (label.toLowerCase() === 'double') text = 'DOUBLE';
  text = text.toUpperCase();

  return (
    <button
      className="action-btn-pill"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="action-btn-text">{text}</span>
    </button>
  );
};
