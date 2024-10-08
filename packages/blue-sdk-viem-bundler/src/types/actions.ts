import type {
  Account,
  Chain,
  Client,
  Hex,
  RpcSchema,
  SendTransactionRequest,
  Transport,
} from "viem";

import type { Address, MarketConfig } from "@morpho-org/blue-sdk";
import type { SimulationResult } from "@morpho-org/blue-sdk-viem-simulation";

export type MarketParams = Pick<
  MarketConfig,
  "loanToken" | "collateralToken" | "oracle" | "irm" | "lltv"
>;

export interface Authorization {
  authorizer: Address;
  authorized: Address;
  isAuthorized: boolean;
  nonce: bigint;
  deadline: bigint;
}

export interface ReallocationWithdrawal {
  marketParams: MarketParams;
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
  erc20TransferFrom: [asset: Address, amount: bigint];

  /* ERC20Wrapper */
  erc20WrapperDepositFor: [wrapper: Address, amount: bigint];
  erc20WrapperWithdrawTo: [wrapper: Address, account: Address, amount: bigint];

  /* Permit */
  permit: [
    asset: Address,
    amount: bigint,
    deadline: bigint,
    signature: Hex | null,
    skipRevert?: boolean,
  ];
  permitDai: [
    nonce: bigint,
    expiry: bigint,
    allowed: boolean,
    signature: Hex | null,
    skipRevert?: boolean,
  ];

  /* Permit2 */
  approve2: [
    permitSingle: Permit2PermitSingle,
    signature: Hex | null,
    skipRevert?: boolean,
  ];
  transferFrom2: [asset: Address, amount: bigint];

  /* ERC4626 */
  erc4626Mint: [
    erc4626: Address,
    shares: bigint,
    maxAssets: bigint,
    receiver: Address,
  ];
  erc4626Deposit: [
    erc4626: Address,
    assets: bigint,
    minShares: bigint,
    receiver: Address,
  ];
  erc4626Withdraw: [
    erc4626: Address,
    assets: bigint,
    maxShares: bigint,
    receiver: Address,
    owner: Address,
  ];
  erc4626Redeem: [
    erc4626: Address,
    shares: bigint,
    minAssets: bigint,
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
    market: MarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    onBehalf: Address,
    onMorphoSupply: Action[],
  ];
  morphoSupplyCollateral: [
    market: MarketParams,
    assets: bigint,
    onBehalf: Address,
    onMorphoSupplyCollateral: Action[],
  ];
  morphoBorrow: [
    market: MarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    receiver: Address,
  ];
  morphoRepay: [
    market: MarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    onBehalf: Address,
    onMorphoRepay: Action[],
  ];
  morphoWithdraw: [
    market: MarketParams,
    assets: bigint,
    shares: bigint,
    slippageAmount: bigint,
    receiver: Address,
  ];
  morphoWithdrawCollateral: [
    market: MarketParams,
    assets: bigint,
    receiver: Address,
  ];

  /* MetaMorpho */

  reallocateTo: [
    publicAllocator: Address,
    vault: Address,
    value: bigint,
    withdrawals: ReallocationWithdrawal[],
    supplyMarket: MarketParams,
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
  wrapNative: [amount: bigint];
  unwrapNative: [amount: bigint];

  /* stETH */
  stakeEth: [amount: bigint, minShares: bigint, referral: Address];

  /* Wrapped stETH */
  wrapStEth: [amount: bigint];
  unwrapStEth: [amount: bigint];

  /* AaveV2 */
  aaveV2Repay: [asset: Address, amount: bigint, rateMode?: bigint];
  aaveV2Withdraw: [asset: Address, amount: bigint];

  /* AaveV3 */
  aaveV3Repay: [asset: Address, amount: bigint, rateMode?: bigint];
  aaveV3Withdraw: [asset: Address, amount: bigint];

  /* AaveV3 Optimizer */
  aaveV3OptimizerRepay: [underlying: Address, amount: bigint];
  aaveV3OptimizerWithdraw: [
    underlying: Address,
    amount: bigint,
    maxIterations: bigint,
  ];
  aaveV3OptimizerWithdrawCollateral: [underlying: Address, amount: bigint];
  aaveV3OptimizerApproveManagerWithSig: [
    isApproved: boolean,
    nonce: bigint,
    deadline: bigint,
    signature: Hex | null,
    skipRevert?: boolean,
  ];

  /* CompoundV2 */
  compoundV2Repay: [cToken: Address, amount: bigint];
  compoundV2Redeem: [cToken: Address, amount: bigint];

  /* CompoundV3 */
  compoundV3Repay: [instance: Address, amount: bigint];
  compoundV3WithdrawFrom: [instance: Address, asset: Address, amount: bigint];
  compoundV3AllowBySig: [
    instance: Address,
    isAllowed: boolean,
    nonce: bigint,
    expiry: bigint,
    signature: Hex | null,
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
    tx: SendTransactionRequest;
  };
};

export type TransactionRequirement = Requirements[TransactionRequirementType];

export interface SignatureRequirement {
  action: Action;
  sign: <
    transport extends Transport = Transport,
    chain extends Chain | undefined = Chain | undefined,
    account extends Account | undefined = Account | undefined,
    rpcSchema extends RpcSchema | undefined = undefined,
  >(
    client: Client<transport, chain, account, rpcSchema>,
  ) => Promise<Hex>;
}

export interface ActionBundle {
  steps: SimulationResult;
  actions: Action[];
  requirements: {
    signatures: SignatureRequirement[];
    txs: TransactionRequirement[];
  };
  tx: () => SendTransactionRequest;
}
