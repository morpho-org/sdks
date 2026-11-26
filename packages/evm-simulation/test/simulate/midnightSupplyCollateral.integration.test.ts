import {
  midnightSupplyCollateral,
  midnightSupplyCollateralWithNative,
} from "@morpho-org/morpho-sdk";
import { midnightAbi } from "@morpho-org/morpho-sdk/abis";
import { MarketParams } from "@morpho-org/morpho-sdk/midnight/entities";
import { fetchMarketParams } from "@morpho-org/morpho-sdk/midnight/fetch";
import { MarketUtils } from "@morpho-org/morpho-sdk/midnight/utils";
import { wrapE2eNative } from "@morpho-org/morpho-test";
import { createE2eMidnightMarket } from "@morpho-org/morpho-test/midnight";
import {
  ChainId,
  getChainAddress,
  getChainAddresses,
} from "@morpho-org/morpho-ts";
import {
  type AnvilTestClient,
  BASE_FORK_BLOCK,
  getErpcForkUrl,
} from "@morpho-org/test";
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
  LimitAccountMismatchError,
  SimulationRevertedError,
  SimulationValidationError,
  simulate,
  toSimulationLimits,
  UnexpectedTokenApprovalError,
} from "../../src/index.js";
import {
  simulateOrThrow,
  simulationClientFor,
  unwrapReport,
} from "../../src/test-helpers/index.js";
import { describeE2e } from "../e2e/setup.js";

/** Pinned after the Base Midnight deployment, matching morpho-sdk's Midnight fork tests. */
const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  chainId: base.id,
  forkBlockNumber: BASE_FORK_BLOCK,
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
const configFor = (client: { transport: { url?: string } }) =>
  simulationClientFor(client.transport.url, base);

const supply = (assets: bigint, onBehalf: Address) =>
  midnightSupplyCollateral({ chainId: base.id, market, assets, onBehalf });

const marketId = supply(1n, OTHER).action.args.market;

const asTransaction = (
  from: Address,
  tx: ReturnType<
    typeof midnightSupplyCollateral | typeof midnightSupplyCollateralWithNative
  >,
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

const nativeScenario = {
  name: "midnight-standalone-collateral-limits",
  requires: ["midnight", "midnightBundlesV2", "wNative"],
} as const;

const mainnetUsdcWethMarket =
  "0x2adde4b2a21d5f14e8b449bf7cb60d6b9b72a8e340bc1785bb63961c32f09693";

describeE2e(nativeScenario, (nativeTest, { chainId }) => {
  const cases = [0n, parseEther("0.5"), parseEther("1")].map(
    (nativeAmount) => ({
      nativeAmount,
      collateralIndex: 0n,
    }),
  );
  if (chainId === ChainId.EthMainnet) {
    cases.push({ nativeAmount: parseEther("0.5"), collateralIndex: 1n });
  }
  for (const { nativeAmount, collateralIndex } of cases) {
    nativeTest(
      `verifies standalone collateral funded with ${nativeAmount} wei at index ${collateralIndex}`,
      async ({ client }) => {
        const user = client.account.address;
        const coreAddress = getChainAddress(chainId, "midnight");
        const bundles = getChainAddress(chainId, "midnightBundlesV2");
        const wrappedNative = getChainAddress(chainId, "wNative");
        let nativeMarket: MarketParams;
        if (collateralIndex === 1n) {
          nativeMarket = await fetchMarketParams(client, {
            marketId: mainnetUsdcWethMarket,
          });
          expect(MarketUtils.getCollateralByIndex(nativeMarket, 1n).token).toBe(
            wrappedNative,
          );
        } else {
          const { params } = await createE2eMidnightMarket(client, chainId);
          nativeMarket = new MarketParams({
            ...params,
            loanToken: getChainAddresses(chainId).usdc ?? params.loanToken,
            collateralParams: params.collateralParams.map((collateral) => ({
              ...collateral,
              token: wrappedNative,
            })),
          });
        }
        const assets = parseEther("1");
        await client.setBalance({ address: user, value: 3n * assets });
        if (nativeAmount < assets) {
          await wrapE2eNative(client, {
            wNative: wrappedNative,
            account: user,
            amount: assets - nativeAmount,
          });
        }
        const config = simulationClientFor(client.transport.url, chainId);
        const deadline = (await client.getBlock()).timestamp + 600n;
        const supplyParams = {
          chainId,
          market: nativeMarket,
          collateralIndex,
          assets,
        };
        const direct = nativeAmount === 0n;
        const tx = direct
          ? midnightSupplyCollateral({ ...supplyParams, onBehalf: user })
          : midnightSupplyCollateralWithNative({
              ...supplyParams,
              accountAddress: user,
              nativeAmount,
              deadline,
            });
        const nativeMarketId = tx.action.args.market;
        const limits = toSimulationLimits(tx.action, {
          owner: user,
          market: MarketUtils.toStruct(nativeMarket),
          slippageTolerance: 0n,
        });
        expect(() => toSimulationLimits(tx.action, { owner: OTHER })).toThrow(
          LimitAccountMismatchError,
        );
        const approve = (spender: Address) => ({
          from: user,
          to: wrappedNative,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [spender, maxUint256],
          }),
        });
        const authorize = {
          from: user,
          to: coreAddress,
          data: encodeFunctionData({
            abi: midnightAbi,
            functionName: "setIsAuthorized",
            args: [bundles, true, user],
          }),
        };
        const authorizations = direct ? [] : [authorize];
        const transactions = [
          approve(direct ? coreAddress : bundles),
          ...authorizations,
          asTransaction(user, tx),
        ];
        const report = await simulate(
          config,
          { transactions, limits },
          { timeoutMs: 30_000 },
        );
        expect(report.warnings).toEqual([]);
        const result = unwrapReport(report);
        expect(result.verification.operations).toMatchObject([
          {
            operation: "midnightSupplyCollateral",
            account: user,
            collateralIndex,
            checkedLimits: {
              quote: { assetsPaid: assets, collateralSupplied: assets },
            },
          },
        ]);
        {
          const maxAssetsPaid = assets - 1n;
          await expect(
            simulateOrThrow(config, {
              transactions,
              limits: {
                operations: [
                  {
                    type: "midnightSupplyCollateral",
                    marketId: nativeMarketId,
                    market: MarketUtils.toStruct(nativeMarket),
                    collateralIndex,
                    account: user,
                    quote: {
                      assetsPaid: maxAssetsPaid,
                      collateralSupplied: assets,
                    },
                    slippageTolerance: 0n,
                  },
                ],
              },
            }),
          ).rejects.toMatchObject({
            name: ConsumerLimitViolationError.name,
            field: "assetsPaid",
            observed: assets,
            bound: maxAssetsPaid,
            tolerance: 0n,
          });
        }
        await expect(
          simulateOrThrow(config, {
            transactions: [
              approve(direct ? bundles : coreAddress),
              ...authorizations,
              asTransaction(user, tx),
            ],
            limits,
          }),
        ).rejects.toBeInstanceOf(SimulationRevertedError);
        await expect(
          simulateOrThrow(config, {
            transactions: [approve(OTHER), ...transactions],
            limits,
          }),
        ).rejects.toBeInstanceOf(UnexpectedTokenApprovalError);
        await expect(
          simulateOrThrow(config, {
            transactions,
            limits: {
              operations: [
                {
                  type: "midnightSupplyCollateral",
                  marketId: nativeMarketId,
                  market: MarketUtils.toStruct(nativeMarket),
                  collateralIndex,
                  account: OTHER,
                  quote: { assetsPaid: assets, collateralSupplied: assets },
                  slippageTolerance: 0n,
                },
              ],
            },
          }),
        ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
      },
    );
  }
});

