import type { BigIntish as SharedBigIntish } from "@morpho-org/morpho-ts";

/**
 * The address of a Contract, or an EOA
 */
export type Address = `0x${string}`;

/**
 * The id of a market used on the Blue contract
 */
export type MarketId = `0x${string}` & { __TYPE__: "marketId" };

/** Primitive values accepted at SDK boundaries and normalized to `bigint`. */
export type BigIntish = SharedBigIntish;

/**
 * The possible transaction type on the Blue contract
 */
export enum TransactionType {
  Supply = "Supply",
  SupplyCollateral = "Supply Collateral",
  Withdraw = "Withdraw",
  WithdrawCollateral = "Withdraw Collateral",
  Borrow = "Borrow",
  Repay = "Repay",
}

/** Value that may not have been loaded yet. */
export type Loadable<T> = T | undefined;
/** Value that may fail to resolve. */
export type Failable<T> = T | null;
/** Value that may be unloaded or fail to resolve. */
export type Fetchable<T> = Failable<Loadable<T>>;

/**
 * Checks whether a value is a 32-byte Morpho Blue market id.
 *
 * @param value - The unknown value to inspect.
 * @returns `true` when `value` is a `0x`-prefixed 32-byte hex string.
 * @example
 * ```ts
 * import { isMarketId } from "@morpho-org/blue-sdk";
 *
 * const valid = isMarketId("0x0000000000000000000000000000000000000000000000000000000000000000");
 * // valid satisfies boolean
 * ```
 */
export const isMarketId = (value: unknown): value is MarketId =>
  typeof value === "string" && /^0x[0-9A-Fa-f]{64}$/.test(value);
