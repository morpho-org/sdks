import type { InputMarketParams, MarketId } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  encodeFunctionResult,
  getAddress,
  zeroAddress,
} from "viem";
import { describe, expect, test } from "vitest";
import { encodeUint256 } from "../../test-helpers/index.js";
import { morphoReads, parseMorpho } from "./morpho.js";
import { decodeStateRead } from "./read-state.js";

const MORPHO: Address = getAddress(
  "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
);
const OWNER: Address = getAddress("0x1111111111111111111111111111111111111111");
const ORACLE: Address = getAddress(
  "0x0000000000000000000000000000000000000001",
);
const IRM: Address = getAddress("0x0000000000000000000000000000000000000002");
const AUTHORIZED: Address = getAddress(
  "0x3333333333333333333333333333333333333333",
);

const params = {
  loanToken: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
  collateralToken: getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
  oracle: ORACLE,
  irm: IRM,
  lltv: 900000000000000000n,
} satisfies InputMarketParams;
const marketId =
  "0xb8c25cd0a6f03f8b34c8b9b12e24a2a1b3f0f0f0f0f0f0f0f0f0f0f0f0f0f0f" as MarketId;

const reads = morphoReads({
  morpho: MORPHO,
  markets: [{ marketId, params }],
  positions: [{ marketId, owner: OWNER }],
  authorizations: [{ authorizer: OWNER, authorized: AUTHORIZED }],
  nonceOwners: [OWNER],
});

const byKind = (kind: string) => reads.filter((r) => r.kind === kind);

describe("morphoReads + parseMorpho", () => {
  test("emits market, position, oracle, irm, authorization and nonce reads", () => {
    expect(byKind("morpho.market")).toHaveLength(1);
    expect(byKind("morpho.position")).toHaveLength(1);
    expect(byKind("morpho.oraclePrice")).toHaveLength(1);
    expect(byKind("morpho.irmRateAtTarget")).toHaveLength(1);
    expect(byKind("morpho.isAuthorized")).toHaveLength(1);
    expect(byKind("morpho.nonce")).toHaveLength(1);
  });

  test("decodes each read kind", () => {
    const marketRead = byKind("morpho.market")[0]!;
    const decoded = decodeStateRead(
      marketRead,
      encodeFunctionResult({
        abi: blueAbi,
        functionName: "market",
        result: [10n, 9n, 8n, 7n, 6n, 5n],
      }),
    );
    const positionRead = byKind("morpho.position")[0]!;
    const decodedPosition = decodeStateRead(
      positionRead,
      encodeFunctionResult({
        abi: blueAbi,
        functionName: "position",
        result: [11n, 12n, 13n],
      }),
    );
    const authRead = byKind("morpho.isAuthorized")[0]!;
    const decodedAuth = decodeStateRead(authRead, encodeUint256(1n));
    const nonceRead = byKind("morpho.nonce")[0]!;
    const decodedNonce = decodeStateRead(nonceRead, encodeUint256(4n));
    const oracleRead = byKind("morpho.oraclePrice")[0]!;
    const decodedOracle = decodeStateRead(
      oracleRead,
      encodeUint256(10n ** 36n),
    );
    const irmRead = byKind("morpho.irmRateAtTarget")[0]!;
    const decodedIrm = decodeStateRead(irmRead, encodeUint256(31_556_952n));

    const parsed = parseMorpho([
      decoded,
      decodedPosition,
      decodedAuth,
      decodedNonce,
      decodedOracle,
      decodedIrm,
    ]);
    expect(parsed.markets).toEqual([
      {
        marketId,
        totalSupplyAssets: 10n,
        totalSupplyShares: 9n,
        totalBorrowAssets: 8n,
        totalBorrowShares: 7n,
        lastUpdate: 6n,
        fee: 5n,
      },
    ]);
    expect(parsed.positions).toEqual([
      {
        marketId,
        owner: OWNER,
        supplyShares: 11n,
        borrowShares: 12n,
        collateral: 13n,
      },
    ]);
    expect(parsed.authorizations).toEqual([
      { authorizer: OWNER, authorized: AUTHORIZED, before: true, after: true },
    ]);
    expect(parsed.nonces).toEqual([
      {
        type: "blueAuthorization",
        verifyingContract: MORPHO,
        owner: OWNER,
        before: 4n,
        after: 4n,
      },
    ]);
    expect(parsed.oraclePrices.get(ORACLE)).toBe(10n ** 36n);
    expect(parsed.irmRates.get(marketId)?.rateAtTarget).toBe(31_556_952n);
  });

  test("skips oracle/irm reads for zero-address bindings", () => {
    const noOracle = morphoReads({
      morpho: MORPHO,
      markets: [
        {
          marketId,
          params: { ...params, oracle: zeroAddress, irm: zeroAddress },
        },
      ],
      positions: [],
      authorizations: [],
      nonceOwners: [],
    });
    expect(noOracle.some((r) => r.kind === "morpho.oraclePrice")).toBe(false);
    expect(noOracle.some((r) => r.kind === "morpho.irmRateAtTarget")).toBe(
      false,
    );
  });
});
