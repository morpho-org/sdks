import {
  getMidnightAuthorizationRequirement,
  getMidnightBlueBuyCallbackAddress,
  getMidnightBlueBuyCallbackData,
  isRequirementSignature,
  midnightCancelAndMake,
  morphoViemExtension,
} from "@morpho-org/morpho-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import {
  midnightAbi,
  midnightEventsAbi,
  priceRatifierV1Abi,
  rateRatifierV1Abi,
} from "@morpho-org/morpho-sdk/midnight/abis";
import {
  AccrualPosition,
  Market,
  MarketParams,
  Offer,
  Tree,
} from "@morpho-org/morpho-sdk/midnight/entities";
import {
  MarketUtils,
  Payload,
  PriceRatifierV1,
  RateRatifierV1,
} from "@morpho-org/morpho-sdk/midnight/utils";
import {
  type E2eScenario,
  getE2eRuns,
  wrapE2eNative,
} from "@morpho-org/morpho-test";
import {
  createE2eMidnightMarket,
  E2E_MIDNIGHT_WALLETS,
  getE2eTakeableOffers,
  postE2eSetterTree,
} from "@morpho-org/morpho-test/midnight";
import { getChainAddress, getChainAddresses } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  type Chain,
  concatHex,
  decodeEventLog,
  encodeFunctionData,
  erc20Abi,
  ethAddress,
  getAbiItem,
  type Hex,
  isAddressEqual,
  maxUint128,
  maxUint256,
  numberToHex,
  padHex,
  parseAbiItem,
  parseUnits,
  toEventSelector,
  toFunctionSelector,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect } from "vitest";
import {
  ConsumerLimitViolationError,
  LimitAccountMismatchError,
  SimulationRevertedError,
  toSimulationAuthorizations,
  toSimulationLimits,
  UnsupportedLimitActionError,
  UnsupportedOperationError,
} from "../../src/index.js";
import {
  simulateOrThrow,
  simulationClientFor,
} from "../../src/test-helpers/index.js";
import { seededMarketData } from "../setup.js";
import { type E2eAsset, fundE2eAsset, getE2eAssets } from "./assets.js";
import {
  createE2eMarket,
  describeE2e,
  E2E_ACTORS,
  withE2eActor,
} from "./setup.js";
import { prepareE2eTransactions, sendE2eSimulated } from "./simulate.js";

type Client = AnvilTestClient<Chain>;
type SendParams = Parameters<typeof sendE2eSimulated>[1];
type MidnightOutput = {
  readonly getRequirements: SendParams["output"]["getRequirements"];
  readonly buildTx: () => ReturnType<SendParams["output"]["buildTx"]>;
};
type Sent = Awaited<ReturnType<typeof sendE2eSimulated>>;

