import type { Address, Hex } from "viem";

/**
 * Parameters for {@link RatifierUtils.getRatifierInfo}.
 *
 * Pass the maker account bytecode read at the same block context used to build
 * the offer. The bytecode is used only to choose the ratifier address to put on
 * the offer.
 *
 * @example
 * ```ts
 * import type { GetRatifierInfoParams } from "@morpho-org/midnight-sdk";
 *
 * const params: GetRatifierInfoParams = {
 *   bytecode: "0x",
 *   ecrecoverRatifier: "0x0000000000000000000000000000000000000001",
 *   setterRatifier: "0x0000000000000000000000000000000000000002",
 * };
 * console.log(params.bytecode);
 * ```
 */
export interface GetRatifierInfoParams {
  /** Maker account bytecode returned by viem `getBytecode`; `undefined`, `null`, and `0x` mean no deployed code. */
  readonly bytecode?: Hex | null;
  /** Ecrecover ratifier address. */
  readonly ecrecoverRatifier: Address;
  /** Setter ratifier address. */
  readonly setterRatifier: Address;
}

/**
 * Classification of the ratifier route for a maker account.
 *
 * Put `ratifier` on each new `Offer.create` call for this maker. Use `type` to
 * decide whether the tree later needs an Ecrecover signature or a Setter root
 * approval before payload encoding.
 *
 * @example
 * ```ts
 * import type { RatifierInfo } from "@morpho-org/midnight-sdk";
 *
 * const info: RatifierInfo = {
 *   type: "ecrecover",
 *   ratifier: "0x0000000000000000000000000000000000000001",
 * };
 * ```
 */
export interface RatifierInfo {
  /** Ratifier family selected for the maker account. */
  readonly type: "ecrecover" | "setter";
  /** Ratifier contract address to put on the offer. */
  readonly ratifier: Address;
}

/**
 * Utilities for selecting Midnight ratifier routes.
 *
 * Call these during make-side preparation, before `Offer.create`, when an app
 * must decide whether a maker can sign an Ecrecover root or must approve a
 * Setter root onchain. Fetch helpers read bytecode for you; this namespace is
 * the pure classification logic.
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
   * EIP-7702 accounts have code-like bytecode but still sign as the owning EOA,
   * so they use the Ecrecover ratifier route instead of the Setter route.
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
   * Selects Ecrecover for EOAs/EIP-7702 accounts and Setter for deployed-code
   * accounts.
   *
   * Use the returned `ratifier` address in `Offer.create`. Later, use
   * `EcrecoverRatifierUtils.ratify` when `type` is `ecrecover`, or approve the
   * root and call `SetterRatifierUtils.ratify` when `type` is `setter`.
   *
   * @param params.bytecode - Maker bytecode returned by `eth_getCode`.
   * @param params.ecrecoverRatifier - Ratifier address used for EOAs and EIP-7702 accounts.
   * @param params.setterRatifier - Ratifier address used for deployed-code accounts.
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
    const ecrecoverRatifier = params.ecrecoverRatifier;
    const setterRatifier = params.setterRatifier;
    const bytecode = params.bytecode;
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
