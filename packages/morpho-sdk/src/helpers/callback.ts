import { type InputMarketParams, marketParamsAbi } from "@morpho-org/blue-sdk";
import { getBlueBuyCallbackAddress } from "@morpho-org/midnight-sdk";
import { type Address, encodeAbiParameters, type Hex } from "viem";

/**
 * Computes the CREATE2 address of `owner`'s `BlueBuyCallback` for `salt`, as deployed or
 * returned by the chain's `midnightBlueBuyCallbackFactory.createBlueBuyCallback(owner, salt)`.
 *
 * Use it to fill each offer's `callback` before calling `supplyBlueMakeLend`. It is the
 * Midnight-qualified name of midnight-sdk's `getBlueBuyCallbackAddress`.
 *
 * @param params.chainId - Chain whose `midnightBlueBuyCallbackFactory`, `midnight` and `blue` are used.
 * @param params.owner - Callback owner, the maker.
 * @param params.salt - Callback salt.
 * @returns The callback address, whether or not it is deployed yet.
 * @throws {UnsupportedChainIdError} when the chain is absent from the address registry.
 * @throws {UnknownAddressError} when the chain has no `midnightBlueBuyCallbackFactory`, `midnight` or `blue` deployment.
 * @example
 * ```ts
 * import { getMidnightBlueBuyCallbackAddress } from "@morpho-org/morpho-sdk";
 * import { ChainId } from "@morpho-org/morpho-ts";
 * import { keccak256, toHex } from "viem";
 * import type { Address } from "viem";
 *
 * const callbackFor = (maker: Address) =>
 *   getMidnightBlueBuyCallbackAddress({
 *     chainId: ChainId.EthMainnet,
 *     owner: maker,
 *     salt: keccak256(toHex("my-strategy")),
 *   });
 * // `callbackFor(maker)` returns the maker's BlueBuyCallback address, deployed or not.
 * ```
 */
export const getMidnightBlueBuyCallbackAddress = (params: {
  readonly chainId: number;
  readonly owner: Address;
  readonly salt: Hex;
}): Address => getBlueBuyCallbackAddress(params);

/**
 * Returns the `callbackData` every `supplyBlueMakeLend` offer must carry: `abi.encode(blueMarket)`.
 *
 * @param blueMarket - Morpho Blue market encoded as the callback data.
 * @returns The ABI-encoded Morpho Blue market parameters.
 * @example
 * ```ts
 * import { getMidnightBlueBuyCallbackData } from "@morpho-org/morpho-sdk";
 * import type { InputMarketParams as MarketParams } from "@morpho-org/blue-sdk";
 * import type { Hex } from "viem";
 *
 * function getCallbackData(blueMarket: MarketParams) {
 *   const callbackData = getMidnightBlueBuyCallbackData(blueMarket);
 *   // callbackData satisfies Hex
 *   return callbackData;
 * }
 * ```
 */
export const getMidnightBlueBuyCallbackData = (
  blueMarket: InputMarketParams,
): Hex => encodeAbiParameters([marketParamsAbi], [blueMarket]);
