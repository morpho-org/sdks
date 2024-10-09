import { createEthersTest } from "@morpho-org/test-ethers";
import { mainnet } from "viem/chains";

const rpcUrl = process.env.MAINNET_RPC_URL;

export const test = createEthersTest(
  {
    forkUrl: rpcUrl,
    forkBlockNumber: 19_530_000,
  },
  mainnet,
);
