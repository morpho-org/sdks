import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { mainnet } from "viem/chains";

export const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: 21_365_000,
});
