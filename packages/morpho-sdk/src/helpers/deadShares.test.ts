import { fc, test as propTest } from "@fast-check/vitest";
import {
  type AccrualVault,
  type AccrualVaultV2,
  AccrualVaultV2MorphoMarketV1AdapterV2,
  AccrualVaultV2MorphoVaultV1Adapter,
  DEAD_ADDRESS,
  InvalidMarketParamsError,
  Market,
  type MarketId,
  MarketParams,
  ORACLE_PRICE_SCALE,
  VaultV2MorphoMarketV1AdapterV2,
  VaultV2MorphoVaultV1Adapter,
} from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import {
  IN_KIND_ADAPTER,
  IN_KIND_VAULT,
  inKindMarketParams,
  inKindVaultV1Data,
  inKindVaultV2Data,
} from "../../test/fixtures/inKindRedeem.js";
import {
  InsufficientDeadSharesError,
  MissingDeadSharesDataError,
} from "../types/error.js";
import { MIN_DEAD_SHARES, MIN_VAULT_V2_DEAD_ASSETS } from "./constant.js";
import {
  validateBlueMarketDeadShares,
  validateVaultV1DeadShares,
  validateVaultV2DeadShares,
} from "./deadShares.js";

const NESTED_V1 = "0x0000000000000000000000000000000000003001" as const;
const V1_ADAPTER = "0x0000000000000000000000000000000000003002" as const;

const market = (deadSupplyShares: bigint | undefined) =>
  new Market({
    params: inKindMarketParams,
    totalSupplyAssets: 10n ** 12n,
    totalBorrowAssets: 0n,
    totalSupplyShares: 10n ** 18n,
    totalBorrowShares: 0n,
    lastUpdate: 0n,
    fee: 0n,
    price: ORACLE_PRICE_SCALE,
    deadSupplyShares,
  });

const withV1 = (overrides: Partial<AccrualVault>, base = inKindVaultV1Data()) =>
  ({ ...base, ...overrides }) as unknown as AccrualVault;

const withV2 = (
  overrides: Partial<AccrualVaultV2>,
  base = inKindVaultV2Data(),
) => ({ ...base, ...overrides }) as unknown as AccrualVaultV2;

const marketCapId = VaultV2MorphoMarketV1AdapterV2.adapterMarketCapId(
  IN_KIND_ADAPTER,
  inKindMarketParams,
);

const nestedV1Vault = (deadSupplyShares = MIN_DEAD_SHARES) => {
  const nested = inKindVaultV1Data({ address: NESTED_V1, deadSupplyShares });
  return withV2({
    accrualAdapters: [
      new AccrualVaultV2MorphoVaultV1Adapter(
        {
          address: V1_ADAPTER,
          parentVault: IN_KIND_VAULT,
          skimRecipient: IN_KIND_VAULT,
          morphoVaultV1: NESTED_V1,
        },
        nested,
        0n,
      ),
    ],
    absoluteCaps: {
      [VaultV2MorphoVaultV1Adapter.adapterCapId(V1_ADAPTER)]: 1n,
    },
  });
};

describe("validateBlueMarketDeadShares", () => {
  test("behavior: accepts exactly MIN_DEAD_SHARES", () => {
    expect(() =>
      validateBlueMarketDeadShares(market(MIN_DEAD_SHARES)),
    ).not.toThrow();
  });

  test("error: InsufficientDeadSharesError one share below the threshold", () => {
    const fetched = market(MIN_DEAD_SHARES - 1n);
    expect(() => validateBlueMarketDeadShares(fetched)).toThrow(
      new InsufficientDeadSharesError({
        entity: [fetched.id],
        reason: "deadShares",
        observed: MIN_DEAD_SHARES - 1n,
        required: MIN_DEAD_SHARES,
      }),
    );
  });

  test("error: MissingDeadSharesDataError when deadSupplyShares was not fetched", () => {
    const fetched = market(undefined);
    expect(() => validateBlueMarketDeadShares(fetched)).toThrow(
      new MissingDeadSharesDataError({
        entity: [fetched.id],
        field: "deadSupplyShares",
      }),
    );
  });

  test("error: supply held by another burn address does not count", () => {
    // `totalSupplyShares` is large, but none of it sits at DEAD_ADDRESS.
    expect(() => validateBlueMarketDeadShares(market(0n))).toThrow(
      InsufficientDeadSharesError,
    );
    expect(DEAD_ADDRESS).not.toBe("0x0000000000000000000000000000000000000001");
  });

  propTest.prop([fc.bigInt({ min: 0n, max: 10n * MIN_DEAD_SHARES })])(
    "behavior: passes iff dead supply shares reach MIN_DEAD_SHARES",
    (deadSupplyShares) => {
      const run = () => validateBlueMarketDeadShares(market(deadSupplyShares));
      if (deadSupplyShares >= MIN_DEAD_SHARES) expect(run).not.toThrow();
      else expect(run).toThrow(InsufficientDeadSharesError);
    },
  );
});

