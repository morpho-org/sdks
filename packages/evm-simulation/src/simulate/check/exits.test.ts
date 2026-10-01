import type { MarketId } from "@morpho-org/blue-sdk";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import { ConsumerLimitViolationError } from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
import {
  emptyDiff,
  makeCheckContext,
  makeParsedState,
  makeVaultState,
  TEST_OWNER,
} from "../../test-helpers/index.js";
import { checkExitOperation, checkExitOperationLimits } from "./exits.js";
import type { CheckedOperation } from "./helpers.js";

const VAULT: Address = getAddress("0xBEEF0173c205AF46a9B1C95C4D1020C0f0b864CB");
const TARGET: Address = getAddress(
  "0x0442222fBEecF2b8490b940EFb834e32e9E5C145",
);
const ASSET: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

const ctx = makeCheckContext();

describe("checkExitOperation", () => {
  test("error: source vault missing from read state", () => {
    const op = {
      type: "vaultV1MigrateToV2",
      transactionIndex: 0,
      sourceVault: VAULT,
      targetVault: TARGET,
      owner: TEST_OWNER,
      asset: ASSET,
      amount: { type: "assets", assets: 100n },
    } as unknown as Parameters<typeof checkExitOperation>[1];
    expect(() =>
      checkExitOperation(ctx, op, makeParsedState(), makeParsedState(), {
        ...emptyDiff,
      }),
    ).toThrow();
  });

  test("migration: wallet must not receive the migrated asset", () => {
    const before = makeVaultState({
      vault: VAULT,
      internals: { decimalsOffset: 0n },
    });
    const after = makeVaultState({
      vault: VAULT,
      vaultState: { userShares: 400n, totalShares: 900n, totalAssets: 900n },
      internals: { decimalsOffset: 0n },
    });
    // Target vault observed on both sides for the minted-shares assertion.
    const targetBefore = makeVaultState({ vault: TARGET, version: "v2" });
    const targetAfter = makeVaultState({
      vault: TARGET,
      version: "v2",
      vaultState: { userShares: 600n, totalShares: 1100n, totalAssets: 1100n },
    });
    const merged = (
      a: ReturnType<typeof makeVaultState>,
      b: ReturnType<typeof makeVaultState>,
    ) =>
      makeParsedState({
        vaults: [...a.vaults, ...b.vaults],
        internals: {
          markets: new Map(),
          vaults: new Map([...a.internals.vaults, ...b.internals.vaults]),
          positions: new Map(),
        },
      });
    const op = {
      type: "vaultV1MigrateToV2",
      transactionIndex: 0,
      sourceVault: VAULT,
      targetVault: TARGET,
      owner: TEST_OWNER,
      asset: ASSET,
      amount: { type: "assets", assets: 100n },
    } as unknown as Parameters<typeof checkExitOperation>[1];
    expect(() =>
      checkExitOperation(
        ctx,
        op,
        merged(before, targetBefore),
        merged(after, targetAfter),
        {
          ...emptyDiff,
          balances: [{ account: TEST_OWNER, token: ASSET, assets: 50n }],
        },
      ),
    ).toThrow();
  });
});

