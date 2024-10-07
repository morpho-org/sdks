import { createAnvilWagmiTest } from "@morpho-org/test";
import { mainnet } from "viem/chains";

const rpcUrl = process.env.MAINNET_RPC_URL;

export const test = createAnvilWagmiTest(
  {
    forkUrl: rpcUrl,
    forkBlockNumber: 19_530_000,
  },
  mainnet,
);
