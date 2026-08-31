import { entries, fromEntries } from "@morpho-org/morpho-ts";

import type { AddressLabel } from "../addresses.js";
import type { Address, BigIntish } from "../types.js";

/** Address registry labels that may receive ERC-20 allowances from a user. */
export const ERC20_ALLOWANCE_RECIPIENTS = [
  "morpho",
  "permit2",
  "bundler3.generalAdapter1",
] as const satisfies readonly AddressLabel[];

/** Address registry label that may receive an ERC-20 allowance from a user. */
export type Erc20AllowanceRecipient =
  (typeof ERC20_ALLOWANCE_RECIPIENTS)[number];

/** Normalized Permit2 allowance values. */
export interface Permit2Allowance {
  amount: bigint;
  expiration: bigint;
  nonce: bigint;
}

/** Input shape for Permit2 allowance values before bigint normalization. */
export interface IPermit2Allowance {
  amount: BigIntish;
  expiration: BigIntish;
  nonce: BigIntish;
}

/** Input shape for a user's token holding and allowance state. */
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

/** Represents a user's balance and allowance state for one token. */
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

  /**
   * Allows to customize the setter behavior in child classes.
   */
  protected _balance: bigint;

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
    this._balance = balance;
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

  /**
   * The balance of the user for this token.
   */
  get balance() {
    return this._balance;
  }
  set balance(value: bigint) {
    this._balance = value;
  }
}