const fixture = async (
  client: Client,
  params: { chainId: number; asset: E2eAsset },
) => {
  const { chainId, asset } = params;
  const owner = client.account.address;
  const maker = E2E_MIDNIGHT_WALLETS.A;
  const other = E2E_MIDNIGHT_WALLETS.C;
  const now = (await client.getBlock()).timestamp;
  const base = await createE2eMidnightMarket(client, chainId, {
    maturity: (now / 86_400n + 366n) * 86_400n + 54_000n,
  });
  const collateralToken =
    getE2eAssets(chainId).find(
      (candidate) => !isAddressEqual(candidate.address, asset.address),
    )?.address ?? base.params.collateralParams[0]!.token;
  const market = new MarketParams({
    ...base.params,
    loanToken: asset.address,
    collateralParams: base.params.collateralParams.map((collateral) => ({
      ...collateral,
      token: collateralToken,
    })),
  });
  const initial = new Market({ ...base.marketData, params: market });
  for (const account of [owner, maker, other]) {
    await client.setBalance({ address: account, value: parseUnits("100", 18) });
    await fundE2eAsset(client, { token: asset.address, account, amount: "40" });
    await fundE2eAsset(client, {
      token: collateralToken,
      account,
      amount: "40",
    });
  }
  const { decimals } = await fundE2eAsset(client, {
    token: asset.address,
    amount: "40",
  });
  const units = parseUnits("1", decimals);
  const { decimals: collateralDecimals } = await fundE2eAsset(client, {
    token: collateralToken,
    amount: "40",
  });
  const collateralUnit = parseUnits("1", collateralDecimals);
  const collateralAssets = 10n * collateralUnit;
  const oraclePrice = 10n ** BigInt(36 + decimals - collateralDecimals);
  await client.setCode({
    address: market.collateralParams[0]!.oracle,
    bytecode: concatHex([
      "0x7f",
      numberToHex(oraclePrice, { size: 32 }),
      "0x60005260206000f3",
    ]),
  });
  const midnightAddress = getChainAddress(chainId, "midnight");
  const bundles = getChainAddress(chainId, "midnightBundlesV2");
  const midnight = client
    .extend(morphoViemExtension({ supportSignature: false }))
    .morpho.midnight(chainId);
  const common = {
    chainId,
    preview: true,
    wallets: [owner, maker, other, midnightAddress, bundles],
    tokens: [asset.address, collateralToken],
  } as const;
  const send = (
    account: Address,
    request: {
      output: MidnightOutput;
      limits?: SendParams["limits"];
      wallets?: SendParams["wallets"];
    },
  ) => sendMidnight(client, { ...common, account, ...request });
  const snapshot = async (account: Address) => ({
    now: (await client.getBlock()).timestamp,
    marketData: await midnight.getMarketData(MarketUtils.toId(market)),
    positionData: await midnight.getPositionData({
      marketId: MarketUtils.toId(market),
      accountAddress: account,
    }),
    collateralPrices: [oraclePrice],
    deadline: (await client.getBlock()).timestamp + 600n,
    accountAddress: account,
  });
  const seedCollateral = async (account: Address) => {
    await client.approve({
      address: collateralToken,
      account,
      args: [midnightAddress, maxUint256],
    });
    await client.writeContract({
      account,
      address: midnightAddress,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(market), 0n, collateralAssets, account],
    });
  };
  const postOffers = async (
    account: Address,
    { buy, group }: { buy: boolean; group: bigint },
  ) => {
    if (buy)
      await client.approve({
        address: asset.address,
        account,
        args: [midnightAddress, maxUint256],
      });
    else await seedCollateral(account);
    const ratifier = getChainAddress(chainId, "setterRatifier");
    const offer = Offer.create({
      market,
      buy,
      maker: account,
      expiry: market.maturity,
      tick: 5_000n,
      ratifier,
      maxUnits: 4n * units,
      group: padHex(numberToHex(group), { size: 32 }),
    });
    const tree = Tree.create([offer]);
    await postE2eSetterTree(client, { chainId, maker: account, tree });
    const takeableOffers = getE2eTakeableOffers({ tree, units });
    return takeableOffers;
  };
  return {
    client,
    chainId,
    asset,
    owner,
    maker,
    other,
    now,
    market,
    initial,
    units,
    collateralAssets,
    collateralUnit,
    oraclePrice,
    midnightAddress,
    bundles,
    midnight,
    common,
    send,
    snapshot,
    seedCollateral,
    postOffers,
  };
};

const quote = (
  sent: Sent,
  { operation, expected }: { operation: string; expected: object },
) => {
  expect(sent.result.verification.operations).toMatchObject([
    { operation, checkedLimits: { quote: expected, slippageTolerance: 0n } },
  ]);
};

const evidence = (
  sent: Sent,
  params: {
    emitter: Address;
    event: "SetConsumed" | "SetIsAuthorized" | "WithdrawCollateral";
    args: object;
  },
) => {
  const select = (logs: Sent["result"]["calls"][number]["logs"]) =>
    logs
      .filter(
        (log) =>
          isAddressEqual(log.address, params.emitter) &&
          log.topics[0] ===
            toEventSelector(
              getAbiItem({ abi: midnightEventsAbi, name: params.event }),
            ),
      )
      .map(
        ({ data, topics }) =>
          decodeEventLog({
            abi: midnightEventsAbi,
            eventName: params.event,
            data,
            topics: [topics[0]!, ...topics.slice(1)],
          }).args,
      );
  const simulated = select(sent.result.calls.at(-1)!.logs);
  const executed = select(sent.receipts.at(-1)!.logs);
  expect(simulated).toEqual(executed);
  expect(simulated).toEqual(
    expect.arrayContaining([expect.objectContaining(params.args)]),
  );
};

const publicationEvidence = (
  sent: Sent,
  params: { emitter: Address; payload: Hex },
) => {
  const event = parseAbiItem("event Data(bytes data)");
  const select = (logs: Sent["result"]["calls"][number]["logs"]) =>
    logs
      .filter(
        (log) =>
          isAddressEqual(log.address, params.emitter) &&
          log.topics[0] === toEventSelector(event),
      )
      .map(
        ({ data, topics }) =>
          decodeEventLog({
            abi: [event],
            eventName: "Data",
            data,
            topics: [topics[0]!, ...topics.slice(1)],
          }).args,
      );
  const simulated = select(sent.result.calls.at(-1)!.logs);
  expect(simulated).toEqual(select(sent.receipts.at(-1)!.logs));
  expect(simulated).toEqual([{ data: params.payload }]);
};

