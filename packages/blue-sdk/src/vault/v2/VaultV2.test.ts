import { encodeAbiParameters, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import {
  ADAPTER,
  accrualPosition,
  EMPTY_HEX,
  LIQUIDITY_ADAPTER,
  market,
  marketParams,
  RECIPIENT,
  vaultV2AdapterInput,
  vaultV2Input,
} from "../../__test__/fixtures.js";
import { VaultV2Errors } from "../../errors.js";
import { MarketParams, marketParamsAbi } from "../../market/MarketParams.js";
import { MathLib } from "../../math/MathLib.js";
import { CapacityLimitReason } from "../../utils.js";
import type { AccrualVault } from "../Vault.js";
import { AccrualVaultV2, VaultV2 } from "./VaultV2.js";
import type {
  IAccrualVaultV2Adapter,
  IVaultV2Adapter,
} from "./VaultV2Adapter.js";
import { VaultV2Adapter } from "./VaultV2Adapter.js";
import {
  AccrualVaultV2MorphoMarketV1Adapter,
  VaultV2MorphoMarketV1Adapter,
} from "./VaultV2MorphoMarketV1Adapter.js";
import {
  AccrualVaultV2MorphoMarketV1AdapterV2,
  VaultV2MorphoMarketV1AdapterV2,
} from "./VaultV2MorphoMarketV1AdapterV2.js";
import {
  AccrualVaultV2MorphoVaultV1Adapter,
  VaultV2MorphoVaultV1Adapter,
} from "./VaultV2MorphoVaultV1Adapter.js";

class TestVaultV2Adapter extends VaultV2Adapter {}

function adapterBaseInput(): Omit<IVaultV2Adapter, "adapterId" | "type"> {
  const {
    adapterId: _adapterId,
    type: _type,
    ...adapter
  } = vaultV2AdapterInput();
  return adapter;
}

function accrualAdapter(
  overrides: Partial<IAccrualVaultV2Adapter> = {},
): IAccrualVaultV2Adapter {
  return {
    ...vaultV2AdapterInput({ type: "AccrualAdapter" }),
    realAssets: () => 1_100n,
    maxDeposit: (_data, assets) => ({
      value: BigInt(assets),
      limiter: CapacityLimitReason.balance,
    }),
    maxWithdraw: () => ({
      value: 500n,
      limiter: CapacityLimitReason.balance,
    }),
    ...overrides,
  };
}

function accrualVaultV2(
  adapter: IAccrualVaultV2Adapter | null | undefined = accrualAdapter(),
  overrides: Partial<ConstructorParameters<typeof AccrualVaultV2>[0]> = {},
) {
  const adapters = adapter == null ? [] : [adapter];
  return new AccrualVaultV2(
    vaultV2Input({ ...overrides }),
    adapter ?? undefined,
    adapters,
    100n,
    {},
  );
}

describe("VaultV2", () => {
  test("constructor stores all v2 fields and derives adapters from input", () => {
    const vault = new VaultV2(vaultV2Input());

    expect(vault.asset).toBe(vaultV2Input().asset);
    expect(vault._totalAssets).toBe(1_000n);
    expect(vault.totalSupply).toBe(1_000n);
    expect(vault.virtualShares).toBe(100n);
    expect(vault.maxRate).toBe(MathLib.WAD / 100_000n);
    expect(vault.lastUpdate).toBe(100n);
    expect(vault.adapters).toStrictEqual([ADAPTER]);
    expect(vault.liquidityAdapter).toBe(LIQUIDITY_ADAPTER);
    expect(vault.liquidityData).toBe(EMPTY_HEX);
    expect(vault.performanceFeeRecipient).toBe(RECIPIENT);
    expect(vault.managementFeeRecipient).toBe(RECIPIENT);
  });

  test("toAssets and toShares use pre-accrual totals", () => {
    const vault = new VaultV2(vaultV2Input());

    expect(vault.toAssets(110n)).toBe(100n);
    expect(vault.toShares(100n)).toBe(109n);
  });
});

describe("AccrualVaultV2.maxDeposit", () => {
  test("zero liquidity adapter is limited only by balance", () => {
    const vault = accrualVaultV2(null, { liquidityAdapter: zeroAddress });

    expect(vault.maxDeposit("42")).toStrictEqual({
      value: 42n,
      limiter: CapacityLimitReason.balance,
    });
  });

  test("throws for unsupported non-zero liquidity adapters", () => {
    const vault = accrualVaultV2(null);

    expect(() => vault.maxDeposit(42n)).toThrow(
      VaultV2Errors.UnsupportedLiquidityAdapter,
    );
  });

  test("applies the liquidity adapter limit", () => {
    const vault = accrualVaultV2(
      accrualAdapter({
        maxDeposit: () => ({
          value: 90n,
          limiter: CapacityLimitReason.balance,
        }),
      }),
    );

    expect(vault.maxDeposit(100n)).toStrictEqual({
      value: 90n,
      limiter: CapacityLimitReason.balance,
    });
  });

  test("absolute caps can be the limiting reason", () => {
    const vault = accrualVaultV2(null, {
      liquidityAllocations: [
        {
          id: "0x1",
          absoluteCap: 550n,
          relativeCap: MathLib.WAD,
          allocation: 500n,
        },
      ],
    });
    vault.accrualLiquidityAdapter = accrualAdapter();

    expect(vault.maxDeposit(1_000n)).toStrictEqual({
      value: 50n,
      limiter: CapacityLimitReason.vaultV2_absoluteCap,
    });
  });

  test("relative caps can be the limiting reason", () => {
    const vault = accrualVaultV2(null, {
      liquidityAllocations: [
        {
          id: "0x1",
          absoluteCap: 10_000n,
          relativeCap: 600_000_000_000_000_000n,
          allocation: 500n,
        },
      ],
    });
    vault.accrualLiquidityAdapter = accrualAdapter();

    expect(vault.maxDeposit(1_000n)).toStrictEqual({
      value: 100n,
      limiter: CapacityLimitReason.vaultV2_relativeCap,
    });
  });

  test("relative caps are ignored when the liquidity limit is already lower", () => {
    const vault = accrualVaultV2(
      accrualAdapter({
        maxDeposit: () => ({
          value: 50n,
          limiter: CapacityLimitReason.balance,
        }),
      }),
      {
        liquidityAllocations: [
          {
            id: "0x1",
            absoluteCap: 10_000n,
            relativeCap: 600_000_000_000_000_000n,
            allocation: 500n,
          },
        ],
      },
    );

    expect(vault.maxDeposit(1_000n)).toStrictEqual({
      value: 50n,
      limiter: CapacityLimitReason.balance,
    });
  });
});

describe("AccrualVaultV2.maxWithdraw", () => {
  test("returns balance limit when requested assets exceed liquidity", () => {
    const vault = accrualVaultV2(null, { liquidityAdapter: zeroAddress });

    expect(vault.maxWithdraw(1_100n)).toStrictEqual({
      value: 100n,
      limiter: CapacityLimitReason.liquidity,
    });
  });

  test("includes liquidity adapter withdraw capacity", () => {
    const vault = accrualVaultV2(
      accrualAdapter({
        maxWithdraw: () => ({
          value: 1_000n,
          limiter: CapacityLimitReason.balance,
        }),
      }),
    );

    expect(vault.maxWithdraw(110n)).toStrictEqual({
      value: 100n,
      limiter: CapacityLimitReason.balance,
    });
  });
});

describe("AccrualVaultV2.accrueInterest", () => {
  test("throws when accruing before lastUpdate", () => {
    const vault = accrualVaultV2();

    expect(() => vault.accrueInterest(99n)).toThrow(
      VaultV2Errors.InvalidInterestAccrual,
    );
  });

  test("returns a copy without fees when elapsed is zero", () => {
    const vault = accrualVaultV2();
    const result = vault.accrueInterest(100n);

    expect(result.vault).not.toBe(vault);
    expect(result.vault._totalAssets).toBe(vault._totalAssets);
    expect(result.performanceFeeShares).toBe(0n);
    expect(result.managementFeeShares).toBe(0n);
  });

  test("accrues real assets and mints performance and management fee shares", () => {
    const vault = accrualVaultV2(accrualAdapter({ realAssets: () => 1_100n }), {
      maxRate: MathLib.WAD,
      managementFee: 10_000_000_000_000_000n,
    });
    const result = vault.accrueInterest(101n);

    expect(result.vault._totalAssets).toBe(1_200n);
    expect(result.performanceFeeShares).toBeGreaterThan(0n);
    expect(result.managementFeeShares).toBeGreaterThan(0n);
    expect(result.vault.totalSupply).toBe(
      1_000n + result.performanceFeeShares + result.managementFeeShares,
    );
    expect(result.vault.lastUpdate).toBe(101n);
  });

  test("accrual with no interest and no management fee does not mint fee shares", () => {
    const vault = accrualVaultV2(accrualAdapter({ realAssets: () => 100n }), {
      managementFee: 0n,
    });
    const result = vault.accrueInterest(101n);

    expect(result.vault._totalAssets).toBe(200n);
    expect(result.performanceFeeShares).toBe(0n);
    expect(result.managementFeeShares).toBe(0n);
    expect(result.vault.totalSupply).toBe(1_000n);
  });

  test("accrual with interest and no performance fee skips performance fee shares", () => {
    const vault = accrualVaultV2(accrualAdapter({ realAssets: () => 1_100n }), {
      maxRate: MathLib.WAD,
      performanceFee: 0n,
      managementFee: 0n,
    });
    const result = vault.accrueInterest(101n);

    expect(result.vault._totalAssets).toBe(1_200n);
    expect(result.performanceFeeShares).toBe(0n);
    expect(result.managementFeeShares).toBe(0n);
    expect(result.vault.totalSupply).toBe(1_000n);
  });
});

describe("VaultV2Adapter", () => {
  test("constructor stores adapter fields", () => {
    const adapter = new TestVaultV2Adapter(vaultV2AdapterInput());

    expect(adapter.type).toBe("TestAdapter");
    expect(adapter.address).toBe(ADAPTER);
    expect(adapter.parentVault).toBe(vaultV2AdapterInput().parentVault);
    expect(adapter.skimRecipient).toBe(RECIPIENT);
  });
});

describe("VaultV2MorphoMarketV1Adapter", () => {
  test("static ids and instance ids are deterministic", () => {
    const params = new MarketParams(marketParams());
    const adapter = new VaultV2MorphoMarketV1Adapter({
      ...adapterBaseInput(),
      marketParamsList: [params],
    });

    expect(adapter.type).toBe("VaultV2MorphoMarketV1Adapter");
    expect(adapter.adapterId).toBe(
      VaultV2MorphoMarketV1Adapter.adapterId(adapter.address),
    );
    expect(adapter.marketParamsList[0]).toBeInstanceOf(MarketParams);
    expect(adapter.ids(params)).toStrictEqual([
      adapter.adapterId,
      VaultV2MorphoMarketV1Adapter.collateralId(params.collateralToken),
      VaultV2MorphoMarketV1Adapter.marketParamsId(adapter.address, params),
    ]);
  });
});

describe("AccrualVaultV2MorphoMarketV1Adapter", () => {
  test("realAssets sums accrued position supply assets", () => {
    const position = accrualPosition({ supplyShares: 100n });
    const adapter = new AccrualVaultV2MorphoMarketV1Adapter(
      { ...adapterBaseInput(), marketParamsList: [position.market.params] },
      [position],
    );

    expect(adapter.realAssets()).toBe(position.supplyAssets);
  });

  test("maxDeposit is limited by balance", () => {
    const adapter = new AccrualVaultV2MorphoMarketV1Adapter(
      { ...adapterBaseInput(), marketParamsList: [marketParams()] },
      [],
    );

    expect(adapter.maxDeposit(EMPTY_HEX, 123n)).toStrictEqual({
      value: 123n,
      limiter: CapacityLimitReason.balance,
    });
  });

  test("maxWithdraw returns the matching position capacity or zero", () => {
    const position = accrualPosition({ supplyShares: 100n });
    const adapter = new AccrualVaultV2MorphoMarketV1Adapter(
      { ...adapterBaseInput(), marketParamsList: [position.market.params] },
      [position],
    );
    const data = encodeAbiParameters(
      [marketParamsAbi],
      [position.market.params],
    );
    const missingData = encodeAbiParameters(
      [marketParamsAbi],
      [new MarketParams(marketParams({ collateralToken: RECIPIENT }))],
    );

    expect(adapter.maxWithdraw(data).value).toBe(
      position.withdrawCapacityLimit.value,
    );
    expect(adapter.maxWithdraw(missingData)).toStrictEqual({
      value: 0n,
      limiter: CapacityLimitReason.position,
    });
  });
});

describe("VaultV2MorphoMarketV1AdapterV2", () => {
  test("constructor stores market ids and supply shares", () => {
    const m = market();
    const adapter = new VaultV2MorphoMarketV1AdapterV2({
      ...adapterBaseInput(),
      marketIds: [m.id],
      adaptiveCurveIrm: ADAPTER,
      supplyShares: { [m.id]: 123n },
    });

    expect(adapter.type).toBe("VaultV2MorphoMarketV1AdapterV2");
    expect(adapter.adapterId).toBe(
      VaultV2MorphoMarketV1AdapterV2.adapterId(adapter.address),
    );
    expect(adapter.marketIds).toStrictEqual([m.id]);
    expect(adapter.adaptiveCurveIrm).toBe(ADAPTER);
    expect(adapter.supplyShares[m.id]).toBe(123n);
    expect(adapter.ids(m.params)[0]).toBe(adapter.adapterId);
  });
});

describe("AccrualVaultV2MorphoMarketV1AdapterV2", () => {
  test("realAssets sums market supply assets", () => {
    const m = market();
    const adapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        ...adapterBaseInput(),
        marketIds: [m.id],
        adaptiveCurveIrm: ADAPTER,
        supplyShares: { [m.id]: 100n },
      },
      [m],
    );

    expect(adapter.realAssets()).toBe(m.toSupplyAssets(100n));
  });

  test("realAssets treats missing supply shares as zero", () => {
    const m = market();
    const adapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        ...adapterBaseInput(),
        marketIds: [m.id],
        adaptiveCurveIrm: ADAPTER,
        supplyShares: {},
      },
      [m],
    );

    expect(adapter.realAssets()).toBe(0n);
  });

  test("maxDeposit is limited by balance", () => {
    const adapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        ...adapterBaseInput(),
        marketIds: [],
        adaptiveCurveIrm: ADAPTER,
        supplyShares: {},
      },
      [],
    );

    expect(adapter.maxDeposit(EMPTY_HEX, "123")).toStrictEqual({
      value: 123n,
      limiter: CapacityLimitReason.balance,
    });
  });

  test("maxWithdraw returns the matching market capacity or zero", () => {
    const m = market();
    const adapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        ...adapterBaseInput(),
        marketIds: [m.id],
        adaptiveCurveIrm: ADAPTER,
        supplyShares: { [m.id]: 100n },
      },
      [m],
    );
    const data = encodeAbiParameters([marketParamsAbi], [m.params]);
    const missingData = encodeAbiParameters(
      [marketParamsAbi],
      [new MarketParams(marketParams({ collateralToken: RECIPIENT }))],
    );

    expect(adapter.maxWithdraw(data).value).toBe(
      m.getWithdrawCapacityLimit({ supplyShares: 100n }).value,
    );
    expect(adapter.maxWithdraw(missingData)).toStrictEqual({
      value: 0n,
      limiter: CapacityLimitReason.position,
    });
  });

  test("maxWithdraw treats missing supply shares on a known market as zero", () => {
    const m = market();
    const adapter = new AccrualVaultV2MorphoMarketV1AdapterV2(
      {
        ...adapterBaseInput(),
        marketIds: [m.id],
        adaptiveCurveIrm: ADAPTER,
        supplyShares: {},
      },
      [m],
    );
    const data = encodeAbiParameters([marketParamsAbi], [m.params]);

    expect(adapter.maxWithdraw(data)).toStrictEqual({
      value: 0n,
      limiter: CapacityLimitReason.position,
    });
  });
});

