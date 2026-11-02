import { encodeAbiParameters } from "viem";
import { describe, expect, test } from "vitest";
import {
  accrualPosition,
  EMPTY_HEX,
  vaultV2AdapterInput,
} from "../../__test__/fixtures.js";
import { InvalidMarketParamsError } from "../../errors.js";
import { marketParamsAbi } from "../../market/MarketParams.js";
import { MathLib } from "../../math/MathLib.js";
import { AccrualVaultV2MorphoMarketV1Adapter } from "./VaultV2MorphoMarketV1Adapter.js";

describe("AccrualVaultV2MorphoMarketV1Adapter", () => {
  test("pendingAllocationIncrease values accrued assets and handles absent or invalid inputs", () => {
    const position = accrualPosition(
      { supplyShares: 500_000n },
      { totalSupplyAssets: 1_000n, totalSupplyShares: 1_000_000n },
    );
    const { address, parentVault, skimRecipient } = vaultV2AdapterInput();
    const adapter = new AccrualVaultV2MorphoMarketV1Adapter(
      {
        address,
        parentVault,
        skimRecipient,
        marketParamsList: [position.market.params],
      },
      [position],
    );
    const data = encodeAbiParameters(
      [marketParamsAbi],
      [position.market.params],
    );
    const allocations = adapter
      .ids(position.market.params)
      .map((id, index) => ({
        id,
        allocation: position.supplyAssets - 20n,
        absoluteCap: index === 2 ? position.supplyAssets + 100n : 10_000n,
        relativeCap: MathLib.WAD,
      }));
    expect(adapter.pendingAllocationIncrease(data, allocations)).toBe(20n);
    expect(adapter.pendingAllocationIncrease(data, [])).toBe(0n);
    expect(
      adapter.pendingAllocationIncrease(
        data,
        allocations.map((entry) => ({
          ...entry,
          allocation: position.supplyAssets + 1n,
        })),
      ),
    ).toBe(0n);
    const empty = new AccrualVaultV2MorphoMarketV1Adapter(adapter, []);
    expect(empty.pendingAllocationIncrease(data, allocations)).toBe(0n);
    expect(() =>
      adapter.pendingAllocationIncrease(EMPTY_HEX, allocations),
    ).toThrow(InvalidMarketParamsError);
  });
});
