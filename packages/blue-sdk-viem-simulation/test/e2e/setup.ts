import { createAnvilTest } from "@morpho-org/prool-viemtest";
import { mainnet } from "viem/chains";

const rpcUrl = process.env.MAINNET_RPC_URL;

export const test = createAnvilTest(
  {
    forkUrl: rpcUrl,
    forkBlockNumber: 19_750_000,
  },
  mainnet,
);
