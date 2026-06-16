import type { Account, Address, BlockTag, Client, StateOverride } from "viem";

/**
 * Shared viem call parameters accepted by Midnight fetch helpers.
 *
 * @example
 * ```ts
 * import type { MidnightCallParameters } from "@morpho-org/midnight-sdk";
 *
 * const params: MidnightCallParameters = { blockTag: "latest" };
 * console.log(params.blockTag);
 * ```
 */
export interface MidnightCallParameters {
  /** Account used as the `from` field for the read. */
  readonly account?: Account | Address;
  /** Block number used for the read. */
  readonly blockNumber?: bigint;
  /** Block tag used for the read. */
  readonly blockTag?: BlockTag;
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
 * const params = {} as MidnightFetchParams;
 * console.log(params.midnight);
 * ```
 */
export interface MidnightFetchParams extends DeploylessFetchParameters {
  /** Viem client. */
  readonly client: Client;
  /** Core Midnight contract address. */
  readonly midnight: Address;
}
