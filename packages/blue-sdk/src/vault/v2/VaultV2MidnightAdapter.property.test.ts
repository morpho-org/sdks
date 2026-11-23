import { fc, test } from "@fast-check/vitest";
import { encodeAbiParameters, getAddress, keccak256 } from "viem";
import { expect } from "vitest";
import { VaultV2MidnightAdapter } from "./VaultV2MidnightAdapter.js";
import {
  type IVaultV2MidnightAdapterMarket,
  VaultV2MidnightAdapterUtils,
} from "./VaultV2MidnightAdapterUtils.js";

const address = fc
  .uint8Array({ minLength: 20, maxLength: 20 })
  .map((bytes) => getAddress(`0x${Buffer.from(bytes).toString("hex")}`));
const uint256 = fc.bigInt({ min: 0n, max: 2n ** 256n - 1n });
const collateral = fc.record({
  token: address,
  lltv: uint256,
  liquidationCursor: uint256,
  oracle: address,
});
const market: fc.Arbitrary<IVaultV2MidnightAdapterMarket> = fc.record({
  collateralParams: fc.array(collateral, { maxLength: 4 }),
  maturity: uint256,
  rcfThreshold: uint256,
  enterGate: address,
  liquidatorGate: address,
});
const collateralParamsAbi = {
  type: "tuple",
  components: [
    { name: "token", type: "address" },
    { name: "lltv", type: "uint256" },
    { name: "liquidationCursor", type: "uint256" },
    { name: "oracle", type: "address" },
  ],
} as const;

const addressId = (tag: string, value: `0x${string}`) =>
  keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }],
      [tag, value],
    ),
  );
type Collateral = IVaultV2MidnightAdapterMarket["collateralParams"][number];
const familyId = (
  input: Pick<
    IVaultV2MidnightAdapterMarket,
    "collateralParams" | "rcfThreshold" | "liquidatorGate" | "enterGate"
  >,
) =>
  keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "tuple[]", components: collateralParamsAbi.components },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
      ],
      [
        "collateralParams/rcfThreshold/liquidatorGate/enterGate",
        input.collateralParams.map((params: Collateral) => ({
          token: params.token,
          lltv: BigInt(params.lltv),
          liquidationCursor: BigInt(params.liquidationCursor),
          oracle: params.oracle,
        })),
        BigInt(input.rcfThreshold),
        input.liquidatorGate,
        input.enterGate,
      ],
    ),
  );

test.prop([
  fc.record({
    adapter: address,
    token: address,
    input: market,
    duration: uint256,
  }),
])(
  "invariant: every cap id matches abi.encode(string,...)",
  ({ adapter, token, input, duration }) => {
    expect(VaultV2MidnightAdapter.adapterCapId(adapter)).toBe(
      addressId("this", adapter),
    );
    expect(VaultV2MidnightAdapter.collateralTokenCapId(token)).toBe(
      addressId("collateralToken", token),
    );
    expect(VaultV2MidnightAdapter.familyCapId(input)).toBe(familyId(input));
    expect(VaultV2MidnightAdapter.durationCapId(adapter, duration)).toBe(
      keccak256(
        encodeAbiParameters(
          [{ type: "string" }, { type: "address" }, { type: "uint256" }],
          ["this/duration", adapter, duration],
        ),
      ),
    );
  },
);

test.prop([address, market])(
  "invariant: ids(market) lists abi-encoded ids in contract order",
  (adapterAddress, input) => {
    const adapter = new VaultV2MidnightAdapter({
      address: adapterAddress,
      parentVault: adapterAddress,
      asset: adapterAddress,
      skimRecipient: adapterAddress,
      midnight: adapterAddress,
      marketIds: [],
      marketData: {},
      durations: [],
      durationAllocations: [],
      maxTtm: 0n,
      minNetBuyRate: 0n,
      maxNetSellRate: 0n,
      shortfallAllowance: 0n,
      enterGateFactory: "0x0000000000000000000000000000000000000000",
    });
    const expected = [
      addressId("this", adapterAddress),
      familyId(input),
      ...input.collateralParams.map((params) =>
        addressId("collateralToken", params.token),
      ),
    ];

    expect(
      VaultV2MidnightAdapterUtils.ids({
        adapterId: adapter.adapterId,
        market: input,
      }),
    ).toStrictEqual(expected);
    expect(adapter.ids(input)).toStrictEqual(expected);
  },
);

const marketDataRecord = fc
  .array(
    fc.record({
      netCredit: fc.bigInt({ min: 0n, max: 2n ** 128n }),
      maturity: fc.bigInt({ min: 0n, max: 2n ** 40n }),
    }),
    { maxLength: 10 },
  )
  .map((entries) =>
    Object.fromEntries(
      entries.map(({ netCredit, maturity }, i) => [
        `0x${i.toString(16).padStart(64, "0")}` as const,
        {
          netCredit,
          netRate: 0n,
          maturity,
          index: BigInt(i),
          forceSellable: false,
          forceRemoved: false,
          minForceSellPrice: 0n,
        },
      ]),
    ),
  );
const ascendingDurations = fc
  .uniqueArray(fc.bigInt({ min: 0n, max: 2n ** 32n - 1n }), { maxLength: 8 })
  .map((durations) => durations.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));

test.prop(
  [
    fc.record({
      marketData: marketDataRecord,
      durations: ascendingDurations,
      timestamp: fc.bigInt({ min: 0n, max: 2n ** 40n }),
    }),
  ],
  { numRuns: 1_000 },
)(
  "invariant: durationAllocations are cumulative totals over thresholds",
  ({ marketData, durations, timestamp }) => {
    const totals = VaultV2MidnightAdapterUtils.durationAllocations({
      marketData,
      durations,
      length: durations.length,
      timestamp,
    });
    const markets = Object.values(marketData);

    for (let i = 1; i < totals.length; i++)
      expect(totals[i]! <= totals[i - 1]!).toBe(true);

    expect(
      VaultV2MidnightAdapterUtils.durationAllocations({
        marketData,
        durations: [0n],
        length: 1,
        timestamp,
      }),
    ).toStrictEqual([markets.reduce((sum, m) => sum + m.netCredit, 0n)]);

    expect(totals).toStrictEqual(
      durations.map((duration) =>
        markets
          .filter(
            (m) =>
              (m.maturity > timestamp ? m.maturity - timestamp : 0n) >=
              duration,
          )
          .reduce((sum, m) => sum + m.netCredit, 0n),
      ),
    );
  },
);
