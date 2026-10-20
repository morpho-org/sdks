import {
  type IOffer,
  Market,
  MarketParams,
  MarketUtils,
  midnightAbi,
  Offer,
  RateRatifierV1,
  RateRatifierV1BoundOverflowError,
  Tree,
} from "@morpho-org/midnight-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient } from "@morpho-org/test/mock";
import {
  decodeFunctionData,
  encodeFunctionResult,
  type Hex,
  maxUint256,
  parseAbi,
} from "viem";
import { base } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  midnightAddresses,
  midnightBaseOffer,
  midnightChainId,
  midnightMarket,
} from "../../../test/fixtures/midnight.js";
import { ChainIdMismatchError } from "../../types/index.js";
import {
  MidnightMarketLiquidationCursorNotEnabledError,
  MidnightMarketLltvNotEnabledError,
  MidnightMarketMaturityTooFarError,
  MidnightMarketOracleWithoutCodeError,
  MidnightOfferCallbackNotSupportedError,
  MidnightOfferContinuousFeeCapBelowMarketFeeError,
  MidnightOfferExpiredError,
  MidnightOfferExpiryAfterMaturityError,
  MidnightOfferGroupConsumedError,
  MidnightOfferNoCreditError,
  MidnightOfferNoDebtError,
  MidnightOfferRateBoundUnreachableError,
  MidnightOfferTickSpacingError,
  MidnightOfferZeroPriceSellError,
} from "../../types/midnightPublicationError.js";
import {
  fetchMidnightMakerOfferStates,
  type MidnightMakerOfferState,
  validateMidnightMakerOfferCallbacks,
  validateMidnightMakerOfferStates,
} from "./publication.js";

const priceRatifier = getChainAddress(midnightChainId, "priceRatifierV1");
const rateRatifier = getChainAddress(midnightChainId, "rateRatifierV1");
const maturity = 2_000n;
const group = `0x${"11".repeat(32)}` as const;

const marketParams = (marketMaturity = maturity) =>
  new MarketParams({ ...midnightMarket, maturity: marketMaturity });

const offer = (overrides: Partial<IOffer> = {}) =>
  Offer.create(
    midnightBaseOffer({
      market: marketParams(),
      ratifier: priceRatifier,
      expiry: 1_500n,
      tick: 5_000n,
      group,
      maxUnits: 100n,
      maxAssets: 0n,
      ...overrides,
    }),
  );

const uncheckedOffer = (overrides: Partial<IOffer> = {}) =>
  new Offer(
    midnightBaseOffer({
      market: marketParams(),
      ratifier: priceRatifier,
      expiry: 1_500n,
      tick: 5_000n,
      group,
      maxUnits: 100n,
      maxAssets: 0n,
      ...overrides,
    }),
  );

const priceTree = (...offers: readonly Offer[]) =>
  Tree.create({
    type: "priceV1",
    entries: offers.map((entry) => ({ offer: entry })),
  });

const rateTree = (entryOffer: Offer, rate: bigint) =>
  Tree.create({
    type: "rateV1",
    entries: [{ offer: entryOffer, rate }],
  });

const aggregate3Abi = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
]);
const defaultContinuousFeeAbi = parseAbi([
  "function defaultContinuousFee(address loanToken) view returns (uint32)",
]);

