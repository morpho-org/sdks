/**
 * The address of a Contract, or an EOA
 */
export type Address = `0x${string}`;

/**
 * The id of a market used on the Blue contract
 */
export type MarketId = `0x${string}` & { __TYPE__: "marketId" };

export type BigIntish = bigint | string | number | boolean;

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

export type Loadable<T> = T | undefined;
export type Failable<T> = T | null;
export type Fetchable<T> = Failable<Loadable<T>>;

// TODO: replace with isDefined
export function isFetched<T>(v: Fetchable<T>): v is T {
  return v !== undefined && v !== null;
}

export const isMarketId = (value: any): value is MarketId =>
  typeof value === "string" && /^0x[0-9A-Fa-f]{64}$/.test(value);
