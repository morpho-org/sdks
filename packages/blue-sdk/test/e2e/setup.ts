import { createViemTest } from "@morpho-org/test-viem";
import { mainnet } from "viem/chains";

const rpcUrl = process.env.MAINNET_RPC_URL;

export const test = createViemTest(
  {
    forkUrl: rpcUrl,
    forkBlockNumber: 19_530_000,
  },
  mainnet,
);
