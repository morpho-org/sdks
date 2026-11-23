import {
  InvalidPositionAccrualStateError,
  InvalidPositionLossFactorError,
} from "@morpho-org/morpho-ts";
import { midnightMarketAbi } from "@morpho-org/morpho-ts/abis/midnight";
import { encodeAbiParameters, zeroAddress } from "viem";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  ADAPTER,
  market as createMarket,
  EMPTY_HEX,
  LIQUIDITY_ADAPTER,
  marketParams,
  RECIPIENT,
  vaultV2AdapterInput,
  vaultV2Input,
} from "../../__test__/fixtures.js";
import { InvalidVaultV2MidnightAdapterMarketsError } from "../../errors.js";
import { MathLib } from "../../math/index.js";
import { CapacityLimitReason } from "../../utils.js";
import {
  AccrualVaultV2MidnightAdapter,
  type IAccrualVaultV2MidnightAdapter,
} from "./AccrualVaultV2MidnightAdapter.js";
import { AccrualVaultV2 } from "./VaultV2.js";
import type { IAccrualVaultV2Adapter } from "./VaultV2Adapter.js";
import {
  type IVaultV2MidnightAdapterAccrualMarket,
  type IVaultV2MidnightAdapterMarketData,
  VaultV2MidnightAdapterUtils,
} from "./VaultV2MidnightAdapterUtils.js";
import { AccrualVaultV2MorphoMarketV1AdapterV2 } from "./VaultV2MorphoMarketV1AdapterV2.js";

const ADDRESS = "0x0000000000000000000000000000000000000001" as const;
const OTHER = "0x0000000000000000000000000000000000000002" as const;
const MAX_UINT_128 = (1n << 128n) - 1n;
const ID = `0x${"01".padStart(64, "0")}` as const;
const SECOND_ID = `0x${"02".padStart(64, "0")}` as const;

function adapterInput() {
  return {
    ...vaultV2AdapterInput({ address: ADDRESS }),
    type: "VaultV2MidnightAdapter" as const,
    asset: ADDRESS,
    midnight: OTHER,
    marketIds: [],
    marketData: {},
    durations: [],
    durationAllocations: [],
    maxTtm: 1000n,
    minNetBuyRate: 0n,
    maxNetSellRate: 0n,
    shortfallAllowance: 0n,
    enterGateFactory: zeroAddress,
  };
}

function accrualMarket(
  overrides: Partial<IVaultV2MidnightAdapterAccrualMarket> = {},
): IVaultV2MidnightAdapterAccrualMarket {
  return {
    id: ID,
    position: {
      credit: 1_000n,
      pendingFee: 0n,
      lastLossFactor: 0n,
      lastAccrual: 100n,
    },
    market: { lossFactor: 0n },
    ...overrides,
  };
}

function accrualAdapter(
  markets: readonly IVaultV2MidnightAdapterAccrualMarket[] = [accrualMarket()],
  {
    lastUpdate = 100n,
    marketDataOverrides = {},
  }: {
    readonly lastUpdate?: bigint;
    readonly marketDataOverrides?: Readonly<
      Record<string, Partial<IVaultV2MidnightAdapterMarketData>>
    >;
  } = {},
) {
  const marketData = Object.fromEntries(
    markets.map((market, index) => [
      market.id,
      {
        netCredit:
          BigInt(market.position.credit) - BigInt(market.position.pendingFee),
        netRate: MathLib.WAD / 100n,
        maturity: 200n,
        index: BigInt(index),
        forceSellable: false,
        forceRemoved: false,
        minForceSellPrice: 0n,
        ...marketDataOverrides[market.id],
      },
    ]),
  );

  return new AccrualVaultV2MidnightAdapter({
    adapter: {
      ...adapterInput(),
      marketIds: markets.map(({ id }) => id),
      marketData,
    },
    markets,
    lastUpdate,
  });
}

