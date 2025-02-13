import type { AnvilTestClient } from "@morpho-org/test";
import { type ViemTestContext, createViemTest } from "@morpho-org/test/vitest";
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

export const preLiquidationTest = createViemTest(mainnet, {
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

export const spectraTest = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 21_715_786,
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

export const midasTest = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 21_587_766,
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