describe("validateVaultV1DeadShares", () => {
  test("behavior: accepts a vault and queue at exactly MIN_DEAD_SHARES", () => {
    expect(() => validateVaultV1DeadShares(inKindVaultV1Data())).not.toThrow();
  });

  test("error: InsufficientDeadSharesError one vault share below the threshold", () => {
    expect(() =>
      validateVaultV1DeadShares(withV1({ deadShares: MIN_DEAD_SHARES - 1n })),
    ).toThrow(
      new InsufficientDeadSharesError({
        entity: [IN_KIND_VAULT],
        reason: "deadShares",
        observed: MIN_DEAD_SHARES - 1n,
        required: MIN_DEAD_SHARES,
      }),
    );
  });

  test("error: MissingDeadSharesDataError when deadShares was not fetched", () => {
    expect(() =>
      validateVaultV1DeadShares(withV1({ deadShares: undefined })),
    ).toThrow(
      new MissingDeadSharesDataError({
        entity: [IN_KIND_VAULT],
        field: "deadShares",
      }),
    );
  });

  test("error: names the withdraw-queue market that fails", () => {
    const vault = inKindVaultV1Data({
      additionalMarket: true,
      deadSupplyShares: MIN_DEAD_SHARES - 1n,
    });
    const [first] = vault.withdrawQueue;
    expect(() => validateVaultV1DeadShares(vault)).toThrow(
      new InsufficientDeadSharesError({
        entity: [IN_KIND_VAULT, first!],
        reason: "deadShares",
        observed: MIN_DEAD_SHARES - 1n,
        required: MIN_DEAD_SHARES,
      }),
    );
  });

  test("error: MissingDeadSharesDataError when a queued market has no allocation", () => {
    const vault = inKindVaultV1Data();
    const missing = `0x${"12".repeat(32)}` as MarketId;
    expect(() =>
      validateVaultV1DeadShares(
        withV1({ withdrawQueue: [...vault.withdrawQueue, missing] }, vault),
      ),
    ).toThrow(
      new MissingDeadSharesDataError({
        entity: [IN_KIND_VAULT, missing],
        field: "allocation",
      }),
    );
  });
});

