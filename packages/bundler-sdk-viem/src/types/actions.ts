import type {
  Account,
  Chain,
  Client,
  Hex,
  TransactionRequest,
  Transport,
} from "viem";

import type { Address, InputMarketParams } from "@morpho-org/blue-sdk";
import type { ParaswapOffsets } from "@morpho-org/simulation-sdk";

export interface Authorization {
  authorizer: Address;
  authorized: Address;
  isAuthorized: boolean;
  nonce: bigint;
  deadline: bigint;
}

export interface InputReallocation {
  marketParams: InputMarketParams;
  amount: bigint;
}

export interface Permit2PermitSingleDetails {
  token: Address;
  amount: bigint;
  expiration: number;
  nonce: number;
}

export interface Permit2PermitSingle {
  details: Permit2PermitSingleDetails;
  sigDeadline: bigint;
}

export interface ActionArgs {
  /* ERC20 */
  nativeTransfer: [
    owner: Address,
    recipient: Address,
    amount: bigint,
    skipRevert?: boolean,
  ];
  erc20Transfer: [
    asset: Address,
    recipient: Address,
    amount: bigint,
    adapter: Address,
    skipRevert?: boolean,
  ];
  erc20TransferFrom: [
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert?: boolean,
  ];

  /* ERC20Wrapper */
  erc20WrapperDepositFor: [
    wrapper: Address,
    underlying: Address,
    amount: bigint,
    skipRevert?: boolean,
  ];
  erc20WrapperWithdrawTo: [
    wrapper: Address,
    receiver: Address,
    amount: bigint,
    skipRevert?: boolean,
  ];

  /* Permit */
  permit: [
    owner: Address,
    asset: Address,
    amount: bigint,
    deadline: bigint,
    signature: Hex | null,
    skipRevert?: boolean,
  ];
  permitDai: [
    owner: Address,
    nonce: bigint,
    expiry: bigint,
    allowed: boolean,
    signature: Hex | null,
    skipRevert?: boolean,
  ];

  /* Permit2 */
  approve2: [
    owner: Address,
    permitSingle: Permit2PermitSingle,
    signature: Hex | null,
    skipRevert?: boolean,
  ];
  transferFrom2: [
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert?: boolean,
  ];

  /* ERC4626 */
  erc4626Mint: [
    erc4626: Address,
    shares: bigint,
    maxSharePrice: bigint,
    receiver: Address,
    skipRevert?: boolean,
  ];
  erc4626Deposit: [
    erc4626: Address,
    assets: bigint,
    maxSharePrice: bigint,
    receiver: Address,
    skipRevert?: boolean,
  ];
  erc4626Withdraw: [
    erc4626: Address,
    assets: bigint,
    minSharePrice: bigint,
    receiver: Address,
    owner: Address,
    skipRevert?: boolean,
  ];
  erc4626Redeem: [
    erc4626: Address,
    shares: bigint,
    minSharePrice: bigint,
    receiver: Address,
    owner: Address,
    skipRevert?: boolean,
  ];

  /* Morpho */
  morphoSetAuthorizationWithSig: [
    authorization: Authorization,
    signature: Hex | null,
    skipRevert?: boolean,
  ];
  morphoSupply: [
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    onBehalf: Address,
    onMorphoSupply: Action[],
    skipRevert?: boolean,
  ];
  morphoSupplyCollateral: [
    market: InputMarketParams,
    assets: bigint,
    onBehalf: Address,
    onMorphoSupplyCollateral: Action[],
    skipRevert?: boolean,
  ];
  morphoBorrow: [
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    receiver: Address,
    skipRevert?: boolean,
  ];
  morphoRepay: [
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    onBehalf: Address,
    onMorphoRepay: Action[],
    skipRevert?: boolean,
  ];
  morphoWithdraw: [
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    receiver: Address,
    skipRevert?: boolean,
  ];
  morphoWithdrawCollateral: [
    market: InputMarketParams,
    assets: bigint,
    receiver: Address,
    skipRevert?: boolean,
  ];
  morphoFlashLoan: [
    token: Address,
    assets: bigint,
    onMorphoFlashLoan: Action[],
    skipRevert?: boolean,
  ];

  /* PublicAllocator */

  reallocateTo: [
    vault: Address,
    fee: bigint,
    withdrawals: InputReallocation[],
    supplyMarket: InputMarketParams,
    skipRevert?: boolean,
  ];

  /* Paraswap */