describe("AccrualVaultV2MidnightAdapter", () => {
  test("behavior: realAssets does not discount backward before lastUpdate", () => {
    const adapter = accrualAdapter();
    const snapshotAssets = adapter.realAssets(adapter.lastUpdate);

    expect(snapshotAssets).toBe(500n);
    expect(adapter.realAssets(adapter.lastUpdate - 1n)).toBe(snapshotAssets);
    expect(adapter.realAssets(0n)).toBe(snapshotAssets);
  });

  test("behavior: realAssets is non-decreasing from lastUpdate through maturity", () => {
    const adapter = accrualAdapter();
    const timestamps = [adapter.lastUpdate, 150n, 199n, 200n, 250n];
    let previousAssets = adapter.realAssets(adapter.lastUpdate);

    for (const timestamp of timestamps) {
      const assets = adapter.realAssets(timestamp);
      expect(assets).toBeGreaterThanOrEqual(previousAssets);
      previousAssets = assets;
    }

    expect(previousAssets).toBe(1_000n);
  });

  test("exposes normalized bigint position and loss-factor values", () => {
    const adapter = accrualAdapter();

    expectTypeOf<IAccrualVaultV2MidnightAdapter>().toExtend<IAccrualVaultV2Adapter>();
    expectTypeOf<
      IAccrualVaultV2MidnightAdapter["type"]
    >().toEqualTypeOf<"VaultV2MidnightAdapter">();
    expectTypeOf(adapter.markets[0]!.position.credit).toEqualTypeOf<bigint>();
    expectTypeOf(adapter.markets[0]!.market.lossFactor).toEqualTypeOf<bigint>();
    expectTypeOf(
      adapter.markets[0]!.position.credit -
        adapter.markets[0]!.position.pendingFee,
    ).toEqualTypeOf<bigint>();
  });

  test("behavior: empty adapter", () => {
    const adapter = new AccrualVaultV2MidnightAdapter({
      adapter: adapterInput(),
      markets: [],
      lastUpdate: 100n,
    });
    const t = 150n;

    expect(adapter.realAssets(t)).toBe(0n);

    const accrued = adapter.accrueInterest(t);
    expect(accrued.markets).toEqual([]);
    expect(accrued.lastUpdate).toBe(t);

    expect(
      VaultV2MidnightAdapterUtils.realAssets(
        { marketIds: [], marketData: {} },
        [],
        t,
      ),
    ).toBe(0n);
  });

  test("error: constructor rejects a held market id without market data", () => {
    const market = accrualMarket();
    const adapter = accrualAdapter([market]);

    expect(
      () =>
        new AccrualVaultV2MidnightAdapter({
          adapter: { ...adapter, marketData: {} },
          markets: [market],
          lastUpdate: 100n,
        }),
    ).toThrow(InvalidVaultV2MidnightAdapterMarketsError);
  });

  test("error: constructor rejects a held market id without a position entry", () => {
    const market = accrualMarket();
    const adapter = accrualAdapter([market]);

    expect(
      () =>
        new AccrualVaultV2MidnightAdapter({
          adapter,
          markets: [],
          lastUpdate: 100n,
        }),
    ).toThrow(InvalidVaultV2MidnightAdapterMarketsError);
  });

  test("error: constructor rejects a position for an id absent from marketIds", () => {
    const market = accrualMarket();
    const adapter = accrualAdapter([market]);

    expect(
      () =>
        new AccrualVaultV2MidnightAdapter({
          adapter,
          markets: [accrualMarket({ id: SECOND_ID })],
          lastUpdate: 100n,
        }),
    ).toThrow(InvalidVaultV2MidnightAdapterMarketsError);
  });

  test("error: constructor rejects duplicate position entries for a market id", () => {
    const market = accrualMarket();
    const adapter = accrualAdapter([market]);

    expect(
      () =>
        new AccrualVaultV2MidnightAdapter({
          adapter,
          markets: [market, market],
          lastUpdate: 100n,
        }),
    ).toThrow(InvalidVaultV2MidnightAdapterMarketsError);
  });

  test("error: constructor rejects duplicate market ids", () => {
    const market = accrualMarket();
    const adapter = accrualAdapter([market]);

    expect(
      () =>
        new AccrualVaultV2MidnightAdapter({
          adapter: { ...adapter, marketIds: [ID, ID] },
          markets: [market],
          lastUpdate: 100n,
        }),
    ).toThrow(InvalidVaultV2MidnightAdapterMarketsError);
  });

  test("error: constructor rejects market data for an unheld market id", () => {
    const market = accrualMarket();
    const data = {
      netCredit: 1_000n,
      netRate: 0n,
      maturity: 200n,
      index: 0n,
      forceSellable: false,
      forceRemoved: false,
      minForceSellPrice: 0n,
    };
    const adapter = {
      ...adapterInput(),
      marketIds: [ID],
      marketData: {
        [ID]: data,
        [SECOND_ID]: { ...data, netCredit: 1n, index: 1n },
      },
    };

    expect(
      () =>
        new AccrualVaultV2MidnightAdapter({
          adapter,
          markets: [market],
          lastUpdate: 100n,
        }),
    ).toThrow(InvalidVaultV2MidnightAdapterMarketsError);
  });

  test("error: realAssets rejects a loss factor below the position snapshot", () => {
    const adapter = accrualAdapter([
      accrualMarket({
        position: {
          credit: 1_000n,
          pendingFee: 0n,
          lastLossFactor: 2n,
          lastAccrual: 100n,
        },
        market: { lossFactor: 1n },
      }),
    ]);

    expect(() => adapter.realAssets(150n)).toThrow(
      InvalidPositionLossFactorError,
    );
  });

  test("error: realAssets rejects a pending fee greater than credit", () => {
    const adapter = accrualAdapter([
      accrualMarket({
        position: {
          credit: 1_000n,
          pendingFee: 1_001n,
          lastLossFactor: 0n,
          lastAccrual: 100n,
        },
        market: { lossFactor: 1n },
      }),
    ]);

    expect(() => adapter.realAssets(150n)).toThrow(
      InvalidPositionAccrualStateError,
    );
  });

  test("error: accrueInterest rejects a loss factor below the position snapshot", () => {
    const adapter = accrualAdapter([
      accrualMarket({
        position: {
          credit: 1_000n,
          pendingFee: 0n,
          lastLossFactor: 2n,
          lastAccrual: 100n,
        },
        market: { lossFactor: 1n },
      }),
    ]);

    expect(() => adapter.accrueInterest(150n)).toThrow(
      InvalidPositionLossFactorError,
    );
  });

  test("error: accrueInterest rejects a pending fee greater than credit", () => {
    const adapter = accrualAdapter([
      accrualMarket({
        position: {
          credit: 1_000n,
          pendingFee: 1_001n,
          lastLossFactor: 0n,
          lastAccrual: 100n,
        },
      }),
    ]);

    expect(() => adapter.accrueInterest(150n)).toThrow(
      InvalidPositionAccrualStateError,
    );
  });

  test("applies the hyperbolic discount and reaches face value at maturity", () => {
    const adapter = accrualAdapter([
      accrualMarket({
        market: { lossFactor: 0n },
      }),
    ]);

    expect(adapter.realAssets(100n)).toBe(500n);
    expect(adapter.realAssets(200n)).toBe(1_000n);
    expect(adapter.realAssets(250n)).toBe(1_000n);

    const alreadyMatured = accrualAdapter([
      accrualMarket({
        position: {
          credit: 1_000n,
          pendingFee: 0n,
          lastLossFactor: 0n,
          lastAccrual: 200n,
        },
      }),
    ]);
    expect(alreadyMatured.realAssets(250n)).toBe(1_000n);
  });

  test("uses live loss factors, including total loss", () => {
    const partiallyLost = accrualAdapter([
      accrualMarket({
        market: { lossFactor: MAX_UINT_128 / 2n },
      }),
    ]);
    const fullyLost = accrualAdapter([
      accrualMarket({
        position: {
          credit: 1_000n,
          pendingFee: 0n,
          lastLossFactor: MAX_UINT_128,
          lastAccrual: 100n,
        },
        market: { lossFactor: MAX_UINT_128 },
      }),
    ]);

    expect(partiallyLost.realAssets(200n)).toBe(500n);
    expect(fullyLost.realAssets(200n)).toBe(0n);
  });

  test("supports zero rate, zero credit, and both force-sellable states", () => {
    const regular = accrualAdapter([accrualMarket()]);
    const forceSellable = accrualAdapter([accrualMarket()], {
      marketDataOverrides: { [ID]: { forceSellable: true } },
    });
    const zeroRate = accrualAdapter([accrualMarket()], {
      marketDataOverrides: { [ID]: { netRate: 0n } },
    });
    const empty = accrualAdapter([
      accrualMarket({
        position: {
          credit: 0n,
          pendingFee: 0n,
          lastLossFactor: 0n,
          lastAccrual: 100n,
        },
      }),
    ]);

    expect(regular.realAssets(100n)).toBe(500n);
    expect(forceSellable.realAssets(100n)).toBe(500n);
    expect(zeroRate.realAssets(100n)).toBe(1_000n);
    expect(empty.realAssets(100n)).toBe(0n);
  });

  test("rounds each market down before summing", () => {
    const adapter = accrualAdapter(
      [
        accrualMarket({
          id: `0x${"01".padStart(64, "0")}`,
          position: {
            credit: 1n,
            pendingFee: 0n,
            lastLossFactor: 0n,
            lastAccrual: 0n,
          },
          market: { lossFactor: 0n },
        }),
        accrualMarket({
          id: SECOND_ID,
          position: {
            credit: 1n,
            pendingFee: 0n,
            lastLossFactor: 0n,
            lastAccrual: 0n,
          },
          market: { lossFactor: 0n },
        }),
      ],
      {
        lastUpdate: 100n,
        marketDataOverrides: {
          [ID]: { netRate: 1n, maturity: MathLib.WAD },
          [SECOND_ID]: { netRate: 1n, maturity: MathLib.WAD },
        },
      },
    );

    expect(adapter.realAssets(0n)).toBe(0n);
  });

  test("values the full 250-market boundary", () => {
    const markets = Array.from({ length: 250 }, (_, index) =>
      accrualMarket({
        id: `0x${BigInt(index + 1)
          .toString(16)
          .padStart(64, "0")}`,
      }),
    );

    expect(accrualAdapter(markets).realAssets(200n)).toBe(250_000n);
  });

  test("does not throw or rewind for timestamps before snapshots", () => {
    const adapter = accrualAdapter([accrualMarket()], { lastUpdate: 100n });
    const past = adapter.accrueInterest(90n);
    const atSnapshot = adapter.accrueInterest(100n);
    const aheadAdapter = accrualAdapter(
      [
        accrualMarket({
          id: ID,
          position: {
            credit: 1_000n,
            pendingFee: 0n,
            lastLossFactor: 0n,
            lastAccrual: 150n,
          },
        }),
        accrualMarket({
          id: SECOND_ID,
          position: {
            credit: 1_000n,
            pendingFee: 0n,
            lastLossFactor: 0n,
            lastAccrual: 100n,
          },
        }),
      ],
      { lastUpdate: 100n },
    );
    const marketAhead = aheadAdapter.accrueInterest(120n);

    expect(adapter.realAssets(90n)).toBeGreaterThan(0n);
    expect(past).not.toBe(adapter);
    expect(past.lastUpdate).toBe(100n);
    expect(past.markets).toStrictEqual(adapter.markets);
    expect(atSnapshot.lastUpdate).toBe(100n);
    expect(atSnapshot.markets).toStrictEqual(adapter.markets);
    expect(aheadAdapter.realAssets(120n)).toBe(1_110n);
    expect(marketAhead.lastUpdate).toBe(120n);
    expect(marketAhead.markets[0]?.position.lastAccrual).toBe(150n);
    expect(marketAhead.markets[1]?.position.lastAccrual).toBe(120n);
  });

  test("accrues forward snapshots without changing the source adapter", () => {
    const adapter = accrualAdapter([
      accrualMarket({
        position: {
          credit: 1_000n,
          pendingFee: 200n,
          lastLossFactor: 0n,
          lastAccrual: 100n,
        },
        market: { lossFactor: 0n },
      }),
    ]);
    const accrued = adapter.accrueInterest(150n);

    expect(accrued).not.toBe(adapter);
    expect(accrued.lastUpdate).toBe(150n);
    expect(accrued.markets[0]?.position.lastAccrual).toBe(150n);
    expect(accrued.markets[0]?.position.credit).toBe(900n);
    expect(accrued.markets[0]?.position.pendingFee).toBe(100n);
    expect(adapter.markets[0]?.position.lastAccrual).toBe(100n);
  });

  test("preserves stored market-data net credit after a forward loss-factor snapshot", () => {
    const adapter = accrualAdapter(
      [
        accrualMarket({
          position: {
            credit: 1_000n,
            pendingFee: 200n,
            lastLossFactor: 0n,
            lastAccrual: 100n,
          },
          market: { lossFactor: MAX_UINT_128 / 2n },
        }),
      ],
      {
        lastUpdate: 100n,
        marketDataOverrides: {
          [ID]: { netCredit: 800n, netRate: 0n, maturity: 200n },
        },
      },
    );
    const accrued = adapter.accrueInterest(150n);

    expect(accrued.marketData[ID]?.netCredit).toBe(800n);
    expect(accrued.markets[0]?.position).toStrictEqual({
      credit: 450n,
      pendingFee: 50n,
      lastLossFactor: MAX_UINT_128 / 2n,
      lastAccrual: 150n,
    });
    expect(accrued.realAssets(150n)).toBe(400n);
    expect(accrued.marketIds).toStrictEqual([ID]);
  });

  test("limits deposit capacity to zero and rejects malformed liquidity data", () => {
    const adapter = accrualAdapter();

    expect(adapter.maxDeposit(EMPTY_HEX, 123n)).toStrictEqual({
      value: 0n,
      limiter: CapacityLimitReason.midnightSelfAllocation,
    });
    expect(adapter.maxWithdraw(EMPTY_HEX)).toStrictEqual({
      value: 0n,
      limiter: CapacityLimitReason.liquidity,
    });
  });

  test("values a mixed Blue/Midnight vault under the vault max-rate cap", () => {
    const blueMarket = createMarket({
      params: marketParams(),
      totalSupplyAssets: 100n,
      totalSupplyShares: 100_000_000n,
      totalBorrowAssets: 0n,
      totalBorrowShares: 0n,
      lastUpdate: 100n,
      rateAtTarget: 0n,
    });
    const blueAdapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        ...vaultV2AdapterInput({ address: ADAPTER }),
        type: "VaultV2MorphoMarketV1AdapterV2",
        marketIds: [blueMarket.id],
        adaptiveCurveIrm: RECIPIENT,
        supplyShares: { [blueMarket.id]: 100_000_000n },
      },
      [blueMarket],
    );
    const midnightAdapter = accrualAdapter(
      [
        accrualMarket({
          position: {
            credit: 1_000n,
            pendingFee: 0n,
            lastLossFactor: 0n,
            lastAccrual: 100n,
          },
          market: { lossFactor: 0n },
        }),
      ],
      {
        lastUpdate: 100n,
        marketDataOverrides: { [ID]: { netRate: 0n } },
      },
    );
    const vault = new AccrualVaultV2(
      vaultV2Input({
        _totalAssets: 100n,
        totalSupply: 100n,
        virtualShares: 0n,
        maxRate: MathLib.WAD / 10n,
        lastUpdate: 100n,
        liquidityAdapter: LIQUIDITY_ADAPTER,
        performanceFee: 0n,
        managementFee: 0n,
      }),
      undefined,
      [blueAdapter, midnightAdapter],
      0n,
      {},
    );
    const t = 110n;
    const { vault: accrued } = vault.accrueInterest(t);
    const accruedMidnightAdapter = accrued.accrualAdapters.find(
      (adapter) => adapter.address === midnightAdapter.address,
    );

    expect(accruedMidnightAdapter).toBeInstanceOf(
      AccrualVaultV2MidnightAdapter,
    );
    if (!(accruedMidnightAdapter instanceof AccrualVaultV2MidnightAdapter)) {
      return;
    }

    expect(accruedMidnightAdapter.lastUpdate).toBe(t);
    expect(accruedMidnightAdapter.markets[0]?.position.lastAccrual).toBe(t);

    const uncappedAssets =
      midnightAdapter.realAssets(t) + blueAdapter.realAssets(t);

    expect(uncappedAssets).toBe(1_100n);
    expect(accrued._totalAssets).toBe(200n);
    expect(accrued.toAssets(100n)).toBeLessThan(uncappedAssets);
  });

  test("uses Midnight liquidity adapter capacity and vault idle assets", () => {
    const midnightAdapter = accrualAdapter();
    const vault = new AccrualVaultV2(
      vaultV2Input({
        _totalAssets: 100n,
        totalSupply: 100n,
        virtualShares: 0n,
        liquidityAdapter: midnightAdapter.address,
        liquidityAllocations: [],
      }),
      midnightAdapter,
      [midnightAdapter],
      25n,
      {},
    );

    expect(vault.maxDeposit(100n)).toStrictEqual({
      value: 0n,
      limiter: CapacityLimitReason.midnightSelfAllocation,
    });
    expect(vault.maxWithdraw(100n)).toStrictEqual({
      value: 25n,
      limiter: CapacityLimitReason.liquidity,
    });

    const t = 110n;
    const { vault: accrued } = vault.accrueInterest(t);
    const accruedMidnightAdapter = accrued.accrualAdapters.find(
      (adapter) => adapter.address === midnightAdapter.address,
    );

    expect(accruedMidnightAdapter).toBeInstanceOf(
      AccrualVaultV2MidnightAdapter,
    );
    if (!(accruedMidnightAdapter instanceof AccrualVaultV2MidnightAdapter)) {
      return;
    }

    expect(accrued.accrualLiquidityAdapter).toBe(accruedMidnightAdapter);
    expect(accrued.accrualLiquidityAdapter).not.toBe(midnightAdapter);
  });
});

