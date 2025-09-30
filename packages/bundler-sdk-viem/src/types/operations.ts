import {
  type BlueOperationArgs,
  type BlueOperationType,
  CALLBACK_OPERATIONS,
  type CallbackOperationType,
  ERC20_OPERATIONS,
  type Erc20OperationArgs,
  type Erc20OperationType,
  type MetaMorphoOperationArgs,
  type MetaMorphoOperationType,
  type OperationArgs,
  type OperationType,
  PARASWAP_OPERATIONS,
  type ParaswapOperationArgs,
  type ParaswapOperationType,
  type WithOperationArgs,
} from "@morpho-org/simulation-sdk";
import type { UnionOmit } from "viem";

export const BLUE_BUNDLER_OPERATIONS = [
  "Blue_SetAuthorization",
  "Blue_Borrow",
  "Blue_Repay",
  "Blue_Supply",
  "Blue_SupplyCollateral",
  "Blue_Withdraw",
  "Blue_WithdrawCollateral",
  "Blue_FlashLoan",
  "Blue_Paraswap_BuyDebt",
] as const satisfies readonly BlueOperationType[];

export type BlueBundlerOperationType = (typeof BLUE_BUNDLER_OPERATIONS)[number];

export type BlueBundlerOperationArgs = Omit<
  BlueOperationArgs,
  (typeof CALLBACK_OPERATIONS)[number]
> & {
  [OperationType in CallbackOperationType]: Omit<
    BlueOperationArgs[OperationType],
    "callback"
  > & {
    /**
     * Inside a callback, the sender is forced to be the generalAdapter1.
     */
    callback?: UnionOmit<BundlerOperation, "sender">[];
  };
};
export type BlueBundlerOperations = {
  [OperationType in BlueBundlerOperationType]: Omit<
    WithOperationArgs<OperationType, BlueBundlerOperationArgs>,
    "address"
  >;
};
export type BlueBundlerOperation =
  BlueBundlerOperations[BlueBundlerOperationType];

export const METAMORPHO_BUNDLER_OPERATIONS = [
  "MetaMorpho_Deposit",
  "MetaMorpho_Withdraw",
  "MetaMorpho_PublicReallocate",
] as const satisfies readonly MetaMorphoOperationType[];

export type MetaMorphoBundlerOperationType =
  (typeof METAMORPHO_BUNDLER_OPERATIONS)[number];
export type MetaMorphoBundlerOperations = {
  [OperationType in MetaMorphoBundlerOperationType]: WithOperationArgs<
    OperationType,
    MetaMorphoOperationArgs
  >;
};
export type MetaMorphoBundlerOperation =
  MetaMorphoBundlerOperations[MetaMorphoBundlerOperationType];

export const PARASWAP_BUNDLER_OPERATIONS =
  PARASWAP_OPERATIONS satisfies readonly ParaswapOperationType[];

export type ParaswapBundlerOperationType =
  (typeof PARASWAP_BUNDLER_OPERATIONS)[number];
export type ParaswapBundlerOperations = {
  [OperationType in ParaswapBundlerOperationType]: WithOperationArgs<
    OperationType,
    ParaswapOperationArgs
  >;
};
export type ParaswapBundlerOperation =
  ParaswapBundlerOperations[ParaswapBundlerOperationType];

export const ERC20_BUNDLER_OPERATIONS =
  ERC20_OPERATIONS satisfies readonly Erc20OperationType[];

export type Erc20BundlerOperationType =
  (typeof ERC20_BUNDLER_OPERATIONS)[number];
export type Erc20BundlerOperations = {
  [OperationType in Erc20BundlerOperationType]: WithOperationArgs<
    OperationType,
    Erc20OperationArgs
  >;
};
export type Erc20BundlerOperation =
  Erc20BundlerOperations[Erc20BundlerOperationType];

export interface BundlerOperationArgs
  extends BlueOperationArgs,
    MetaMorphoOperationArgs,
    ParaswapOperationArgs,
    Erc20OperationArgs {}

export type BundlerOperations = BlueBundlerOperations &
  MetaMorphoBundlerOperations &
  ParaswapBundlerOperations &
  Erc20BundlerOperations;

export type BundlerOperationType =
  | BlueBundlerOperationType
  | MetaMorphoBundlerOperationType
  | ParaswapBundlerOperationType
  | Erc20BundlerOperationType;

export type BundlerOperation =
  | BlueBundlerOperation
  | MetaMorphoBundlerOperation
  | ParaswapBundlerOperation
  | Erc20BundlerOperation;

export const BUNDLER_OPERATIONS = [
  ...BLUE_BUNDLER_OPERATIONS,
  ...METAMORPHO_BUNDLER_OPERATIONS,
  ...ERC20_BUNDLER_OPERATIONS,
] as const satisfies readonly OperationType[];

export type CallbackBundlerOperationType = (typeof CALLBACK_OPERATIONS)[number];
export type CallbackBundlerOperations = Pick<
  BundlerOperations,
  CallbackBundlerOperationType
