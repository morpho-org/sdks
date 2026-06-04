import type { RoundingDirection as SharedRoundingDirection } from "@morpho-org/morpho-ts";
import type { Address, Hex } from "viem";

/**
 * Bigint-compatible SDK input accepted by fields converted with `BigInt`.
 *
 * @example
 * ```ts
 * import type { BigIntish } from "@morpho-org/midnight-sdk";
 *
 * const assets: BigIntish = 1_000n;
 * ```
 */
export type BigIntish = bigint | number | string;

/**
 * Rounding direction used by Midnight fixed-point helpers.
 *
 * @example
 * ```ts
 * import type { RoundingDirection } from "@morpho-org/midnight-sdk";
 *
 * const rounding: RoundingDirection = "Down";
 * ```
 */
export type RoundingDirection = SharedRoundingDirection;

/**
 * Neutral transaction-call descriptor returned by Midnight encoders.
 *
 * @example
 * ```ts
 * import type { MidnightCall } from "@morpho-org/midnight-sdk";
 *
 * const call: MidnightCall = { to: "0x0000000000000000000000000000000000000001", data: "0x" };
 * ```
 */
export interface MidnightCall {
  /** Contract that receives the call. */
  readonly to: Address;
  /** ABI-encoded calldata. */
  readonly data: Hex;
}

/**
 * Kind tag for Midnight token permit payloads.
 *
 * @example
 * ```ts
 * import { PermitKind } from "@morpho-org/midnight-sdk";
 *
 * const kind = PermitKind.None;
 * ```
 */
export enum PermitKind {
  /** No permit payload is attached. */
  None = 0,
  /** ERC-2612 permit calldata is attached. */
  ERC2612 = 1,
  /** Permit2 permit calldata is attached. */
  Permit2 = 2,
}

/**
 * ABI-compatible Midnight token permit tuple.
 *
 * @example
 * ```ts
 * import { PermitKind, type TokenPermit } from "@morpho-org/midnight-sdk";
 *
 * const permit: TokenPermit = { kind: PermitKind.None, data: "0x" };
 * ```
 */
export interface TokenPermit {
  /** Permit flavor expected by the periphery. */
  readonly kind: PermitKind;
  /** ABI payload for the selected permit flavor. */
  readonly data: Hex;
}

/**
 * ABI-compatible collateral withdrawal tuple.
 *
 * @example
 * ```ts
 * import type { CollateralWithdrawal } from "@morpho-org/midnight-sdk";
 *
 * const withdrawal: CollateralWithdrawal = { collateralIndex: 0n, assets: 100n };
 * ```
 */
export interface CollateralWithdrawal {
  /** Index in the market collateral array. */
  readonly collateralIndex: bigint;
  /** Amount of collateral assets to withdraw. */
  readonly assets: bigint;
}

/**
 * ABI-compatible collateral supply tuple.
 *
 * @example
 * ```ts
 * import { PermitKind, type CollateralSupply } from "@morpho-org/midnight-sdk";
 *
 * const supply: CollateralSupply = {
 *   collateralIndex: 0n,
 *   assets: 100n,
 *   permit: { kind: PermitKind.None, data: "0x" },
 * };
 * ```
 */
export interface CollateralSupply {
  /** Index in the market collateral array. */
  readonly collateralIndex: bigint;
  /** Amount of collateral assets to supply. */
  readonly assets: bigint;
  /** Optional token permit consumed before the transfer. */
  readonly permit: TokenPermit;
}

/**
 * Classification of the ratifier route for a maker account.
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
 * Pinned Midnight deployment addresses for one chain.
 *
 * @example
 * ```ts
 * import type { MidnightAddresses } from "@morpho-org/midnight-sdk";
 *
 * const addresses: MidnightAddresses = {
 *   midnight: "0x0000000000000000000000000000000000000001",
 *   midnightBundles: "0x0000000000000000000000000000000000000002",
 *   midnightMempool: "0x0000000000000000000000000000000000000003",
 *   ecrecoverRatifier: "0x0000000000000000000000000000000000000004",
 *   setterRatifier: "0x0000000000000000000000000000000000000005",
 *   permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
 * };
 * ```
 */
export interface MidnightAddresses {
  /** Core Midnight contract. */
  readonly midnight: Address;
  /** Midnight periphery bundle contract. */
  readonly midnightBundles: Address;
  /** Mempool submission endpoint used by app/orderbook flows. */
  readonly midnightMempool: Address;
  /** EOA signature ratifier. */
  readonly ecrecoverRatifier: Address;
  /** Smart-account root ratifier. */
  readonly setterRatifier: Address;
  /** Permit2 contract used by the periphery. */
  readonly permit2: Address;
}
