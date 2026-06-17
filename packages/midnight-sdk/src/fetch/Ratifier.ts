import { getChainAddress } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { getBytecode } from "viem/actions";
import {
  type RatifierInfo,
  RatifierUtils,
} from "../signatures/RatifierUtils.js";
import type { MidnightCallParameters } from "./types.js";
import { bytecodeCallParameters, resolveChainId } from "./utils.js";

/**
 * Fetches maker bytecode and classifies the ratifier route.
 *
 * @param client - Viem client used for the bytecode read.
 * @param params - Fetch parameters.
 * @returns Ratifier information.
 * @throws {UnsupportedChainIdError} when no address registry exists for the client chain id.
 * @throws {UnknownAddressError} when the registry has no configured ratifier address for the client chain id.
 * @example
 * ```ts
 * import { fetchRatifierInfo } from "@morpho-org/midnight-sdk";
 *
 * const info = await fetchRatifierInfo({} as never, {} as never);
 * console.log(info.type);
 * ```
 */
export async function fetchRatifierInfo(
  client: Client,
  params: {
    readonly maker: Address;
  } & MidnightCallParameters,
): Promise<RatifierInfo> {
  const chainId = await resolveChainId(client);
  const ecrecoverRatifier = getChainAddress(chainId, "ecrecoverRatifier");
  const setterRatifier = getChainAddress(chainId, "setterRatifier");
  const bytecode = await getBytecode(client, {
    ...bytecodeCallParameters(params),
    address: params.maker,
  });

  return RatifierUtils.getRatifierInfo({
    bytecode,
    ecrecoverRatifier,
    setterRatifier,
  });
}
