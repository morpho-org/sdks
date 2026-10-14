import {
  getAddress,
  IntegerOutOfRangeError,
  InvalidAddressError,
  isAddress,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  InvalidVaultV2MidnightAdapterMarketsError,
  VaultV2Errors,
} from "../../errors.js";
import { MathLib } from "../../math/index.js";
import type { Hash } from "../../types.js";
import { CapacityLimitReason } from "../../utils.js";
import {
  type IVaultV2MidnightAdapterAccrualMarket,
  type IVaultV2MidnightAdapterMarketData,
  VaultV2MidnightAdapterUtils,
} from "./VaultV2MidnightAdapterUtils.js";
import { VaultV2Utils } from "./VaultV2Utils.js";

const ADDRESS = "0x0000000000000000000000000000000000000001" as const;
const OTHER = "0x0000000000000000000000000000000000000002" as const;
const ID = `0x${"01".padStart(64, "0")}` as Hash;
const SECOND_ID = `0x${"02".padStart(64, "0")}` as Hash;
const MARKET_DATA: IVaultV2MidnightAdapterMarketData = {
  netCredit: 800n,
  rate: 0n,
  maturity: 200n,
  index: 0n,
  forceSellable: false,
};

function createMarket(id: Hash = ID): IVaultV2MidnightAdapterAccrualMarket {
  return {
    id,
    position: {
      credit: 1_000n,
      pendingFee: 0n,
      lastLossFactor: 0n,
      lastAccrual: 100n,
    },
    market: { lossFactor: 0n },
  };
}

const marketData = {
  [ADDRESS]: {
    netCredit: 10n,
    rate: 0n,
    maturity: 7_000n,
    index: 0n,
    forceSellable: false,
  },
  [OTHER]: {
    netCredit: "20",
    rate: 0,
    maturity: 500,
    index: 1,
    forceSellable: true,
  },
};

describe("VaultV2MidnightAdapterUtils.durationAllocations", () => {
  test("default: returns zero totals without market data", () => {
    expect(
      VaultV2MidnightAdapterUtils.durationAllocations({
        marketData: {},
        durations: [3_600n, 7_200n],
        length: 2,
        timestamp: 1_000n,
      }),
    ).toStrictEqual([0n, 0n]);
  });

  test("behavior: counts matured markets only in a zero duration", () => {
    expect(
      VaultV2MidnightAdapterUtils.durationAllocations({
        marketData,
        durations: [0n, 3_000n],
        length: 2,
        timestamp: 1_000n,
      }),
    ).toStrictEqual([30n, 10n]);
  });

  test("behavior: truncates durations beyond length", () => {
    expect(
      VaultV2MidnightAdapterUtils.durationAllocations({
        marketData,
        durations: [0n, 3_000n],
        length: 1,
        timestamp: 1_000n,
      }),
    ).toStrictEqual([30n]);
  });

  test("behavior: counts a market whose ttm equals the duration (inclusive)", () => {
    expect(
      VaultV2MidnightAdapterUtils.durationAllocations({
        marketData,
        durations: [6_000n, 6_001n],
        length: 2,
        timestamp: 1_000n,
      }),
    ).toStrictEqual([10n, 0n]);
  });

  test("behavior: returns an empty array for length 0", () => {
    expect(
      VaultV2MidnightAdapterUtils.durationAllocations({
        marketData,
        durations: [0n, 3_000n],
        length: 0,
        timestamp: 1_000n,
      }),
    ).toStrictEqual([]);
  });

  test("behavior: counts a matured market (ttm 0) in no positive bucket", () => {
    expect(
      VaultV2MidnightAdapterUtils.durationAllocations({
        marketData,
        durations: [1n, 6_000n],
        length: 2,
        timestamp: 1_000n,
      }),
    ).toStrictEqual([10n, 10n]);
  });

  test("default: returns zeros for an adapter with no markets", () => {
    expect(
      VaultV2MidnightAdapterUtils.durationAllocations({
        marketData: {},
        durations: [86_400n, 604_800n, 2_592_000n, 7_776_000n, 15_552_000n],
        length: 3,
        timestamp: 1_000n,
      }),
    ).toStrictEqual([0n, 0n, 0n]);
  });

  test.each([-1, 1.5, 2])(
    "error: rejects bucket length %s outside [0, durations.length]",
    (length) => {
      expect(() =>
        VaultV2MidnightAdapterUtils.durationAllocations({
          marketData,
          durations: [0n],
          length,
          timestamp: 1_000n,
        }),
      ).toThrow(VaultV2Errors.InvalidMidnightDurationsLength);
    },
  );
});