describe.sequential("midnightSupplyCollateral limits — Base fork", () => {
  test("a single supply verifies the sender debit and the indexed collateral credit", async ({
    client,
  }) => {
    const user = await setUp(client);
    const tx = supply(parseEther("1"), user);
    const result = await simulateOrThrow(configFor(client), {
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

  test("an in-bundle collateral approval to Midnight passes; one to another spender is rejected", async ({
    client,
  }) => {
    const user = await setUp(client);
    const tx = supply(parseEther("1"), user);
    const approve = (spender: Address) => ({
      from: user,
      to: wNative,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, maxUint256],
      }),
    });
    const limits = toSimulationLimits(tx.action, { owner: user });
    await expect(
      simulateOrThrow(configFor(client), {
        transactions: [approve(midnight), asTransaction(user, tx)],
        limits,
      }),
    ).resolves.toBeDefined();
    await expect(
      simulateOrThrow(configFor(client), {
        transactions: [approve(OTHER), asTransaction(user, tx)],
        limits,
      }),
    ).rejects.toBeInstanceOf(UnexpectedTokenApprovalError);
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
    const result = await simulateOrThrow(configFor(client), {
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
      simulateOrThrow(configFor(client), {
        transactions: [asTransaction(user, first), asTransaction(user, second)],
        limits: toSimulationLimits(first.action, { owner: user }),
      }),
    ).rejects.toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ field: "assetsPaid" }),
        expect.objectContaining({ field: "collateralSupplied" }),
      ]),
    });
  });

  test("collateral supplied for another owner verifies with the caller's onBehalf intent", async ({
    client,
  }) => {
    const user = await setUp(client);
    await authorizeSender(client);
    const tx = supply(parseEther("1"), OTHER);
    const result = await simulateOrThrow(configFor(client), {
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
      transactions: [asTransaction(user, tx)],
    };
    const error = await simulateOrThrow(configFor(client), {
      ...request,
      limits,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SimulationValidationError);
    expect(error).toMatchObject({
      fieldErrors: [
        "limits.operations[0].assetPaid: required for a market the bundle creates",
      ],
    });
    expect((error as Error).message).toContain(
      'If this bundle creates the market, pass the market struct via "market".',
    );
    expect((error as Error).message).toContain(
      "set assetPaid to exactly collateralParams[collateralIndex].token",
    );

    const result = await simulateOrThrow(configFor(client), {
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
    const result = await simulateOrThrow(configFor(client), {
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
    const error = await simulateOrThrow(configFor(client), {
      transactions: [asTransaction(user, delivered)],
      limits: toSimulationLimits(intended.action, { owner: user }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as Error).message).toContain(
      'Limit operation 0 (midnightSupplyCollateral): slippage for "collateralSupplied"',
    );
  });
});