>;
export type CallbackBundlerOperation =
  CallbackBundlerOperations[CallbackBundlerOperationType];

export const isBlueBundlerOperation = (
  operation: BundlerOperation,
): operation is BlueBundlerOperation => {
  return (BLUE_BUNDLER_OPERATIONS as readonly OperationType[]).includes(
    operation.type,
  );
};

export const isMetaMorphoBundlerOperation = (
  operation: BundlerOperation,
): operation is MetaMorphoBundlerOperation => {
  return (METAMORPHO_BUNDLER_OPERATIONS as readonly OperationType[]).includes(
    operation.type,
  );
};

export const isErc20BundlerOperation = (
  operation: BundlerOperation,
): operation is Erc20BundlerOperation => {
  return (ERC20_BUNDLER_OPERATIONS as readonly OperationType[]).includes(
    operation.type,
  );
};

export const isCallbackBundlerOperation = (
  operation: BundlerOperation,
): operation is CallbackBundlerOperation => {
  return (CALLBACK_OPERATIONS as readonly OperationType[]).includes(
    operation.type,
  );
};

export const BLUE_INPUT_OPERATIONS =
  BLUE_BUNDLER_OPERATIONS satisfies readonly BlueBundlerOperationType[];

export type BlueInputBundlerOperationType =
  (typeof BLUE_INPUT_OPERATIONS)[number];

export type BlueInputBundlerOperationArgs = Omit<
  OperationArgs,
  (typeof CALLBACK_OPERATIONS)[number]
> & {
  [OperationType in CallbackOperationType]: Omit<
    OperationArgs[OperationType],
    "callback"
  > & {
    /**
     * Inside a callback, the sender is forced to be the generalAdapter1.
     */
    callback?: UnionOmit<InputBundlerOperation, "sender">[];
  };
};
export type BlueInputBundlerOperations = {
  [OperationType in BlueInputBundlerOperationType]: Omit<
    WithOperationArgs<OperationType, BlueInputBundlerOperationArgs>,
    "address"
  >;
};
export type BlueInputBundlerOperation =
  BlueInputBundlerOperations[BlueInputBundlerOperationType];

export const METAMORPHO_INPUT_OPERATIONS = [
  "MetaMorpho_Deposit",
  "MetaMorpho_Withdraw",
] as const satisfies readonly MetaMorphoBundlerOperationType[];

export type MetaMorphoInputBundlerOperationType =
  (typeof METAMORPHO_INPUT_OPERATIONS)[number];
export type MetaMorphoInputBundlerOperation =
  MetaMorphoBundlerOperations[MetaMorphoInputBundlerOperationType];

export const PARASWAP_INPUT_OPERATIONS =
  PARASWAP_BUNDLER_OPERATIONS satisfies readonly ParaswapOperationType[];

export type ParaswapInputBundlerOperationType =
  (typeof PARASWAP_INPUT_OPERATIONS)[number];
export type ParaswapInputBundlerOperation =
  BundlerOperations[ParaswapInputBundlerOperationType];

export const ERC20_INPUT_OPERATIONS =
  ERC20_BUNDLER_OPERATIONS satisfies readonly Erc20BundlerOperationType[];

export type Erc20InputBundlerOperationType =
  (typeof ERC20_INPUT_OPERATIONS)[number];
export type Erc20InputBundlerOperation =
  Erc20BundlerOperations[Erc20InputBundlerOperationType];

export interface InputBundlerOperationArgs
  extends BlueOperationArgs,
    MetaMorphoOperationArgs,
    ParaswapOperationArgs,
    Erc20OperationArgs {}

export type InputBundlerOperationType =
  | BlueInputBundlerOperationType
  | MetaMorphoInputBundlerOperationType
  | ParaswapInputBundlerOperationType
  | Erc20InputBundlerOperationType;

export type InputBundlerOperation =
  | BlueInputBundlerOperation
  | MetaMorphoInputBundlerOperation
  | ParaswapInputBundlerOperation
  | Erc20InputBundlerOperation;

export const isBlueInputBundlerOperation = (operation: {
  type: OperationType;
}): operation is BlueInputBundlerOperation => {
  return (BLUE_INPUT_OPERATIONS as readonly OperationType[]).includes(
    operation.type,
  );
};

export const isMetaMorphoInputBundlerOperation = (operation: {
  type: OperationType;
}): operation is MetaMorphoInputBundlerOperation => {
  return (METAMORPHO_INPUT_OPERATIONS as readonly OperationType[]).includes(
    operation.type,
  );
};

export const isErc20InputBundlerOperation = (operation: {
  type: OperationType;
}): operation is Erc20InputBundlerOperation => {
  return (ERC20_INPUT_OPERATIONS as readonly OperationType[]).includes(
    operation.type,
  );
};

export const isParaswapInputBundlerOperation = (operation: {
  type: OperationType;
}): operation is ParaswapInputBundlerOperation => {
  return (PARASWAP_INPUT_OPERATIONS as readonly OperationType[]).includes(
    operation.type,
  );
};
