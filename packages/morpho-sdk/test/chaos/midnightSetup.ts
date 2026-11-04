import { MarketUtils, midnightAbi } from "@morpho-org/midnight-sdk";
import {
  createE2eMidnightMarket,
  E2E_MIDNIGHT_WALLETS,
  fundE2eMidnightWallets,
} from "@morpho-org/morpho-test/midnight";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import {
  createFaultProxy,
  type ErrorCategory,
  expectFailClosed,
  type FaultProxy,
  type FaultRule,
} from "@morpho-org/test/chaos";
import { createViemTest } from "@morpho-org/test/vitest";
import { type Client, createClient, http, parseEther } from "viem";
import { base } from "viem/chains";
import { expect } from "vitest";
import { type MorphoClientType, morphoViemExtension } from "../../src/index.js";

/** Base fork fixture for Midnight chaos tests. */
export const midnightChaosTest = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  chainId: base.id,
  forkBlockNumber: 52_252_000n,
  stepsTracing: false,
}).extend<{ client: AnvilTestClient<typeof base> }>({
  client: async ({ client }, use) => {
    await client.setCode({
      address: client.account.address,
      bytecode: "0x",
    });
    await use(client);
  },
});

/** Funds the reusable Midnight lender and borrower and supplies borrower collateral. */
export const setUpMidnightChaosMarket = async (
  client: AnvilTestClient<typeof base>,
) => {
  const { timestamp } = await client.getBlock();
  const maturity = (timestamp / 86_400n + 1n) * 86_400n + 54_000n;
  const sharedClient = client as unknown as AnvilTestClient;
  const { params, marketData } = await createE2eMidnightMarket(
    sharedClient,
    base.id,
    { maturity },
  );
  const lender = E2E_MIDNIGHT_WALLETS.A;
  const borrower = E2E_MIDNIGHT_WALLETS.B;
  const loanAssets = parseEther("1");
  const collateralAssets = parseEther("10");
  const midnight = getChainAddress(base.id, "midnight");

  await fundE2eMidnightWallets(sharedClient, {
    market: params,
    wallets: {
      A: { loanAssets },
      B: { collateralAssets },
    },
    approve: midnight,
  });
  await client.writeContract({
    account: borrower,
    address: midnight,
    abi: midnightAbi,
    functionName: "supplyCollateral",
    args: [MarketUtils.toStruct(params), 0n, collateralAssets, borrower],
  });

  return { params, marketData, lender, borrower };
};

/**
 * Runs a callback with a fault proxy; batch multicall stays disabled so each eth_call method and selector remains deterministic.
 */
export const withMidnightFaultProxy = async (
  {
    client,
    faults = [],
  }: {
    client: AnvilTestClient<typeof base>;
    faults?: readonly FaultRule[];
  },
  run: (ctx: {
    proxy: FaultProxy;
    client: Client & { readonly morpho: MorphoClientType };
  }) => Promise<void>,
) => {
  const proxy = await createFaultProxy({
    upstream: client.transport.url!,
    faults,
  });
  try {
    const proxiedClient = createClient({
      account: client.account,
      chain: base,
      transport: http(proxy.url, { retryCount: 0 }),
    }).extend(morphoViemExtension());
    await run({ proxy, client: proxiedClient });
  } finally {
    await proxy.kill();
  }
};

/** Expects a Midnight flow to reject before returning a transaction. */
export const expectMidnightFlowFailsClosed = async (
  prepare: () => Promise<{
    getRequirements: () => Promise<unknown>;
    buildTx: () => unknown;
  }>,
  expected:
    | Exclude<ErrorCategory, "unknown">
    | (new (
        ...args: never[]
      ) => Error),
) => {
  let transaction: unknown;
  const promise = (async () => {
    const action = await prepare();
    await action.getRequirements();
    transaction = action.buildTx();
  })();
  let error: Error;
  if (typeof expected === "string") {
    error = await expectFailClosed(promise, expected);
  } else {
    await expect(promise).rejects.toBeInstanceOf(expected);
    error = (await promise.catch((e: Error) => e)) as Error;
  }
  expect(transaction).toBeUndefined();
  return error;
};