describe("checkExitOperationLimits", () => {
  const ctxWith = (operations: OperationLimit[]) =>
    makeCheckContext({ limits: { ...makeCheckContext().limits, operations } });

  const checked = (operation: object, outcome: object) =>
    ({ operation, outcome }) as CheckedOperation;

  const OTHER: Address = getAddress(
    "0x00000000000000000000000000000000000000ff",
  );
  const BAD: Address = getAddress("0x0000000000000000000000000000000000000bad");
  const MARKET_A =
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as MarketId;
  const MARKET_B =
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as MarketId;
  const MARKET_BAD =
    "0x0000000000000000000000000000000000000000000000000000000000000bad" as MarketId;

  // biome-ignore lint/complexity/useMaxParams: pass/fail helper reads clearest with positional arguments
  const pass = (operation: object, outcome: object, limit: OperationLimit) =>
    expect(() =>
      checkExitOperationLimits(ctxWith([limit]), checked(operation, outcome)),
    ).not.toThrow();
  // biome-ignore lint/complexity/useMaxParams: pass/fail helper reads clearest with positional arguments
  const fail = (operation: object, outcome: object, limit: OperationLimit) =>
    expect(() =>
      checkExitOperationLimits(ctxWith([limit]), checked(operation, outcome)),
    ).toThrow(ConsumerLimitViolationError);

  describe("vaultV1MigrateToV2", () => {
    const op = {
      type: "vaultV1MigrateToV2",
      transactionIndex: 0,
      sourceVault: VAULT,
      targetVault: TARGET,
      receiver: TEST_OWNER,
      amount: { type: "assets", assets: 100n },
    };
    const outcome = { targetSharesMinted: 100n };
    test("pass: all fields satisfied", () => {
      pass(op, outcome, {
        type: "vaultV1MigrateToV2",
        sourceVault: VAULT,
        targetVault: TARGET,
        expectedAssets: 100n,
        expectedReceiver: TEST_OWNER,
        minTargetSharesMinted: 50n,
      });
    });
    test("pass: expectedShares vs shares amount", () => {
      pass({ ...op, amount: { type: "shares", shares: 100n } }, outcome, {
        type: "vaultV1MigrateToV2",
        sourceVault: VAULT,
        targetVault: TARGET,
        expectedShares: 100n,
      });
    });
    test.each<[string, object]>([
      ["sourceVault", { sourceVault: BAD }],
      ["targetVault", { targetVault: BAD }],
      ["expectedAssets", { expectedAssets: 99n }],
      ["expectedShares", { expectedShares: 100n }],
      ["expectedReceiver", { expectedReceiver: OTHER }],
      ["minTargetSharesMinted", { minTargetSharesMinted: 101n }],
    ])("violation: %s", (_field, override) => {
      fail(op, outcome, {
        type: "vaultV1MigrateToV2",
        sourceVault: VAULT,
        targetVault: TARGET,
        ...override,
      } as OperationLimit);
    });
  });

  describe("vaultV2ForceWithdraw", () => {
    const op = {
      type: "vaultV2ForceWithdraw",
      transactionIndex: 0,
      vault: VAULT,
      exitAssets: 100n,
      adapter: TEST_OWNER,
      receiver: TEST_OWNER,
    };
    const outcome = {
      sharesBurned: 100n,
      assetsReceived: 100n,
      penaltyAssets: 0n,
    };
    test("pass: all fields satisfied", () => {
      pass(op, outcome, {
        type: "vaultV2ForceWithdraw",
        vault: VAULT,
        expectedExitAssets: 100n,
        expectedAdapter: TEST_OWNER,
        maxSharesBurned: 200n,
        minAssetsReceived: 50n,
        maxPenaltyAssets: 0n,
      });
    });
    test.each<[string, object]>([
      ["vault", { vault: BAD }],
      ["expectedExitAssets", { expectedExitAssets: 99n }],
      ["expectedAdapter", { expectedAdapter: OTHER }],
      ["maxSharesBurned", { maxSharesBurned: 99n }],
      ["minAssetsReceived", { minAssetsReceived: 101n }],
      ["maxPenaltyAssets", { maxPenaltyAssets: -1n }],
    ])("violation: %s", (_field, override) => {
      fail(op, outcome, {
        type: "vaultV2ForceWithdraw",
        vault: VAULT,
        ...override,
      } as OperationLimit);
    });
  });

  describe("vaultV2ForceRedeem", () => {
    const deallocation = {
      adapter: TEST_OWNER,
      marketId: MARKET_A,
      assets: 100n,
    };
    const op = {
      type: "vaultV2ForceRedeem",
      transactionIndex: 0,
      vault: VAULT,
      shares: 100n,
      receiver: TEST_OWNER,
      onBehalf: TEST_OWNER,
      deallocations: [deallocation],
    };
    const outcome = {
      assetsReceived: 100n,
      penaltyShares: 0n,
      penaltyAssets: 0n,
    };
    test("pass: all fields satisfied", () => {
      pass(op, outcome, {
        type: "vaultV2ForceRedeem",
        vault: VAULT,
        expectedShares: 100n,
        expectedRecipient: TEST_OWNER,
        expectedOnBehalf: TEST_OWNER,
        expectedDeallocations: [deallocation],
        minAssetsReceived: 50n,
        maxPenaltyShares: 1n,
        maxPenaltyAssets: 0n,
      });
    });
    test.each<[string, object]>([
      ["vault", { vault: BAD }],
      ["expectedShares", { expectedShares: 99n }],
      ["expectedRecipient", { expectedRecipient: OTHER }],
      ["expectedOnBehalf", { expectedOnBehalf: OTHER }],
      [
        "expectedDeallocations",
        {
          expectedDeallocations: [
            { adapter: TEST_OWNER, marketId: MARKET_A, assets: 99n },
          ],
        },
      ],
      ["minAssetsReceived", { minAssetsReceived: 101n }],
      ["maxPenaltyShares", { maxPenaltyShares: -1n }],
      ["maxPenaltyAssets", { maxPenaltyAssets: -1n }],
    ])("violation: %s", (_field, override) => {
      fail(op, outcome, {
        type: "vaultV2ForceRedeem",
        vault: VAULT,
        ...override,
      } as OperationLimit);
    });
  });

  describe("vaultV1InKindRedeem", () => {
    const op = {
      type: "vaultV1InKindRedeem",
      transactionIndex: 0,
      vault: VAULT,
      assets: 100n,
      markets: [{ marketId: MARKET_A }, { marketId: MARKET_B }],
    };
    const outcome = {
      sharesBurned: 100n,
      idleAssetsReceived: 100n,
      supplyAssetsByMarket: [
        { marketId: MARKET_A, assets: 50n },
        { marketId: MARKET_B, assets: 50n },
      ],
      penaltyAssets: 0n,
      residualShareAllowance: 0n,
    };
    test("pass: all fields satisfied", () => {
      pass(op, outcome, {
        type: "vaultV1InKindRedeem",
        vault: VAULT,
        expectedAssets: 100n,
        expectedMarketIds: [MARKET_A, MARKET_B],
        maxSharesBurned: 200n,
        minIdleAssetsReceived: 50n,
        minSupplyAssetsByMarket: [{ marketId: MARKET_A, minAssets: 50n }],
        maxPenaltyAssets: 0n,
        maxResidualShareAllowance: 0n,
      });
    });
    test.each<[string, object]>([
      ["vault", { vault: BAD }],
      ["expectedAssets", { expectedAssets: 99n }],
      ["expectedMarketIds", { expectedMarketIds: [MARKET_A, MARKET_BAD] }],
      ["maxSharesBurned", { maxSharesBurned: 99n }],
      ["minIdleAssetsReceived", { minIdleAssetsReceived: 101n }],
      [
        "minSupplyAssetsByMarket",
        { minSupplyAssetsByMarket: [{ marketId: MARKET_A, minAssets: 51n }] },
      ],
      ["maxPenaltyAssets", { maxPenaltyAssets: -1n }],
      ["maxResidualShareAllowance", { maxResidualShareAllowance: -1n }],
    ])("violation: %s", (_field, override) => {
      fail(op, outcome, {
        type: "vaultV1InKindRedeem",
        vault: VAULT,
        ...override,
      } as OperationLimit);
    });
  });

  describe("vaultV2InKindRedeem", () => {
    const op = {
      type: "vaultV2InKindRedeem",
      transactionIndex: 0,
      vault: VAULT,
      assets: 100n,
      markets: [{ marketId: MARKET_A }],
    };
    const outcome = {
      sharesBurned: 100n,
      idleAssetsReceived: 100n,
      supplyAssetsByMarket: [{ marketId: MARKET_A, assets: 50n }],
      penaltyAssets: 0n,
      residualShareAllowance: 0n,
    };
    test("pass + violation: minSupplyAssetsByMarket and maxSharesBurned", () => {
      pass(op, outcome, {
        type: "vaultV2InKindRedeem",
        vault: VAULT,
        minSupplyAssetsByMarket: [{ marketId: MARKET_A, minAssets: 50n }],
        maxSharesBurned: 100n,
      });
      fail(op, outcome, {
        type: "vaultV2InKindRedeem",
        vault: VAULT,
        minSupplyAssetsByMarket: [{ marketId: MARKET_A, minAssets: 51n }],
      });
      fail(op, outcome, {
        type: "vaultV2InKindRedeem",
        vault: VAULT,
        maxSharesBurned: 99n,
      });
    });
  });
});
