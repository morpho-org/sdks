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
import { checkExitOperation } from "./exits.js";

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

describe("checkExitOperation — consumer limits", () => {
  const ctxWith = (operations: OperationLimit[]) =>
    makeCheckContext({ limits: { ...makeCheckContext().limits, operations } });

  const OTHER: Address = getAddress(
    "0x00000000000000000000000000000000000000ff",
  );
  const BAD: Address = getAddress("0x0000000000000000000000000000000000000bad");
  const ADAPTER: Address = getAddress(
    "0x0000000000000000000000000000000000000add",
  );
  const MARKET_A =
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as MarketId;
  const MARKET_B =
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as MarketId;
  const MARKET_BAD =
    "0x0000000000000000000000000000000000000000000000000000000000000bad" as MarketId;

  type Op = Parameters<typeof checkExitOperation>[1];
  const mkOp = (op: object) => op as Op;
  const mkLimit = (limit: object) => limit as OperationLimit;

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

  describe("vaultV1MigrateToV2", () => {
    const before = merged(
      makeVaultState({ vault: VAULT, internals: { decimalsOffset: 0n } }),
      makeVaultState({ vault: TARGET, version: "v2" }),
    );
    const after = merged(
      makeVaultState({
        vault: VAULT,
        vaultState: { userShares: 400n, totalShares: 900n, totalAssets: 900n },
        internals: { decimalsOffset: 0n },
      }),
      makeVaultState({
        vault: TARGET,
        version: "v2",
        vaultState: {
          userShares: 600n,
          totalShares: 1100n,
          totalAssets: 1100n,
        },
      }),
    );
    const op = mkOp({
      type: "vaultV1MigrateToV2",
      transactionIndex: 0,
      sourceVault: VAULT,
      targetVault: TARGET,
      owner: TEST_OWNER,
      asset: ASSET,
      receiver: TEST_OWNER,
      amount: { type: "assets", assets: 100n },
    });
    const call = (limits: OperationLimit[]) => () =>
      checkExitOperation(ctxWith(limits), op, before, after, {
        ...emptyDiff,
      });
    test("pass", () => {
      expect(
        call([
          mkLimit({
            type: "vaultV1MigrateToV2",
            sourceVault: VAULT,
            targetVault: TARGET,
            expectedAssets: 100n,
            expectedReceiver: TEST_OWNER,
            minTargetSharesMinted: 1n,
          }),
        ]),
      ).not.toThrow();
    });
    test("pass: expectedShares vs shares amount", () => {
      const sharesOp = mkOp({
        ...op,
        amount: { type: "shares", shares: 100n },
      });
      // 100 source shares -> 100 assets -> 100 target shares on these fixtures.
      expect(() =>
        checkExitOperation(
          ctxWith([
            mkLimit({
              type: "vaultV1MigrateToV2",
              sourceVault: VAULT,
              targetVault: TARGET,
              expectedShares: 100n,
            }),
          ]),
          sharesOp,
          before,
          after,
          { ...emptyDiff },
        ),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["sourceVault", { sourceVault: BAD }],
      ["targetVault", { targetVault: BAD }],
      ["expectedAssets", { expectedAssets: 99n }],
      ["expectedShares", { expectedShares: 100n }],
      ["expectedReceiver", { expectedReceiver: OTHER }],
      ["minTargetSharesMinted", { minTargetSharesMinted: 10n ** 30n }],
    ])("violation: %s", (_f, override) => {
      expect(
        call([
          mkLimit({
            type: "vaultV1MigrateToV2",
            sourceVault: VAULT,
            targetVault: TARGET,
            ...override,
          }),
        ]),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("vaultV2ForceWithdraw", () => {
    const before = makeVaultState({
      vault: VAULT,
      version: "v2",
      vaultState: {
        allocations: [{ adapter: ADAPTER, marketId: MARKET_A, assets: 100n }],
      },
      internals: {
        virtualShares: 1n,
        allocations: [{ adapter: ADAPTER, marketId: MARKET_A, penaltyWad: 0n }],
      },
    });
    const after = makeVaultState({
      vault: VAULT,
      version: "v2",
      vaultState: {
        userShares: 400n,
        allocations: [{ adapter: ADAPTER, marketId: MARKET_A, assets: 0n }],
      },
      internals: {
        virtualShares: 1n,
        allocations: [{ adapter: ADAPTER, marketId: MARKET_A, penaltyWad: 0n }],
      },
    });
    const op = mkOp({
      type: "vaultV2ForceWithdraw",
      transactionIndex: 0,
      vault: VAULT,
      asset: ASSET,
      exitAssets: 100n,
      adapter: ADAPTER,
      onBehalf: TEST_OWNER,
      receiver: TEST_OWNER,
    });
    const diff = {
      ...emptyDiff,
      balances: [{ account: TEST_OWNER, token: ASSET, assets: 100n }],
    };
    const call = (limits: OperationLimit[]) => () =>
      checkExitOperation(ctxWith(limits), op, before, after, diff);
    test("pass", () => {
      expect(
        call([
          mkLimit({
            type: "vaultV2ForceWithdraw",
            vault: VAULT,
            expectedExitAssets: 100n,
            expectedAdapter: ADAPTER,
            maxSharesBurned: 10n ** 30n,
            minAssetsReceived: 1n,
            maxPenaltyAssets: 10n ** 30n,
          }),
        ]),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["vault", { vault: BAD }],
      ["expectedExitAssets", { expectedExitAssets: 99n }],
      ["expectedAdapter", { expectedAdapter: OTHER }],
      ["maxSharesBurned", { maxSharesBurned: 0n }],
      ["minAssetsReceived", { minAssetsReceived: 10n ** 30n }],
      ["maxPenaltyAssets", { maxPenaltyAssets: -1n }],
    ])("violation: %s", (_f, override) => {
      expect(
        call([
          mkLimit({ type: "vaultV2ForceWithdraw", vault: VAULT, ...override }),
        ]),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("vaultV2ForceRedeem", () => {
    const deallocation = {
      adapter: ADAPTER,
      marketId: MARKET_A,
      assets: 100n,
      data: "0x",
    };
    const before = makeVaultState({
      vault: VAULT,
      version: "v2",
      vaultState: {
        allocations: [{ adapter: ADAPTER, marketId: MARKET_A, assets: 100n }],
      },
      internals: {
        virtualShares: 1n,
        allocations: [{ adapter: ADAPTER, marketId: MARKET_A, penaltyWad: 0n }],
      },
    });
    const after = makeVaultState({
      vault: VAULT,
      version: "v2",
      vaultState: {
        userShares: 400n,
        allocations: [{ adapter: ADAPTER, marketId: MARKET_A, assets: 0n }],
      },
      internals: {
        virtualShares: 1n,
        allocations: [{ adapter: ADAPTER, marketId: MARKET_A, penaltyWad: 0n }],
      },
    });
    const op = mkOp({
      type: "vaultV2ForceRedeem",
      transactionIndex: 0,
      vault: VAULT,
      asset: ASSET,
      shares: 100n,
      receiver: TEST_OWNER,
      onBehalf: TEST_OWNER,
      deallocations: [deallocation],
    });
    const diff = {
      ...emptyDiff,
      balances: [{ account: TEST_OWNER, token: ASSET, assets: 100n }],
    };
    const call = (limits: OperationLimit[]) => () =>
      checkExitOperation(ctxWith(limits), op, before, after, diff);
    test("pass", () => {
      expect(
        call([
          mkLimit({
            type: "vaultV2ForceRedeem",
            vault: VAULT,
            expectedShares: 100n,
            expectedRecipient: TEST_OWNER,
            expectedOnBehalf: TEST_OWNER,
            expectedDeallocations: [
              { adapter: ADAPTER, marketId: MARKET_A, assets: 100n },
            ],
            minAssetsReceived: 1n,
            maxPenaltyShares: 10n ** 30n,
            maxPenaltyAssets: 10n ** 30n,
          }),
        ]),
      ).not.toThrow();
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
            { adapter: ADAPTER, marketId: MARKET_A, assets: 99n },
          ],
        },
      ],
      ["minAssetsReceived", { minAssetsReceived: 10n ** 30n }],
      ["maxPenaltyShares", { maxPenaltyShares: -1n }],
      ["maxPenaltyAssets", { maxPenaltyAssets: -1n }],
    ])("violation: %s", (_f, override) => {
      expect(
        call([
          mkLimit({ type: "vaultV2ForceRedeem", vault: VAULT, ...override }),
        ]),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("vaultV1InKindRedeem", () => {
    const pos = {
      marketId: MARKET_A,
      user: TEST_OWNER,
      supplyAssets: 0n,
      supplyShares: 0n,
      borrowAssets: 0n,
      borrowShares: 0n,
      collateral: 0n,
    };
    const before = makeParsedState({
      vaults: [
        {
          vault: VAULT,
          version: "v1",
          asset: ASSET,
          totalAssets: 1_000n,
          totalShares: 1_000n,
          userShares: 500n,
          idleAssets: 200n,
          allocations: [],
        },
      ],
      positions: [pos],
      internals: {
        markets: new Map(),
        vaults: new Map([
          [
            VAULT,
            {
              version: "v1",
              sharePriceE27: 10n ** 27n,
              decimalsOffset: 0n,
              allocations: [],
            },
          ],
        ]),
        positions: new Map(),
      },
    });
    const after = makeParsedState({
      vaults: [
        {
          vault: VAULT,
          version: "v1",
          asset: ASSET,
          totalAssets: 900n,
          totalShares: 900n,
          userShares: 400n,
          idleAssets: 100n,
          allocations: [],
        },
      ],
      positions: [pos],
      internals: {
        markets: new Map(),
        vaults: new Map([
          [
            VAULT,
            {
              version: "v1",
              sharePriceE27: 10n ** 27n,
              decimalsOffset: 0n,
              allocations: [],
            },
          ],
        ]),
        positions: new Map(),
      },
    });
    const op = mkOp({
      type: "vaultV1InKindRedeem",
      transactionIndex: 0,
      vault: VAULT,
      asset: ASSET,
      assets: 100n,
      owner: TEST_OWNER,
      onBehalf: TEST_OWNER,
      markets: [{ marketId: MARKET_A }, { marketId: MARKET_B }],
    });
    // MARKET_B position also needed
    const posB = { ...pos, marketId: MARKET_B };
    const before2 = makeParsedState({
      vaults: before.vaults,
      positions: [pos, posB],
      internals: before.internals,
    });
    const after2 = makeParsedState({
      vaults: after.vaults,
      positions: [pos, posB],
      internals: after.internals,
    });
    const diff = {
      ...emptyDiff,
      balances: [{ account: TEST_OWNER, token: ASSET, assets: 100n }],
    };
    const call = (limits: OperationLimit[]) => () =>
      checkExitOperation(ctxWith(limits), op, before2, after2, diff);
    test("pass", () => {
      expect(
        call([
          mkLimit({
            type: "vaultV1InKindRedeem",
            vault: VAULT,
            expectedAssets: 100n,
            expectedMarketIds: [MARKET_A, MARKET_B],
            maxSharesBurned: 10n ** 30n,
            minIdleAssetsReceived: 1n,
            minSupplyAssetsByMarket: [{ marketId: MARKET_A, minAssets: 0n }],
            maxPenaltyAssets: 10n ** 30n,
            maxResidualShareAllowance: 10n ** 30n,
          }),
        ]),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["vault", { vault: BAD }],
      ["expectedAssets", { expectedAssets: 99n }],
      ["expectedMarketIds", { expectedMarketIds: [MARKET_A, MARKET_BAD] }],
      ["maxSharesBurned", { maxSharesBurned: 0n }],
      ["minIdleAssetsReceived", { minIdleAssetsReceived: 10n ** 30n }],
      [
        "minSupplyAssetsByMarket",
        { minSupplyAssetsByMarket: [{ marketId: MARKET_A, minAssets: 1n }] },
      ],
      ["maxPenaltyAssets", { maxPenaltyAssets: -1n }],
      ["maxResidualShareAllowance", { maxResidualShareAllowance: -1n }],
    ])("violation: %s", (_f, override) => {
      expect(
        call([
          mkLimit({ type: "vaultV1InKindRedeem", vault: VAULT, ...override }),
        ]),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("vaultV2InKindRedeem", () => {
    const pos = {
      marketId: MARKET_A,
      user: TEST_OWNER,
      supplyAssets: 0n,
      supplyShares: 0n,
      borrowAssets: 0n,
      borrowShares: 0n,
      collateral: 0n,
    };
    const mkState = (vaultState_: object) =>
      makeParsedState({
        vaults: [
          {
            vault: VAULT,
            version: "v2",
            asset: ASSET,
            totalAssets: 1_000n,
            totalShares: 1_000n,
            userShares: 500n,
            idleAssets: 200n,
            allocations: [],
            ...vaultState_,
          },
        ],
        positions: [pos],
        internals: {
          markets: new Map(),
          vaults: new Map([
            [
              VAULT,
              {
                version: "v2",
                sharePriceE27: 10n ** 27n,
                virtualShares: 1n,
                allocations: [],
              },
            ],
          ]),
          positions: new Map(),
        },
      });
    const before = mkState({});
    const after = mkState({
      userShares: 400n,
      totalAssets: 900n,
      totalShares: 900n,
      idleAssets: 100n,
    });
    const op = mkOp({
      type: "vaultV2InKindRedeem",
      transactionIndex: 0,
      vault: VAULT,
      asset: ASSET,
      assets: 100n,
      owner: TEST_OWNER,
      onBehalf: TEST_OWNER,
      markets: [{ marketId: MARKET_A }],
    });
    const diff = {
      ...emptyDiff,
      balances: [{ account: TEST_OWNER, token: ASSET, assets: 100n }],
    };
    test("pass + violation", () => {
      expect(() =>
        checkExitOperation(
          ctxWith([
            mkLimit({
              type: "vaultV2InKindRedeem",
              vault: VAULT,
              minSupplyAssetsByMarket: [{ marketId: MARKET_A, minAssets: 0n }],
              maxSharesBurned: 10n ** 30n,
            }),
          ]),
          op,
          before,
          after,
          diff,
        ),
      ).not.toThrow();
      expect(() =>
        checkExitOperation(
          ctxWith([
            mkLimit({
              type: "vaultV2InKindRedeem",
              vault: VAULT,
              maxSharesBurned: 0n,
            }),
          ]),
          op,
          before,
          after,
          diff,
        ),
      ).toThrow(ConsumerLimitViolationError);
    });
  });
});
