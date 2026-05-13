import type { InputMarketParams } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";

/**
 * Morpho authorization payload signed by a user for Bundler3-mediated Morpho
 * Blue execution.
 */
export interface Authorization {
  /** Address granting or revoking authorization. */
  readonly authorizer: Address;

  /** Address receiving authorization. */
  readonly authorized: Address;

  /** Whether authorization is granted (`true`) or revoked (`false`). */
  readonly isAuthorized: boolean;

  /** Morpho authorization nonce consumed by the signature. */
  readonly nonce: bigint;

  /** Signature deadline timestamp in seconds. */
  readonly deadline: bigint;
}

/**
 * Public allocator withdrawal input used by a `reallocateTo` Bundler3 action.
 */
export interface InputReallocation {
  /** Market to withdraw liquidity from. */
  readonly marketParams: InputMarketParams;

  /** Amount of loan assets to withdraw from the market. */
  readonly amount: bigint;
}

/**
 * Permit2 single-permit token allowance details.
 */
export interface Permit2PermitSingleDetails {
  /** ERC20 token approved through Permit2. */
  readonly token: Address;

  /** Allowance amount approved through Permit2. */
  readonly amount: bigint;

  /** Permit2 allowance expiration timestamp in seconds. */
  readonly expiration: number;

  /** Permit2 nonce consumed by the signature. */
  readonly nonce: number;
}

/**
 * Permit2 single-permit payload signed by the token owner.
 */
export interface Permit2PermitSingle {
  /** Token, amount, expiration, and nonce being approved. */
  readonly details: Permit2PermitSingleDetails;

  /** Deadline timestamp for consuming the Permit2 signature. */
  readonly sigDeadline: bigint;
}

/**
 * Argument tuples for Bundler3 actions supported by `morpho-sdk`.
 */
export interface ActionArgs {
  readonly nativeTransfer: [
    owner: Address,
    recipient: Address,
    amount: bigint,
    skipRevert?: boolean,
  ];
  readonly erc20Transfer: [
    asset: Address,
    recipient: Address,
    amount: bigint,
    adapter: Address,
    skipRevert?: boolean,
  ];
  readonly erc20TransferFrom: [
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert?: boolean,
  ];
  readonly permit: [
    owner: Address,
    asset: Address,
    amount: bigint,
    deadline: bigint,
    signature: Hex | null,
    skipRevert?: boolean,
  ];
  readonly approve2: [
    owner: Address,
    permitSingle: Permit2PermitSingle,
    signature: Hex | null,
    skipRevert?: boolean,
  ];
  readonly transferFrom2: [
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert?: boolean,
  ];
  readonly erc4626Deposit: [
    erc4626: Address,
    assets: bigint,
    maxSharePrice: bigint,
    receiver: Address,
    skipRevert?: boolean,
  ];
  readonly erc4626Redeem: [
    erc4626: Address,
    shares: bigint,
    minSharePrice: bigint,
    receiver: Address,
    owner: Address,
    skipRevert?: boolean,
  ];
  readonly morphoSupplyCollateral: [
    market: InputMarketParams,
    assets: bigint,
    onBehalf: Address,
    onMorphoSupplyCollateral: Action[],
    skipRevert?: boolean,
  ];
  readonly morphoBorrow: [
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    receiver: Address,
    skipRevert?: boolean,
  ];
  readonly morphoRepay: [
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    onBehalf: Address,
    onMorphoRepay: Action[],
    skipRevert?: boolean,
  ];
  readonly morphoWithdrawCollateral: [
    market: InputMarketParams,
    assets: bigint,
    receiver: Address,
    skipRevert?: boolean,
  ];
  readonly reallocateTo: [
    vault: Address,
    fee: bigint,
    withdrawals: InputReallocation[],
    supplyMarket: InputMarketParams,
    skipRevert?: boolean,
  ];
  readonly wrapNative: [
    amount: bigint,
    recipient: Address,
    skipRevert?: boolean,
  ];
}

/**
 * Supported Bundler3 action discriminator.
 */
export type ActionType = keyof ActionArgs;

/**
 * Supported Bundler3 action object map keyed by action discriminator.
 */
export type Actions = {
  readonly [T in ActionType]: {
    readonly type: T;
    readonly args: ActionArgs[T];
  };
};

/**
 * Discriminated union of Bundler3 actions supported by `morpho-sdk`.
 */
export type Action = Actions[ActionType];
