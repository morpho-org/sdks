import type { BigIntish } from "@morpho-org/morpho-ts";
import type { Address, Hash } from "viem";
import { readContract } from "viem/actions";
import { midnightAbi } from "../abis.js";
import { MAX_COLLATERALS } from "../constants.js";
import { AccrualPosition, Position } from "../market/index.js";
import {
  abi as getPositionAbi,
  code as getPositionCode,
} from "../queries/GetPosition.js";
import { callParameters, shouldUseDeployless } from "./_utils.js";
import { fetchMarket } from "./Market.js";
import type { MidnightFetchParams } from "./types.js";

/**
 * Fetches a Midnight position by id and user.
 *
 * The Solidity storage getter does not return the fixed collateral array, so
 * this helper reads each collateral slot before returning the position.
 *
 * @param params - Fetch parameters.
 * @returns Normalized position object.
 * @example
 * ```ts
 * import { fetchPosition } from "@morpho-org/midnight-sdk";
 *
 * const position = await fetchPosition({} as never);
 * console.log(position.debt);
 * ```
 */
export async function fetchPosition(
  params: MidnightFetchParams & {
    readonly marketId: Hash;
    readonly user: Address;
  },
): Promise<Position> {
  if (shouldUseDeployless(params)) {
    try {
      const position = await readContract(params.client, {
        ...callParameters(params),
        abi: getPositionAbi,
        code: getPositionCode,
        functionName: "query",
        args: [params.midnight, params.marketId, params.user],
      });

      const collateral = position.collateral as readonly BigIntish[];

      return new Position({
        credit: position.credit,
        pendingFee: position.pendingFee,
        lastLossFactor: position.lastLossFactor,
        lastAccrual: position.lastAccrual,
        debt: position.debt,
        collateralBitmap: position.collateralBitmap,
        collateral: collateral.map((assets) => BigInt(assets)),
      });
    } catch (error) {
      if (params.deployless === "force") throw error;
      // Fallback to direct reads if deployless execution is unavailable.
    }
  }

  const position = await readContract(params.client, {
    ...callParameters(params),
    address: params.midnight,
    abi: midnightAbi,
    functionName: "position",
    args: [params.marketId, params.user],
  });
  const collateral = await Promise.all(
    Array.from({ length: Number(MAX_COLLATERALS) }, (_, collateralIndex) => {
      return readContract(params.client, {
        ...callParameters(params),
        address: params.midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [params.marketId, params.user, BigInt(collateralIndex)],
      });
    }),
  );

  return new Position({
    credit: position[0],
    pendingFee: position[1],
    lastLossFactor: position[2],
    lastAccrual: position[3],
    debt: position[4],
    collateralBitmap: position[5],
    collateral: [...collateral],
  });
}

/**
 * Fetches a Midnight position paired with its hydrated market.
 *
 * @param params - Fetch parameters.
 * @returns Accrual position instance.
 * @example
 * ```ts
 * import { fetchAccrualPosition } from "@morpho-org/midnight-sdk";
 *
 * const position = await fetchAccrualPosition({} as never);
 * console.log(position.market.id);
 * ```
 */
export async function fetchAccrualPosition(
  params: MidnightFetchParams & {
    readonly marketId: Hash;
    readonly user: Address;
  },
) {
  const [position, market] = await Promise.all([
    fetchPosition(params),
    fetchMarket(params),
  ]);

  return new AccrualPosition(position, market);
}
