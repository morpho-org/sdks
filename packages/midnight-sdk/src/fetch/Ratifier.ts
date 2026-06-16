import type { Address, Client } from "viem";
import { getBytecode } from "viem/actions";
import {
  type RatifierInfo,
  RatifierUtils,
} from "../signatures/RatifierUtils.js";
import { bytecodeCallParameters } from "./_utils.js";
import type { MidnightCallParameters } from "./types.js";

/**
 * Fetches maker bytecode and classifies the ratifier route.
 *
 * @param params - Fetch parameters.
 * @returns Ratifier information.
 * @example
 * ```ts
 * import { fetchRatifierInfo } from "@morpho-org/midnight-sdk";
 *
 * const info = await fetchRatifierInfo({} as never);
 * console.log(info.type);
 * ```
 */
export async function fetchRatifierInfo(
  params: {
    readonly client: Client;
    readonly maker: Address;
    readonly ecrecoverRatifier: Address;
    readonly setterRatifier: Address;
  } & MidnightCallParameters,
): Promise<RatifierInfo> {
  const bytecode = await getBytecode(params.client, {
    ...bytecodeCallParameters(params),
    address: params.maker,
  });

  return RatifierUtils.getRatifierInfo({
    bytecode,
    ecrecoverRatifier: params.ecrecoverRatifier,
    setterRatifier: params.setterRatifier,
  });
}
