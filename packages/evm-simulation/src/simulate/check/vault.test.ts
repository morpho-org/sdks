import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import { StateChangeMismatchError } from "../../errors.js";
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
