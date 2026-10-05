import { MarketParams, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
import { blueAbi, blueOracleAbi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeFunctionData,
  encodeFunctionResult,
  type Hex,
} from "viem";
import { describe, expect, test } from "vitest";
import {
  ConsumerLimitViolationError,
  InvalidSimulationResponseError,
  MissingVerificationEvidenceError,
} from "../errors.js";
import type { HealthMarket } from "./backends/resolve-health-markets.js";
import { planHealthReads, verifyPositionHealth } from "./position-health.js";

const owner: Address = "0x0000000000000000000000000000000000000001";
const other: Address = "0x0000000000000000000000000000000000000002";
const morpho: Address = "0x0000000000000000000000000000000000000003";
const params = {
  loanToken: "0x0000000000000000000000000000000000000004",
  collateralToken: "0x0000000000000000000000000000000000000005",
  oracle: "0x0000000000000000000000000000000000000006",
  irm: "0x0000000000000000000000000000000000000007",
  lltv: 80_0000000000000000n,
} as const;
const marketId = new MarketParams(params).id;
const markets: HealthMarket[] = [{ marketId, params }];
const context = { chainId: 1, mode: "final", blockNumber: 1n } as const;

/** Return data for a market with 1e6 borrow shares per asset (its virtual-share ratio) and a 1:1 price; `borrowShares` is given in assets. */
function returnData(position: {
  collateral: bigint;
  borrowShares: bigint;
  account?: Address;
}): Map<string, Hex> {
  const account = position.account ?? owner;
  return new Map([
    [
      `market:${marketId}`.toLowerCase(),
      encodeFunctionResult({
        abi: blueAbi,
        functionName: "market",
        result: [0n, 0n, 10n ** 18n, 10n ** 24n, 0n, 0n],
      }),
    ],
    [
      `price:${marketId}`.toLowerCase(),
      encodeFunctionResult({
        abi: blueOracleAbi,
        functionName: "price",
        result: ORACLE_PRICE_SCALE,
      }),
    ],
    [
      `position:${marketId}:${account}`.toLowerCase(),
      encodeFunctionResult({
        abi: blueAbi,
        functionName: "position",
        result: [0n, position.borrowShares * 10n ** 6n, position.collateral],
      }),
    ],
  ]);
}

describe("planHealthReads", () => {
  test("default: no positions plan no reads", () => {
    expect(
      planHealthReads({ morpho, markets: [], positions: [], owner }),
    ).toEqual([]);
  });
  test("behavior: accrues once per market before reading totals, price and each position", () => {
    const reads = planHealthReads({
      morpho,
      markets,
      positions: [{ marketId }, { marketId, account: other }, { marketId }],
      owner,
    });
    expect(reads.map(({ kind, to }) => [kind, to])).toEqual([
      ["morpho.accrueInterest", morpho],
      ["morpho.market", morpho],
      ["oracle.price", params.oracle],
      ["morpho.position", morpho],
      ["morpho.position", morpho],
    ]);
    expect(
      decodeFunctionData({ abi: blueAbi, data: reads[0]!.data }),
    ).toMatchObject({ functionName: "accrueInterest", args: [params] });
    expect(
      reads
        .slice(3)
        .map(
          (read) => decodeFunctionData({ abi: blueAbi, data: read.data }).args,
        ),
    ).toEqual([
      [marketId, owner],
      [marketId, other],
    ]);
  });
});

describe("verifyPositionHealth", () => {
  const verify = (
    position: Parameters<typeof returnData>[0],
    maxLtv?: bigint,
  ) =>
    verifyPositionHealth({
      markets,
      positions: [
        {
          marketId,
          ...(position.account !== undefined
            ? { account: position.account }
            : {}),
          ...(maxLtv !== undefined ? { maxLtv } : {}),
        },
      ],
      owner,
      returnData: returnData(position),
      context,
    });

  test("behavior: a position without debt passes with zero LTV", () => {
    expect(verify({ collateral: 0n, borrowShares: 0n })).toEqual([
      { marketId, account: owner, lltv: params.lltv, ltv: 0n },
    ]);
  });
  test("behavior: a position exactly at the LLTV is healthy", () => {
    expect(
      verify({ collateral: 1000n, borrowShares: 800n, account: other }),
    ).toEqual([
      { marketId, account: other, lltv: params.lltv, ltv: params.lltv },
    ]);
  });
  test("error: a liquidatable position is a consumer limit violation", () => {
    const error = (() => {
      try {
        verify({ collateral: 1000n, borrowShares: 801n });
      } catch (cause) {
        return cause;
      }
    })();
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect((error as ConsumerLimitViolationError).context).toMatchObject({
      stage: "verification",
      account: owner,
      field: `position:${marketId}:${owner}`.toLowerCase(),
      expected: params.lltv,
      observed: 801_000000000000000n,
    });
  });
  test("error: collateral-free debt is liquidatable", () => {
    expect(() => verify({ collateral: 0n, borrowShares: 1n })).toThrow(
      ConsumerLimitViolationError,
    );
  });
  test("behavior: maxLtv is inclusive", () => {
    expect(
      verify({ collateral: 1000n, borrowShares: 500n }, 50_0000000000000000n),
    ).toEqual([
      {
        marketId,
        account: owner,
        lltv: params.lltv,
        ltv: 50_0000000000000000n,
        maxLtv: 50_0000000000000000n,
      },
    ]);
  });
  test("error: a healthy position above maxLtv fails", () => {
    expect(() =>
      verify({ collateral: 1000n, borrowShares: 501n }, 50_0000000000000000n),
    ).toThrow(/above the maximum/);
  });
  test("error: empty return data is missing evidence", () => {
    const data = returnData({ collateral: 1n, borrowShares: 0n });
    data.set(`price:${marketId}`.toLowerCase(), "0x");
    expect(() =>
      verifyPositionHealth({
        markets,
        positions: [{ marketId }],
        owner,
        returnData: data,
        context,
      }),
    ).toThrow(MissingVerificationEvidenceError);
  });
  test("error: undecodable return data is an invalid response", () => {
    const data = returnData({ collateral: 1n, borrowShares: 0n });
    data.set(`market:${marketId}`.toLowerCase(), "0x01");
    expect(() =>
      verifyPositionHealth({
        markets,
        positions: [{ marketId }],
        owner,
        returnData: data,
        context,
      }),
    ).toThrow(InvalidSimulationResponseError);
  });
});
