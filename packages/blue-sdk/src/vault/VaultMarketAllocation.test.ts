import { describe, expect, test } from "vitest";
import { accrualPosition, vaultMarketConfig } from "../__test__/fixtures.js";
import { MathLib } from "../math/MathLib.js";
import { VaultMarketAllocation } from "./VaultMarketAllocation.js";

describe("VaultMarketAllocation", () => {
  test("constructor normalizes config and exposes vault and market id", () => {
    const position = accrualPosition();
    const config = vaultMarketConfig(position.marketId);
    const allocation = new VaultMarketAllocation({ config, position });

    expect(allocation.config).not.toBe(config);
    expect(allocation.position).toBe(position);
    expect(allocation.vault).toBe(config.vault);
    expect(allocation.marketId).toBe(position.marketId);
  });

  test("utilization is MAX_UINT_256 when cap is zero", () => {
    const position = accrualPosition();
    const allocation = new VaultMarketAllocation({
      config: vaultMarketConfig(position.marketId, { cap: 0n }),
      position,
    });

    expect(allocation.utilization).toBe(MathLib.MAX_UINT_256);
  });

  test("utilization is supply assets over cap", () => {
    const position = accrualPosition({ supplyShares: 100n });
    const allocation = new VaultMarketAllocation({
      config: vaultMarketConfig(position.marketId, { cap: 400n }),
      position,
    });

    expect(allocation.utilization).toBe(250_000_000_000_000_000n);
  });
});
