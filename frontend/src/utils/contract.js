import { ethers } from 'ethers';

// Simple ABI for the Blackjack contract functions we need
export const blackjackABI = [
  "function placeBet(uint256 betAmount) external",
  "function split(uint256 id) external",
  "function hit(uint256 id) external",
  "function doubleDown(uint256 id) external",
  "function stand(uint256 id) external",
  "function gameCounter() view returns (uint256)",
  "function games(uint256) view returns (address player, uint8 dealerScore, uint8 currentHand, bool isSplit, bool settled)",
  "event GameStarted(address indexed player, uint256 indexed gameId)",
  "event GameSettled(address indexed player, uint256 indexed gameId, uint256 payout)"
];

export const tokenABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)"
];

export const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Example hardhat local address
export const TOKEN_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"; // Example hardhat local token address

export const getContract = async (signerOrProvider) => {
  return new ethers.Contract(CONTRACT_ADDRESS, blackjackABI, signerOrProvider);
};

export const getTokenContract = async (signerOrProvider) => {
  return new ethers.Contract(TOKEN_ADDRESS, tokenABI, signerOrProvider);
};
