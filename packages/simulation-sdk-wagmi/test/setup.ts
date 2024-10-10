import { createWagmiTest } from "@morpho-org/test-wagmi";
import { mainnet } from "viem/chains";

const rpcUrl = process.env.MAINNET_RPC_URL;

export const test = createWagmiTest(
  {
    forkUrl: rpcUrl,
    forkBlockNumber: 19_750_000,
  },
  mainnet,
);
