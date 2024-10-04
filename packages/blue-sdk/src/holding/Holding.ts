import { entries, fromEntries } from "@morpho-org/morpho-ts";

import type { AddressLabel } from "../addresses";
import type { Address, BigIntish } from "../types";

export const ERC20_ALLOWANCE_RECIPIENTS = [
  "morpho",
  "permit2",
  "bundler",
] as const satisfies readonly AddressLabel[];

export const PERMIT2_ALLOWANCE_RECIPIENTS = [
  "morpho",
  "bundler",
] as const satisfies readonly Exclude<AddressLabel, "permit2">[];

export type Erc20AllowanceRecipient =
  (typeof ERC20_ALLOWANCE_RECIPIENTS)[number];

export type Permit2AllowanceRecipient =
  (typeof PERMIT2_ALLOWANCE_RECIPIENTS)[number];

export interface Permit2Allowance {
  amount: bigint;
  expiration: bigint;
  nonce: bigint;
}

export interface InputPermit2Allowance {
  amount: BigIntish;
  expiration: BigIntish;
  nonce: BigIntish;
}

export interface InputHolding {
  user: Address;
  token: Address;
  erc20Allowances: {
    [key in Erc20AllowanceRecipient]: bigint;
  };
  permit2Allowances: {
    [key in Permit2AllowanceRecipient]: InputPermit2Allowance;
  };
  erc2612Nonce?: bigint;
  canTransfer?: boolean;
  balance: bigint;
}

export class Holding implements InputHolding {
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
  public readonly permit2Allowances: {
    [key in Permit2AllowanceRecipient]: Permit2Allowance;
  };

  /**
   * ERC-2612 Permit nonce of the user for this token.
   * `undefined` if the token does not support ERC-2612.
   */
  public erc2612Nonce?: bigint;

  constructor({
    user,
    token,
    erc20Allowances,
    permit2Allowances,
    balance,
    erc2612Nonce,
    canTransfer,
  }: InputHolding) {
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
    this.permit2Allowances = {
      morpho: {
        amount: BigInt(permit2Allowances.morpho.amount),
        expiration: BigInt(permit2Allowances.morpho.expiration),
        nonce: BigInt(permit2Allowances.morpho.nonce),
      },
      bundler: {
        amount: BigInt(permit2Allowances.bundler.amount),
        expiration: BigInt(permit2Allowances.bundler.expiration),
        nonce: BigInt(permit2Allowances.bundler.nonce),
      },
    };

    if (erc2612Nonce != null) this.erc2612Nonce = erc2612Nonce;
  }
}
