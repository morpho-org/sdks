import { Time } from "@morpho-org/morpho-ts";
import { describe, expect, test } from "vitest";
import {
  accrualPosition,
  marketParams,
  RECIPIENT,
  USER,
  vaultInput,
  vaultMarketConfig,
} from "../__test__/fixtures.js";
import { Market } from "../market/Market.js";
import { MathLib } from "../math/MathLib.js";
import { AccrualPosition } from "../position/Position.js";
import type { MarketId } from "../types.js";
import { CapacityLimitReason } from "../utils.js";
import { AccrualVault, Vault } from "./Vault.js";

function accrualVault({
  cap = 200n,
  includeInSupplyQueue = true,
  lostAssets,
}: {
  cap?: bigint;
  includeInSupplyQueue?: boolean;
  lostAssets?: bigint;
} = {}) {
  const position = accrualPosition({ supplyShares: 100n });
  return new AccrualVault(
    vaultInput({
      supplyQueue: includeInSupplyQueue ? [position.marketId] : [],
      totalSupply: 1_000n,
      lastTotalAssets: 50n,
      lostAssets,
    }),
    [
      {
        config: vaultMarketConfig(position.marketId, { cap }),
        position,
      },
    ],
  );
}

describe("Vault", () => {
  test("constructor stores all vault fields", () => {
    const input = vaultInput({
      publicAllocatorConfig: {
        admin: USER,
        fee: 1n,
        accruedFee: 2n,
      },
      lostAssets: 3n,
    });
    const vault = new Vault(input);

    expect(vault.owner).toBe(USER);
    expect(vault.curator).toBe(USER);
    expect(vault.guardian).toBe(USER);
    expect(vault.feeRecipient).toBe(RECIPIENT);
    expect(vault.skimRecipient).toBe(RECIPIENT);
    expect(vault.pendingTimelock).toStrictEqual(input.pendingTimelock);
    expect(vault.pendingTimelock).not.toBe(input.pendingTimelock);
    expect(vault.pendingGuardian).toBe(input.pendingGuardian);
    expect(vault.pendingOwner).toBe(USER);
    expect(vault.timelock).toBe(0n);
    expect(vault.supplyQueue).toStrictEqual([]);
    expect(vault.withdrawQueue).toStrictEqual([]);
    expect(vault.lastTotalAssets).toBe(900n);
    expect(vault.lostAssets).toBe(3n);
    expect(vault.publicAllocatorConfig).toStrictEqual(
      input.publicAllocatorConfig,
    );
  });

  test("totalInterest floors at zero and conversions use vault token math", () => {
    expect(new Vault(vaultInput()).totalInterest).toBe(100n);
    expect(
      new Vault(vaultInput({ totalAssets: 800n, lastTotalAssets: 900n }))
        .totalInterest,
    ).toBe(0n);

    const vault = new Vault(vaultInput());
    expect(vault.toAssets(100n)).toBe(100n);
    expect(vault.toShares(100n)).toBe(100n);
  });
});

