export type Hex64 = string & { __LENGTH__: 64 };

/**
 * The address of a Contract, or an EOA
 */
export type Address = string;

/**
 * The id of a market used on the Blue contract
 */
export type MarketId = `0x${Hex64}` & { __TYPE__: "marketId" };

export type BigIntish = bigint | string;

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
