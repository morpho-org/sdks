import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  ConsumerLimitViolationError,
  StateChangeMismatchError,
} from "../../errors.js";
import {
  emptyDiff,
  makeCheckContext,
  makeVaultState,
  TEST_OWNER,
} from "../../test-helpers/index.js";
import type { VaultInternals } from "../state/types.js";
import { checkVaultOperation, vaultToAssets, vaultToShares } from "./vault.js";

const VAULT: Address = getAddress("0xBEEF0173c205AF46a9B1C95C4D1020C0f0b864CB");
const ASSET: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const OTHER: Address = getAddress("0x00000000000000000000000000000000000000ff");

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

const vaultState = {
  vault: VAULT,
  version: "v1" as const,
  asset: ASSET,
  totalAssets: 1_000n,
  totalShares: 1_000n,
  userShares: 500n,
  idleAssets: 0n,
  allocations: [],
};

type Op = Parameters<typeof checkVaultOperation>[1];
const mkOp = (op: object) => op as Op;
const ctx = makeCheckContext();

describe("vault share/asset conversion", () => {
  test("v1 decimalsOffset=0 → 1:1 conversion", () => {
    expect(vaultToShares(vaultState, v1Internals, 100n)).toBe(100n);
    expect(vaultToAssets(vaultState, v1Internals, 100n)).toBe(100n);
  });

  test("v2 uses virtualShares in the supply", () => {
    expect(vaultToShares(vaultState, v2Internals, 100n)).toBe(100n);
    expect(vaultToAssets(vaultState, v2Internals, 100n)).toBe(100n);
  });
});

describe("checkVaultOperation", () => {
  test("error: vault missing from read state", () => {
    const op = mkOp({ type: "vaultV1Deposit", vault: VAULT });
    const state = makeVaultState({ vault: VAULT });
    const other = makeVaultState({
      vault: getAddress("0x0000000000000000000000000000000000000009"),
    });
    expect(() =>
      checkVaultOperation(ctx, op, state, other, { ...emptyDiff }),
    ).toThrow(StateChangeMismatchError);
  });

  describe("deposit", () => {
    const before = makeVaultState({ vault: VAULT });
    const after = makeVaultState({
      vault: VAULT,
      vaultState: {
        totalAssets: 1_100n,
        totalShares: 1_100n,
        userShares: 600n,
      },
    });
    const op = mkOp({ type: "vaultV1Deposit", vault: VAULT });
    test("pass", () => {
      expect(() =>
        checkVaultOperation(ctx, op, before, after, { ...emptyDiff }),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["expectedAssets", { expectedAssets: 99n }],
      ["minSharesMinted", { minSharesMinted: 999n }],
    ])("violation: %s", (_f, override) => {
      expect(() =>
        checkVaultOperation(
          ctx,
          mkOp({ type: "vaultV1Deposit", vault: VAULT, ...override }),
          before,
          after,
          { ...emptyDiff },
        ),
      ).toThrow(ConsumerLimitViolationError);
    });
    test("expectedReceiver: shares credited to a distinct receiver", () => {
      const diff = {
        ...emptyDiff,
        balances: [
          {
            account: OTHER,
            token: VAULT,
            before: 0n,
            after: 100n,
            assets: 100n,
          },
        ],
      };
      expect(() =>
        checkVaultOperation(
          ctx,
          mkOp({
            type: "vaultV1Deposit",
            vault: VAULT,
            expectedReceiver: OTHER,
          }),
          before,
          after,
          diff,
        ),
      ).not.toThrow();
    });
  });

  describe("withdraw", () => {
    const before = makeVaultState({ vault: VAULT });
    const after = makeVaultState({
      vault: VAULT,
      vaultState: { totalAssets: 900n, totalShares: 900n, userShares: 400n },
    });
    const diff = {
      ...emptyDiff,
      balances: [
        {
          account: TEST_OWNER,
          token: ASSET,
          before: 0n,
          after: 100n,
          assets: 100n,
        },
      ],
    };
    test("pass", () => {
      expect(() =>
        checkVaultOperation(
          ctx,
          mkOp({ type: "vaultV1Withdraw", vault: VAULT, expectedAssets: 100n }),
          before,
          after,
          diff,
        ),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["expectedAssets", { expectedAssets: 99n }],
      ["maxSharesBurned", { maxSharesBurned: 99n }],
    ])("violation: %s", (_f, override) => {
      expect(() =>
        checkVaultOperation(
          ctx,
          mkOp({ type: "vaultV1Withdraw", vault: VAULT, ...override }),
          before,
          after,
          diff,
        ),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("redeem", () => {
    const before = makeVaultState({ vault: VAULT });
    const after = makeVaultState({
      vault: VAULT,
      vaultState: { totalAssets: 900n, totalShares: 900n, userShares: 400n },
    });
    const diff = {
      ...emptyDiff,
      balances: [
        {
          account: TEST_OWNER,
          token: ASSET,
          before: 0n,
          after: 100n,
          assets: 100n,
        },
      ],
    };
    test("pass", () => {
      expect(() =>
        checkVaultOperation(
          ctx,
          mkOp({ type: "vaultV1Redeem", vault: VAULT, expectedShares: 100n }),
          before,
          after,
          diff,
        ),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["expectedShares", { expectedShares: 99n }],
      ["minAssetsReceived", { minAssetsReceived: 999n }],
    ])("violation: %s", (_f, override) => {
      expect(() =>
        checkVaultOperation(
          ctx,
          mkOp({ type: "vaultV1Redeem", vault: VAULT, ...override }),
          before,
          after,
          diff,
        ),
      ).toThrow(ConsumerLimitViolationError);
    });
  });
});