describe("AccrualVault", () => {
  test("constructor builds ordered allocations and collateral allocation summaries", () => {
    const firstPosition = accrualPosition({ supplyShares: 100n });
    const secondPosition = accrualPosition(
      { supplyShares: 50n },
      { params: marketParams({ oracle: RECIPIENT }) },
    );
    const vault = new AccrualVault(
      vaultInput({
        supplyQueue: [firstPosition.marketId, secondPosition.marketId],
        totalSupply: 1_000n,
      }),
      [
        {
          config: vaultMarketConfig(firstPosition.marketId, { cap: 1_000n }),
          position: firstPosition,
        },
        {
          config: vaultMarketConfig(secondPosition.marketId, { cap: 1_000n }),
          position: secondPosition,
        },
      ],
    );
    const marketId = vault.withdrawQueue[0]!;
    const allocation = vault.allocations.get(marketId);

    expect(allocation?.marketId).toBe(marketId);
    expect(vault.totalAssets).toBe(150n);
    expect(vault.collateralAllocations.size).toBe(1);
    expect(
      vault.collateralAllocations.get(
        allocation?.position.market.params.collateralToken ?? RECIPIENT,
      )?.proportion,
    ).toBe(MathLib.WAD - 1n);
  });

  test("liquidity sums allocation withdraw capacity", () => {
    expect(accrualVault().liquidity).toBe(100n);
  });

  test("apy helpers return zero for empty vaults and positive values otherwise", () => {
    const empty = new AccrualVault(vaultInput({ supplyQueue: [] }), []);
    const funded = accrualVault();

    expect(empty.apy).toBe(0);
    expect(empty.getApy()).toBe(0);
    expect(empty.netApy).toBe(0);
    expect(funded.getApy(200n)).toBeGreaterThanOrEqual(0);
    expect(funded.getNetApy(200n)).toBeGreaterThanOrEqual(0);
  });

  test("APY helpers match known weighted market examples", () => {
    const timestamp = 1_000_000n;
    const slowMarket = new Market({
      params: marketParams(),
      totalSupplyAssets: 100n,
      totalBorrowAssets: 90n,
      totalSupplyShares: 10_000_000n,
      totalBorrowShares: 9_000_000n,
      rateAtTarget: 10_0000000000000000n / Time.s.from.y(1n),
      lastUpdate: timestamp,
      fee: 25_0000000000000000n,
    });
    const fastMarket = new Market({
      params: marketParams({ oracle: RECIPIENT }),
      totalSupplyAssets: 100n,
      totalBorrowAssets: 90n,
      totalSupplyShares: 10_000_000n,
      totalBorrowShares: 9_000_000n,
      rateAtTarget: 100_0000000000000000n / Time.s.from.y(1n),
      lastUpdate: timestamp,
      fee: 25_0000000000000000n,
    });
    const vault = new AccrualVault(
      vaultInput({
        totalSupply: 0n,
        lastTotalAssets: 0n,
        supplyQueue: [],
        fee: 20_0000000000000000n,
      }),
      [
        {
          config: vaultMarketConfig(slowMarket.id, {
            cap: MathLib.MAX_UINT_256,
          }),
          position: new AccrualPosition(
            {
              user: USER,
              supplyShares: 5_000_000n,
              borrowShares: 0n,
              collateral: 0n,
            },
            slowMarket,
          ),
        },
        {
          config: vaultMarketConfig(fastMarket.id, {
            cap: MathLib.MAX_UINT_256,
          }),
          position: new AccrualPosition(
            {
              user: USER,
              supplyShares: 5_000_000n,
              borrowShares: 0n,
              collateral: 0n,
            },
            fastMarket,
          ),
        },
      ],
    );

    expect(vault.getApy(timestamp)).toBe(0.44954541440127593);
    expect(vault.getNetApy(timestamp)).toBe(0.34581529939809785);
  });

  test("getAllocationProportion handles empty and missing allocations", () => {
    const empty = new AccrualVault(vaultInput({ supplyQueue: [] }), []);
    const vault = accrualVault();
    const marketId = vault.withdrawQueue[0]!;

    expect(empty.getAllocationProportion(marketId)).toBe(0n);
    expect(vault.getAllocationProportion("0x1234" as MarketId)).toBe(0n);
    expect(vault.getAllocationProportion(marketId)).toBe(MathLib.WAD);
  });

  test("maxDeposit is cap limited or balance limited", () => {
    expect(accrualVault().maxDeposit(150n)).toStrictEqual({
      value: 100n,
      limiter: CapacityLimitReason.cap,
    });
    expect(accrualVault().maxDeposit(50n)).toStrictEqual({
      value: 50n,
      limiter: CapacityLimitReason.balance,
    });
    expect(
      accrualVault({ includeInSupplyQueue: false }).maxDeposit(1n),
    ).toStrictEqual({
      value: 0n,
      limiter: CapacityLimitReason.cap,
    });
  });

  test("deprecated deposit capacity alias delegates to maxDeposit", () => {
    const vault = accrualVault();

    expect(vault.getDepositCapacityLimit(50n)).toStrictEqual(
      vault.maxDeposit(50n),
    );
  });

  test("maxWithdraw is liquidity limited or balance limited", () => {
    expect(accrualVault().maxWithdraw(100n)).toStrictEqual({
      value: 10n,
      limiter: CapacityLimitReason.balance,
    });
    expect(accrualVault().maxWithdraw(10_000n)).toStrictEqual({
      value: 100n,
      limiter: CapacityLimitReason.liquidity,
    });
  });

  test("deprecated withdraw capacity alias delegates to maxWithdraw", () => {
    const vault = accrualVault();

    expect(vault.getWithdrawCapacityLimit(100n)).toStrictEqual(
      vault.maxWithdraw(100n),
    );
  });

  test("accrueInterest keeps withdraw queue order and mints fee shares", () => {
    const vault = accrualVault();
    const accrued = vault.accrueInterest(200n);

    expect(accrued).not.toBe(vault);
    expect(accrued.withdrawQueue).toStrictEqual(vault.withdrawQueue);
    expect(accrued.totalAssets).toBeGreaterThan(0n);
    expect(accrued.totalSupply).toBeGreaterThan(vault.totalSupply);
    expect(accrued.lastTotalAssets).toBe(accrued.totalAssets);
  });

  test("accrueInterest accounts for configured lost assets", () => {
    const accrued = accrualVault({ lostAssets: 1n }).accrueInterest(200n);

    expect(accrued.lostAssets).toBeGreaterThanOrEqual(1n);
    expect(accrued.totalAssets).toBeGreaterThanOrEqual(accrued.lastTotalAssets);
  });
});
