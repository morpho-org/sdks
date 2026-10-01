import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import { ConsumerLimitViolationError } from "../../errors.js";
import {
  emptyDiff,
  makeCheckContext,
  makeMarketState,
  makeParsedState,
  makeVaultState,
  TEST_MARKET_ID,
  TEST_OWNER,
} from "../../test-helpers/index.js";
import type { ParsedState, VaultInternals } from "../state/types.js";
import { checkExitOperation } from "./exits.js";

const SOURCE: Address = getAddress(
  "0xBEEF0173c205AF46a9B1C95C4D1020C0f0b864CB",
);
const TARGET: Address = getAddress(
  "0xC0FFEE254729296a45a3885639AC7E10F9d54979",
);
const ASSET: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const ADAPTER: Address = getAddress(
  "0x00000000000000000000000000000000000000aa",
);

const ctx = makeCheckContext();
type Op = Parameters<typeof checkExitOperation>[1];
const mkOp = (op: object) => op as Op;

const merge = (...states: ParsedState[]): ParsedState =>
  makeParsedState({
    balances: states.flatMap((s) => s.balances),
    positions: states.flatMap((s) => s.positions),
    markets: states.flatMap((s) => s.markets),
    vaults: states.flatMap((s) => s.vaults),
    internals: {
      markets: new Map(states.flatMap((s) => [...s.internals.markets])),
      vaults: new Map(states.flatMap((s) => [...s.internals.vaults])),
      positions: new Map(states.flatMap((s) => [...s.internals.positions])),
    },
  });

const v1Internals: VaultInternals = {
  version: "v1",
  sharePriceE27: 10n ** 27n,
  decimalsOffset: 0n,
  allocations: [],
};
const v2Internals: VaultInternals = {
  version: "v2",
  sharePriceE27: 10n ** 27n,
  virtualShares: 1n,
  allocations: [],
};

// biome-ignore lint/complexity/useMaxParams: three-arg fixture reads clearest positionally
const balance = (account: Address, token: Address, assets: bigint) => ({
  account,
  token,
  before: 0n,
  after: assets,
  assets,
});

