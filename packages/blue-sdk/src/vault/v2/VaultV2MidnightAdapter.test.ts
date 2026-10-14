import { encodeAbiParameters, keccak256 } from "viem";
import { describe, expect, test } from "vitest";
import { MathLib } from "../../math/index.js";
import { CapacityLimitReason } from "../../utils.js";
import {
  type IVaultV2MidnightAdapter,
  VaultV2MidnightAdapter,
} from "./VaultV2MidnightAdapter.js";
import {
  type IVaultV2MidnightAdapterMarket,
  VaultV2MidnightAdapterUtils,
} from "./VaultV2MidnightAdapterUtils.js";

const ADDRESS = "0x0000000000000000000000000000000000000001" as const;
const OTHER = "0x0000000000000000000000000000000000000002" as const;
const ASSET = "0x0000000000000000000000000000000000000003" as const;
const MIDNIGHT = "0x0000000000000000000000000000000000000004" as const;

function adapterInput(
  overrides: Partial<IVaultV2MidnightAdapter> = {},
): IVaultV2MidnightAdapter {
  return {
    address: ADDRESS,
    parentVault: OTHER,
    asset: ADDRESS,
    skimRecipient: OTHER,
    midnight: OTHER,
    marketIds: [],
    marketData: {},
    durations: [3600n, 7200n],
    durationAllocations: [0n, 0n],
    maxTtm: 86_400n,
    minRate: 0n,
    noSalesWithShortfall: false,
    noSalesBelowFaceValue: false,
    ...overrides,
  };
}

function taggedHash({
  tag,
  types,
  values,
}: {
  readonly tag: string;
  readonly types: readonly { type: string; components?: readonly unknown[] }[];
  readonly values: readonly unknown[];
}) {
  return keccak256(
    encodeAbiParameters([{ type: "string" }, ...types], [
      tag,
      ...values,
    ] as never),
  );
}