const sendMidnight = async (
  client: Client,
  params: Omit<SendParams, "output"> & { output: MidnightOutput },
) => {
  const requirements = await params.output.getRequirements();
  const midnightAuthorizations = requirements.filter(
    ({ action }) => action.type === "midnightAuthorization",
  );
  for (const authorization of midnightAuthorizations) {
    if (isRequirementSignature(authorization))
      throw new Error("Expected a Midnight call authorization");
    expect(() =>
      toSimulationAuthorizations({
        owner: params.account,
        requirements: [authorization],
      }),
    ).toThrow(UnsupportedOperationError);
    const authorized = await sendE2eSimulated(client, {
      ...params,
      output: { getRequirements: async () => [], buildTx: () => authorization },
      limits: {},
    });
    evidence(authorized, {
      emitter: getChainAddress(params.chainId, "midnight"),
      event: "SetIsAuthorized",
      args: {
        caller: params.account,
        onBehalf: params.account,
        authorized: getChainAddress(params.chainId, "midnightBundlesV2"),
        newIsAuthorized: true,
      },
    });
  }
  return sendE2eSimulated(client, {
    ...params,
    output: { ...params.output, buildTx: () => params.output.buildTx() },
  });
};

const rejectInvalidStandaloneSupply = async (
  client: Client,
  params: {
    readonly owner: Address;
    readonly output: MidnightOutput;
    readonly market: ReturnType<typeof MarketUtils.toStruct>;
    readonly assets: bigint;
    readonly wrongSpender: Address;
  },
) => {
  const { owner, output, market, assets, wrongSpender } = params;
  const { tx, transactions } = await prepareE2eTransactions(client, {
    account: owner,
    output,
  });
  expect(() => toSimulationLimits(tx.action, { owner: wrongSpender })).toThrow(
    LimitAccountMismatchError,
  );
  const config = simulationClientFor(client.transport.url, client.chain);
  const options = { owner, market, slippageTolerance: 0n };
  const [approval, ...remaining] = transactions;
  expect(approval?.to).not.toBe(tx.to);
  expect(approval?.data?.slice(0, 10)).toBe(
    toFunctionSelector("approve(address,uint256)"),
  );
  await expect(
    simulateOrThrow(config, {
      transactions: [
        {
          ...approval!,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [wrongSpender, maxUint256],
          }),
        },
        ...remaining,
      ],
      limits: toSimulationLimits(tx.action, options),
    }),
  ).rejects.toBeInstanceOf(SimulationRevertedError);
  await expect(
    simulateOrThrow(config, {
      transactions,
      limits: toSimulationLimits(tx.action, {
        ...options,
        expected: { assetsPaid: assets - 1n },
      }),
    }),
  ).rejects.toMatchObject({
    name: ConsumerLimitViolationError.name,
    field: "assetsPaid",
    observed: assets,
    bound: assets - 1n,
  });
};

