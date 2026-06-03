import type { Address, Hex } from "viem";

import { normalizeAddress, normalizeHex } from "../internal.js";
import type { RatifierInfo } from "../types.js";

/**
 * Parameters for {@link RatifierUtils.getRatifierInfo}.
 *
 * @example
 * ```ts
 * import type { GetRatifierInfoParams } from "@morpho-org/midnight-sdk";
 *
 * const params = {} as GetRatifierInfoParams;
 * console.log(params.bytecode);
 * ```
 */
export interface GetRatifierInfoParams {
  /** Maker account bytecode returned by viem `getBytecode`. */
  readonly bytecode?: Hex | null;
  /** Ecrecover ratifier address. */
  readonly ecrecoverRatifier: Address | string;
  /** Setter ratifier address. */
  readonly setterRatifier: Address | string;
}

/**
 * Utilities for selecting Midnight ratifier routes.
 *
 * @example
 * ```ts
 * import { RatifierUtils } from "@morpho-org/midnight-sdk";
 *
 * console.log(RatifierUtils.isEip7702Designator("0xef0100"));
 * ```
 */
export namespace RatifierUtils {
  /**
   * Checks whether bytecode is an EIP-7702 designator.
   *
   * @param bytecode - Account bytecode.
   * @returns Whether the bytecode starts with `0xef0100`.
   * @example
   * ```ts
   * import { RatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * console.log(RatifierUtils.isEip7702Designator("0xef0100"));
   * ```
   */
  export function isEip7702Designator(bytecode: Hex) {
    return bytecode.toLowerCase().startsWith("0xef0100");
  }

  /**
   * Selects Ecrecover for EOAs/EIP-7702 accounts and Setter for deployed-code accounts.
   *
   * @param params - Ratifier selection parameters.
   * @returns Ratifier information for the maker.
   * @example
   * ```ts
   * import { RatifierUtils } from "@morpho-org/midnight-sdk";
   *
   * const info = RatifierUtils.getRatifierInfo({
   *   bytecode: "0x",
   *   ecrecoverRatifier: "0x0000000000000000000000000000000000000001",
   *   setterRatifier: "0x0000000000000000000000000000000000000002",
   * });
   * console.log(info.type);
   * ```
   */
  export function getRatifierInfo(params: GetRatifierInfoParams): RatifierInfo {
    const ecrecoverRatifier = normalizeAddress(
      params.ecrecoverRatifier,
      "ecrecoverRatifier",
    );
    const setterRatifier = normalizeAddress(
      params.setterRatifier,
      "setterRatifier",
    );
    const bytecode =
      params.bytecode == null
        ? params.bytecode
        : normalizeHex(params.bytecode, "bytecode");
    if (
      bytecode == null ||
      bytecode === "0x" ||
      isEip7702Designator(bytecode)
    ) {
      return { type: "ecrecover", ratifier: ecrecoverRatifier };
    }

    return { type: "setter", ratifier: setterRatifier };
  }
}
