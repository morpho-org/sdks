import { Time } from "@morpho-org/morpho-ts";
import { randomAddress } from "@morpho-org/test/fixtures";
import { describe, expect, test } from "vitest";
import {
  AccrualPosition,
  AccrualVault,
  Market,
  MathLib,
} from "../../src/index.js";

describe("Vault", () => {
  test("should have consistent APRs and APYs", () => {
    const timestamp = Time.timestamp();

    const market = new Market({
      params: {
        collateralToken: randomAddress(),
        loanToken: randomAddress(),
        oracle: randomAddress(),
        irm: randomAddress(),
        lltv: 86_0000000000000000n,
      },
      totalSupplyAssets: 100n,
      totalBorrowAssets: 90n,
      totalSupplyShares: 10000000n,
      totalBorrowShares: 9000000n,
      rateAtTarget: 10_0000000000000000n / Time.s.from.y(1n),
      lastUpdate: timestamp,
      fee: 25_0000000000000000n,
    });

    const market2 = new Market({
      params: {
        collateralToken: randomAddress(),
        loanToken: randomAddress(),
        oracle: randomAddress(),
        irm: randomAddress(),
        lltv: 86_0000000000000000n,
      },
      totalSupplyAssets: 100n,
      totalBorrowAssets: 90n,
      totalSupplyShares: 10000000n,
      totalBorrowShares: 9000000n,
      rateAtTarget: 100_0000000000000000n / Time.s.from.y(1n),
      lastUpdate: timestamp,
      fee: 25_0000000000000000n,
    });

    const vault = new AccrualVault(
      {
        address: randomAddress(),
        owner: randomAddress(),
        asset: randomAddress(),
        totalSupply: 0n,
        lastTotalAssets: 0n,
        supplyQueue: [],
        curator: randomAddress(),
        feeRecipient: randomAddress(),
        fee: 20_0000000000000000n,
        decimalsOffset: 0n,
        skimRecipient: randomAddress(),
        guardian: randomAddress(),
        pendingGuardian: { value: randomAddress(), validAt: 0n },
        pendingOwner: randomAddress(),
        pendingTimelock: { value: 0n, validAt: 0n },
        lostAssets: 0n,
        timelock: 0n,
        withdrawQueue: [market.id, market2.id],
      },
      [
        {
          config: {
            cap: MathLib.MAX_UINT_256,
            enabled: true,
            marketId: market.id,
            pendingCap: { value: 0n, validAt: 0n },
            removableAt: 0n,
            vault: randomAddress(),
          },
          position: new AccrualPosition(
            {
              supplyShares: 5000000n,
              borrowShares: 0n,
              collateral: 0n,
              user: randomAddress(),
            },
            market,
          ),
        },
        {
          config: {
            cap: MathLib.MAX_UINT_256,
            enabled: true,
            marketId: market2.id,
            pendingCap: { value: 0n, validAt: 0n },
            removableAt: 0n,
            vault: randomAddress(),
          },
          position: new AccrualPosition(
            {
              supplyShares: 5000000n,
              borrowShares: 0n,
              collateral: 0n,
              user: randomAddress(),
            },
            market2,
          ),
        },
      ],
    );

    expect(vault.getApy(timestamp)).toBe(0.44954541440127593);
    expect(vault.getNetApy(timestamp)).toBe(0.34581529939809785);
  });

  test("should handle accrueInterest when withdrawQueue contains market not in allocations", () => {
    const timestamp = Time.timestamp();

    const market = new Market({
      params: {
        collateralToken: randomAddress(),
        loanToken: randomAddress(),
        oracle: randomAddress(),
        irm: randomAddress(),
        lltv: 86_0000000000000000n,
      },
      totalSupplyAssets: 100n,
      totalBorrowAssets: 90n,
      totalSupplyShares: 10000000n,
      totalBorrowShares: 9000000n,
      rateAtTarget: 10_0000000000000000n / Time.s.from.y(1n),
      lastUpdate: timestamp,
      fee: 25_0000000000000000n,
    });

    const market2 = new Market({
      params: {
        collateralToken: randomAddress(),
        loanToken: randomAddress(),
        oracle: randomAddress(),
        irm: randomAddress(),
        lltv: 86_0000000000000000n,
      },
      totalSupplyAssets: 100n,
      totalBorrowAssets: 90n,
      totalSupplyShares: 10000000n,
      totalBorrowShares: 9000000n,
      rateAtTarget: 100_0000000000000000n / Time.s.from.y(1n),
      lastUpdate: timestamp,
      fee: 25_0000000000000000n,
    });

    // Create a vault where withdrawQueue contains market2, but allocations only has market
    const vault = new AccrualVault(
      {
        address: randomAddress(),
        owner: randomAddress(),
        asset: randomAddress(),
        totalSupply: 0n,
        lastTotalAssets: 0n,
        supplyQueue: [],
        curator: randomAddress(),
        feeRecipient: randomAddress(),
        fee: 20_0000000000000000n,
        decimalsOffset: 0n,
        skimRecipient: randomAddress(),
        guardian: randomAddress(),
        pendingGuardian: { value: randomAddress(), validAt: 0n },
        pendingOwner: randomAddress(),
        pendingTimelock: { value: 0n, validAt: 0n },
        lostAssets: 0n,
        timelock: 0n,
        withdrawQueue: [market.id, market2.id],
      },
      [
        {
          config: {
            cap: MathLib.MAX_UINT_256,
            enabled: true,
            marketId: market.id,
            pendingCap: { value: 0n, validAt: 0n },
            removableAt: 0n,
            vault: randomAddress(),
          },
          position: new AccrualPosition(
            {
              supplyShares: 5000000n,
              borrowShares: 0n,
              collateral: 0n,
              user: randomAddress(),
            },
            market,
          ),
        },
        // market2 is NOT in allocations
      ],
    );

    // This should not throw even though market2 is in withdrawQueue but not in allocations
    const accruedVault = vault.accrueInterest(timestamp);

    // The accrued vault should only have market in its allocations and withdrawQueue
    expect(accruedVault.withdrawQueue).toHaveLength(1);
    expect(accruedVault.withdrawQueue[0]).toBe(market.id);
    expect(accruedVault.allocations.size).toBe(1);
    expect(accruedVault.allocations.has(market.id)).toBe(true);
    expect(accruedVault.allocations.has(market2.id)).toBe(false);
  });
});
