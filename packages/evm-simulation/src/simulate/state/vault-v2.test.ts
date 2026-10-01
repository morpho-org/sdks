import { type Address, getAddress, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { encodeUint256 } from "../../test-helpers/index.js";
import { decodeVaultValue } from "./vault-v1.js";
import { vaultV2Reads } from "./vault-v2.js";

const VAULT: Address = getAddress("0x0442222fBEecF2b8490b940EFb834e32e9E5C145");
const ASSET: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const ADAPTER: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);
const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const ALLOCATION_ID =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`;

describe("vaultV2Reads", () => {
  test("idle reads the asset balance of the liquidity adapter", () => {
    const reads = vaultV2Reads({
      vault: VAULT,
      owner: OWNER,
      asset: ASSET,
      liquidityAdapter: ADAPTER,
      allocationIds: [ALLOCATION_ID],
    });
    expect(reads.map((r) => r.kind)).toEqual([
      "vault.totalAssets",
      "vault.totalSupply",
      "vault.balanceOf",
      "vault.idleAssets",
      "vault.allocation",
    ]);
    const idle = reads[3]!;
    // The idle read calls asset.balanceOf(adapter), not a vault view.
    expect(idle.kind === "vault.idleAssets" && idle.to).toBe(ASSET);
  });

  test("no adapter → no idle read", () => {
    const reads = vaultV2Reads({
      vault: VAULT,
      owner: OWNER,
      asset: ASSET,
      liquidityAdapter: zeroAddress,
      allocationIds: [],
    });
    expect(reads.some((r) => r.kind === "vault.idleAssets")).toBe(false);
  });

  test("allocation reads decode as uint256", () => {
    const reads = vaultV2Reads({
      vault: VAULT,
      owner: OWNER,
      asset: ASSET,
      allocationIds: [ALLOCATION_ID],
    });
    const allocation = reads.find((r) => r.kind === "vault.allocation")!;
    expect(decodeVaultValue(allocation, encodeUint256(77n))).toBe(77n);
  });
});
