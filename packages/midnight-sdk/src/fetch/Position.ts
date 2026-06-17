import { type BigIntish, getChainAddress } from "@morpho-org/morpho-ts";
import type { Address, Client, Hash } from "viem";
import { readContract } from "viem/actions";
import { midnightAbi } from "../abis.js";
import { MAX_COLLATERALS } from "../constants.js";
import { AccrualPosition, Position } from "../market/index.js";
import {
  abi as getPositionAbi,
  code as getPositionCode,
} from "../queries/GetPosition.js";
import { fetchMarket } from "./Market.js";
import type { MidnightFetchParams } from "./types.js";
import {
  callParameters,
  resolveChainId,
  shouldUseDeployless,
} from "./utils.js";

/**
 * Fetches a Midnight position by id and user.
 *
 * The Solidity storage getter does not return the fixed collateral array, so
 * this helper reads each collateral slot before returning the position.
 *
 * @param client - Viem client used for the reads.
 * @param params - Fetch parameters.
 * @returns Normalized position object.
 * @throws {UnsupportedChainIdError} when no address registry exists for the client chain id.
 * @throws {UnknownAddressError} when the registry has no Midnight address for the client chain id.
 * @example
 * ```ts
 * import { fetchPosition } from "@morpho-org/midnight-sdk";
 *
 * const position = await fetchPosition({} as never, {} as never);
 * console.log(position.debt);
 * ```
 */
export async function fetchPosition(
  client: Client,
  params: MidnightFetchParams & {
    readonly marketId: Hash;
    readonly user: Address;
  },
): Promise<Position> {
  const chainId = await resolveChainId(client);
  const midnight = getChainAddress(chainId, "midnight");
  if (shouldUseDeployless(params)) {
    try {
      const position = await readContract(client, {
        ...callParameters(params),
        abi: getPositionAbi,
        code: getPositionCode,
        functionName: "query",
        args: [midnight, params.marketId, params.user],
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

  const position = await readContract(client, {
    ...callParameters(params),
    address: midnight,
    abi: midnightAbi,
    functionName: "position",
    args: [params.marketId, params.user],
  });
  const collateral = await Promise.all(
    Array.from({ length: Number(MAX_COLLATERALS) }, (_, collateralIndex) => {
      return readContract(client, {
        ...callParameters(params),
        address: midnight,
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
 * @param client - Viem client used for the reads.
 * @param params - Fetch parameters.
 * @returns Accrual position instance.
 * @throws {UnsupportedChainIdError} when no address registry exists for the client chain id.
 * @throws {UnknownAddressError} when the registry has no Midnight address for the client chain id.
 * @example
 * ```ts
 * import { fetchAccrualPosition } from "@morpho-org/midnight-sdk";
 *
 * const position = await fetchAccrualPosition({} as never, {} as never);
 * console.log(position.market.id);
 * ```
 */
export async function fetchAccrualPosition(
  client: Client,
  params: MidnightFetchParams & {
    readonly marketId: Hash;
    readonly user: Address;
  },
) {
  const [position, market] = await Promise.all([
    fetchPosition(client, params),
    fetchMarket(client, params),
  ]);

  return new AccrualPosition(position, market);
}
