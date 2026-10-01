import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
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