describe("VaultV2MidnightAdapter", () => {
  test("normalizes state and computes the shared adapter id", () => {
    const adapter = new VaultV2MidnightAdapter(
      adapterInput({
        marketIds: [OTHER],
        marketData: {
          [OTHER]: {
            netCredit: "10",
            rate: 2,
            maturity: 100,
            index: 0,
            forceSellable: true,
          },
        },
        durations: ["3600"],
        durationAllocations: ["10"],
        asset: ASSET,
        midnight: MIDNIGHT,
        maxTtm: "86400",
        minRate: 7,
        noSalesWithShortfall: true,
        noSalesBelowFaceValue: false,
      }),
    );

    expect(adapter.type).toBe("VaultV2MidnightAdapter");
    expect(adapter.adapterId).toBe(
      taggedHash({
        tag: "this",
        types: [{ type: "address" }],
        values: [ADDRESS],
      }),
    );
    expect(adapter.marketData[OTHER]).toStrictEqual({
      netCredit: 10n,
      rate: 2n,
      maturity: 100n,
      index: 0n,
      forceSellable: true,
    });
    expect(adapter.durations).toStrictEqual([3600n]);
    expect(adapter.durationAllocations).toStrictEqual([10n]);
    expect(adapter.maxTtm).toBe(86_400n);
    expect(adapter.minRate).toBe(7n);
    expect(adapter.asset).toBe(ASSET);
    expect(adapter.midnight).toBe(MIDNIGHT);
    expect(adapter.noSalesWithShortfall).toBe(true);
    expect(adapter.noSalesBelowFaceValue).toBe(false);
  });

  test("matches contract cap-id encodings and ids order", () => {
    const collateral = {
      token: ADDRESS,
      lltv: 860_000_000_000_000_000n,
      liquidationCursor: 800_000_000_000_000_000n,
      oracle: OTHER,
    };
    const market: IVaultV2MidnightAdapterMarket = {
      collateralParams: [collateral],
      maturity: 100n,
      rcfThreshold: 42n,
      enterGate: ADDRESS,
      liquidatorGate: OTHER,
    };
    const adapter = new VaultV2MidnightAdapter(adapterInput());
    const tuple = {
      type: "tuple",
      components: [
        { name: "token", type: "address" },
        { name: "lltv", type: "uint256" },
        { name: "liquidationCursor", type: "uint256" },
        { name: "oracle", type: "address" },
      ],
    } as const;

    expect(VaultV2MidnightAdapter.collateralTokenCapId(ADDRESS)).toBe(
      taggedHash({
        tag: "collateralToken",
        types: [{ type: "address" }],
        values: [ADDRESS],
      }),
    );
    expect(VaultV2MidnightAdapter.collateralParamsCapId(collateral)).toBe(
      taggedHash({
        tag: "collateralParams",
        types: [tuple],
        values: [collateral],
      }),
    );
    expect(VaultV2MidnightAdapter.enterGateCapId(ADDRESS)).toBe(
      taggedHash({
        tag: "enterGate",
        types: [{ type: "address" }],
        values: [ADDRESS],
      }),
    );
    expect(VaultV2MidnightAdapter.liquidatorGateCapId(OTHER)).toBe(
      taggedHash({
        tag: "liquidatorGate",
        types: [{ type: "address" }],
        values: [OTHER],
      }),
    );
    expect(VaultV2MidnightAdapter.rcfThresholdCapId(42n)).toBe(
      taggedHash({
        tag: "rcfThreshold",
        types: [{ type: "uint256" }],
        values: [42n],
      }),
    );
    expect(VaultV2MidnightAdapter.durationCapId(ADDRESS, 3600n)).toBe(
      taggedHash({
        tag: "duration",
        types: [{ type: "address" }, { type: "uint256" }],
        values: [ADDRESS, 3600n],
      }),
    );
    expect(adapter.ids(market)).toStrictEqual([
      adapter.adapterId,
      VaultV2MidnightAdapter.enterGateCapId(ADDRESS),
      VaultV2MidnightAdapter.liquidatorGateCapId(OTHER),
      VaultV2MidnightAdapter.rcfThresholdCapId(42n),
      VaultV2MidnightAdapter.collateralTokenCapId(ADDRESS),
      VaultV2MidnightAdapter.collateralParamsCapId(collateral),
    ]);
  });

  test("computes duration allocations as suffix totals", () => {
    const marketData = {
      [ADDRESS]: {
        netCredit: 10n,
        rate: 0n,
        maturity: 7_000n,
        index: 0n,
        forceSellable: false,
      },
      [OTHER]: {
        netCredit: 20n,
        rate: 0n,
        maturity: 4_000n,
        index: 1n,
        forceSellable: true,
      },
    };

    expect(
      VaultV2MidnightAdapterUtils.durationAllocations({
        marketData,
        durations: [3_000n, 5_000n, 8_000n],
        length: 3,
        timestamp: 1_000n,
      }),
    ).toStrictEqual([30n, 10n, 0n]);
  });

  test("computes duration headroom from absolute and relative caps", () => {
    const result = VaultV2MidnightAdapterUtils.durationHeadroom({
      allocation: 60n,
      absoluteCap: 100n,
      relativeCap: MathLib.WAD / 2n,
      firstTotalAssets: 200n,
    });

    expect(result).toStrictEqual({
      value: 40n,
      limiter: CapacityLimitReason.vaultV2_absoluteCap,
    });
  });

  test("supports the maximum number of markets", () => {
    const marketIds = Array.from(
      { length: 250 },
      (_, index) =>
        `0x${index.toString(16).padStart(64, "0")}` as `0x${string}`,
    );
    const marketData = Object.fromEntries(
      marketIds.map((id, index) => [
        id,
        {
          netCredit: index,
          rate: 0n,
          maturity: 1n,
          index,
          forceSellable: index % 2 === 0,
        },
      ]),
    );
    const adapter = new VaultV2MidnightAdapter(
      adapterInput({ marketIds, marketData }),
    );

    expect(adapter.marketIds).toHaveLength(250);
    expect(Object.keys(adapter.marketData)).toHaveLength(250);
  });
});