for (const family of ["collateral", "takes"] as const) {
  const coreScenario = {
    name: `simulationMidnight-${family}`,
    requires: [
      "midnight",
      "midnightBundlesV2",
      ...(family === "takes" ? (["setterRatifier"] as const) : []),
    ],
  } as const satisfies E2eScenario;

  describeE2e(coreScenario, (baseTest, { chainId }) => {
    for (const actor of E2E_ACTORS)
      describe(actor, () => {
        const test = withE2eActor(baseTest, actor);
        describe.each(getE2eAssets(chainId))("$symbol", (asset) => {
          const tags =
            actor === "EOA" && asset.symbol === getE2eAssets(chainId)[0]!.symbol
              ? []
              : ["nightly"];

          const wNative = getChainAddresses(chainId).wNative;
          if (family === "collateral" && wNative !== undefined) {
            const representative =
              getE2eAssets(chainId).find(
                ({ address }) => !isAddressEqual(wNative, address),
              ) ?? getE2eAssets(chainId)[0];
            for (const funding of ["direct", "full", "partial"] as const) {
              const needsFixtureLoan = isAddressEqual(wNative, asset.address);
              if (needsFixtureLoan && asset.symbol !== representative?.symbol)
                continue;
              test(`standalone collateral (${funding})`, {
                tags:
                  actor === "EOA" && asset.symbol === representative?.symbol
                    ? []
                    : ["nightly"],
              }, async ({ client }) => {
                const {
                  owner,
                  midnight,
                  market,
                  initial,
                  midnightAddress,
                  bundles,
                } = await fixture(client, { chainId, asset });
                const nativeMarket = new MarketParams({
                  ...market,
                  loanToken: needsFixtureLoan
                    ? MarketUtils.getCollateralByIndex(market, 0n).token
                    : market.loanToken,
                  collateralParams: market.collateralParams.map(
                    (collateral) => ({
                      ...collateral,
                      token: wNative,
                    }),
                  ),
                });
                const collateralAssets = parseUnits("1", 18);
                const nativeAmount =
                  funding === "direct"
                    ? 0n
                    : funding === "full"
                      ? collateralAssets
                      : collateralAssets / 2n;
                if (nativeAmount < collateralAssets) {
                  await wrapE2eNative(client, {
                    wNative,
                    account: owner,
                    amount: collateralAssets - nativeAmount,
                  });
                }
                const { timestamp: now } = await client.getBlock();
                const params = {
                  accountAddress: owner,
                  marketData: new Market({ ...initial, params: nativeMarket }),
                  collateralAssets,
                  now,
                };
                const output =
                  funding === "direct"
                    ? midnight.supplyCollateral(params)
                    : midnight.supplyCollateralWithNative({
                        ...params,
                        nativeAmount,
                        deadline: now + 600n,
                      });
                const marketStruct = MarketUtils.toStruct(nativeMarket);
                await rejectInvalidStandaloneSupply(client, {
                  owner,
                  output,
                  market: marketStruct,
                  assets: collateralAssets,
                  wrongSpender:
                    funding === "direct" ? bundles : midnightAddress,
                });
                const sent = await sendMidnight(client, {
                  chainId,
                  account: owner,
                  preview: true,
                  wallets: [owner, midnightAddress, bundles],
                  tokens: [wNative, ethAddress],
                  output,
                  limits: {
                    market: marketStruct,
                    slippageTolerance: 0n,
                  },
                });
                quote(sent, {
                  operation: "midnightSupplyCollateral",
                  expected: {
                    assetsPaid: collateralAssets,
                    collateralSupplied: collateralAssets,
                  },
                });
              });
            }
          }

          if (family === "collateral")
            test("direct collateral, batches, single-withdraw limits, authorization and cancellation", {
              tags,
            }, async ({ client }) => {
              const ctx = await fixture(client, { chainId, asset });
              const {
                owner,
                midnight,
                collateralUnit: units,
                market,
                initial,
                midnightAddress,
                bundles,
                send,
                snapshot,
              } = ctx;
              const auth = await getMidnightAuthorizationRequirement({
                viemClient: client,
                chainId,
                owner,
                authorized: bundles,
              });
              expect(auth).not.toBeNull();
              if (auth == null)
                throw new Error("Expected fresh Midnight authorization");
              const authorized = await send(owner, {
                output: {
                  getRequirements: async () => [],
                  buildTx: () => auth,
                },
                limits: {},
              });
              evidence(authorized, {
                emitter: midnightAddress,
                event: "SetIsAuthorized",
                args: {
                  caller: owner,
                  onBehalf: owner,
                  authorized: bundles,
                  newIsAuthorized: true,
                },
              });
              expect(authorized.result.calls).toHaveLength(1);
              const supplied = await send(owner, {
                output: midnight.supplyCollateral({
                  accountAddress: owner,
                  marketData: initial,
                  collateralAssets: units,
                }),
                limits: {
                  market: MarketUtils.toStruct(market),
                  slippageTolerance: 0n,
                },
              });
              quote(supplied, {
                operation: "midnightSupplyCollateral",
                expected: {
                  assetsPaid: units,
                  collateralSupplied: units,
                },
              });
              const batched = await send(owner, {
                output: midnight.supplyCollateralBatch({
                  accountAddress: owner,
                  marketData: await midnight.getMarketData(
                    MarketUtils.toId(market),
                  ),
                  collateralSupplies: [{ collateralIndex: 0n, assets: units }],
                }),
                limits: { slippageTolerance: 0n },
              });
              quote(batched, {
                operation: "midnightSupplyCollateralBatch",
                expected: {
                  collateralSupplies: [{ collateralIndex: 0n, assets: units }],
                },
              });
              const single = midnight.withdrawCollateral({
                ...(await snapshot(owner)),
                assets: units,
              });
              const withdrawn = await send(owner, {
                output: single,
                limits: { slippageTolerance: 0n },
              });
              quote(withdrawn, {
                operation: "midnightWithdrawCollateralBatch",
                expected: {
                  collateralWithdrawals: [
                    { collateralIndex: 0n, assets: units },
                  ],
                },
              });
              evidence(withdrawn, {
                emitter: midnightAddress,
                event: "WithdrawCollateral",
                args: {
                  caller: owner,
                  onBehalf: owner,
                  receiver: owner,
                  assets: units,
                },
              });
              const withdrawnBatch = await send(owner, {
                output: midnight.withdrawCollateralBatch({
                  ...(await snapshot(owner)),
                  collateralWithdrawals: [
                    { collateralIndex: 0n, assets: units },
                  ],
                }),
                limits: { slippageTolerance: 0n },
              });
              quote(withdrawnBatch, {
                operation: "midnightWithdrawCollateralBatch",
                expected: {
                  collateralWithdrawals: [
                    { collateralIndex: 0n, assets: units },
                  ],
                },
              });
              expect((await snapshot(owner)).positionData.collateral[0]).toBe(
                0n,
              );
              for (const groups of [
                [padHex("0x11", { size: 32 })],
                [padHex("0x12", { size: 32 }), padHex("0x13", { size: 32 })],
              ]) {
                const cancellation = midnight.cancelOffers({
                  accountAddress: owner,
                  groups,
                });
                const cancelled = await send(owner, {
                  output: cancellation,
                  limits: {},
                });
                expect(cancelled.result.calls).toHaveLength(1);
                evidence(cancelled, {
                  emitter: midnightAddress,
                  event: "SetConsumed",
                  args: {
                    caller: owner,
                    onBehalf: owner,
                    group: groups[0],
                    amount: maxUint128,
                  },
                });
                const events = cancelled.result.calls
                  .flatMap(({ logs }) => logs)
                  .filter(
                    (log) =>
                      isAddressEqual(log.address, midnightAddress) &&
                      log.topics[0] ===
                        toEventSelector(
                          "SetConsumed(address,bytes32,uint256,address)",
                        ),
                  )
                  .map(({ data, topics }) =>
                    decodeEventLog({
                      abi: midnightEventsAbi,
                      eventName: "SetConsumed",
                      data,
                      topics: [topics[0]!, ...topics.slice(1)],
                    }),
                  );
                expect(events.map(({ args }) => args.group)).toEqual(groups);
                expect(
                  events.every(
                    ({ args }) =>
                      args.amount === maxUint128 &&
                      isAddressEqual(args.onBehalf, owner),
                  ),
                ).toBe(true);
              }
            });

          if (family === "takes")
            test("takeBorrow, full repayWithdrawCollateral and redeem", {
              tags,
            }, async ({ client }) => {
              const {
                owner,
                maker,
                units,
                collateralAssets,
                midnight,
                send,
                snapshot,
                seedCollateral,
                postOffers,
              } = await fixture(client, { chainId, asset });
              await seedCollateral(owner);
              const offers = await postOffers(maker, { buy: true, group: 21n });
              const borrowed = await send(owner, {
                output: midnight.takeBorrow({
                  ...(await snapshot(owner)),
                  target: { type: "units", units, minSellerAssets: units / 2n },
                  takeableOffers: offers,
                }),
                limits: { slippageTolerance: 0n },
              });
              quote(borrowed, {
                operation: "midnightTakeBorrow",
                expected: {
                  unitsSold: units,
                  assetsReceived: units / 2n,
                },
              });
              expect((await snapshot(owner)).positionData.debt).toBe(units);
              const repaid = await send(owner, {
                output: midnight.repayWithdrawCollateral({
                  ...(await snapshot(owner)),
                  repay: { type: "full", maxBuyerAssets: units },
                  collateralWithdrawals: [
                    { collateralIndex: 0n, assets: maxUint256 },
                  ],
                }),
                limits: {
                  slippageTolerance: 0n,
                  expected: {
                    debtRepaid: units,
                    collateralWithdrawals: [
                      { collateralIndex: 0n, assets: collateralAssets },
                    ],
                  },
                },
              });
              quote(repaid, {
                operation: "midnightRepayWithdrawCollateral",
                expected: {
                  assetsPaid: units,
                  debtRepaid: units,
                  collateralWithdrawals: [
                    { collateralIndex: 0n, assets: collateralAssets },
                  ],
                },
              });
              expect((await snapshot(owner)).positionData.debt).toBe(0n);
              expect((await snapshot(owner)).positionData.collateral[0]).toBe(
                0n,
              );
              expect(repaid.result.verification.operations).toMatchObject([
                {
                  checkedLimits: {
                    position: {
                      maxDebt: 0n,
                      maxCollateral: [{ collateralIndex: 0n, assets: 0n }],
                    },
                  },
                },
              ]);
              const redeemed = await send(maker, {
                output: midnight.redeem({
                  accountAddress: maker,
                  positionData: (await snapshot(maker)).positionData,
                  units,
                  now: (await client.getBlock()).timestamp,
                }),
                limits: { slippageTolerance: 0n },
              });
              quote(redeemed, {
                operation: "midnightRedeem",
                expected: {
                  creditRedeemed: units,
                  assetsReceived: units,
                },
              });
              expect((await snapshot(maker)).positionData.credit).toBe(0n);
            });

          if (family === "takes")
            test("supplyCollateralTakeBorrow and offer-based takeRepayWithdrawCollateral", {
              tags,
            }, async ({ client }) => {
              const {
                owner,
                maker,
                other,
                market,
                initial,
                units,
                collateralAssets,
                oraclePrice,
                midnight,
                send,
                snapshot,
                postOffers,
              } = await fixture(client, { chainId, asset });
              const lendOffers = await postOffers(maker, {
                buy: true,
                group: 31n,
              });
              const borrowed = await send(owner, {
                output: midnight.supplyCollateralTakeBorrow({
                  accountAddress: owner,
                  marketData: initial,
                  positionData: new AccrualPosition(
                    {
                      user: owner,
                      credit: 0n,
                      pendingFee: 0n,
                      lastLossFactor: 0n,
                      lastAccrual: 0n,
                      debt: 0n,
                      collateralBitmap: 0n,
                      collateral: [0n],
                    },
                    initial,
                  ),
                  collateralPrices: [oraclePrice],
                  collateralSupplies: [
                    { collateralIndex: 0n, assets: collateralAssets },
                  ],
                  target: { type: "units", units, minSellerAssets: units / 2n },
                  takeableOffers: lendOffers,
                  deadline: (await client.getBlock()).timestamp + 600n,
                  now: (await client.getBlock()).timestamp,
                }),
                limits: {
                  slippageTolerance: 0n,
                  market: MarketUtils.toStruct(market),
                },
              });
              quote(borrowed, {
                operation: "midnightSupplyCollateralTakeBorrow",
                expected: {
                  unitsSold: units,
                  assetsReceived: units / 2n,
                  collateralSupplies: [
                    { collateralIndex: 0n, assets: collateralAssets },
                  ],
                },
              });
              const borrowOffers = await postOffers(other, {
                buy: false,
                group: 32n,
              });
              const repaid = await send(owner, {
                output: midnight.takeRepayWithdrawCollateral({
                  ...(await snapshot(owner)),
                  target: { type: "units", units, maxBuyerAssets: units },
                  takeableOffers: borrowOffers,
                  repayEnabled: false,
                  maxContinuousFee: maxUint256,
                  collateralWithdrawals: [
                    { collateralIndex: 0n, assets: collateralAssets },
                  ],
                }),
                limits: { slippageTolerance: 0n },
              });
              quote(repaid, {
                operation: "midnightTakeRepayWithdrawCollateral",
                expected: {
                  debtRepaid: units,
                  assetsPaid: units,
                },
              });
              expect((await snapshot(owner)).positionData.debt).toBe(0n);
              expect((await snapshot(owner)).positionData.collateral[0]).toBe(
                0n,
              );
              expect((await snapshot(other)).positionData.debt).toBe(units);
            });

          if (family === "takes")
            test("takeLend and takeWithdraw move credit between wallets", {
              tags,
            }, async ({ client }) => {
              const {
                owner,
                maker,
                other,
                units,
                midnight,
                send,
                snapshot,
                postOffers,
              } = await fixture(client, { chainId, asset });
              const borrowOffers = await postOffers(maker, {
                buy: false,
                group: 41n,
              });
              const lent = await send(owner, {
                output: midnight.takeLend({
                  ...(await snapshot(owner)),
                  target: { type: "units", units, maxBuyerAssets: units },
                  takeableOffers: borrowOffers,
                  maxContinuousFee: maxUint256,
                }),
                limits: { slippageTolerance: 0n },
              });
              quote(lent, {
                operation: "midnightTakeLend",
                expected: {
                  unitsBought: units,
                  assetsPaid: units,
                },
              });
              expect((await snapshot(owner)).positionData.credit).toBe(units);
              const lendOffers = await postOffers(other, {
                buy: true,
                group: 42n,
              });
              const withdrawn = await send(owner, {
                output: midnight.takeWithdraw({
                  ...(await snapshot(owner)),
                  target: { type: "units", units, minSellerAssets: units / 2n },
                  takeableOffers: lendOffers,
                }),
                limits: { slippageTolerance: 0n },
              });
              quote(withdrawn, {
                operation: "midnightTakeWithdraw",
                expected: {
                  creditRedeemed: units,
                  assetsReceived: units / 2n,
                },
              });
              expect((await snapshot(owner)).positionData.credit).toBe(0n);
              expect((await snapshot(other)).positionData.credit).toBe(units);
              expect((await snapshot(maker)).positionData.debt).toBe(units);
            });
        });
      });
  });
}

