import { ethers } from 'ethers';

// Full ABI for the BlackJackCard contract (supporting both single-player and multiplayer tables)
export const blackjackABI = [
  // Old Single-Player Actions
  "function split(uint256 id) external",
  "function games(uint256) view returns (address player, uint8 dealerScore, uint8 currentHand, bool isSplit, bool settled)",
  "function getPlayerCards(uint256 id, uint256 handIdx) view returns (uint8[] memory)",
  "event GameStarted(address indexed player, uint256 indexed gameId)",
  "event GameSettled(address indexed player, uint256 indexed gameId, uint256 betAmount, uint256 payout)",

  // Unified / Multiplayer Actions
  "function createTable() external returns (uint256)",
  "function placeBet(uint256 tableId, uint256 betAmount) external",
  "function startRound(uint256 tableId) external",
  "function hit(uint256 tableId) external",
  "function doubleDown(uint256 tableId) external",
  "function stand(uint256 tableId) external",
  "function forceTimeout(uint256 tableId) external",
  "function settleTable(uint256 tableId) external",
  "function split(uint256 tableId) external",
  
  // Getters
  "function tableCounter() view returns (uint256)",
  "function minBet() view returns (uint256)",
  "function maxBet() view returns (uint256)",
  "function turnTimeoutDuration() view returns (uint256)",
  "function getDealerCards(uint256 tableId) view returns (uint8[] memory)",
  "function getActivePlayers(uint256 tableId) view returns (address[] memory)",
  "function getPlayerBetDetails(uint256 tableId, address player) view returns (address playerAddress, uint256 betAmount, uint8[] memory cards, uint8 score, bool stood, bool busted, bool settled, bool doubledDown)",
  "function getPlayerSplitDetails(uint256 tableId, address player) view returns (bool isSplit, uint8[] memory splitCards, uint8 splitScore, bool splitStood, bool splitBusted, uint256 splitBetAmount, uint8 activeHandIndex)",
  "function tables(uint256) view returns (uint256 tableId, uint8 state, uint8 dealerScore, uint256 currentTurnIndex, uint256 lastActionTimestamp)",
  
  // Events
  "event TableCreated(uint256 indexed tableId)",
  "event BetPlaced(uint256 indexed tableId, address indexed player, uint256 betAmount)",
  "event RoundStarted(uint256 indexed tableId, uint8[] dealerCards)",
  "event PlayerAction(uint256 indexed tableId, address indexed player, string action, uint8[] cards, uint8 score)",
  "event TableSettled(uint256 indexed tableId, uint8[] dealerCards, uint8 dealerScore)",
  "event TimeoutTriggered(uint256 indexed tableId, address indexed timedOutPlayer, address indexed triggerer)"
];

// Standard ERC20 ABI
export const tokenABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function mint(address to, uint256 amount) external"
];

// BSC Testnet Addresses
export const CONTRACT_ADDRESS = "0x0A9d1704ff312F90F745996C2f35eb2dFfcf69d4";
export const TOKEN_ADDRESS = "0x5BB373697cee7Ea0fB183E97913e543f2efD335e"; // Game Chips (TKN)
export const USDT_ADDRESS = "0xA421Da1F4630C22C687F7bdA97e97776218CE89d"; // BSC Testnet USDT

// This should be your wallet where you want to receive the USDT
export const ADMIN_WALLET = "0x2818bA353dFF5CB15310b438f122110d41D7b995";

export const getContract = (signerOrProvider) => {
  return new ethers.Contract(CONTRACT_ADDRESS, blackjackABI, signerOrProvider);
};

export const getTokenContract = (signerOrProvider) => {
  return new ethers.Contract(TOKEN_ADDRESS, tokenABI, signerOrProvider);
};

export const getUSDTContract = (signerOrProvider) => {
  return new ethers.Contract(USDT_ADDRESS, tokenABI, signerOrProvider);
};
