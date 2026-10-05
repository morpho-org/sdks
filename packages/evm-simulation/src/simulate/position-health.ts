import { type MarketId, MarketUtils } from "@morpho-org/blue-sdk";
import { blueAbi, blueOracleAbi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
} from "viem";
import {
  ConsumerLimitViolationError,
  InvalidSimulationResponseError,
  MissingVerificationEvidenceError,
} from "../errors.js";
import type { PositionHealthLimit } from "../limits.js";
import type { CheckedPositionHealth } from "../result.js";
import type {
  HealthMarket,
  RequestContext,
} from "./backends/resolve-health-markets.js";
import type { StateRead } from "./state/contract.js";

const accrueId = (marketId: MarketId) => `accrue:${marketId}`.toLowerCase();
const marketReadId = (marketId: MarketId) => `market:${marketId}`.toLowerCase();
const priceId = (marketId: MarketId) => `price:${marketId}`.toLowerCase();
const positionId = (marketId: MarketId, account: Address) =>
  `position:${marketId}:${account}`.toLowerCase();

/**
 * Plan the calls run after the bundle: accrue interest, then read the
 * market totals and oracle price once per market and each checked position.
 * @internal
 */
export function planHealthReads(params: {
  readonly morpho: Address;
  readonly markets: readonly HealthMarket[];
  readonly positions: readonly PositionHealthLimit[];
  readonly owner: Address;
}): readonly StateRead[] {
  const { morpho, markets, positions, owner } = params;
  const reads = new Map<string, StateRead>();
  for (const { marketId, params: marketParams } of markets) {
    reads.set(accrueId(marketId), {
      kind: "morpho.accrueInterest",
      id: accrueId(marketId),
      to: morpho,
      marketId,
      data: encodeFunctionData({
        abi: blueAbi,
        functionName: "accrueInterest",
        args: [marketParams],
      }),
    });
    reads.set(marketReadId(marketId), {
      kind: "morpho.market",
      id: marketReadId(marketId),
      to: morpho,
      marketId,
      data: encodeFunctionData({
        abi: blueAbi,
        functionName: "market",
        args: [marketId],
      }),
    });
    reads.set(priceId(marketId), {
      kind: "oracle.price",
      id: priceId(marketId),
      to: marketParams.oracle,
      marketId,
      data: encodeFunctionData({ abi: blueOracleAbi, functionName: "price" }),
    });
  }
  for (const { marketId, account = owner } of positions) {
    const id = positionId(marketId, account);
    reads.set(id, {
      kind: "morpho.position",
      id,
      to: morpho,
      morpho,
      marketId,
      owner: account,
      data: encodeFunctionData({
        abi: blueAbi,
        functionName: "position",
        args: [marketId, account],
      }),
    });
  }
  return [...reads.values()];
}

/**
 * Check each caller-selected position after the bundle: it must be healthy
 * at the market LLTV and, when `maxLtv` is set, have an LTV of at most `maxLtv`.
 * @param params.returnData - Return data of the {@link planHealthReads} calls by id.
 * @throws {ConsumerLimitViolationError} When a position is liquidatable or above `maxLtv`.
 * @throws {MissingVerificationEvidenceError} When a read returned no data.
 * @throws {InvalidSimulationResponseError} When a read cannot be decoded.
 * @internal
 */
export function verifyPositionHealth(params: {
  readonly markets: readonly HealthMarket[];
  readonly positions: readonly PositionHealthLimit[];
  readonly owner: Address;
  readonly returnData: ReadonlyMap<string, Hex>;
  readonly context: RequestContext;
}): readonly CheckedPositionHealth[] {
  const { markets, positions, owner, returnData, context } = params;
  const decode = <T>(id: string, fn: (data: Hex) => T): T => {
    const data = returnData.get(id);
    if (data === undefined || data === "0x")
      throw new MissingVerificationEvidenceError(
        `Cannot observe position health read "${id}": it returned no data.`,
        { context: { stage: "verification", ...context, field: id } },
      );
    try {
      return fn(data);
    } catch (cause) {
      throw new InvalidSimulationResponseError(
        `Cannot decode position health read "${id}". Check the market oracle and RPC response.`,
        { cause },
      );
    }
  };
  return positions.map(({ marketId, account = owner, maxLtv }) => {
    const { lltv } = markets.find(
      (entry) => entry.marketId.toLowerCase() === marketId.toLowerCase(),
    )!.params;
    const [, , totalBorrowAssets, totalBorrowShares] = decode(
      marketReadId(marketId),
      (data) =>
        decodeFunctionResult({ abi: blueAbi, functionName: "market", data }),
    );
    const price = decode(priceId(marketId), (data) =>
      decodeFunctionResult({ abi: blueOracleAbi, functionName: "price", data }),
    );
    const id = positionId(marketId, account);
    const [, borrowShares, collateral] = decode(id, (data) =>
      decodeFunctionResult({ abi: blueAbi, functionName: "position", data }),
    );
    const position = { collateral, borrowShares };
    const market = { totalBorrowAssets, totalBorrowShares, price };
    const ltv = MarketUtils.getLtv(position, { ...market }) ?? 0n;
    const violation = (expected: bigint, reason: string) =>
      new ConsumerLimitViolationError(
        `Position on "${marketId}" of ${account} has an LTV of ${ltv} after the bundle, ${reason} ${expected} (WAD).`,
        {
          context: {
            stage: "verification",
            ...context,
            account,
            field: id,
            expected,
            observed: ltv,
          },
        },
      );
    if (!MarketUtils.isHealthy(position, market, { lltv }))
      throw violation(lltv, "liquidatable at the market LLTV");
    if (maxLtv !== undefined && ltv > maxLtv)
      throw violation(maxLtv, "above the maximum");
    return {
      marketId,
      account,
      lltv,
      ltv,
      ...(maxLtv !== undefined ? { maxLtv } : {}),
    };
  });
}
