import type { MarketId } from "@morpho-org/blue-sdk";
import fc from "fast-check";
import { type Address, ethAddress, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import type {
  MarketState,
  PermissionState,
  VerificationSnapshot,
} from "../../domain/evidence.js";
import type { DecodedProbeRead } from "../../domain/stages.js";
import { MissingVerificationEvidenceError } from "../../errors.js";
import { accrueSnapshot } from "./accrue.js";
import { buildSnapshot, diffSnapshots } from "./snapshot.js";

const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const TOKEN: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const SPENDER: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);
const ORACLE: Address = getAddress(
  "0x4444444444444444444444444444444444444444",
);
const IRM: Address = getAddress("0x5555555555555555555555555555555555555555");
const MORPHO: Address = getAddress(
  "0xbBbBB9fc5e258E8B39f9c12A1C3bb3D18Ed9c48A",
);
const MARKET_ID = `0x${"cd".repeat(32)}` as MarketId;

const NOW = 1_700_000_000n;

const template = (
  overrides: Partial<VerificationSnapshot> = {},
): VerificationSnapshot => ({
  wallet: [
    { account: OWNER, token: ethAddress, assets: 10n ** 18n },
    { account: OWNER, token: TOKEN, assets: 1_000_000n },
  ],
  permissions: [
    {
      type: "erc20Allowance",
      token: TOKEN,
      owner: OWNER,
      spender: SPENDER,
      amount: 500_000n,
    },
  ],
  positions: [
    {
      marketId: MARKET_ID,
      owner: OWNER,
      supplyAssets: 0n,
      supplyShares: 100n,
      borrowAssets: 0n,
      borrowShares: 0n,
      collateralAssets: 50n,
      ltvWad: { type: "debtFree" },
      healthFactorWad: { type: "unbounded", reason: "zeroCollateral" },
    },
  ],
  vaults: [],
  markets: [
    {
      market: {
        marketId: MARKET_ID,
        params: {
          loanToken: TOKEN,
          collateralToken: TOKEN,
          oracle: ORACLE,
          irm: IRM,
          lltv: 8n * 10n ** 17n,
        },
      },
      totalSupplyAssets: 1_000n,
      totalSupplyShares: 1_000n,
      totalBorrowAssets: 400n,
      totalBorrowShares: 400n,
      lastUpdate: NOW,
      feeWad: 0n,
      liquidityAssets: 600n,
      utilizationWad: { type: "finite", valueWad: 4n * 10n ** 17n },
      borrowApyWad: { type: "applicable", value: 10n ** 16n },
      oraclePrice: {
        type: "applicable",
        value: { value: 10n ** 36n, scale: 10n ** 36n },
      },
      borrowRatePerSecondWad: { type: "applicable", value: 3n },
      rateAtTargetPerSecondWad: { type: "applicable", value: 3n },
      preLiquidation: { type: "notApplicable", reason: "noPreLiquidation" },
    },
  ],
  ...overrides,
});

const reads = (
  overrides: Partial<DecodedProbeRead>[] = [],
): DecodedProbeRead[] =>
  [
    { type: "nativeBalance", account: OWNER, value: 9n * 10n ** 17n },
    {
      type: "erc20Balance",
      token: TOKEN,
      account: OWNER,
      value: 700_000n,
    },
    {
      type: "erc20Allowance",
      token: TOKEN,
      owner: OWNER,
      spender: SPENDER,
      value: 300_000n,
    },
    {
      type: "bluePosition",
      morpho: MORPHO,
      marketId: MARKET_ID,
      owner: OWNER,
      value: { supplyShares: 110n, borrowShares: 0n, collateral: 50n },
    },
    {
      type: "blueMarket",
      morpho: MORPHO,
      marketId: MARKET_ID,
      value: {
        totalSupplyAssets: 1_050n,
        totalSupplyShares: 1_000n,
        totalBorrowAssets: 420n,
        totalBorrowShares: 400n,
        lastUpdate: NOW + 10n,
        fee: 0n,
      },
    },
    { type: "oraclePrice", oracle: ORACLE, value: 2n * 10n ** 36n },
    { type: "irmBorrowRateView", irm: IRM, value: 5n },
    { type: "irmRateAtTarget", irm: IRM, marketId: MARKET_ID, value: 3n },
    ...overrides,
  ] as DecodedProbeRead[];

