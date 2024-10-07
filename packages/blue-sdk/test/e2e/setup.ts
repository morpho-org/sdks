import { createAnvilTest } from "@morpho-org/test";
import { mainnet } from "viem/chains";

const rpcUrl = process.env.MAINNET_RPC_URL;

export const test = createAnvilTest(
  {
    forkUrl: rpcUrl,
    forkBlockNumber: 19_530_000,
  },
  mainnet,
);