const MIDNIGHT_MARKET = {
  chainId: 8453n,
  midnight: "0x00000000000000000000000000000000000000AA",
  loanToken: OTHER,
  collateralParams: [
    {
      token: "0x0000000000000000000000000000000000000003",
      lltv: 860_000_000_000_000_000n,
      liquidationCursor: 300_000_000_000_000_000n,
      oracle: "0x0000000000000000000000000000000000000004",
    },
  ],
  maturity: 200n,
  rcfThreshold: 5n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
} as const;
// Computed with midnight-sdk `MarketUtils.toId(MIDNIGHT_MARKET)`.
const MIDNIGHT_MARKET_ID =
  "0x46e2923ebe4d79cb307962f15d0a04f01f7639db2a42d4bc72fdd8bbba7553be" as const;

function liquidityData(market: typeof MIDNIGHT_MARKET = MIDNIGHT_MARKET) {
  return encodeAbiParameters([midnightMarketAbi], [market]);
}

function withdrawAdapter({
  credit = 1_000n,
  pendingFee = 0n,
  withdrawable,
  forceRemoved = false,
  asset = OTHER,
  lastUpdate = 100n,
  lastAccrual = lastUpdate,
}: {
  readonly lastAccrual?: bigint;
  readonly credit?: bigint;
  readonly pendingFee?: bigint;
  readonly withdrawable?: bigint;
  readonly forceRemoved?: boolean;
  readonly asset?: typeof OTHER | typeof ADDRESS;
  readonly lastUpdate?: bigint;
} = {}) {
  const base = accrualAdapter(
    [
      {
        id: MIDNIGHT_MARKET_ID,
        position: {
          credit,
          pendingFee,
          lastLossFactor: 0n,
          lastAccrual,
        },
        market: { lossFactor: 0n, withdrawable },
      },
    ],
    {
      lastUpdate,
      marketDataOverrides: { [MIDNIGHT_MARKET_ID]: { forceRemoved } },
    },
  );
  return new AccrualVaultV2MidnightAdapter({
    adapter: { ...base, asset },
    markets: base.markets,
    lastUpdate: base.lastUpdate,
  });
}

