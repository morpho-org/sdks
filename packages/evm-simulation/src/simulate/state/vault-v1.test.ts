import type { MarketId } from "@morpho-org/blue-sdk";
import { type Address, getAddress } from "viem";
import { describe, expect, test } from "vitest";
import { encodeUint256 } from "../../test-helpers/index.js";
import { decodeVaultValue, vaultV1Reads } from "./vault-v1.js";

const VAULT: Address = getAddress("0xBEEF0173c205AF46a9B1C95C4D1020C0f0b864CB");
const MORPHO: Address = getAddress(
  "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
);
const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const MARKET_ID =
  "0xb8c25cd0a6f03f8b34c8b9b12e24a2a1b3f0f0f0f0f0f0f0f0f0f0f0f0f0f0f" as MarketId;

describe("vaultV1Reads", () => {
  test("emits totals, owner balance and per-market morpho position reads", () => {
    const reads = vaultV1Reads({
      vault: VAULT,
      owner: OWNER,
      morpho: MORPHO,
      allocationMarketIds: [MARKET_ID],
    });
    expect(reads.map((r) => r.kind)).toEqual([
      "vault.totalAssets",
      "vault.totalSupply",
      "vault.balanceOf",
      "morpho.position",
    ]);
    const position = reads[3]!;
    expect(position.kind === "morpho.position" && position.owner).toBe(VAULT);
    expect(position.to).toBe(MORPHO);
  });

  test("no allocation markets emits only vault reads", () => {
    expect(
      vaultV1Reads({
        vault: VAULT,
        owner: OWNER,
        morpho: MORPHO,
        allocationMarketIds: [],
      }),
    ).toHaveLength(3);
  });

  test("decodeVaultValue decodes uint256 totals", () => {
    const [totalAssets] = vaultV1Reads({
      vault: VAULT,
      owner: OWNER,
      morpho: MORPHO,
      allocationMarketIds: [],
    });
    expect(decodeVaultValue(totalAssets!, encodeUint256(123n))).toBe(123n);
  });
});
