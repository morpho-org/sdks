import type { BlockNumberOrTag } from "@morpho-org/morpho-ts";
import type { Account, Address, StateOverride } from "viem";

/**
 * Shared viem call parameters accepted by Midnight fetch helpers.
 *
 * @example
 * ```ts
 * import type { MidnightCallParameters } from "@morpho-org/midnight-sdk";
 *
 * const params: MidnightCallParameters = { block: { type: "tag", value: "latest" } };
 * console.log(params.block);
 * ```
 */
export interface MidnightCallParameters {
  /** Account used as the `from` field for the read. */
  readonly account?: Account | Address;
  /** Optional numbered block or named tag; omission preserves the client default. */
  readonly block?: BlockNumberOrTag;
  /** State override set used for the read. */
  readonly stateOverride?: StateOverride;
}

/**
 * Deployless read mode accepted by deployless-capable Midnight fetch helpers.
 *
 * @example
 * ```ts
 * import type { DeploylessFetchParameters } from "@morpho-org/midnight-sdk";
 *
 * const params: DeploylessFetchParameters = { deployless: "force" };
 * console.log(params.deployless);
 * ```
 */
export interface DeploylessFetchParameters extends MidnightCallParameters {
  /**
   * If `true`, deployless-capable fetchers use deployless reads and fall back to direct reads if they fail.
   *
   * If `"force"`, deployless-capable fetchers use deployless reads without fallback.
   *
   * If `false`, deployless-capable fetchers use direct reads.
   *
   * Default is `true` for fetchers that implement deployless reads.
   */
  readonly deployless?: boolean | "force";
}

/**
 * Shared viem fetch parameters for Midnight helpers.
 *
 * @example
 * ```ts
 * import type { MidnightFetchParams } from "@morpho-org/midnight-sdk";
 *
 * const params: MidnightFetchParams = { block: { type: "tag", value: "latest" } };
 * console.log(params.block);
 * ```
 */
export type MidnightFetchParams = DeploylessFetchParameters;
