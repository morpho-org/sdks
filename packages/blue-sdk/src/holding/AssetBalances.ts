import { Token } from "../token/Token";

export type PeripheralBalanceType =
  | "base" // The requested token balance (ETH for ETH, wstETH for wstETH).
  | "wrapped" // The wrapped token balance, if applicable (none for DAI, wstETH for wstETH).
  | "staked-wrapped" // The balance of the unwrapped token staked then wrapped, if applicable (none for WETH, ETH for wstETH).
  | "vault" // The vault token balance, if applicable (none for WETH, re7WETH for re7WETH).
  | "wrapped-vault" // The balance of the unwrapped token wrapped then deposited to the vault, if applicable (none for sparkDAI, ETH for re7WETH).
  | "unwrapped-staked-wrapped"; // The balance of the wrapped token unwrapped then wrapped then deposited to the vault, if applicable (none for sDAI, WETH for wstETH).

export interface PeripheralBalance {
  /**
   * The token held.
   */
  token: Token;
  /**
   * The type of the token held.
   */
  type: PeripheralBalanceType;
  /**
   * The amount of peripheral tokens held.
   */
  amount: bigint;
  /**
   * The corresponding amount of underlying tokens held.
   */
  underlyingAmount: bigint;
}

export class AssetBalances {
  /**
   * The total balance of all types of related tokens.
   */
  public total: bigint;

  /**
   * The total balance of all types of related tokens.
   */
  public allocations: { base: PeripheralBalance } & {
    [T in Exclude<PeripheralBalanceType, "base">]?: PeripheralBalance;
  };

  constructor(balance: PeripheralBalance) {
    this.total = balance.amount;
    this.allocations = {
      base: balance,
    };
  }

  public add(balance: PeripheralBalance) {
    this.total += balance.amount;

    const allocation = (this.allocations[balance.type] = {
      ...balance,
      amount: 0n,
      underlyingAmount: 0n,
    });

    allocation.amount += balance.amount;
    allocation.underlyingAmount += balance.underlyingAmount;

    return this;
  }

  public sub(balance: PeripheralBalance) {
    this.total -= balance.amount;

    const allocation = (this.allocations[balance.type] = { ...balance });

    allocation.amount -= balance.amount;
    allocation.underlyingAmount -= balance.underlyingAmount;

    return this;
  }
}