describe("VaultV2MorphoVaultV1Adapter", () => {
  test("constructor and ids store the Morpho Vault V1 target", () => {
    const adapter = new VaultV2MorphoVaultV1Adapter({
      ...adapterBaseInput(),
      morphoVaultV1: RECIPIENT,
    });

    expect(adapter.type).toBe("VaultV2MorphoVaultV1Adapter");
    expect(adapter.adapterId).toBe(
      VaultV2MorphoVaultV1Adapter.adapterId(adapter.address),
    );
    expect(adapter.morphoVaultV1).toBe(RECIPIENT);
    expect(adapter.ids()).toStrictEqual([adapter.adapterId]);
  });
});

describe("AccrualVaultV2MorphoVaultV1Adapter", () => {
  test("delegates asset, deposit and withdraw calculations to the V1 vault", () => {
    const accrualVaultV1 = {
      accrueInterest: (timestamp?: bigint) => ({
        toAssets: (shares: bigint) => shares + (timestamp ?? 0n),
      }),
      maxDeposit: (assets: bigint) => ({
        value: assets - 1n,
        limiter: CapacityLimitReason.balance,
      }),
      maxWithdraw: (shares: bigint) => ({
        value: shares - 2n,
        limiter: CapacityLimitReason.liquidity,
      }),
    } as AccrualVault;
    const adapter = new AccrualVaultV2MorphoVaultV1Adapter(
      { ...adapterBaseInput(), morphoVaultV1: RECIPIENT },
      accrualVaultV1,
      10n,
    );

    expect(adapter.realAssets(5n)).toBe(15n);
    expect(adapter.maxDeposit(EMPTY_HEX, 10n)).toStrictEqual({
      value: 9n,
      limiter: CapacityLimitReason.balance,
    });
    expect(adapter.maxWithdraw(EMPTY_HEX)).toStrictEqual({
      value: 8n,
      limiter: CapacityLimitReason.liquidity,
    });
  });
});
