import { entries, fromEntries } from "@morpho-org/morpho-ts";

import type { AddressLabel } from "../addresses.js";
import type { Address, BigIntish } from "../types.js";

export const ERC20_ALLOWANCE_RECIPIENTS = [
  "morpho",
  "permit2",
  "bundler",
] as const satisfies readonly AddressLabel[];

export type Erc20AllowanceRecipient =
  (typeof ERC20_ALLOWANCE_RECIPIENTS)[number];

export interface Permit2Allowance {
  amount: bigint;
  expiration: bigint;
  nonce: bigint;
}

export interface IPermit2Allowance {
  amount: BigIntish;
  expiration: BigIntish;
  nonce: BigIntish;
}

export interface IHolding {
  user: Address;
  token: Address;
  erc20Allowances: {
    [key in Erc20AllowanceRecipient]: bigint;
  };
  permit2BundlerAllowance: IPermit2Allowance;
  erc2612Nonce?: bigint;
  canTransfer?: boolean;
  balance: bigint;
}

export class Holding implements IHolding {
  /**
   * The user of this holding.
   */
  public readonly user: Address;

  /**
   * The token in which this holding is denominated.
   */
  public readonly token: Address;

  /**
   * The balance of the user for this token.
   */
  public balance: bigint;

  /**
   * Whether the user is allowed to transfer this holding's balance.
   */
  public canTransfer?: boolean;

  /**
   * ERC20 allowance for this token from the user to the allowance recipient.
   */
  public readonly erc20Allowances: {
    [key in Erc20AllowanceRecipient]: bigint;
  };

  /**
   * Permit2 allowance for this token from the user to the allowance recipient.
   */
  public readonly permit2BundlerAllowance: Permit2Allowance;

  /**
   * ERC-2612 Permit nonce of the user for this token.
   * `undefined` if the token does not support ERC-2612.
   */
  public erc2612Nonce?: bigint;

  constructor({
    user,
    token,
    erc20Allowances,
    permit2BundlerAllowance,
    balance,
    erc2612Nonce,
    canTransfer,
  }: IHolding) {
    this.user = user;
    this.token = token;
    this.balance = balance;
    this.canTransfer = canTransfer;
    this.erc20Allowances = fromEntries(
      entries(erc20Allowances).map(([address, allowance]) => [
        address,
        allowance,
      ]),
    );
    this.permit2BundlerAllowance = {
      amount: BigInt(permit2BundlerAllowance.amount),
      expiration: BigInt(permit2BundlerAllowance.expiration),
      nonce: BigInt(permit2BundlerAllowance.nonce),
    };

    if (erc2612Nonce != null) this.erc2612Nonce = erc2612Nonce;
  }
}
