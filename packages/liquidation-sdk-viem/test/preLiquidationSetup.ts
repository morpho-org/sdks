import type { AnvilTestClient } from "@morpho-org/test";
import { type ViemTestContext, createViemTest } from "@morpho-org/test/vitest";
import dotenv from "dotenv";
import { bytecode, executorAbi } from "executooor-viem";
import { type Chain, mainnet } from "viem/chains";
import { LiquidationEncoder } from "../src/index.js";

dotenv.config();

export interface LiquidationEncoderTestContext<chain extends Chain = Chain> {
  encoder: LiquidationEncoder<AnvilTestClient<chain>>;
}

export interface LiquidationTestContext<chain extends Chain = Chain>
  extends ViemTestContext<chain>,
    LiquidationEncoderTestContext<chain> {}

export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 21_429_913,
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
