import type {
  Account,
  Chain,
  Client,
  Hex,
  TransactionRequest,
  Transport,
} from "viem";

import type { Address, InputMarketParams } from "@morpho-org/blue-sdk";
import type { SimulationResult } from "@morpho-org/simulation-sdk";

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
  spender: Address;
  sigDeadline: bigint;
}

export interface ActionArgs {
  /* ERC20 */
  nativeTransfer: [recipient: Address, amount: bigint];
  erc20Transfer: [asset: Address, recipient: Address, amount: bigint];
  erc20TransferFrom: [asset: Address, amount: bigint, recipient?: Address];

  /* ERC20Wrapper */
  erc20WrapperDepositFor: [wrapper: Address, amount: bigint];
  erc20WrapperWithdrawTo: [wrapper: Address, receiver: Address, amount: bigint];

  /* Permit */
  permit: [
    owner: Address,
    asset: Address,
    amount: bigint,
    deadline: bigint,
    signature: Hex | null,
    spender?: Address,
    skipRevert?: boolean,
  ];
  permitDai: [
    owner: Address,
    nonce: bigint,
    expiry: bigint,
    allowed: boolean,
    signature: Hex | null,
    spender?: Address,
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
    owner: Address,
    amount: bigint,
    recipient?: Address,
  ];

  /* ERC4626 */
  erc4626Mint: [
    erc4626: Address,
    shares: bigint,
    maxSharePrice: bigint,
    receiver: Address,
  ];
  erc4626Deposit: [
    erc4626: Address,
    assets: bigint,
    maxSharePrice: bigint,
    receiver: Address,
  ];
  erc4626Withdraw: [
    erc4626: Address,
    assets: bigint,
    minSharePrice: bigint,
    receiver: Address,
    owner: Address,
  ];
  erc4626Redeem: [
    erc4626: Address,
    shares: bigint,
    minSharePrice: bigint,
    receiver: Address,
    owner: Address,
  ];

  /* Morpho */
  morphoSetAuthorizationWithSig: [
    authorization: {
      authorizer: Address;
      authorized: Address;
      isAuthorized: boolean;
      nonce: bigint;
      deadline: bigint;
    },
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
  ];
  morphoSupplyCollateral: [
    market: InputMarketParams,
    assets: bigint,
    onBehalf: Address,
    onMorphoSupplyCollateral: Action[],
  ];
  morphoBorrow: [
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    receiver: Address,
  ];
  morphoRepay: [
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    onBehalf: Address,
    onMorphoRepay: Action[],
  ];
  morphoWithdraw: [
    market: InputMarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    receiver: Address,
  ];
  morphoWithdrawCollateral: [
    market: InputMarketParams,
    assets: bigint,
    receiver: Address,
  ];

  /* MetaMorpho */

  reallocateTo: [
    vault: Address,
    fee: bigint,
    withdrawals: InputReallocation[],
    supplyMarket: InputMarketParams,
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
  wrapNative: [amount: bigint, recipient?: Address];
  unwrapNative: [amount: bigint, recipient?: Address];

  /* stETH */
  stakeEth: [
    amount: bigint,
    minShares: bigint,
    referral: Address,
    recipient?: Address,
  ];

  /* Wrapped stETH */
  wrapStEth: [amount: bigint, recipient?: Address];
  unwrapStEth: [amount: bigint, recipient?: Address];

  /* AaveV2 */
  aaveV2Repay: [
    asset: Address,
    amount: bigint,
    onBehalf: Address,
    rateMode?: bigint,
  ];
  aaveV2Withdraw: [asset: Address, amount: bigint, recipient?: Address];

  /* AaveV3 */
  aaveV3Repay: [
    asset: Address,
    amount: bigint,
    onBehalf: Address,
    rateMode?: bigint,
  ];
  aaveV3Withdraw: [asset: Address, amount: bigint, recipient?: Address];

  /* AaveV3 Optimizer */
  aaveV3OptimizerRepay: [
    underlying: Address,
    amount: bigint,
    onBehalf: Address,
  ];
  aaveV3OptimizerWithdraw: [
    underlying: Address,
    amount: bigint,
    maxIterations: bigint,
    recipient?: Address,
  ];
  aaveV3OptimizerWithdrawCollateral: [
    underlying: Address,
    amount: bigint,
    recipient?: Address,
  ];
  aaveV3OptimizerApproveManagerWithSig: [
    owner: Address,
    isApproved: boolean,
    nonce: bigint,
    deadline: bigint,
    signature: Hex | null,
    manager?: Address,
    skipRevert?: boolean,
  ];

  /* CompoundV2 */
  compoundV2Repay: [cToken: Address, amount: bigint, onBehalf: Address];
  compoundV2Redeem: [cToken: Address, amount: bigint, recipient?: Address];

  /* CompoundV3 */
  compoundV3Repay: [instance: Address, amount: bigint, onBehalf: Address];
  compoundV3WithdrawFrom: [
    instance: Address,
    asset: Address,
    amount: bigint,
    recipient?: Address,
  ];
  compoundV3AllowBySig: [
    instance: Address,
    owner: Address,
    isAllowed: boolean,
    nonce: bigint,
    expiry: bigint,
    signature: Hex | null,
    manager?: Address,
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

export interface ActionBundle {
  steps: SimulationResult;
  actions: Action[];
  requirements: {
    signatures: SignatureRequirement[];
    txs: TransactionRequirement[];
  };
  tx: () => TransactionRequest & { to: Address; data: Hex };
}