const makerMethods = [
  "makeLend",
  "makeBorrow",
  "makeWithdraw",
  "makeRepay",
  "supplyCollateralMakeBorrow",
  "supplyBlueMakeLend",
] as const;
for (const method of makerMethods) {
  const scenario = {
    name: `simulationMidnightMaker-${method}`,
    requires: [
      "midnight",
      "midnightBundlesV2",
      "midnightMempool",
      "priceRatifierV1",
      "rateRatifierV1",
      ...(method === "makeWithdraw" || method === "makeRepay"
        ? (["setterRatifier"] as const)
        : []),
      ...(method === "supplyBlueMakeLend"
        ? ([
            "blue",
            "adaptiveCurveIrm",
            "midnightBlueBuyCallbackFactory",
          ] as const)
        : []),
    ],
  } as const satisfies E2eScenario;
  if (getE2eRuns({ scenario, env: process.env }).length === 0) continue;
  describeE2e(scenario, (baseTest, { chainId }) => {
    for (const actor of E2E_ACTORS)
      describe(actor, () => {
        const test = withE2eActor(baseTest, actor);
        describe.each(getE2eAssets(chainId))("$symbol", (asset) => {
          for (const ratifierType of ["priceV1", "rateV1"] as const)
            test(`${method} ${ratifierType}: root event and wallet effects match execution`, {
              tags:
                actor === "EOA" &&
                asset.symbol === getE2eAssets(chainId)[0]!.symbol &&
                ratifierType === "priceV1"
                  ? []
                  : ["nightly"],
            }, async ({ client }) => {
              const ctx = await fixture(client, { chainId, asset });
              const {
                owner,
                market,
                units,
                collateralUnit,
                midnight,
                send,
                snapshot,
              } = ctx;
              const buy =
                method === "makeLend" ||
                method === "makeRepay" ||
                method === "supplyBlueMakeLend";
              const reduceOnly =
                method === "makeWithdraw" || method === "makeRepay";
              if (method === "makeWithdraw") {
                const takeableOffers = await ctx.postOffers(ctx.maker, {
                  buy: false,
                  group: 61n,
                });
                await send(owner, {
                  output: midnight.takeLend({
                    ...(await snapshot(owner)),
                    target: { type: "units", units, maxBuyerAssets: units },
                    takeableOffers,
                    maxContinuousFee: maxUint256,
                  }),
                  limits: { slippageTolerance: 0n },
                });
                expect((await snapshot(owner)).positionData.credit).toBe(units);
              }
              if (method === "makeRepay") {
                await ctx.seedCollateral(owner);
                const takeableOffers = await ctx.postOffers(ctx.maker, {
                  buy: true,
                  group: 62n,
                });
                await send(owner, {
                  output: midnight.takeBorrow({
                    ...(await snapshot(owner)),
                    target: {
                      type: "units",
                      units,
                      minSellerAssets: units / 2n,
                    },
                    takeableOffers,
                  }),
                  limits: { slippageTolerance: 0n },
                });
                expect((await snapshot(owner)).positionData.debt).toBe(units);
              }
              let callback: Address = zeroAddress;
              let callbackData: Hex = "0x";
              const callbackSalt = padHex("0x51", { size: 32 });
              const blueMarket =
                method === "supplyBlueMakeLend"
                  ? await createE2eMarket(client, {
                      chainId,
                      loanToken: asset.address,
                    })
                  : undefined;
              let sharesMinted: bigint | undefined;
              if (blueMarket) {
                // Only seed here; the quote uses the returned snapshot before parking.
                const blueData = await seededMarketData(client, blueMarket);
                sharesMinted = blueData.toSupplyShares(units, "Down");
                callback = getMidnightBlueBuyCallbackAddress({
                  chainId,
                  owner,
                  salt: callbackSalt,
                });
                callbackData = getMidnightBlueBuyCallbackData(blueMarket);
              }
              const ratifier = getChainAddress(
                chainId,
                ratifierType === "priceV1"
                  ? "priceRatifierV1"
                  : "rateRatifierV1",
              );
              const offer = Offer.create({
                market,
                buy,
                maker: owner,
                expiry: market.maturity,
                tick: 5_000n,
                ratifier,
                reduceOnly,
                maxUnits: buy ? 0n : units,
                maxAssets: buy ? units : 0n,
                receiverIfMakerIsSeller: buy ? zeroAddress : owner,
                callback,
                callbackData,
              });
              const offers =
                ratifierType === "priceV1"
                  ? Tree.create({ type: "priceV1", entries: [{ offer }] })
                  : Tree.create({
                      type: "rateV1",
                      entries: [{ offer, rate: 1_000_000_000n }],
                    });
              const params = {
                accountAddress: owner,
                offers,
                deadline: maxUint256,
                now: (await client.getBlock()).timestamp,
                validation: false,
              } as const;
              const output = await (() => {
                switch (method) {
                  case "makeLend":
                    return midnight.makeLend({
                      ...params,
                      loanToken: asset.address,
                      loanAssets: units,
                    });
                  case "makeBorrow":
                    return midnight.makeBorrow(params);
                  case "makeWithdraw":
                    return midnight.makeWithdraw(params);
                  case "makeRepay":
                    return midnight.makeRepay({
                      ...params,
                      loanToken: asset.address,
                      loanAssets: units,
                    });
                  case "supplyCollateralMakeBorrow":
                    return midnight.supplyCollateralMakeBorrow({
                      ...params,
                      collateral: {
                        market,
                        supplies: [
                          { collateralIndex: 0n, assets: collateralUnit },
                        ],
                      },
                    });
                  case "supplyBlueMakeLend": {
                    if (!blueMarket)
                      throw new Error("Expected Blue market fixture");
                    return midnight.supplyBlueMakeLend({
                      ...params,
                      blueMarket,
                      callbackSalt,
                      assetsToPark: units,
                    });
                  }
                }
              })();
              const supported =
                method === "supplyCollateralMakeBorrow" ||
                method === "supplyBlueMakeLend";
              if (!supported)
                expect(() =>
                  toSimulationLimits(output.buildTx().action, { owner }),
                ).toThrow(UnsupportedLimitActionError);
              const sent = await send(owner, {
                wallets: [
                  ...ctx.common.wallets,
                  ...(callback === zeroAddress ? [] : [callback]),
                ],
                output,
                limits: supported
                  ? {
                      market: MarketUtils.toStruct(market),
                      slippageTolerance: 0n,
                      ...(method === "supplyBlueMakeLend"
                        ? { expected: { sharesMinted } }
                        : {}),
                    }
                  : "none",
              });
              const abi =
                ratifierType === "priceV1"
                  ? priceRatifierV1Abi
                  : rateRatifierV1Abi;
              const rootEvents = (
                logs: Sent["result"]["calls"][number]["logs"],
              ) =>
                logs
                  .filter(
                    (log) =>
                      isAddressEqual(log.address, ratifier) &&
                      log.topics[0] ===
                        toEventSelector(
                          getAbiItem({ abi, name: "SetIsRootRatified" }),
                        ),
                  )
                  .map(
                    ({ data, topics }) =>
                      decodeEventLog({
                        abi,
                        eventName: "SetIsRootRatified",
                        data,
                        topics: [topics[0]!, ...topics.slice(1)],
                      }).args,
                  );
              const simulated = rootEvents(
                sent.result.calls.flatMap(({ logs }) => logs),
              );
              expect(simulated).toEqual(
                rootEvents(sent.receipts.flatMap(({ logs }) => logs)),
              );
              expect(simulated).toMatchObject([
                { maker: owner, root: offers.root, newIsRootRatified: true },
              ]);
              publicationEvidence(sent, {
                emitter: getChainAddress(chainId, "midnightMempool"),
                payload: await Payload.encode(
                  offers.type === "priceV1"
                    ? PriceRatifierV1.ratify({ tree: offers })
                    : RateRatifierV1.ratify({ tree: offers }),
                ),
              });
              let groupToCancel = output.groups[0]!;
              if (method === "makeLend" && ratifierType === "priceV1") {
                expect(output.groups).toEqual([
                  PriceRatifierV1.groupId([{ offer }]),
                ]);
                const replacementOffers = Tree.create({
                  type: "priceV1",
                  entries: [
                    {
                      offer: Offer.create({
                        ...offer,
                        group: padHex("0x71", { size: 32 }),
                      }),
                    },
                  ],
                });
                const replacement = await midnight.makeLend({
                  ...params,
                  now: (await client.getBlock()).timestamp,
                  offers: replacementOffers,
                  loanToken: asset.address,
                  loanAssets: units,
                  cancellations: [
                    { group: output.groups[0]!, maxConsumed: 0n },
                  ],
                });
                expect(replacement.root).not.toBe(output.root);
                const replaced = await send(owner, {
                  output: replacement,
                  limits: "none",
                });
                evidence(replaced, {
                  emitter: ctx.midnightAddress,
                  event: "SetConsumed",
                  args: {
                    onBehalf: owner,
                    group: output.groups[0],
                    amount: maxUint128,
                  },
                });
                const replacementRoots = rootEvents(
                  replaced.result.calls.at(-1)!.logs,
                );
                expect(replacementRoots).toEqual(
                  rootEvents(replaced.receipts.at(-1)!.logs),
                );
                expect(replacementRoots).toMatchObject([
                  {
                    maker: owner,
                    root: replacement.root,
                    newIsRootRatified: true,
                  },
                ]);
                publicationEvidence(replaced, {
                  emitter: getChainAddress(chainId, "midnightMempool"),
                  payload: await Payload.encode(
                    PriceRatifierV1.ratify({ tree: replacementOffers }),
                  ),
                });
                groupToCancel = replacement.groups[0]!;
              }
              if (method === "supplyCollateralMakeBorrow") {
                quote(sent, {
                  operation: "midnightSupplyCollateralMakeBorrow",
                  expected: {
                    assetsPaid: collateralUnit,
                    collateralSupplied: collateralUnit,
                  },
                });
                expect((await snapshot(owner)).positionData.collateral[0]).toBe(
                  collateralUnit,
                );
              }
              if (method === "supplyBlueMakeLend") {
                quote(sent, {
                  operation: "midnightSupplyBlueMakeLend",
                  expected: {
                    assetsPaid: units,
                    sharesMinted,
                  },
                });
                const [supplyShares] = await client.readContract({
                  address: getChainAddress(chainId, "blue"),
                  abi: blueAbi,
                  functionName: "position",
                  args: [blueMarket!.id, callback],
                });
                expect(supplyShares).toBe(sharesMinted);
              }
              const cancellation = midnightCancelAndMake({
                chainId,
                cancellations: [{ group: groupToCancel, maxConsumed: 0n }],
                deadline: maxUint256,
              });
              expect(() =>
                toSimulationLimits(cancellation.action, { owner }),
              ).toThrow(UnsupportedLimitActionError);
              const cancelled = await send(owner, {
                output: {
                  getRequirements: async () => [],
                  buildTx: () => cancellation,
                },
                limits: "none",
              });
              evidence(cancelled, {
                emitter: ctx.midnightAddress,
                event: "SetConsumed",
                args: {
                  onBehalf: owner,
                  group: groupToCancel,
                  amount: maxUint128,
                },
              });
              expect(zeroHash).not.toBe(output.root);
            });
        });
      });
  });
}
