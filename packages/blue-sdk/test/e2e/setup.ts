import { createAnvilTest } from "@morpho-org/morpho-test";
import { mainnet } from "viem/chains";

const rpcUrl = process.env.MAINNET_RPC_URL || mainnet.rpcUrls.default.http[0];

export const test = createAnvilTest(
  {
    forkUrl: rpcUrl,
    forkBlockNumber: 19_530_000,
  },
  mainnet,
);
