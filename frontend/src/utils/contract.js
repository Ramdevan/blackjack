import { ethers } from 'ethers';

// Full ABI for the BlackJackCard contract
export const blackjackABI = [
  "function placeBet(uint256 betAmount) external",
  "function split(uint256 id) external",
  "function hit(uint256 id) external",
  "function doubleDown(uint256 id) external",
  "function stand(uint256 id) external",
  "function gameCounter() view returns (uint256)",
  "function games(uint256) view returns (address player, uint8 dealerScore, uint8 currentHand, bool isSplit, bool settled)",
  "event GameStarted(address indexed player, uint256 indexed gameId)",
  "event GameSettled(address indexed player, uint256 indexed gameId, uint256 betAmount, uint256 payout)"
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
export const CONTRACT_ADDRESS = "0x5DB6154b5D007eae6DE7A4a8F30399861f22e61A";
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