describe("buildSnapshot", () => {
  test("default: overlays dynamic fields from reads", () => {
    const after = buildSnapshot(template(), reads());
    expect(after.wallet[0]).toEqual({
      account: OWNER,
      token: ethAddress,
      assets: 9n * 10n ** 17n,
    });
    expect(after.wallet[1]?.assets).toBe(700_000n);
    const allowance = after.permissions.find(
      (p): p is Extract<PermissionState, { type: "erc20Allowance" }> =>
        p.type === "erc20Allowance",
    );
    expect(allowance?.amount).toBe(300_000n);
    expect(after.positions[0]?.supplyShares).toBe(110n);
    expect(after.markets[0]?.totalSupplyAssets).toBe(1_050n);
    expect(
      after.markets[0]?.oraclePrice.type === "applicable"
        ? after.markets[0].oraclePrice.value.value
        : null,
    ).toBe(2n * 10n ** 36n);
    expect(
      after.markets[0]?.borrowRatePerSecondWad.type === "applicable"
        ? after.markets[0].borrowRatePerSecondWad.value
        : null,
    ).toBe(5n);
  });

  test("error: MissingVerificationEvidenceError for absent subject read", () => {
    const partial = reads().filter(
      (r) => !(r.type === "erc20Balance" && r.token === TOKEN),
    );
    expect(() => buildSnapshot(template(), partial)).toThrow(
      MissingVerificationEvidenceError,
    );
  });
});

describe("diffSnapshots", () => {
  test("diff(x, x) is empty", () => {
    fc.assert(
      fc.property(fc.bigInt(0n, 10n ** 30n), (assets) => {
        const snap = template({
          wallet: [{ account: OWNER, token: TOKEN, assets }],
        });
        const diff = diffSnapshots(snap, snap);
        expect(diff.wallet).toHaveLength(0);
        expect(diff.positions).toHaveLength(0);
        expect(diff.markets).toHaveLength(0);
        expect(diff.permissions).toHaveLength(0);
      }),
    );
  });

  test("wallet diffs are signed", () => {
    const before = template();
    const after = buildSnapshot(before, reads());
    const diff = diffSnapshots(before, after);
    const tokenDiff = diff.wallet.find((w) => w.token === TOKEN);
    expect(tokenDiff?.assets).toBe(700_000n - 1_000_000n);
  });
});

describe("accrueSnapshot", () => {
  const marketState = (rate: bigint): MarketState => ({
    market: {
      marketId: MARKET_ID,
      params: {
        loanToken: TOKEN,
        collateralToken: TOKEN,
        oracle: ORACLE,
        irm: IRM,
        lltv: 8n * 10n ** 17n,
      },
    },
    totalSupplyAssets: 1_000n,
    totalSupplyShares: 1_000n,
    totalBorrowAssets: 400n,
    totalBorrowShares: 400n,
    lastUpdate: NOW,
    feeWad: 0n,
    liquidityAssets: 600n,
    utilizationWad: { type: "finite", valueWad: 4n * 10n ** 17n },
    borrowApyWad: { type: "applicable", value: 10n ** 16n },
    oraclePrice: {
      type: "applicable",
      value: { value: 10n ** 36n, scale: 10n ** 36n },
    },
    borrowRatePerSecondWad: { type: "applicable", value: rate },
    rateAtTargetPerSecondWad: { type: "applicable", value: rate },
    preLiquidation: { type: "notApplicable", reason: "noPreLiquidation" },
  });

  test("is monotone in time when rate is non-negative", () => {
    fc.assert(
      fc.property(
        fc.bigInt(0n, 10n ** 12n),
        fc.bigInt(0n, 3600n),
        (rate, dt) => {
          const snap = template({ markets: [marketState(rate)] });
          const t1 = accrueSnapshot(snap, NOW + dt);
          const t2 = accrueSnapshot(snap, NOW + dt + 1n);
          expect(t2.markets[0]!.totalBorrowAssets).toBeGreaterThanOrEqual(
            t1.markets[0]!.totalBorrowAssets,
          );
        },
      ),
    );
  });

  test("zero rate leaves totals unchanged", () => {
    const snap = template({ markets: [marketState(0n)] });
    const accrued = accrueSnapshot(snap, NOW + 100n);
    expect(accrued.markets[0]?.totalBorrowAssets).toBe(400n);
    expect(accrued.markets[0]?.lastUpdate).toBe(NOW + 100n);
  });
});