describe("VaultV2MidnightAdapterUtils.marketId", () => {
  test("default: matches Midnight IdLib.toId", () => {
    expect(VaultV2MidnightAdapterUtils.marketId(MIDNIGHT_MARKET)).toBe(
      MIDNIGHT_MARKET_ID,
    );
  });

  test("behavior: binds every market field", () => {
    expect(
      VaultV2MidnightAdapterUtils.marketId({ ...MIDNIGHT_MARKET, chainId: 1n }),
    ).not.toBe(MIDNIGHT_MARKET_ID);
    expect(
      VaultV2MidnightAdapterUtils.marketId({
        ...MIDNIGHT_MARKET,
        maturity: 201n,
      }),
    ).not.toBe(MIDNIGHT_MARKET_ID);
  });
});

describe("AccrualVaultV2MidnightAdapter.maxWithdraw", () => {
  test("default: caps credit by market withdrawable liquidity", () => {
    expect(
      withdrawAdapter({ withdrawable: 400n }).maxWithdraw(liquidityData()),
    ).toStrictEqual({ value: 400n, limiter: CapacityLimitReason.liquidity });
  });

  test("behavior: caps withdrawable liquidity by gross position credit", () => {
    // Midnight.withdraw debits gross credit; the pending fee shrinks pro rata.
    expect(
      withdrawAdapter({
        credit: 300n,
        pendingFee: 50n,
        withdrawable: 1_000n,
      }).maxWithdraw(liquidityData()).value,
    ).toBe(300n);
  });

  test("behavior: caps by credit net of continuous fees accrued to lastUpdate", () => {
    // Midnight.withdraw updates the position first: half the pending fee accrues by t = 150.
    expect(
      withdrawAdapter({
        credit: 300n,
        pendingFee: 100n,
        withdrawable: 1_000n,
        lastAccrual: 100n,
        lastUpdate: 150n,
      }).maxWithdraw(liquidityData()).value,
    ).toBe(250n);
  });

  test("behavior: missing withdrawable snapshot defaults to zero", () => {
    const adapter = withdrawAdapter();

    expect(adapter.markets[0]?.market.withdrawable).toBe(0n);
    expect(adapter.maxWithdraw(liquidityData()).value).toBe(0n);
  });

  test("behavior: zero for a force-removed market", () => {
    expect(
      withdrawAdapter({ withdrawable: 400n, forceRemoved: true }).maxWithdraw(
        liquidityData(),
      ).value,
    ).toBe(0n);
  });

  test("behavior: zero when the market loan token is not the adapter asset", () => {
    expect(
      withdrawAdapter({ withdrawable: 400n, asset: ADDRESS }).maxWithdraw(
        liquidityData(),
      ).value,
    ).toBe(0n);
  });

  test("behavior: zero for a market the adapter does not hold", () => {
    expect(
      withdrawAdapter({ withdrawable: 400n }).maxWithdraw(
        liquidityData({ ...MIDNIGHT_MARKET, maturity: 201n } as never),
      ).value,
    ).toBe(0n);
  });

  test("behavior: zero for truncated liquidity data", () => {
    expect(
      withdrawAdapter({ withdrawable: 400n }).maxWithdraw(
        liquidityData().slice(0, 66) as `0x${string}`,
      ).value,
    ).toBe(0n);
  });

  test("behavior: preserves withdrawable liquidity through accrual", () => {
    const accrued = withdrawAdapter({ withdrawable: 400n }).accrueInterest(
      150n,
    );

    expect(accrued.markets[0]?.market.withdrawable).toBe(400n);
    expect(accrued.maxWithdraw(liquidityData()).value).toBe(400n);
  });

  test("behavior: vault max withdraw adds adapter liquidity to idle assets", () => {
    const midnightAdapter = withdrawAdapter({ withdrawable: 40n });
    const vault = new AccrualVaultV2(
      vaultV2Input({
        _totalAssets: 100n,
        totalSupply: 100n,
        virtualShares: 0n,
        liquidityAdapter: midnightAdapter.address,
        liquidityData: liquidityData(),
        liquidityAllocations: [],
      }),
      midnightAdapter,
      [midnightAdapter],
      25n,
      {},
    );

    expect(vault.maxWithdraw(100n)).toStrictEqual({
      value: 65n,
      limiter: CapacityLimitReason.liquidity,
    });
  });
});
