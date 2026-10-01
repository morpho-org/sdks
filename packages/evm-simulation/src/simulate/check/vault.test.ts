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
import type { CheckedOperation } from "./helpers.js";
import {
  checkVaultOperation,
  checkVaultOperationLimits,
  vaultToAssets,
  vaultToShares,
} from "./vault.js";

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

describe("checkVaultOperationLimits", () => {
  const ctxWith = (operations: OperationLimit[]) =>
    makeCheckContext({ limits: { ...makeCheckContext().limits, operations } });

  const checked = (operation: object, outcome: object) =>
    ({ operation, outcome }) as CheckedOperation;

  const OTHER: Address = getAddress(
    "0x00000000000000000000000000000000000000ff",
  );
  const BAD_VAULT: Address = getAddress(
    "0x0000000000000000000000000000000000000bad",
  );

  const depositOp = {
    type: "vaultV1Deposit",
    transactionIndex: 0,
    vault: VAULT,
    funding: { type: "erc20", token: ASSET, assets: 100n },
    receiver: TEST_OWNER,
  };
  const withdrawOp = {
    type: "vaultV1Withdraw",
    transactionIndex: 0,
    vault: VAULT,
    assets: 100n,
    receiver: TEST_OWNER,
  };
  const redeemOp = {
    type: "vaultV1Redeem",
    transactionIndex: 0,
    vault: VAULT,
    shares: 100n,
    receiver: TEST_OWNER,
  };

  test("deposit pass: all fields satisfied", () => {
    const limit: OperationLimit = {
      type: "vaultV1Deposit",
      vault: VAULT,
      expectedAssets: 100n,
      expectedReceiver: TEST_OWNER,
      minSharesMinted: 50n,
    };
    expect(() =>
      checkVaultOperationLimits(
        ctxWith([limit]),
        checked(depositOp, { sharesMinted: 100n }),
      ),
    ).not.toThrow();
  });
  test.each<[string, object]>([
    ["vault", { vault: BAD_VAULT }],
    ["expectedAssets", { expectedAssets: 99n }],
    ["expectedReceiver", { expectedReceiver: OTHER }],
    ["minSharesMinted", { minSharesMinted: 101n }],
  ])("deposit violation: %s", (_field, override) => {
    expect(() =>
      checkVaultOperationLimits(
        ctxWith([
          {
            type: "vaultV1Deposit",
            vault: VAULT,
            ...override,
          } as OperationLimit,
        ]),
        checked(depositOp, { sharesMinted: 100n }),
      ),
    ).toThrow(ConsumerLimitViolationError);
  });

  test("deposit (v2) pass", () => {
    const op = { ...depositOp, type: "vaultV2Deposit" };
    const limit: OperationLimit = {
      type: "vaultV2Deposit",
      vault: VAULT,
      expectedAssets: 100n,
      minSharesMinted: 100n,
    };
    expect(() =>
      checkVaultOperationLimits(
        ctxWith([limit]),
        checked(op, { sharesMinted: 100n }),
      ),
    ).not.toThrow();
  });
  test("deposit (v2) violation: minSharesMinted", () => {
    const op = { ...depositOp, type: "vaultV2Deposit" };
    const limit: OperationLimit = {
      type: "vaultV2Deposit",
      vault: VAULT,
      minSharesMinted: 101n,
    };
    expect(() =>
      checkVaultOperationLimits(
        ctxWith([limit]),
        checked(op, { sharesMinted: 100n }),
      ),
    ).toThrow(ConsumerLimitViolationError);
  });

  test("withdraw pass: all fields satisfied", () => {
    const limit: OperationLimit = {
      type: "vaultV1Withdraw",
      vault: VAULT,
      expectedAssets: 100n,
      expectedReceiver: TEST_OWNER,
      maxSharesBurned: 200n,
    };
    expect(() =>
      checkVaultOperationLimits(
        ctxWith([limit]),
        checked(withdrawOp, { sharesBurned: 100n }),
      ),
    ).not.toThrow();
  });
  test.each<[string, object]>([
    ["vault", { vault: BAD_VAULT }],
    ["expectedAssets", { expectedAssets: 99n }],
    ["expectedReceiver", { expectedReceiver: OTHER }],
    ["maxSharesBurned", { maxSharesBurned: 99n }],
  ])("withdraw violation: %s", (_field, override) => {
    expect(() =>
      checkVaultOperationLimits(
        ctxWith([
          {
            type: "vaultV1Withdraw",
            vault: VAULT,
            ...override,
          } as OperationLimit,
        ]),
        checked(withdrawOp, { sharesBurned: 100n }),
      ),
    ).toThrow(ConsumerLimitViolationError);
  });
  test("withdraw (v2) pass + violation: maxSharesBurned", () => {
    const op = { ...withdrawOp, type: "vaultV2Withdraw" };
    const pass: OperationLimit = {
      type: "vaultV2Withdraw",
      vault: VAULT,
      maxSharesBurned: 100n,
    };
    expect(() =>
      checkVaultOperationLimits(
        ctxWith([pass]),
        checked(op, { sharesBurned: 100n }),
      ),
    ).not.toThrow();
    const fail: OperationLimit = {
      type: "vaultV2Withdraw",
      vault: VAULT,
      maxSharesBurned: 99n,
    };
    expect(() =>
      checkVaultOperationLimits(
        ctxWith([fail]),
        checked(op, { sharesBurned: 100n }),
      ),
    ).toThrow(ConsumerLimitViolationError);
  });

  test("redeem pass: all fields satisfied", () => {
    const limit: OperationLimit = {
      type: "vaultV1Redeem",
      vault: VAULT,
      expectedShares: 100n,
      expectedReceiver: TEST_OWNER,
      minAssetsReceived: 50n,
    };
    expect(() =>
      checkVaultOperationLimits(
        ctxWith([limit]),
        checked(redeemOp, { assetsReceived: 100n }),
      ),
    ).not.toThrow();
  });
  test.each<[string, object]>([
    ["vault", { vault: BAD_VAULT }],
    ["expectedShares", { expectedShares: 99n }],
    ["expectedReceiver", { expectedReceiver: OTHER }],
    ["minAssetsReceived", { minAssetsReceived: 101n }],
  ])("redeem violation: %s", (_field, override) => {
    expect(() =>
      checkVaultOperationLimits(
        ctxWith([
          {
            type: "vaultV1Redeem",
            vault: VAULT,
            ...override,
          } as OperationLimit,
        ]),
        checked(redeemOp, { assetsReceived: 100n }),
      ),
    ).toThrow(ConsumerLimitViolationError);
  });
  test("redeem (v2) pass + violation: minAssetsReceived", () => {
    const op = { ...redeemOp, type: "vaultV2Redeem" };
    const pass: OperationLimit = {
      type: "vaultV2Redeem",
      vault: VAULT,
      minAssetsReceived: 100n,
    };
    expect(() =>
      checkVaultOperationLimits(
        ctxWith([pass]),
        checked(op, { assetsReceived: 100n }),
      ),
    ).not.toThrow();
    const fail: OperationLimit = {
      type: "vaultV2Redeem",
      vault: VAULT,
      minAssetsReceived: 101n,
    };
    expect(() =>
      checkVaultOperationLimits(
        ctxWith([fail]),
        checked(op, { assetsReceived: 100n }),
      ),
    ).toThrow(ConsumerLimitViolationError);
  });
});