describe("VaultV2MidnightAdapterUtils.durationHeadroom", () => {
  const caps = {
    allocation: 60n,
    absoluteCap: 1_000n,
    relativeCap: MathLib.WAD / 2n,
    firstTotalAssets: 200n,
  };

  test("behavior: returns relative-cap headroom when it binds", () => {
    expect(VaultV2MidnightAdapterUtils.durationHeadroom(caps)).toStrictEqual({
      value: 40n,
      limiter: CapacityLimitReason.vaultV2_relativeCap,
    });
  });

  test("behavior: floors headroom at zero when allocation exceeds caps", () => {
    expect(
      VaultV2MidnightAdapterUtils.durationHeadroom({
        ...caps,
        allocation: 2_000n,
      }).value,
    ).toBe(0n);
  });
});

describe("VaultV2MidnightAdapterUtils cap ids", () => {
  test("error: rejects short and bad-checksum addresses", () => {
    // Built at runtime: `pnpm lint:address` rewrites mixed-case address literals to valid checksums.
    const checksummed = getAddress(
      "0xabcdef0000000000000000000000000000000001",
    );
    expect(checksummed.startsWith("0xa")).toBe(true);
    const badChecksum = `0xA${checksummed.slice(3)}`;
    expect(isAddress(badChecksum, { strict: true })).toBe(false);

    expect(() =>
      VaultV2MidnightAdapterUtils.gateCapId("enterGate", "0x1234"),
    ).toThrow(InvalidAddressError);
    expect(() =>
      VaultV2MidnightAdapterUtils.durationCapId(badChecksum, 1n),
    ).toThrow(InvalidAddressError);
  });

  test("error: rejects integers outside uint256", () => {
    expect(() => VaultV2MidnightAdapterUtils.rcfThresholdCapId(-1n)).toThrow(
      IntegerOutOfRangeError,
    );
    expect(() =>
      VaultV2MidnightAdapterUtils.durationCapId(ADDRESS, 2n ** 256n),
    ).toThrow(IntegerOutOfRangeError);
    expect(() =>
      VaultV2MidnightAdapterUtils.collateralParamsCapId({
        token: ADDRESS,
        lltv: 2n ** 256n,
        liquidationCursor: 0n,
        oracle: OTHER,
      }),
    ).toThrow(IntegerOutOfRangeError);
  });
});

// Expected ids come from `adapterId()` and `ids(Market)` on a VaultV2MidnightAdapter
// created through the Base factory on an Anvil fork at block 52513513. The duration id
// has no onchain view, so it is pinned from the pre-refactor encoder's output.
describe("VaultV2MidnightAdapterUtils pinned cap ids", () => {
  const adapter = "0xa5d93ca75aB778b1CDa3d6579788a577ba89D4c0" as const;
  const market = {
    collateralParams: [
      {
        token: "0x4200000000000000000000000000000000000006",
        lltv: 860000000000000000n,
        liquidationCursor: 300000000000000000n,
        oracle: "0x1111111111111111111111111111111111111111",
      },
      {
        token: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle: "0x2222222222222222222222222222222222222222",
      },
    ],
    maturity: 1798761600n,
    rcfThreshold: 50000000000000000n,
    enterGate: "0x3333333333333333333333333333333333333333",
    liquidatorGate: "0x4444444444444444444444444444444444444444",
  } as const;
  const adapterId =
    "0x355eef140979b86f1415666608c053e5896bf67bbd98b8216bfee1d72626bd38";
  const onchainIds = [
    adapterId,
    "0x4516e22b4002f82da644525126d6193a2bdc81467626c25c3d50c9494bd55f1e",
    "0xae317afd68d43287e0c4167edd9b01100c07c72e775bda6ea6d7efc88f53c04c",
    "0x2e1e8d117faed13ce4cac7a4c938ecf6c15eb50a6d8155008bbe0983632cf7b4",
    "0x207cf9968961dcdfb8e4007f249958d856244d4356441a5379d11c267f651be4",
    "0xd40245bbcfc6d817f63d01c9aa4998aa1dd4e9958196da769d88c5e58a7f61b8",
    "0x13ff47043c4f28ff9eb52ff2a760b64b77707c842acabb83558f6415c9cb4797",
    "0x11ee8756632c3bdeb977a4c5725972b198a7884983a5d805c5df6b97b35a3da8",
  ];

  test("default: adapterCapId matches adapterId()", () => {
    expect(VaultV2Utils.adapterCapId(adapter)).toBe(adapterId);
  });

  test("default: each tag matches ids(Market)", () => {
    const [weth] = market.collateralParams;
    expect(
      VaultV2MidnightAdapterUtils.gateCapId("enterGate", market.enterGate),
    ).toBe(onchainIds[1]);
    expect(
      VaultV2MidnightAdapterUtils.gateCapId(
        "liquidatorGate",
        market.liquidatorGate,
      ),
    ).toBe(onchainIds[2]);
    expect(
      VaultV2MidnightAdapterUtils.rcfThresholdCapId(market.rcfThreshold),
    ).toBe(onchainIds[3]);
    expect(VaultV2Utils.collateralCapId(weth.token)).toBe(onchainIds[4]);
    expect(VaultV2MidnightAdapterUtils.collateralTokenCapId(weth.token)).toBe(
      onchainIds[4],
    );
    expect(VaultV2MidnightAdapterUtils.collateralParamsCapId(weth)).toBe(
      onchainIds[5],
    );
  });

  test("default: ids matches ids(Market)", () => {
    expect(
      VaultV2MidnightAdapterUtils.ids({ adapterId, market }),
    ).toStrictEqual(onchainIds);
  });

  test("default: durationCapId matches the pre-refactor encoder", () => {
    expect(VaultV2MidnightAdapterUtils.durationCapId(adapter, 2592000n)).toBe(
      "0x6baf7378d249f341a058f18315f7e25c42c9a6717e34312de525e0e270e9e497",
    );
  });
});

