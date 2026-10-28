import { type MarketInput, MarketUtils } from "@morpho-org/midnight-sdk";
import {
  type Abi,
  BaseError,
  type ContractFunctionName,
  type EncodeFunctionDataParameters,
  type EncodeFunctionDataReturnType,
  encodeFunctionData,
} from "viem";
import { MidnightCalldataEncodingError } from "../types/index.js";

/**
 * `encodeFunctionData` for Midnight builders that reports invalid inputs as a typed SDK error.
 *
 * @internal
 * @param parameters - viem `encodeFunctionData` parameters.
 * @returns The encoded calldata.
 * @throws {MidnightCalldataEncodingError} when viem cannot encode an argument.
 * @example
 * ```ts
 * import { midnightAbi } from "@morpho-org/midnight-sdk";
 *
 * const data = encodeMidnightCalldata({
 *   abi: midnightAbi,
 *   functionName: "setIsAuthorized",
 *   args: [operator, true, owner],
 * });
 * ```
 */
export function encodeMidnightCalldata<
  const abi extends Abi | readonly unknown[],
  functionName extends ContractFunctionName<abi> | undefined = undefined,
>(
  parameters: EncodeFunctionDataParameters<abi, functionName>,
): EncodeFunctionDataReturnType {
  try {
    return encodeFunctionData(parameters);
  } catch (error) {
    if (!(error instanceof BaseError)) throw error;
    throw new MidnightCalldataEncodingError(
      String(parameters.functionName),
      error,
    );
  }
}

/**
 * Runs a Midnight ABI encoding step and reports a viem encoding failure as a typed SDK error.
 *
 * @internal
 * @param name - Name of the encoded value, reported as the error's `input`.
 * @param encode - Encoding step, such as hashing a market or an offer tree.
 * @returns The encoding step's result.
 * @throws {MidnightCalldataEncodingError} when `encode` throws a viem error.
 * @example
 * ```ts
 * const tree = wrapMidnightEncoding("offers", () => Tree.from(offers));
 * ```
 */
export function wrapMidnightEncoding<T>(name: string, encode: () => T): T {
  try {
    return encode();
  } catch (error) {
    if (!(error instanceof BaseError)) throw error;
    throw new MidnightCalldataEncodingError(name, error);
  }
}

/**
 * `MarketUtils.toId` for Midnight builders that reports an unencodable market as a typed SDK error.
 *
 * @internal
 * @param market - Midnight market whose struct is ABI-encoded and hashed.
 * @returns The market id.
 * @throws {MidnightCalldataEncodingError} when viem cannot encode a market field.
 * @example
 * ```ts
 * const marketId = encodeMidnightMarketId(market);
 * ```
 */
export function encodeMidnightMarketId(market: MarketInput) {
  return wrapMidnightEncoding("marketId", () => MarketUtils.toId(market));
}
