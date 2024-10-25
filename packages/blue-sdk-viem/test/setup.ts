import { createViemTest } from "@morpho-org/test";
import { mainnet } from "viem/chains";

export const test = await createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 19_530_000,
});