describe("VaultV2MidnightAdapterUtils accrual", () => {
  test("values markets from their positions and stored market data", () => {
    const adapter = {
      marketIds: [ID, SECOND_ID],
      marketData: {
        [ID]: {
          netCredit: 800n,
          rate: 10_000_000_000_000_000n,
          maturity: 200n,
          index: 0n,
          forceSellable: false,
        },
        [SECOND_ID]: {
          netCredit: 900n,
          rate: 0n,
          maturity: 1_000n,
          index: 1n,
          forceSellable: true,
        },
      } satisfies Record<Hash, IVaultV2MidnightAdapterMarketData>,
    };
    const markets: readonly IVaultV2MidnightAdapterAccrualMarket[] = [
      {
        id: ID,
        position: {
          credit: 1_000n,
          pendingFee: 0n,
          lastLossFactor: 0n,
          lastAccrual: 100n,
        },
        market: { lossFactor: 0n },
      },
      {
        id: SECOND_ID,
        position: {
          credit: 1_000n,
          pendingFee: 0n,
          lastLossFactor: 0n,
          lastAccrual: 100n,
        },
        market: { lossFactor: 0n },
      },
    ];

    expect(VaultV2MidnightAdapterUtils.realAssets(adapter, markets, 100n)).toBe(
      1_500n,
    );
  });

  test("projects positions without changing stored market data", () => {
    const adapter = {
      marketIds: [ID],
      marketData: {
        [ID]: {
          netCredit: 800n,
          rate: 0n,
          maturity: 200n,
          index: 0n,
          forceSellable: false,
        },
      } satisfies Record<Hash, IVaultV2MidnightAdapterMarketData>,
    };
    const markets: readonly IVaultV2MidnightAdapterAccrualMarket[] = [
      {
        id: ID,
        position: {
          credit: 1_000n,
          pendingFee: 200n,
          lastLossFactor: 0n,
          lastAccrual: 100n,
        },
        market: { lossFactor: (1n << 128n) / 2n },
      },
    ];

    expect(
      VaultV2MidnightAdapterUtils.accrueMarkets(adapter, markets, 150n),
    ).toStrictEqual([
      {
        id: ID,
        position: {
          credit: 450n,
          pendingFee: 50n,
          lastLossFactor: (1n << 128n) / 2n,
          lastAccrual: 150n,
        },
        market: { lossFactor: (1n << 128n) / 2n },
      },
    ]);
    expect(adapter.marketData[ID]?.netCredit).toBe(800n);
  });

  test("error: rejects a held market without a position", () => {
    const adapter = {
      marketIds: [ID],
      marketData: { [ID]: MARKET_DATA } satisfies Record<
        Hash,
        IVaultV2MidnightAdapterMarketData
      >,
    };

    expect(() =>
      VaultV2MidnightAdapterUtils.validateMarkets(adapter, []),
    ).toThrow(InvalidVaultV2MidnightAdapterMarketsError);
  });

  test("error: rejects duplicate market ids", () => {
    const adapter = {
      marketIds: [ID, ID],
      marketData: { [ID]: MARKET_DATA } satisfies Record<
        Hash,
        IVaultV2MidnightAdapterMarketData
      >,
    };

    expect(() =>
      VaultV2MidnightAdapterUtils.validateMarkets(adapter, [createMarket()]),
    ).toThrow(InvalidVaultV2MidnightAdapterMarketsError);
  });

  test("error: rejects duplicate position ids", () => {
    const adapter = {
      marketIds: [ID],
      marketData: { [ID]: MARKET_DATA } satisfies Record<
        Hash,
        IVaultV2MidnightAdapterMarketData
      >,
    };

    expect(() =>
      VaultV2MidnightAdapterUtils.validateMarkets(adapter, [
        createMarket(),
        createMarket(),
      ]),
    ).toThrow(InvalidVaultV2MidnightAdapterMarketsError);
  });

  test("error: validateMarkets rejects unheld market data with held markets", () => {
    const adapter = {
      marketIds: [ID],
      marketData: {
        [ID]: MARKET_DATA,
        [SECOND_ID]: { ...MARKET_DATA, netCredit: 1n },
      } satisfies Record<Hash, IVaultV2MidnightAdapterMarketData>,
    };

    expect(() =>
      VaultV2MidnightAdapterUtils.validateMarkets(adapter, [createMarket()]),
    ).toThrow(InvalidVaultV2MidnightAdapterMarketsError);
  });

  test("error: validateMarkets rejects unheld market data without held markets", () => {
    const adapter = {
      marketIds: [],
      marketData: {
        [SECOND_ID]: { ...MARKET_DATA, netCredit: 1n },
      } satisfies Record<Hash, IVaultV2MidnightAdapterMarketData>,
    };

    expect(() =>
      VaultV2MidnightAdapterUtils.validateMarkets(adapter, []),
    ).toThrow(InvalidVaultV2MidnightAdapterMarketsError);
  });

  test("error: realAssets rejects unheld market data with held markets", () => {
    const adapter = {
      marketIds: [ID],
      marketData: {
        [ID]: MARKET_DATA,
        [SECOND_ID]: { ...MARKET_DATA, netCredit: 1n },
      } satisfies Record<Hash, IVaultV2MidnightAdapterMarketData>,
    };

    expect(() =>
      VaultV2MidnightAdapterUtils.realAssets(adapter, [createMarket()], 100n),
    ).toThrow(InvalidVaultV2MidnightAdapterMarketsError);
  });

  test("error: realAssets rejects unheld market data without held markets", () => {
    const adapter = {
      marketIds: [],
      marketData: {
        [SECOND_ID]: { ...MARKET_DATA, netCredit: 1n },
      } satisfies Record<Hash, IVaultV2MidnightAdapterMarketData>,
    };

    expect(() =>
      VaultV2MidnightAdapterUtils.realAssets(adapter, [], 100n),
    ).toThrow(InvalidVaultV2MidnightAdapterMarketsError);
  });

  test("error: realAssets rejects a held market without market data", () => {
    const adapter = {
      marketIds: [ID],
      marketData: {} satisfies Record<Hash, IVaultV2MidnightAdapterMarketData>,
    };

    expect(() =>
      VaultV2MidnightAdapterUtils.realAssets(adapter, [createMarket()], 100n),
    ).toThrow(InvalidVaultV2MidnightAdapterMarketsError);
  });

  test("error: accrueMarkets rejects a position for an unheld market", () => {
    const adapter = {
      marketIds: [ID],
      marketData: { [ID]: MARKET_DATA } satisfies Record<
        Hash,
        IVaultV2MidnightAdapterMarketData
      >,
    };

    expect(() =>
      VaultV2MidnightAdapterUtils.accrueMarkets(
        adapter,
        [createMarket(), createMarket(SECOND_ID)],
        150n,
      ),
    ).toThrow(InvalidVaultV2MidnightAdapterMarketsError);
  });
});
