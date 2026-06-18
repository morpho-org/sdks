import { getChainAddress } from "@morpho-org/morpho-ts";
import type { Address, Client } from "viem";
import { getBytecode } from "viem/actions";
import {
  type RatifierInfo,
  RatifierUtils,
} from "../signatures/RatifierUtils.js";
import type { MidnightCallParameters } from "./types.js";
import { resolveChainId } from "./utils.js";

/**
 * Fetches maker bytecode and classifies the ratifier route for new offers.
 *
 * The `bytecode` read is the result of `eth_getCode` for `params.maker` at the
 * requested block. It is not returned to callers; it only tells the SDK whether
 * the maker is an EOA or EIP-7702 account that can use Ecrecover signatures, or
 * a deployed-code account that should use Setter root approval. Put the returned
 * `ratifier` address on `Offer.create`, then use the returned `type` to choose
 * `EcrecoverRatifierUtils.ratify` or `SetterRatifierUtils.ratify` after the tree
 * has been built.
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
 * const maker = "0x7b093658BE7f90B63D7c359e8f408e503c2D9401";
 * const info = await fetchRatifierInfo(client, { maker });
 * // Pass info.ratifier to Offer.create(...), then use info.type after
 * // Tree.create([...]) to choose the Ecrecover or Setter ratifier flow.
 * console.log(info.type, info.ratifier);
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
    ...(params.blockNumber != null
      ? { blockNumber: params.blockNumber }
      : params.blockTag != null
        ? { blockTag: params.blockTag }
        : {}),
    address: params.maker,
  });

  return RatifierUtils.getRatifierInfo({
    bytecode,
    ecrecoverRatifier,
    setterRatifier,
  });
}