const market = (
  overrides: {
    readonly tickSpacing?: number;
    readonly continuousFee?: number;
    readonly settlementFeeCbps?: readonly [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
  } = {},
) =>
  new Market({
    params: marketParams(),
    totalUnits: 1_000n,
    lossFactor: 0n,
    withdrawable: 1_000n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: overrides.settlementFeeCbps ?? [0, 0, 0, 0, 0, 0, 0],
    continuousFee: overrides.continuousFee ?? 0,
    tickSpacing: overrides.tickSpacing ?? 4,
  });

const state = (
  overrides: Partial<MidnightMakerOfferState> = {},
): MidnightMakerOfferState => ({
  consumed: 0n,
  tickSpacing: 4,
  continuousFee: 0n,
  credit: 1n,
  debt: 1n,
  market: market(),
  lltvEnabled: [true],
  liquidationCursorEnabled: [true],
  oracleHasCode: [true],
  ...overrides,
});

const validate = (params: {
  readonly offer: Offer;
  readonly state?: MidnightMakerOfferState;
  readonly now?: bigint;
  readonly marketCreationTime?: "expiry" | "now";
}) =>
  validateMidnightMakerOfferStates({
    tree: priceTree(params.offer),
    states: [params.state ?? state()],
    now: params.now ?? 1_000n,
    marketCreationTime: params.marketCreationTime,
  });

describe("validateMidnightMakerOfferStates", () => {
  test("rejects expiry equal to now and accepts expiry one second later", () => {
    expect(() => validate({ offer: offer({ expiry: 1_000n }) })).toThrow(
      MidnightOfferExpiredError,
    );
    expect(() => validate({ offer: offer({ expiry: 1_001n }) })).not.toThrow();
  });

  test("rejects expiry after market maturity", () => {
    expect(() => validate({ offer: offer({ expiry: maturity + 1n }) })).toThrow(
      MidnightOfferExpiryAfterMaturityError,
    );
  });

  test("rejects a fully consumed group but allows a partially consumed group", () => {
    expect(() =>
      validate({ offer: offer(), state: state({ consumed: 100n }) }),
    ).toThrow(MidnightOfferGroupConsumedError);
    expect(() =>
      validate({
        offer: offer({ maxUnits: 0n, maxAssets: 100n }),
        state: state({ consumed: 2n ** 128n - 1n }),
      }),
    ).toThrow(MidnightOfferGroupConsumedError);
    expect(() =>
      validate({ offer: offer(), state: state({ consumed: 40n }) }),
    ).not.toThrow();
  });

  test("allows an unused buy capacity below the settlement fee", () => {
    const lowPriceBuy = offer({
      buy: true,
      tick: 6_744n,
      maxAssets: 0n,
      maxUnits: 100n,
    });
    expect(() =>
      validate({
        offer: lowPriceBuy,
        state: state({
          market: market({
            settlementFeeCbps: [
              10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000,
            ],
          }),
        }),
      }),
    ).not.toThrow();
  });

  test("rejects ticks that do not match market spacing", () => {
    const error = (() => {
      try {
        validate({
          offer: uncheckedOffer({ tick: 5n }),
          state: state({ tickSpacing: 0 }),
        });
      } catch (cause) {
        return cause;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(MidnightOfferTickSpacingError);
    expect(error).toMatchObject({ tickSpacing: 4 });
  });

  test("rejects continuous fees above the offer cap", () => {
    expect(() =>
      validate({ offer: offer(), state: state({ continuousFee: 1n }) }),
    ).toThrow(MidnightOfferContinuousFeeCapBelowMarketFeeError);
  });

  test("rejects an uncreated market whose default fee exceeds the offer cap", () => {
    expect(() =>
      validate({
        offer: offer(),
        state: state({
          tickSpacing: 0,
          continuousFee: 1n,
          market: market({ tickSpacing: 0, continuousFee: 1 }),
        }),
      }),
    ).toThrow(MidnightOfferContinuousFeeCapBelowMarketFeeError);
  });

  test("rejects zero-price sells", () => {
    expect(() => validate({ offer: offer({ tick: 0n }) })).toThrow(
      MidnightOfferZeroPriceSellError,
    );
  });

  test("rejects unreachable Rate V1 sell bounds", () => {
    const unreachableSell = offer({
      tick: 5_000n,
      ratifier: rateRatifier,
    });
    expect(() =>
      validateMidnightMakerOfferStates({
        tree: rateTree(unreachableSell, 0n),
        states: [state()],
        now: 1_000n,
      }),
    ).toThrow(MidnightOfferRateBoundUnreachableError);
  });

  test("rejects an overflowing Rate V1 sell bound", () => {
    const sell = offer({ tick: 5_000n, ratifier: rateRatifier });
    expect(() =>
      validateMidnightMakerOfferStates({
        tree: rateTree(sell, maxUint256),
        states: [state()],
        now: 1_000n,
      }),
    ).toThrow(MidnightOfferRateBoundUnreachableError);
  });

  test("matches Rate V1 sell overflow boundaries at tMax and tMax + 1", () => {
    const rates = [maxUint256 / 600n, maxUint256 / 300n, maxUint256 / 150n];
    const maxSafeNumerator = maxUint256 - 10n ** 36n - 10n ** 18n + 1n;

    for (const rate of rates) {
      const tMax = maxSafeNumerator / rate;
      const sell = offer({
        market: marketParams(tMax + 2n),
        expiry: tMax + 2n,
        start: 0n,
        tick: 5_000n,
        ratifier: rateRatifier,
      });

      expect(
        RateRatifierV1.priceBound({
          rate,
          timeToMaturity: tMax,
          buy: false,
        }),
      ).toBeGreaterThan(0n);
      expect(() =>
        RateRatifierV1.priceBound({
          rate,
          timeToMaturity: tMax + 1n,
          buy: false,
        }),
      ).toThrow(RateRatifierV1BoundOverflowError);
      expect(
        RateRatifierV1.isPriceAcceptable({
          offer: sell,
          rate,
          timestamp: 2n,
        }),
      ).toBe(true);
      expect(
        RateRatifierV1.isPriceAcceptable({
          offer: sell,
          rate,
          timestamp: 1n,
        }),
      ).toBe(false);
    }
  });

  test("allows a Rate V1 sell when its bound overflow clears before expiry", () => {
    const sell = offer({
      tick: 5_000n,
      expiry: 1_500n,
      ratifier: rateRatifier,
    });
    expect(() =>
      validateMidnightMakerOfferStates({
        tree: rateTree(sell, maxUint256 / 600n),
        states: [state()],
        now: 1_000n,
      }),
    ).not.toThrow();
  });

  test("rejects a Rate V1 sell when its bound overflow clears after expiry", () => {
    const sell = offer({
      tick: 5_000n,
      expiry: 1_400n,
      ratifier: rateRatifier,
    });
    expect(() =>
      validateMidnightMakerOfferStates({
        tree: rateTree(sell, maxUint256 / 600n),
        states: [state()],
        now: 1_000n,
      }),
    ).toThrow(MidnightOfferRateBoundUnreachableError);
  });

  test("allows a buy that becomes fillable at expiry", () => {
    const expiryBuy = offer({
      buy: true,
      expiry: maturity,
      tick: 6_744n,
      ratifier: rateRatifier,
    });
    expect(() =>
      validateMidnightMakerOfferStates({
        tree: rateTree(expiryBuy, 1_000_000_000_000_000_000n),
        states: [state()],
        now: 1_000n,
      }),
    ).not.toThrow();
  });

  test("rejects a Rate V1 buy that is unacceptable even at expiry", () => {
    const expiryBuy = offer({
      buy: true,
      expiry: 1_500n,
      tick: 6_744n,
      ratifier: rateRatifier,
    });
    expect(() =>
      validateMidnightMakerOfferStates({
        tree: rateTree(expiryBuy, maxUint256),
        states: [state()],
        now: 1_000n,
      }),
    ).toThrow(MidnightOfferRateBoundUnreachableError);
  });

  test("rejects reduce-only offers without the matching position", () => {
    expect(() =>
      validate({
        offer: offer({ buy: true, reduceOnly: true }),
        state: state({ debt: 0n }),
      }),
    ).toThrow(MidnightOfferNoDebtError);
    expect(() =>
      validate({
        offer: offer({ reduceOnly: true }),
        state: state({ credit: 0n }),
      }),
    ).toThrow(MidnightOfferNoCreditError);
  });

  test("checks uncreated-market maturity against the latest creation time", () => {
    const maxTimeToMaturity = 100n * 365n * 86_400n;
    expect(() =>
      validate({
        offer: offer({ market: marketParams(1_500n + maxTimeToMaturity) }),
        state: state({ tickSpacing: 0 }),
      }),
    ).not.toThrow();
    expect(() =>
      validate({
        offer: offer({
          market: marketParams(1_500n + maxTimeToMaturity + 1n),
        }),
        state: state({ tickSpacing: 0 }),
      }),
    ).toThrow(MidnightMarketMaturityTooFarError);
    expect(() =>
      validate({
        offer: offer({ market: marketParams(1_000n + maxTimeToMaturity) }),
        state: state({ tickSpacing: 0 }),
        marketCreationTime: "now",
      }),
    ).not.toThrow();
    expect(() =>
      validate({
        offer: offer({
          market: marketParams(1_000n + maxTimeToMaturity + 1n),
        }),
        state: state({ tickSpacing: 0 }),
        marketCreationTime: "now",
      }),
    ).toThrow(MidnightMarketMaturityTooFarError);
  });

  test("checks uncreated-market collateral settings", () => {
    expect(() =>
      validate({
        offer: offer(),
        state: state({ tickSpacing: 0, lltvEnabled: [false] }),
      }),
    ).toThrow(MidnightMarketLltvNotEnabledError);
    expect(() =>
      validate({
        offer: offer(),
        state: state({ tickSpacing: 0, liquidationCursorEnabled: [false] }),
      }),
    ).toThrow(MidnightMarketLiquidationCursorNotEnabledError);
    expect(() =>
      validate({
        offer: offer(),
        state: state({ tickSpacing: 0, oracleHasCode: [false] }),
      }),
    ).toThrow(MidnightMarketOracleWithoutCodeError);
  });
});

describe("validateMidnightMakerOfferCallbacks", () => {
  test("rejects nonzero callbacks and allows the zero address", () => {
    expect(() =>
      validateMidnightMakerOfferCallbacks([
        offer({ callback: midnightAddresses.maker }),
      ]),
    ).toThrow(MidnightOfferCallbackNotSupportedError);
    expect(() =>
      validateMidnightMakerOfferCallbacks([
        offer({ callback: "0x0000000000000000000000000000000000000000" }),
      ]),
    ).not.toThrow();
  });
});

describe("fetchMidnightMakerOfferStates", () => {
  test("rejects an RPC chain mismatch before any state reads", async () => {
    const handle = createMockClient(base);
    handle.request.mockResolvedValue("0x1");

    await expect(
      fetchMidnightMakerOfferStates({
        client: handle.client,
        chainId: midnightChainId,
        tree: priceTree(offer()),
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(handle.request.mock.calls.map(([{ method }]) => method)).toEqual([
      "eth_chainId",
    ]);
  });

  test("decodes interleaved collateral reads across created and uncreated markets", async () => {
    const secondCursor = 300_000_000_000_000_000n;
    const twoCollateralMarket = new MarketParams({
      ...midnightMarket,
      maturity: maturity + 1n,
      collateralParams: [
        midnightMarket.collateralParams[0]!,
        {
          ...midnightMarket.collateralParams[0]!,
          token: "0x0000000000000000000000000000000000007100",
          liquidationCursor: secondCursor,
        },
      ],
    });
    const uncreatedOffer = offer({
      market: twoCollateralMarket,
      continuousFeeCap: 37n,
    });
    const createdOffer = offer({ market: marketParams() });
    const tree = priceTree(uncreatedOffer, createdOffer);
    const uncreatedMarketId = MarketUtils.toId(twoCollateralMarket);
    const handle = createMockClient(base);
    const block = {
      baseFeePerGas: "0x0",
      difficulty: "0x0",
      extraData: "0x",
      gasLimit: "0x1c9c380",
      gasUsed: "0x0",
      hash: `0x${"01".repeat(32)}`,
      logsBloom: `0x${"00".repeat(256)}`,
      miner: midnightAddresses.maker,
      mixHash: `0x${"02".repeat(32)}`,
      nonce: "0x0000000000000000",
      number: "0x1396",
      parentHash: `0x${"03".repeat(32)}`,
      receiptsRoot: `0x${"04".repeat(32)}`,
      sha3Uncles: `0x${"05".repeat(32)}`,
      stateRoot: `0x${"06".repeat(32)}`,
      timestamp: "0x3e8",
      totalDifficulty: "0x0",
      transactions: [],
      transactionsRoot: `0x${"07".repeat(32)}`,
    };
    handle.request.mockImplementation(async ({ method, params }) => {
      if (method === "eth_chainId") return `0x${base.id.toString(16)}`;
      if (method === "eth_blockNumber") return "0x1396";
      if (method === "eth_getBlockByNumber") return block;
      if (method === "eth_getCode") return "0x01";
      if (method === "eth_call") {
        const transaction = params?.[0] as { data: Hex };
        const aggregate = decodeFunctionData({
          abi: aggregate3Abi,
          data: transaction.data,
        });
        if (aggregate.functionName !== "aggregate3") {
          throw new Error(`unexpected multicall ${aggregate.functionName}`);
        }
        const results = aggregate.args[0].map(({ callData }) => {
          const call = decodeFunctionData({ abi: midnightAbi, data: callData });
          switch (call.functionName) {
            case "marketState": {
              const uncreated =
                call.args[0].toLowerCase() === uncreatedMarketId.toLowerCase();
              return {
                success: true,
                returnData: encodeFunctionResult({
                  abi: midnightAbi,
                  functionName: "marketState",
                  result: [
                    1n,
                    0n,
                    0n,
                    0n,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    uncreated ? 0 : 4,
                  ],
                }),
              };
            }
            case "defaultContinuousFee":
              return {
                success: true,
                returnData: encodeFunctionResult({
                  abi: defaultContinuousFeeAbi,
                  functionName: "defaultContinuousFee",
                  result: 37,
                }),
              };
            case "consumed":
              return {
                success: true,
                returnData: encodeFunctionResult({
                  abi: midnightAbi,
                  functionName: "consumed",
                  result: 0n,
                }),
              };
            case "credit":
            case "debt":
              return {
                success: true,
                returnData: encodeFunctionResult({
                  abi: midnightAbi,
                  functionName: call.functionName,
                  result: 1n,
                }),
              };
            case "isLltvEnabled":
              return {
                success: true,
                returnData: encodeFunctionResult({
                  abi: midnightAbi,
                  functionName: "isLltvEnabled",
                  result: true,
                }),
              };
            case "isLiquidationCursorEnabled":
              return {
                success: true,
                returnData: encodeFunctionResult({
                  abi: midnightAbi,
                  functionName: "isLiquidationCursorEnabled",
                  result: call.args[0] !== secondCursor,
                }),
              };
            default:
              throw new Error(`unexpected Midnight read ${call.functionName}`);
          }
        });
        return encodeFunctionResult({
          abi: aggregate3Abi,
          functionName: "aggregate3",
          result: results,
        });
      }
      throw new Error(`unexpected RPC ${method}`);
    });

    const { states, now } = await fetchMidnightMakerOfferStates({
      client: handle.client,
      chainId: midnightChainId,
      tree,
      blockNumber: 5_022n,
    });
    expect(
      states.map(({ tickSpacing, continuousFee }) => ({
        tickSpacing,
        continuousFee,
      })),
    ).toEqual([
      { tickSpacing: 0, continuousFee: 37n },
      { tickSpacing: 4, continuousFee: 0n },
    ]);
    const ethCalls = handle.request.mock.calls.filter(
      ([{ method }]) => method === "eth_call",
    );
    const ethGetCodeCalls = handle.request.mock.calls.filter(
      ([{ method }]) => method === "eth_getCode",
    );
    expect(ethCalls).not.toHaveLength(0);
    expect(ethGetCodeCalls).not.toHaveLength(0);
    expect(
      [...ethCalls, ...ethGetCodeCalls].every(
        ([{ params }]) => params?.[1] === "0x139e",
      ),
    ).toBe(true);
    let error: unknown;
    try {
      validateMidnightMakerOfferStates({ tree, states, now });
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(
      MidnightMarketLiquidationCursorNotEnabledError,
    );
    expect(error).toMatchObject({ index: 0, liquidationCursor: secondCursor });
  });
});
