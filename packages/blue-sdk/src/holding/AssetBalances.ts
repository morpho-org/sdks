import type { Token } from "../token/Token.js";

export type PeripheralBalanceType =
  | "base" // The balance of the requested token (ETH for ETH, wstETH for wstETH).
  | "wrapped" // The balance of the unwrapped token (none for DAI, wstETH for wstETH).
  | "staked-wrapped" // The balance of the unstaked token staked then wrapped (none for WETH, ETH for wstETH).
  | "vault" // The balance of the underlying token deposited into the vault (none for WETH, WETH for re7WETH).
  | "wrapped-vault" // The balance of the unwrapped token wrapped then deposited into the vault (none for sparkDAI, ETH for re7WETH).
  | "unwrapped-staked-wrapped"; // The balance of the wrapped token unwrapped then staked then wrapped (none for sDAI, WETH for wstETH).

/**
 * Represents the balance of a requested token and the balance quoted in the corresponding source token:
 * ```{
 *  type: "staked-wrapped",
 *  srcToken: ETH,
 *  srcAmount: 1 ETH,
 *  dstAmount: 1.2 wstETH
 * }```
 */
export interface PeripheralBalance {
  /**
   * The type of balance conversion.
   */
  type: PeripheralBalanceType;
  /**
   * The source token held corresponding to the type of balance conversion.
   */
  srcToken: Token;
  /**
   * The source amount of source token held.
   */
  srcAmount: bigint;
  /**
   * The corresponding amount of token held after conversion of the whole balance `srcAmount`.
   */
  dstAmount: bigint;
}

export interface InputAssetBalances extends Omit<PeripheralBalance, "type"> {}

export class AssetBalances {
  /**
   * The total balance of all types of related tokens.
   */
  public total: bigint;

  /**
   * The balance of each type of related tokens and the corresponding underlying balance.
   */
  public allocations: { base: PeripheralBalance } & {
    [T in Exclude<PeripheralBalanceType, "base">]?: PeripheralBalance;
  };

  constructor(balance: InputAssetBalances) {
    this.total = balance.dstAmount;
    this.allocations = {
      base: { ...balance, type: "base" },
    };
  }

  public add(balance: PeripheralBalance) {
    this.total += balance.dstAmount;

    const allocation = (this.allocations[balance.type] ??= {
      ...balance,
      srcAmount: 0n,
      dstAmount: 0n,
    });

    allocation.srcAmount += balance.srcAmount;
    allocation.dstAmount += balance.dstAmount;

    return this;
  }

  public sub(balance: PeripheralBalance) {
    this.total -= balance.dstAmount;

    const allocation = (this.allocations[balance.type] ??= {
      ...balance,
      srcAmount: 0n,
      dstAmount: 0n,
    });

    allocation.srcAmount -= balance.srcAmount;
    allocation.dstAmount -= balance.dstAmount;

    return this;
  }
}
