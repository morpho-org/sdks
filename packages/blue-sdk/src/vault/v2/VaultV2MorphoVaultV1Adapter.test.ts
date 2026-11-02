import { describe, expect, test, vi } from "vitest";
import {
  accrualPosition,
  EMPTY_HEX,
  RECIPIENT,
  vaultInput,
  vaultMarketConfig,
  vaultV2AdapterInput,
} from "../../__test__/fixtures.js";
import { MathLib } from "../../math/MathLib.js";
import { AccrualVault } from "../Vault.js";
import { AccrualVaultV2MorphoVaultV1Adapter } from "./VaultV2MorphoVaultV1Adapter.js";

describe("AccrualVaultV2MorphoVaultV1Adapter.pendingAllocationIncrease", () => {
  test("values current shares without extra accrual and ignores inactive allocations", () => {
    const position = accrualPosition({ supplyShares: 100_000n });
    const nested = new AccrualVault(
      vaultInput({ supplyQueue: [position.marketId] }),
      [
        {
          config: vaultMarketConfig(position.marketId, { cap: 10n ** 18n }),
          position,
        },
      ],
    );
    const adapter = new AccrualVaultV2MorphoVaultV1Adapter(
      { ...vaultV2AdapterInput(), morphoVaultV1: RECIPIENT },
      nested,
      100n,
    );
    const assets = nested.toAssets(adapter.shares);
    const allocation = {
      id: adapter.adapterId,
      allocation: assets - 1n,
      absoluteCap: assets + 50n,
      relativeCap: MathLib.WAD,
    };
    expect(adapter.pendingAllocationIncrease(EMPTY_HEX, [allocation])).toBe(1n);
    const accrue = vi.spyOn(nested, "accrueInterest");
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2100-01-01T00:00:00Z"));
      expect(adapter.pendingAllocationIncrease(EMPTY_HEX, [allocation])).toBe(
        1n,
      );
      expect(accrue).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      accrue.mockRestore();
    }
    expect(adapter.pendingAllocationIncrease(EMPTY_HEX, [])).toBe(0n);
    expect(
      adapter.pendingAllocationIncrease(EMPTY_HEX, [
        { ...allocation, allocation: assets + 1n },
      ]),
    ).toBe(0n);
    const inactive = new AccrualVaultV2MorphoVaultV1Adapter(
      adapter,
      {} as AccrualVault,
      0n,
    );
    expect(inactive.pendingAllocationIncrease(EMPTY_HEX, [allocation])).toBe(
      0n,
    );
    const unallocated = new AccrualVaultV2MorphoVaultV1Adapter(
      { ...adapter, parentAllocation: 0n },
      nested,
      100n,
    );
    expect(unallocated.pendingAllocationIncrease(EMPTY_HEX, [allocation])).toBe(
      1n,
    );
  });
});
