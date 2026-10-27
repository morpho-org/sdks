import { midnightSupplyCollateral } from "@morpho-org/morpho-sdk";
import { midnightAbi } from "@morpho-org/morpho-sdk/abis";
import { MarketParams } from "@morpho-org/morpho-sdk/midnight/entities";
import { MarketUtils } from "@morpho-org/morpho-sdk/midnight/utils";
import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  padHex,
  parseEther,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  ConsumerLimitViolationError,
  SlippageCheckUnavailableError,
  simulate,
  toSimulationLimits,
} from "../../src/index.js";

/** Pinned after the Base Midnight deployment, matching morpho-sdk's Midnight fork tests. */
const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  chainId: base.id,
  forkBlockNumber: 52_252_000n,
}).extend<{ client: AnvilTestClient<typeof base> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const OTHER: Address = "0x00000000000000000000000000000000000c0E57";
const oracle: Address = "0x0000000000000000000000000000000000080000";

const market = new MarketParams({
  chainId: base.id,
  midnight,
  loanToken: usdc,
  collateralParams: [
    {
      token: wNative,
      lltv: 770000000000000000n,
      liquidationCursor: 300000000000000000n,
      oracle,
    },
  ],
  maturity: 2_000_000_000n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
});
const configFor = (client: { transport: { url?: string } }) => ({
  chains: new Map([[base.id, { simulateV1Url: client.transport.url! }]]),
});

const supply = (assets: bigint, onBehalf: Address) =>
  midnightSupplyCollateral({ chainId: base.id, market, assets, onBehalf });

const marketId = supply(1n, OTHER).action.args.market;

const asTransaction = (
  from: Address,
  tx: ReturnType<typeof midnightSupplyCollateral>,
) => ({ from, to: tx.to, data: tx.data, value: tx.value });

/** Install a fixed-price oracle, fund and approve the sender, then create the market with a first supply unless `createMarket` is false. */
const setUp = async (
  client: AnvilTestClient<typeof base>,
  createMarket = true,
) => {
  const user = client.account.address;
  // Returns a constant 1e36 price.
  await client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(10n ** 36n), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });
  await client.deal({ erc20: wNative, amount: parseEther("10") });
  await client.writeContract({
    account: client.account,
    address: wNative,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, maxUint256],
  });
  if (!createMarket) return user;
  const seed = supply(1n, user);
  await client.sendTransaction({
    account: client.account,
    to: seed.to,
    data: seed.data,
  });
  return user;
};

/** Midnight only credits another account that authorized the sender. */
const authorizeSender = async (client: AnvilTestClient<typeof base>) => {
  await client.setBalance({ address: OTHER, value: parseEther("1") });
  await client.sendTransaction({
    account: OTHER,
    to: midnight,
    data: encodeFunctionData({
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [client.account.address, true, OTHER],
    }),
  });
};

describe.sequential("midnightSupplyCollateral limits — Base fork", () => {
  test("a single supply verifies the sender debit and the indexed collateral credit", async ({
    client,
  }) => {
    const user = await setUp(client);
    const tx = supply(parseEther("1"), user);
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, { owner: user }),
    });
    expect(result.verification.operations).toEqual([
      {
        operation: "midnightSupplyCollateral",
        marketId,
        collateralIndex: 0n,
        account: user,
        receiver: user,
        checkedLimits: {
          quote: {
            assetsPaid: parseEther("1"),
            collateralSupplied: parseEther("1"),
          },
          slippageTolerance: 300000000000000n,
        },
      },
    ]);
  });

  test("two supplies in one bundle verify their aggregate delta", async ({
    client,
  }) => {
    const user = await setUp(client);
    const first = supply(parseEther("1"), user);
    const second = supply(parseEther("2"), user);
    const aggregate = {
      assetsPaid: parseEther("3"),
      collateralSupplied: parseEther("3"),
    };
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, first), asTransaction(user, second)],
      limits: toSimulationLimits(first.action, {
        owner: user,
        expected: aggregate,
      }),
    });
    expect(result.verification.operations[0]?.checkedLimits.quote).toEqual(
      aggregate,
    );

    // Only the first supply is quoted per-action: the bundle pays more than it.
    await expect(
      simulate(configFor(client), {
        chainId: base.id,
        transactions: [asTransaction(user, first), asTransaction(user, second)],
        limits: toSimulationLimits(first.action, { owner: user }),
      }),
    ).rejects.toThrow(/slippage for "assetsPaid"/);
  });

  test("collateral supplied for another owner verifies with the caller's onBehalf intent", async ({
    client,
  }) => {
    const user = await setUp(client);
    await authorizeSender(client);
    const tx = supply(parseEther("1"), OTHER);
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, { owner: user, onBehalf: OTHER }),
    });
    expect(result.verification.operations[0]).toMatchObject({
      account: OTHER,
      receiver: user,
    });
  });

  test("the first supply without a market struct still needs an explicit paid token", async ({
    client,
  }) => {
    const user = await setUp(client, false);
    const tx = supply(parseEther("1"), user);
    const limits = toSimulationLimits(tx.action, { owner: user });
    const request = {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
    };
    const error = await simulate(configFor(client), {
      ...request,
      limits,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SlippageCheckUnavailableError);
    expect((error as Error).message).toContain(
      'If this bundle creates the market, pass the market struct via "market".',
    );
    expect((error as Error).message).toContain(
      "set assetPaid to exactly collateralParams[collateralIndex].token",
    );

    const result = await simulate(configFor(client), {
      ...request,
      limits: {
        operations: limits.operations.map((operation) =>
          operation.type === "midnightSupplyCollateral"
            ? { ...operation, assetPaid: wNative }
            : operation,
        ),
      },
    });
    expect(result.verification.operations[0]?.checkedLimits.quote).toEqual({
      assetsPaid: parseEther("1"),
      collateralSupplied: parseEther("1"),
    });
  });

  test("the first supply can resolve its collateral from the supplied market", async ({
    client,
  }) => {
    const user = await setUp(client, false);
    const tx = supply(parseEther("1"), user);
    const options = { owner: user, market: MarketUtils.toStruct(market) };
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, tx)],
      limits: toSimulationLimits(tx.action, options),
    });
    expect(result.verification.operations[0]?.checkedLimits.quote).toEqual({
      assetsPaid: parseEther("1"),
      collateralSupplied: parseEther("1"),
    });
  });

  test("a successful supply credited to the wrong owner is rejected by the economic limit", async ({
    client,
  }) => {
    const user = await setUp(client);
    await authorizeSender(client);
    const intended = supply(parseEther("1"), user);
    const delivered = supply(parseEther("1"), OTHER);
    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [asTransaction(user, delivered)],
      limits: toSimulationLimits(intended.action, { owner: user }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain(
      'Limit operation 0 (midnightSupplyCollateral): slippage for "collateralSupplied"',
    );
  });
});
