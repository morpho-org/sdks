import {
  type AnvilTestClient,
  type ViemTestContext,
  createViemTest,
} from "@morpho-org/test-viem";
import { bytecode, executorAbi } from "executooor-viem";
import { type Chain, mainnet } from "viem/chains";
import { LiquidationEncoder } from "../src/index.js";

export interface LiquidationEncoderTestContext<chain extends Chain = Chain> {
  encoder: LiquidationEncoder<AnvilTestClient<chain>>;
}

export interface LiquidationTestContext<chain extends Chain = Chain>
  extends ViemTestContext<chain>,
    LiquidationEncoderTestContext<chain> {}

export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 20_818_976,
}).extend<LiquidationEncoderTestContext<typeof mainnet>>({
  encoder: async ({ client }, use) => {
    const receipt = await client.deployContractWait({
      abi: executorAbi,
      bytecode,
      args: [client.account.address],
    });

    await use(new LiquidationEncoder(receipt.contractAddress, client));
  },
});
