import { addressesRegistry } from "@morpho-org/blue-sdk";
import { erc2612Abi, permit2Abi } from "@morpho-org/blue-sdk-viem";
import { testAccount } from "@morpho-org/test/fixtures";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  type Account,
  type CustomTransport,
  createWalletClient,
  custom,
  erc20Abi,
  type WalletClient,
} from "viem";
import { mainnet } from "viem/chains";
import { test as base, type TestAPI } from "vitest";
import {
  GauntletWethVaultV1,
  SteakhouseUsdcVaultV1,
} from "./fixtures/vaultV1.js";

type UnitClient = WalletClient<CustomTransport, typeof mainnet, Account>;

const createClient = (): UnitClient => {
  const handle = createMockClient(mainnet);
  const { dai, permit2, usdc, wNative } = addressesRegistry[mainnet.id];

  for (const address of [
    dai,
    usdc,
    wNative,
    GauntletWethVaultV1.address,
    SteakhouseUsdcVaultV1.address,
  ])
    mockRead(handle, {
      address,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
  mockRead(handle, {
    address: permit2,
    abi: permit2Abi,
    functionName: "allowance",
    result: [0n, 0, 0],
  });
  for (const [address, decimals, name, symbol] of [
    [usdc, 6, "USD Coin", "USDC"],
    [GauntletWethVaultV1.address, 18, "Gauntlet WETH", "gtWETH"],
    [SteakhouseUsdcVaultV1.address, 18, "Steakhouse USDC", "steakUSDC"],
  ] as const) {
    mockRead(handle, {
      address,
      abi: erc2612Abi,
      functionName: "nonces",
      result: 0n,
    });
    for (const [functionName, result] of [
      ["decimals", decimals],
      ["name", name],
      ["symbol", symbol],
    ] as const)
      mockRead(handle, { address, abi: erc20Abi, functionName, result });
  }

  return createWalletClient({
    account: testAccount(),
    chain: mainnet,
    transport: custom({ request: handle.request }),
  });
};

export const test: TestAPI<{ client: UnitClient }> = base.extend<{
  client: UnitClient;
}>({
  // biome-ignore lint/correctness/noEmptyPattern: required by Vitest at runtime
  client: async ({}, use) => use(createClient()),
});