describe("validateVaultV2DeadShares", () => {
  test("behavior: accepts a vault at exactly the dead-share and dead-asset thresholds", () => {
    expect(() => validateVaultV2DeadShares(inKindVaultV2Data())).not.toThrow();
  });

  test.each([
    ["deadShares", { deadShares: undefined }],
    ["deadAssets", { deadAssets: undefined }],
    ["absoluteCaps", { absoluteCaps: undefined }],
  ] as const)(
    "error: MissingDeadSharesDataError without %s",
    (field, overrides) => {
      expect(() => validateVaultV2DeadShares(withV2(overrides))).toThrow(
        new MissingDeadSharesDataError({ entity: [IN_KIND_VAULT], field }),
      );
    },
  );

  test("error: InsufficientDeadSharesError one dead share below the threshold", () => {
    expect(() =>
      validateVaultV2DeadShares(withV2({ deadShares: MIN_DEAD_SHARES - 1n })),
    ).toThrow(
      expect.objectContaining({
        reason: "deadShares",
        entity: [IN_KIND_VAULT],
      }),
    );
  });

  test("error: InsufficientDeadSharesError when dead shares are worth less than 1e6 assets", () => {
    expect(() =>
      validateVaultV2DeadShares(
        withV2({ deadAssets: MIN_VAULT_V2_DEAD_ASSETS - 1n }),
      ),
    ).toThrow(
      new InsufficientDeadSharesError({
        entity: [IN_KIND_VAULT],
        reason: "deadAssets",
        observed: MIN_VAULT_V2_DEAD_ASSETS - 1n,
        required: MIN_VAULT_V2_DEAD_ASSETS,
      }),
    );
  });

  test("error: an inflated share price does not replace missing dead shares", () => {
    expect(() =>
      validateVaultV2DeadShares(
        withV2({
          _totalAssets: 10n ** 30n,
          deadShares: 1n,
          deadAssets: 10n ** 21n,
        }),
      ),
    ).toThrow(expect.objectContaining({ reason: "deadShares" }));
  });

  // Floor: (totalAssets + 1) / (totalSupply + virtualShares) > 1 / (10 * virtualShares).
  test.each([
    ["eighteen", 1n],
    ["six", 10n ** 12n],
  ])(
    "behavior: %s-decimal asset share-price floor is strict",
    (_, virtualShares) => {
      const totalAssets = 10n ** 6n;
      const atFloor = (totalAssets + 1n) * 10n * virtualShares - virtualShares;
      expect(() =>
        validateVaultV2DeadShares(
          withV2({
            _totalAssets: totalAssets,
            virtualShares,
            totalSupply: atFloor,
          }),
        ),
      ).toThrow(expect.objectContaining({ reason: "sharePrice" }));
      expect(() =>
        validateVaultV2DeadShares(
          withV2({
            _totalAssets: totalAssets,
            virtualShares,
            totalSupply: atFloor - 1n,
          }),
        ),
      ).not.toThrow();
    },
  );

  test("error: names the nested market-adapter market that fails", () => {
    const vault = inKindVaultV2Data({ deadSupplyShares: MIN_DEAD_SHARES - 1n });
    expect(() => validateVaultV2DeadShares(vault)).toThrow(
      new InsufficientDeadSharesError({
        entity: [IN_KIND_VAULT, market(0n).id],
        reason: "deadShares",
        observed: MIN_DEAD_SHARES - 1n,
        required: MIN_DEAD_SHARES,
      }),
    );
  });

  test("error: rejects a failing market behind the legacy market adapter", () => {
    const vault = inKindVaultV2Data({
      adapters: "legacy",
      deadSupplyShares: 0n,
    });
    expect(() => validateVaultV2DeadShares(vault)).toThrow(
      InsufficientDeadSharesError,
    );
  });

  test("behavior: ignores a failing market whose absolute cap is zero", () => {
    const base = inKindVaultV2Data({ deadSupplyShares: 0n });
    expect(() =>
      validateVaultV2DeadShares(
        withV2(
          { absoluteCaps: { ...base.absoluteCaps, [marketCapId]: 0n } },
          base,
        ),
      ),
    ).not.toThrow();
  });

  test("error: MissingDeadSharesDataError when an adapter cap was not fetched", () => {
    expect(() =>
      validateVaultV2DeadShares(withV2({ absoluteCaps: {} })),
    ).toThrow(
      new MissingDeadSharesDataError({
        entity: [IN_KIND_VAULT, IN_KIND_ADAPTER],
        field: "absoluteCaps",
      }),
    );
  });

  test("error: MissingDeadSharesDataError for an adapter the SDK cannot hydrate", () => {
    const foreign = {
      address: V1_ADAPTER,
    } as unknown as AccrualVaultV2["accrualAdapters"][number];
    expect(() =>
      validateVaultV2DeadShares(withV2({ accrualAdapters: [foreign] })),
    ).toThrow(
      new MissingDeadSharesDataError({
        entity: [IN_KIND_VAULT, V1_ADAPTER],
        field: "adapter",
      }),
    );
  });

  test("behavior: accepts a nested Vault V1 that passes", () => {
    expect(() => validateVaultV2DeadShares(nestedV1Vault())).not.toThrow();
  });

  test("error: names the V2 → V1 → market path that fails", () => {
    expect(() =>
      validateVaultV2DeadShares(nestedV1Vault(MIN_DEAD_SHARES - 1n)),
    ).toThrow(
      new InsufficientDeadSharesError({
        entity: [IN_KIND_VAULT, NESTED_V1, market(0n).id],
        reason: "deadShares",
        observed: MIN_DEAD_SHARES - 1n,
        required: MIN_DEAD_SHARES,
      }),
    );
  });

  test("behavior: ignores a failing nested Vault V1 whose absolute cap is zero", () => {
    const vault = nestedV1Vault(0n);
    expect(() =>
      validateVaultV2DeadShares(
        withV2(
          {
            absoluteCaps: {
              [VaultV2MorphoVaultV1Adapter.adapterCapId(V1_ADAPTER)]: 0n,
            },
          },
          vault,
        ),
      ),
    ).not.toThrow();
  });
  test("behavior: accepts a liquidity market the snapshot holds", () => {
    expect(() =>
      validateVaultV2DeadShares(
        inKindVaultV2Data({ liquidityAdapter: "sole" }),
      ),
    ).not.toThrow();
  });

  test("error: MissingDeadSharesDataError when the liquidity market is not in the snapshot", () => {
    const vault = inKindVaultV2Data({ liquidityAdapter: "sole" });
    const adapter = vault.accrualLiquidityAdapter;
    if (!(adapter instanceof AccrualVaultV2MorphoMarketV1AdapterV2))
      throw new TypeError("expected a market adapter");
    const liquidityMarketId = MarketParams.fromHex(vault.liquidityData).id;
    const emptyAdapter = Object.assign(
      Object.create(Object.getPrototypeOf(adapter)),
      adapter,
      { markets: [] },
    ) as AccrualVaultV2MorphoMarketV1AdapterV2;
    const withoutLiquidityMarket = Object.assign(
      Object.create(Object.getPrototypeOf(vault)),
      vault,
      {
        accrualAdapters: [emptyAdapter],
        accrualLiquidityAdapter: emptyAdapter,
      },
    ) as AccrualVaultV2;
    expect(() => validateVaultV2DeadShares(withoutLiquidityMarket)).toThrow(
      new MissingDeadSharesDataError({
        entity: [IN_KIND_VAULT, adapter.address, liquidityMarketId],
        field: "liquidityMarket",
      }),
    );
  });

  test("error: InvalidMarketParamsError for liquidity data that is not a market", () => {
    expect(() =>
      validateVaultV2DeadShares(
        withV2(
          { liquidityData: "0xdead" },
          inKindVaultV2Data({ liquidityAdapter: "sole" }),
        ),
      ),
    ).toThrow(InvalidMarketParamsError);
  });
});