describe("checkExitOperation", () => {
  describe("vaultV1MigrateToV2", () => {
    const before = merge(
      makeVaultState({
        vault: SOURCE,
        vaultState: {
          totalAssets: 1_000n,
          totalShares: 1_000n,
          userShares: 500n,
        },
        internals: v1Internals,
      }),
      makeVaultState({
        vault: TARGET,
        vaultState: {
          totalAssets: 2_000n,
          totalShares: 2_000n,
          userShares: 0n,
        },
        internals: v2Internals,
      }),
    );
    const after = merge(
      makeVaultState({
        vault: SOURCE,
        vaultState: { totalAssets: 900n, totalShares: 900n, userShares: 400n },
        internals: v1Internals,
      }),
      makeVaultState({
        vault: TARGET,
        vaultState: {
          totalAssets: 2_100n,
          totalShares: 2_100n,
          userShares: 100n,
        },
        internals: v2Internals,
      }),
    );
    const op = mkOp({
      type: "vaultV1MigrateToV2",
      sourceVault: SOURCE,
      targetVault: TARGET,
    });
    test("pass", () => {
      expect(() =>
        checkExitOperation(ctx, op, before, after, { ...emptyDiff }),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["expectedAssets", { expectedAssets: 99n }],
      ["expectedShares", { expectedShares: 99n }],
      ["minTargetSharesMinted", { minTargetSharesMinted: 999n }],
    ])("violation: %s", (_f, override) => {
      expect(() =>
        checkExitOperation(
          ctx,
          mkOp({
            type: "vaultV1MigrateToV2",
            sourceVault: SOURCE,
            targetVault: TARGET,
            ...override,
          }),
          before,
          after,
          { ...emptyDiff },
        ),
      ).toThrow(ConsumerLimitViolationError);
    });
    test("error: wallet asset moved during migration", () => {
      const diff = { ...emptyDiff, balances: [balance(TEST_OWNER, ASSET, 5n)] };
      expect(() => checkExitOperation(ctx, op, before, after, diff)).toThrow();
    });
  });

  describe("vaultV2ForceWithdraw", () => {
    const internals: VaultInternals = {
      ...v2Internals,
      allocations: [
        { adapter: ADAPTER, marketId: TEST_MARKET_ID, penaltyWad: 0n },
      ],
    };
    const before = makeVaultState({
      vault: TARGET,
      version: "v2",
      vaultState: {
        totalAssets: 1_000n,
        totalShares: 1_000n,
        userShares: 500n,
        idleAssets: 200n,
        allocations: [
          { adapter: ADAPTER, marketId: TEST_MARKET_ID, assets: 300n },
        ],
      },
      internals,
    });
    const after = makeVaultState({
      vault: TARGET,
      version: "v2",
      vaultState: {
        totalAssets: 900n,
        totalShares: 900n,
        userShares: 400n,
        idleAssets: 100n,
        allocations: [
          { adapter: ADAPTER, marketId: TEST_MARKET_ID, assets: 200n },
        ],
      },
      internals,
    });
    const diff = { ...emptyDiff, balances: [balance(TEST_OWNER, ASSET, 100n)] };
    test("pass", () => {
      expect(() =>
        checkExitOperation(
          ctx,
          mkOp({
            type: "vaultV2ForceWithdraw",
            vault: TARGET,
            expectedAdapter: ADAPTER,
            expectedExitAssets: 100n,
          }),
          before,
          after,
          diff,
        ),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["expectedExitAssets", { expectedExitAssets: 99n }],
      ["maxSharesBurned", { maxSharesBurned: 1n }],
      ["minAssetsReceived", { minAssetsReceived: 999n }],
    ])("violation: %s", (_f, override) => {
      expect(() =>
        checkExitOperation(
          ctx,
          mkOp({ type: "vaultV2ForceWithdraw", vault: TARGET, ...override }),
          before,
          after,
          diff,
        ),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("vaultV2ForceRedeem", () => {
    const internals: VaultInternals = {
      ...v2Internals,
      allocations: [
        { adapter: ADAPTER, marketId: TEST_MARKET_ID, penaltyWad: 0n },
      ],
    };
    const before = makeVaultState({
      vault: TARGET,
      version: "v2",
      vaultState: {
        totalAssets: 1_000n,
        totalShares: 1_000n,
        userShares: 500n,
        idleAssets: 200n,
        allocations: [
          { adapter: ADAPTER, marketId: TEST_MARKET_ID, assets: 300n },
        ],
      },
      internals,
    });
    const after = makeVaultState({
      vault: TARGET,
      version: "v2",
      vaultState: {
        totalAssets: 900n,
        totalShares: 900n,
        userShares: 400n,
        idleAssets: 100n,
        allocations: [
          { adapter: ADAPTER, marketId: TEST_MARKET_ID, assets: 200n },
        ],
      },
      internals,
    });
    const diff = { ...emptyDiff, balances: [balance(TEST_OWNER, ASSET, 100n)] };
    test("pass", () => {
      expect(() =>
        checkExitOperation(
          ctx,
          mkOp({
            type: "vaultV2ForceRedeem",
            vault: TARGET,
            expectedShares: 100n,
            expectedDeallocations: [
              { adapter: ADAPTER, marketId: TEST_MARKET_ID, assets: 100n },
            ],
          }),
          before,
          after,
          diff,
        ),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["expectedShares", { expectedShares: 99n }],
      [
        "expectedDeallocations",
        {
          expectedDeallocations: [
            { adapter: ADAPTER, marketId: TEST_MARKET_ID, assets: 50n },
          ],
        },
      ],
      ["minAssetsReceived", { minAssetsReceived: 999n }],
    ])("violation: %s", (_f, override) => {
      expect(() =>
        checkExitOperation(
          ctx,
          mkOp({ type: "vaultV2ForceRedeem", vault: TARGET, ...override }),
          before,
          after,
          diff,
        ),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("vaultV1InKindRedeem", () => {
    const internals: VaultInternals = {
      ...v1Internals,
      allocations: [{ marketId: TEST_MARKET_ID }],
    };
    const before = merge(
      makeVaultState({
        vault: SOURCE,
        vaultState: {
          totalAssets: 1_000n,
          totalShares: 1_000n,
          userShares: 500n,
          idleAssets: 0n,
          allocations: [{ marketId: TEST_MARKET_ID, assets: 300n }],
        },
        internals,
      }),
      makeMarketState({ marketId: TEST_MARKET_ID }),
    );
    const after = merge(
      makeVaultState({
        vault: SOURCE,
        vaultState: {
          totalAssets: 900n,
          totalShares: 900n,
          userShares: 400n,
          allocations: [{ marketId: TEST_MARKET_ID, assets: 200n }],
        },
        internals,
      }),
      makeMarketState({
        marketId: TEST_MARKET_ID,
        position: { supplyAssets: 100n, supplyShares: 100n },
      }),
    );
    test("pass", () => {
      expect(() =>
        checkExitOperation(
          ctx,
          mkOp({
            type: "vaultV1InKindRedeem",
            vault: SOURCE,
            expectedMarketIds: [TEST_MARKET_ID],
            minSupplyAssetsByMarket: [
              { marketId: TEST_MARKET_ID, minAssets: 1n },
            ],
          }),
          before,
          after,
          { ...emptyDiff },
        ),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      [
        "expectedMarketIds",
        {
          expectedMarketIds: [
            "0x0000000000000000000000000000000000000000000000000000000000000bad",
          ],
        },
      ],
      ["maxSharesBurned", { maxSharesBurned: 1n }],
      [
        "minSupplyAssetsByMarket",
        {
          minSupplyAssetsByMarket: [
            { marketId: TEST_MARKET_ID, minAssets: 999n },
          ],
        },
      ],
    ])("violation: %s", (_f, override) => {
      expect(() =>
        checkExitOperation(
          ctx,
          mkOp({ type: "vaultV1InKindRedeem", vault: SOURCE, ...override }),
          before,
          after,
          { ...emptyDiff },
        ),
      ).toThrow(ConsumerLimitViolationError);
    });
  });
});
