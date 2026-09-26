import type { MarketId } from "@morpho-org/blue-sdk";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import * as fc from "fast-check";
import {
  type Address,
  encodeAbiParameters,
  getAddress,
  numberToHex,
  zeroAddress,
} from "viem";
import type { ProbeRead } from "../../domain/stages.js";
import { InvalidSimulationResponseError } from "../../errors.js";
import { NATIVE_BALANCE_PROBE_ADDRESS } from "./native-balance-probe.js";
import { decodeProbeResult, encodeProbeCall, probeId } from "./probes.js";

const addresses = getChainAddresses(1);

const address = fc
  .bigInt({ min: 0n, max: (1n << 160n) - 1n })
  .map((n) => getAddress(`0x${n.toString(16).padStart(40, "0")}`) as Address);
const big = fc.bigInt({ min: 0n, max: 2n ** 200n });

const marketParams = {
  loanToken: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
  collateralToken: getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
  oracle: getAddress("0x0000000000000000000000000000000000000100"),
  irm: getAddress("0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC"),
  lltv: 860_000_000_000_000_000n,
};

const readArb: fc.Arbitrary<ProbeRead> = fc.oneof(
  address.map((account): ProbeRead => ({ type: "nativeBalance", account })),
  fc
    .record({ token: address, account: address })
    .map((r): ProbeRead => ({ type: "erc20Balance", ...r })),
  fc
    .record({ token: address, owner: address, spender: address })
    .map((r): ProbeRead => ({ type: "erc20Allowance", ...r })),
  fc
    .record({ token: address, owner: address })
    .map((r): ProbeRead => ({ type: "erc2612Nonce", ...r })),
  fc.record({ owner: address, wordPosition: big }).map(
    (r): ProbeRead => ({
      type: "permit2NonceBitmap",
      permit2: addresses.permit2!,
      ...r,
    }),
  ),
  fc.record({ authorizer: address, authorized: address }).map(
    (r): ProbeRead => ({
      type: "blueIsAuthorized",
      morpho: addresses.blue,
      ...r,
    }),
  ),
  fc
    .record({ owner: address })
    .map(
      (r): ProbeRead => ({ type: "blueNonce", morpho: addresses.blue, ...r }),
    ),
  fc.record({ owner: address }).map(
    (r): ProbeRead => ({
      type: "bluePosition",
      morpho: addresses.blue,
      marketId: `0x${"ab".repeat(32)}` as MarketId,
      ...r,
    }),
  ),
  address.map((oracle): ProbeRead => ({ type: "oraclePrice", oracle })),
  address.map((vault): ProbeRead => ({ type: "vaultTotalAssets", vault })),
  address.map((vault): ProbeRead => ({ type: "vaultTotalSupply", vault })),
  fc
    .record({ vault: address, account: address })
    .map((r): ProbeRead => ({ type: "vaultBalanceOf", ...r })),
  fc
    .record({ vault: address, asset: address, liquidityAdapter: address })
    .map((r): ProbeRead => ({ type: "vaultIdleAssets", ...r })),
  fc.record({ vault: address }).map(
    (r): ProbeRead => ({
      type: "adapterAllocation",
      allocationId: `0x${"cd".repeat(32)}` as MarketId,
      ...r,
    }),
  ),
  address.map(
    (irm): ProbeRead => ({
      type: "irmBorrowRateView",
      irm,
      market: marketParams,
      marketState: {
        totalSupplyAssets: 1n,
        totalSupplyShares: 1n,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        lastUpdate: 1n,
        fee: 0n,
      },
    }),
  ),
  fc.constant<ProbeRead>({
    type: "blueMarket",
    morpho: addresses.blue,
    marketId: `0x${"ab".repeat(32)}` as MarketId,
  }),
);