  paraswapBuy: [
    augustus: Address,
    callData: Hex,
    srcToken: Address,
    dstToken: Address,
    offsets: ParaswapOffsets,
    receiver: Address,
    skipRevert?: boolean,
  ];
  paraswapSell: [
    augustus: Address,
    callData: Hex,
    srcToken: Address,
    dstToken: Address,
    sellEntireBalance: boolean,
    offsets: ParaswapOffsets,
    receiver: Address,
    skipRevert?: boolean,
  ];
  paraswapBuyMorphoDebt: [
    augustus: Address,
    callData: Hex,
    srcToken: Address,
    marketParams: InputMarketParams,
    offsets: ParaswapOffsets,
    onBehalf: Address,
    receiver: Address,
    skipRevert?: boolean,
  ];

  /* Universal Rewards Distributor */

  urdClaim: [
    distributor: Address,
    account: Address,
    reward: Address,
    amount: bigint,
    proof: Hex[],
    skipRevert?: boolean,
  ];

  /* Wrapped Native */
  wrapNative: [amount: bigint, recipient: Address, skipRevert?: boolean];
  unwrapNative: [amount: bigint, recipient: Address, skipRevert?: boolean];

  /* stETH */
  stakeEth: [
    amount: bigint,
    minShares: bigint,
    referral: Address,
    recipient: Address,
    skipRevert?: boolean,
  ];

  /* Wrapped stETH */
  wrapStEth: [amount: bigint, recipient: Address, skipRevert?: boolean];
  unwrapStEth: [amount: bigint, recipient: Address, skipRevert?: boolean];

  /* AaveV2 */
  aaveV2Repay: [
    asset: Address,
    amount: bigint,
    onBehalf: Address,
    rateMode?: bigint,
    skipRevert?: boolean,
  ];
  aaveV2Withdraw: [
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert?: boolean,
  ];

  /* AaveV3 */
  aaveV3Repay: [
    asset: Address,
    amount: bigint,
    onBehalf: Address,
    rateMode?: bigint,
    skipRevert?: boolean,
  ];
  aaveV3Withdraw: [
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert?: boolean,
  ];

  /* AaveV3 Optimizer */
  aaveV3OptimizerRepay: [
    underlying: Address,
    amount: bigint,
    onBehalf: Address,
    skipRevert?: boolean,
  ];
  aaveV3OptimizerWithdraw: [
    underlying: Address,
    amount: bigint,
    maxIterations: bigint,
    recipient: Address,
    skipRevert?: boolean,
  ];
  aaveV3OptimizerWithdrawCollateral: [
    underlying: Address,
    amount: bigint,
    recipient: Address,
    skipRevert?: boolean,
  ];
  aaveV3OptimizerApproveManagerWithSig: [
    aaveV3Optimizer: Address,
    owner: Address,
    isApproved: boolean,
    nonce: bigint,
    deadline: bigint,
    signature: Hex | null,
    skipRevert?: boolean,
  ];

  /* CompoundV2 */
  compoundV2Repay: [
    cToken: Address,
    amount: bigint,
    isEth: boolean,
    onBehalf: Address,
    skipRevert?: boolean,
  ];
  compoundV2Redeem: [
    cToken: Address,
    amount: bigint,
    isEth: boolean,
    recipient: Address,
    skipRevert?: boolean,
  ];

  /* CompoundV3 */
  compoundV3Repay: [
    instance: Address,
    amount: bigint,
    onBehalf: Address,
    skipRevert?: boolean,
  ];
  compoundV3WithdrawFrom: [
    instance: Address,
    asset: Address,
    amount: bigint,
    recipient: Address,
    skipRevert?: boolean,
  ];
  compoundV3AllowBySig: [
    instance: Address,
    owner: Address,
    isAllowed: boolean,
    nonce: bigint,
    expiry: bigint,
    signature: Hex | null,
    skipRevert?: boolean,
  ];

  /* MORPHO Token */
  morphoWrapperDepositFor: [
    recipient: Address,
    amount: bigint,
    skipRevert?: boolean,
  ];
}

export type ActionType = keyof ActionArgs;

export type Actions = {
  [T in ActionType]: {
    type: T;
    args: ActionArgs[T];
  };
};

export type Action = Actions[ActionType];

export interface TransactionRequirementArgs {
  /* ERC20 */
  erc20Approve: [asset: Address, recipient: Address, amount: bigint];

  /* Morpho */
  morphoSetAuthorization: [authorized: Address, isAuthorized: boolean];
}

export type TransactionRequirementType = keyof TransactionRequirementArgs;

export type Requirements = {
  [T in TransactionRequirementType]: {
    type: T;
    args: TransactionRequirementArgs[T];
    tx: TransactionRequest & { to: Address; data: Hex };
  };
};

export type TransactionRequirement = Requirements[TransactionRequirementType];

export interface SignatureRequirementFunction {
  (client: Client<Transport, Chain | undefined, Account>): Promise<Hex>;
  (client: Client, account: Account): Promise<Hex>;
}

export interface SignatureRequirement {
  action: Action;
  sign: SignatureRequirementFunction;
}
