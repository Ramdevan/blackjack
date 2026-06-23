import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_RPC_URLS = [
  "https://bnb-testnet.api.onfinality.io/public",
  "https://bsc-testnet.drpc.org",
  "https://data-seed-prebsc-1-s1.binance.org:8545",
  "https://data-seed-prebsc-2-s1.binance.org:8545",
  "https://bsc-testnet-rpc.publicnode.com"
];

let rpcUrls = DEFAULT_RPC_URLS;

if (process.env.BSC_RPC_URLS) {
  try {
    const customUrls = process.env.BSC_RPC_URLS.split(',')
      .map(url => url.trim())
      .filter(Boolean);
    if (customUrls.length > 0) {
      rpcUrls = customUrls;
    }
  } catch (err) {
    console.error("Failed to parse BSC_RPC_URLS from environment, using default nodes:", err.message);
  }
}

console.log(`[Provider] Initializing FallbackProvider with ${rpcUrls.length} nodes:`);
rpcUrls.forEach((url, i) => console.log(`  Priority ${i + 1}: ${url}`));

// Map each URL to a FallbackProvider configuration
const providerConfigs = rpcUrls.map((url, index) => {
  const provider = new ethers.JsonRpcProvider(url, 97, {
    staticNetwork: true
  });
  return {
    provider,
    priority: index + 1, // Prioritize sequentially starting from 1
    weight: 1,
    stallTimeout: 2000 // Time to wait in ms before trying the next node
  };
});

// Quorum is set to 1 so that as long as one RPC node responds, the query is successful.
export const fallbackProvider = new ethers.FallbackProvider(providerConfigs, 97, { quorum: 1 });
