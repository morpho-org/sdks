import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  ConsumerLimitViolationError,
  StateChangeMismatchError,
} from "../../errors.js";
import type { OperationLimit } from "../../limits.js";
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
    const op = {
      type: "vaultV1Deposit",
      transactionIndex: 0,
      vault: VAULT,
      funding: { type: "erc20", token: ASSET, assets: 100n },
      receiver: TEST_OWNER,
    } as unknown as Parameters<typeof checkVaultOperation>[1];
    const state = makeVaultState({ vault: VAULT });
    const other = makeVaultState({
      vault: getAddress("0x0000000000000000000000000000000000000009"),
    });
    expect(() =>
      checkVaultOperation(makeCheckContext(), op, state, other, {
        ...emptyDiff,
      }),
    ).toThrow(StateChangeMismatchError);
  });
});

describe("checkVaultOperation — consumer limits", () => {
  const ctxWith = (operations: OperationLimit[]) =>
    makeCheckContext({ limits: { ...makeCheckContext().limits, operations } });

  const OTHER: Address = getAddress(
    "0x00000000000000000000000000000000000000ff",
  );
  const BAD_VAULT: Address = getAddress(
    "0x0000000000000000000000000000000000000bad",
  );

  type Op = Parameters<typeof checkVaultOperation>[1];
  const mkOp = (op: object) => op as Op;
  const mkLimit = (limit: object) => limit as OperationLimit;

  // biome-ignore lint/complexity/useMaxParams: fixture builder reads clearest with positional arguments
  const beforeVault = (
    version: "v1" | "v2",
    vaultState_ = {},
    internals_ = {},
  ) =>
    makeVaultState({
      vault: VAULT,
      version,
      vaultState: { ...vaultState, ...vaultState_ },
      internals: {
        ...(version === "v1" ? v1Internals : v2Internals),
        ...internals_,
      },
    });
  // biome-ignore lint/complexity/useMaxParams: fixture builder reads clearest with positional arguments
  const afterVault = (
    version: "v1" | "v2",
    vaultState_ = {},
    internals_ = {},
  ) => beforeVault(version, vaultState_, internals_);

  const credit = (account: Address, assets: bigint) => ({
    ...emptyDiff,
    balances: [
      {
        account,
        token: ASSET,
        assets,
      },
    ],
  });

  describe("vaultV1Deposit", () => {
    const before = beforeVault("v1");
    const after = afterVault("v1", {
      totalAssets: 1_100n,
      totalShares: 1_100n,
      userShares: 600n,
    });
    const op = mkOp({
      type: "vaultV1Deposit",
      transactionIndex: 0,
      vault: VAULT,
      asset: ASSET,
      funding: { type: "erc20", token: ASSET, assets: 100n },
      receiver: TEST_OWNER,
    });
    const call = (limits: OperationLimit[]) => () =>
      checkVaultOperation(ctxWith(limits), op, before, after, { ...emptyDiff });
    test("pass", () => {
      expect(
        call([
          mkLimit({
            type: "vaultV1Deposit",
            vault: VAULT,
            expectedAssets: 100n,
            expectedReceiver: TEST_OWNER,
            minSharesMinted: 1n,
          }),
        ]),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["vault", { vault: BAD_VAULT }],
      ["expectedAssets", { expectedAssets: 99n }],
      ["expectedReceiver", { expectedReceiver: OTHER }],
      ["minSharesMinted", { minSharesMinted: 10n ** 30n }],
    ])("violation: %s", (_f, override) => {
      expect(
        call([mkLimit({ type: "vaultV1Deposit", vault: VAULT, ...override })]),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("vaultV2Deposit", () => {
    const before = beforeVault("v2", { version: "v2" });
    const after = afterVault("v2", {
      version: "v2",
      totalAssets: 1_100n,
      totalShares: 1_100n,
      userShares: 600n,
    });
    const op = mkOp({
      type: "vaultV2Deposit",
      transactionIndex: 0,
      vault: VAULT,
      asset: ASSET,
      funding: { type: "erc20", token: ASSET, assets: 100n },
      receiver: TEST_OWNER,
    });
    test("pass + violation", () => {
      expect(() =>
        checkVaultOperation(
          ctxWith([
            mkLimit({
              type: "vaultV2Deposit",
              vault: VAULT,
              minSharesMinted: 1n,
            }),
          ]),
          op,
          before,
          after,
          { ...emptyDiff },
        ),
      ).not.toThrow();
      expect(() =>
        checkVaultOperation(
          ctxWith([
            mkLimit({
              type: "vaultV2Deposit",
              vault: VAULT,
              minSharesMinted: 10n ** 30n,
            }),
          ]),
          op,
          before,
          after,
          { ...emptyDiff },
        ),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("vaultV1Withdraw", () => {
    const before = beforeVault("v1");
    const after = afterVault("v1", {
      totalAssets: 900n,
      totalShares: 900n,
      userShares: 400n,
    });
    const op = mkOp({
      type: "vaultV1Withdraw",
      transactionIndex: 0,
      vault: VAULT,
      asset: ASSET,
      assets: 100n,
      receiver: TEST_OWNER,
    });
    const diff = credit(TEST_OWNER, 100n);
    const call = (limits: OperationLimit[]) => () =>
      checkVaultOperation(ctxWith(limits), op, before, after, diff);
    test("pass", () => {
      expect(
        call([
          mkLimit({
            type: "vaultV1Withdraw",
            vault: VAULT,
            expectedAssets: 100n,
            expectedReceiver: TEST_OWNER,
            maxSharesBurned: 10n ** 30n,
          }),
        ]),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["vault", { vault: BAD_VAULT }],
      ["expectedAssets", { expectedAssets: 99n }],
      ["expectedReceiver", { expectedReceiver: OTHER }],
      ["maxSharesBurned", { maxSharesBurned: 0n }],
    ])("violation: %s", (_f, override) => {
      expect(
        call([mkLimit({ type: "vaultV1Withdraw", vault: VAULT, ...override })]),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("vaultV2Withdraw", () => {
    const before = beforeVault("v2", { version: "v2" });
    const after = afterVault("v2", {
      version: "v2",
      totalAssets: 900n,
      totalShares: 900n,
      userShares: 400n,
    });
    const op = mkOp({
      type: "vaultV2Withdraw",
      transactionIndex: 0,
      vault: VAULT,
      asset: ASSET,
      assets: 100n,
      receiver: TEST_OWNER,
    });
    const diff = credit(TEST_OWNER, 100n);
    test("pass + violation", () => {
      expect(() =>
        checkVaultOperation(
          ctxWith([
            mkLimit({
              type: "vaultV2Withdraw",
              vault: VAULT,
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
        checkVaultOperation(
          ctxWith([
            mkLimit({
              type: "vaultV2Withdraw",
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

  describe("vaultV1Redeem", () => {
    const before = beforeVault("v1");
    const after = afterVault("v1", {
      totalAssets: 900n,
      totalShares: 900n,
      userShares: 400n,
    });
    const op = mkOp({
      type: "vaultV1Redeem",
      transactionIndex: 0,
      vault: VAULT,
      asset: ASSET,
      shares: 100n,
      receiver: TEST_OWNER,
    });
    const diff = credit(TEST_OWNER, 100n);
    const call = (limits: OperationLimit[]) => () =>
      checkVaultOperation(ctxWith(limits), op, before, after, diff);
    test("pass", () => {
      expect(
        call([
          mkLimit({
            type: "vaultV1Redeem",
            vault: VAULT,
            expectedShares: 100n,
            expectedReceiver: TEST_OWNER,
            minAssetsReceived: 1n,
          }),
        ]),
      ).not.toThrow();
    });
    test.each<[string, object]>([
      ["vault", { vault: BAD_VAULT }],
      ["expectedShares", { expectedShares: 99n }],
      ["expectedReceiver", { expectedReceiver: OTHER }],
      ["minAssetsReceived", { minAssetsReceived: 10n ** 30n }],
    ])("violation: %s", (_f, override) => {
      expect(
        call([mkLimit({ type: "vaultV1Redeem", vault: VAULT, ...override })]),
      ).toThrow(ConsumerLimitViolationError);
    });
  });

  describe("vaultV2Redeem", () => {
    const before = beforeVault("v2", { version: "v2" });
    const after = afterVault("v2", {
      version: "v2",
      totalAssets: 900n,
      totalShares: 900n,
      userShares: 400n,
    });
    const op = mkOp({
      type: "vaultV2Redeem",
      transactionIndex: 0,
      vault: VAULT,
      asset: ASSET,
      shares: 100n,
      receiver: TEST_OWNER,
    });
    const diff = credit(TEST_OWNER, 100n);
    test("pass + violation", () => {
      expect(() =>
        checkVaultOperation(
          ctxWith([
            mkLimit({
              type: "vaultV2Redeem",
              vault: VAULT,
              minAssetsReceived: 1n,
            }),
          ]),
          op,
          before,
          after,
          diff,
        ),
      ).not.toThrow();
      expect(() =>
        checkVaultOperation(
          ctxWith([
            mkLimit({
              type: "vaultV2Redeem",
              vault: VAULT,
              minAssetsReceived: 10n ** 30n,
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