describe("encodeProbeCall", () => {
  test("behavior: every probe call is populated and sent from zero", () => {
    fc.assert(
      fc.property(readArb, (read) => {
        const tx = encodeProbeCall(read);
        expect(tx.from).toBe(zeroAddress);
        expect(tx.value).toBe(0n);
        expect(tx.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
        expect(tx.data).toMatch(/^0x[0-9a-fA-F]*$/);
      }),
    );
  });

  test("behavior: native probes target the injected contract", () => {
    const tx = encodeProbeCall({
      type: "nativeBalance",
      account: getAddress("0x1111111111111111111111111111111111111111"),
    });
    expect(tx.to).toBe(NATIVE_BALANCE_PROBE_ADDRESS);
  });

  test("behavior: non-native probes target the real contract", () => {
    const token = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    const owner = getAddress("0x1111111111111111111111111111111111111111");
    const tx = encodeProbeCall({ type: "erc20Balance", token, account: owner });
    expect(tx.to).toBe(token);
  });
});

describe("decodeProbeResult", () => {
  test("behavior: bigint reads round-trip", () => {
    fc.assert(
      fc.property(big, (value) => {
        const data = encodeAbiParameters(
          [{ type: "uint256" }],
          [value],
        ) as MarketId;
        for (const read of [
          {
            type: "nativeBalance",
            account: getAddress("0x1111111111111111111111111111111111111111"),
          } satisfies ProbeRead,
          {
            type: "erc2612Nonce",
            token: getAddress("0x2222222222222222222222222222222222222222"),
            owner: getAddress("0x1111111111111111111111111111111111111111"),
          } satisfies ProbeRead,
          {
            type: "oraclePrice",
            oracle: getAddress("0x3333333333333333333333333333333333333333"),
          } satisfies ProbeRead,
        ] as const) {
          const decoded = decodeProbeResult(read, data);
          expect(decoded.value).toBe(value);
        }
      }),
    );
  });

  test("behavior: bluePosition decodes the three fields", () => {
    const data = encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [1n, 2n, 3n],
    ) as MarketId;
    const decoded = decodeProbeResult(
      {
        type: "bluePosition",
        morpho: addresses.blue,
        marketId: `0x${"ab".repeat(32)}` as MarketId,
        owner: getAddress("0x1111111111111111111111111111111111111111"),
      },
      data,
    );
    expect(decoded.value).toEqual({
      supplyShares: 1n,
      borrowShares: 2n,
      collateral: 3n,
    });
  });

  test("behavior: blueMarket decodes the six fields", () => {
    const data = encodeAbiParameters(
      [
        { type: "uint128" },
        { type: "uint128" },
        { type: "uint128" },
        { type: "uint128" },
        { type: "uint128" },
        { type: "uint128" },
      ],
      [1n, 2n, 3n, 4n, 5n, 6n],
    ) as MarketId;
    const decoded = decodeProbeResult(
      {
        type: "blueMarket",
        morpho: addresses.blue,
        marketId: `0x${"ab".repeat(32)}` as MarketId,
      },
      data,
    );
    expect(decoded.value).toEqual({
      totalSupplyAssets: 1n,
      totalSupplyShares: 2n,
      totalBorrowAssets: 3n,
      totalBorrowShares: 4n,
      lastUpdate: 5n,
      fee: 6n,
    });
  });

  test("behavior: blueIsAuthorized decodes a boolean", () => {
    const data = encodeAbiParameters([{ type: "bool" }], [true]) as MarketId;
    const decoded = decodeProbeResult(
      {
        type: "blueIsAuthorized",
        morpho: addresses.blue,
        authorizer: getAddress("0x1111111111111111111111111111111111111111"),
        authorized: getAddress("0x2222222222222222222222222222222222222222"),
      },
      data,
    );
    expect(decoded.value).toBe(true);
  });

  test("error: InvalidSimulationResponseError on undecodable data", () => {
    expect(() =>
      decodeProbeResult(
        {
          type: "oraclePrice",
          oracle: getAddress("0x1111111111111111111111111111111111111111"),
        },
        "0x1234",
      ),
    ).toThrow(InvalidSimulationResponseError);
  });
});

describe("probeId", () => {
  test("behavior: ids are stable, distinct and key-field-based", () => {
    const owner = getAddress("0x1111111111111111111111111111111111111111");
    const a: ProbeRead = { type: "nativeBalance", account: owner };
    const b: ProbeRead = {
      type: "erc20Balance",
      token: getAddress("0x2222222222222222222222222222222222222222"),
      account: owner,
    };
    expect(probeId(a)).toBe(probeId({ ...a }));
    expect(probeId(a)).not.toBe(probeId(b));
    expect(probeId(a)).toContain("nativeBalance");
    expect(probeId(b)).toContain(owner);
    expect(
      probeId({
        type: "permit2NonceBitmap",
        permit2: addresses.permit2!,
        owner,
        wordPosition: 256n,
      }),
    ).toContain(numberToHex(256n));
  });
});
