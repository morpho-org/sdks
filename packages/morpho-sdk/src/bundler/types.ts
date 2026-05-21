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
  /** Native-token transfer from `owner` to `recipient` for `amount`; `skipRevert` controls Bundler3 revert handling. */
  readonly nativeTransfer: [
    owner: Address,
    recipient: Address,
    amount: bigint,
    skipRevert?: boolean,
  ];

  /** ERC20 transfer from `adapter` to `recipient` for `amount` of `asset`; `skipRevert` controls Bundler3 revert handling. */
  readonly erc20Transfer: [
    asset: Address,
    recipient: Address,
    amount: bigint,
    adapter: Address,
    skipRevert?: boolean,
  ];

  /** GeneralAdapter1 ERC20 `transferFrom` of `asset` and `amount` to `recipient`; `skipRevert` controls Bundler3 revert handling. */
  readonly erc20TransferFrom: [
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert?: boolean,
  ];

  /** ERC-2612 permit from `owner` for `asset`, `amount`, `deadline`, and `signature`; `skipRevert` controls Bundler3 revert handling. */
  readonly permit: [
    owner: Address,
    asset: Address,
    amount: bigint,
    deadline: bigint,
    signature: Hex | null,
    skipRevert?: boolean,
  ];

  /** Permit2 approval from `owner` for `permitSingle` and `signature`; `skipRevert` controls Bundler3 revert handling. */
  readonly approve2: [
    owner: Address,
    permitSingle: Permit2PermitSingle,
    signature: Hex | null,
    skipRevert?: boolean,
  ];

  /** GeneralAdapter1 Permit2 transfer of `asset` and `amount` to `recipient`; `skipRevert` controls Bundler3 revert handling. */
  readonly transferFrom2: [
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert?: boolean,
  ];

  /** ERC4626 deposit into `erc4626` for `assets`, `maxSharePrice`, and `receiver`; `skipRevert` controls Bundler3 revert handling. */
  readonly erc4626Deposit: [
    erc4626: Address,
    assets: bigint,
    maxSharePrice: bigint,
    receiver: Address,
    skipRevert?: boolean,
  ];

  /** ERC4626 redeem from `erc4626` for `shares`, `minSharePrice`, `receiver`, and `owner`; `skipRevert` controls Bundler3 revert handling. */
  readonly erc4626Redeem: [
    erc4626: Address,
    shares: bigint,
    minSharePrice: bigint,
    receiver: Address,
    owner: Address,
    skipRevert?: boolean,
  ];

  /** Morpho Blue supply-collateral call for `market`, `assets`, `onBehalf`, and callback actions; `skipRevert` controls Bundler3 revert handling. */
  readonly morphoSupplyCollateral: [
    market: InputMarketParams,
    assets: bigint,
    onBehalf: Address,
    onMorphoSupplyCollateral: Action[],
    skipRevert?: boolean,
  ];

  /** Morpho Blue borrow call for `market`, `assets` or `shares`, `slippageAmount`, and `receiver`; `skipRevert` controls Bundler3 revert handling. */
  readonly morphoBorrow: [
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    receiver: Address,
    skipRevert?: boolean,
  ];

  /** Morpho Blue repay call for `market`, `assets` or `shares`, `slippageAmount`, `onBehalf`, and callback actions; `skipRevert` controls Bundler3 revert handling. */
  readonly morphoRepay: [
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    onBehalf: Address,
    onMorphoRepay: Action[],
    skipRevert?: boolean,
  ];

  /** Morpho Blue withdraw-collateral call for `market`, `assets`, and `receiver`; `skipRevert` controls Bundler3 revert handling. */
  readonly morphoWithdrawCollateral: [
    market: InputMarketParams,
    assets: bigint,
    receiver: Address,
    skipRevert?: boolean,
  ];

  /** PublicAllocator reallocation to `supplyMarket` from `vault` withdrawals while paying `fee`; `skipRevert` controls Bundler3 revert handling. */
  readonly reallocateTo: [
    vault: Address,
    fee: bigint,
    withdrawals: InputReallocation[],
    supplyMarket: InputMarketParams,
    skipRevert?: boolean,
  ];

  /** GeneralAdapter1 native wrap of `amount` to `recipient`; `skipRevert` controls Bundler3 revert handling. */
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
