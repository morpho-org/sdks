import type {
  BlueOperationArgs,
  BlueOperationType,
  CALLBACK_OPERATIONS,
  Erc20OperationArgs,
  Erc20OperationType,
  MetaMorphoOperationArgs,
  MetaMorphoOperationType,
  OperationArgs,
  OperationType,
  WithOperationArgs,
} from "@morpho-org/simulation-sdk";

export const BUNDLER_OPERATIONS = [
  "Blue_SetAuthorization",
  "Blue_Borrow",
  "Blue_Repay",
  "Blue_Supply",
  "Blue_SupplyCollateral",
  "Blue_Withdraw",
  "Blue_WithdrawCollateral",
  "MetaMorpho_Deposit",
  "MetaMorpho_Withdraw",
  "MetaMorpho_PublicReallocate",
  "Erc20_Approve",
  "Erc20_Permit",
  "Erc20_Permit2",
  "Erc20_Transfer",
  "Erc20_Transfer2",
  "Erc20_Wrap",
  "Erc20_Unwrap",
] as const satisfies readonly OperationType[];

export type BundlerOperationType = (typeof BUNDLER_OPERATIONS)[number];

export interface BundlerOperationArgs
  extends Omit<OperationArgs, (typeof CALLBACK_OPERATIONS)[number]> {
  Blue_SupplyCollateral: Omit<
    BlueOperationArgs["Blue_SupplyCollateral"],
    "callback"
  > & { callback?: BundlerOperation[] };

  Blue_Supply: Omit<BlueOperationArgs["Blue_Supply"], "callback"> & {
    callback?: BundlerOperation[];
  };
  Blue_Repay: Omit<BlueOperationArgs["Blue_Repay"], "callback"> & {
    callback?: BundlerOperation[];
  };
}
export type BundlerOperations = {
  [OperationType in BundlerOperationType]: WithOperationArgs<
    OperationType,
    BundlerOperationArgs
  >;
};
export type BundlerOperation = BundlerOperations[BundlerOperationType];

export type CallbackBundlerOperationType = (typeof CALLBACK_OPERATIONS)[number];
export type CallbackBundlerOperations = {
  [OperationType in CallbackBundlerOperationType]: WithOperationArgs<
    OperationType,
    BundlerOperationArgs
  >;
};
export type CallbackBundlerOperation =
  CallbackBundlerOperations[CallbackBundlerOperationType];

export const BLUE_INPUT_OPERATIONS = [
  "Blue_Borrow",
  "Blue_Repay",
  "Blue_Supply",
  "Blue_SupplyCollateral",
  "Blue_Withdraw",
  "Blue_WithdrawCollateral",
  "Blue_SetAuthorization",
] as const satisfies readonly BlueOperationType[];

export type BlueInputBundlerOperationType =
  (typeof BLUE_INPUT_OPERATIONS)[number];

export interface BlueInputBundlerOperationArgs
  extends Omit<OperationArgs, (typeof CALLBACK_OPERATIONS)[number]> {
  Blue_SupplyCollateral: Omit<
    BlueOperationArgs["Blue_SupplyCollateral"],
    "callback"
  > & { callback?: InputBundlerOperation[] };

  Blue_Supply: Omit<BlueOperationArgs["Blue_Supply"], "callback"> & {
    callback?: InputBundlerOperation[];
  };
  Blue_Repay: Omit<BlueOperationArgs["Blue_Repay"], "callback"> & {
    callback?: InputBundlerOperation[];
  };
}
export type BlueInputBundlerOperations = {
  [OperationType in BlueInputBundlerOperationType]: WithOperationArgs<
    OperationType,
    BlueInputBundlerOperationArgs
  >;
};
export type BlueInputBundlerOperation =
  BlueInputBundlerOperations[BlueInputBundlerOperationType];

export const METAMORPHO_INPUT_OPERATIONS = [
  "MetaMorpho_Deposit",
  "MetaMorpho_Withdraw",
] as const satisfies readonly MetaMorphoOperationType[];

export type MetaMorphoInputBundlerOperationType =
  (typeof METAMORPHO_INPUT_OPERATIONS)[number];
export type MetaMorphoInputBundlerOperation =
  BundlerOperations[MetaMorphoInputBundlerOperationType];

export const ERC20_INPUT_OPERATIONS = [
  "Erc20_Wrap",
  "Erc20_Unwrap",
] as const satisfies readonly Erc20OperationType[];

export type Erc20InputBundlerOperationType =
  (typeof ERC20_INPUT_OPERATIONS)[number];
export type Erc20InputBundlerOperation =
  BundlerOperations[Erc20InputBundlerOperationType];

export interface InputBundlerOperationArgs
  extends BlueOperationArgs,
    MetaMorphoOperationArgs,
    Erc20OperationArgs {}

export type InputBundlerOperationType =
  | BlueInputBundlerOperationType
  | MetaMorphoInputBundlerOperationType
  | Erc20InputBundlerOperationType;

export type InputBundlerOperation =
  | BlueInputBundlerOperation
  | MetaMorphoInputBundlerOperation
  | Erc20InputBundlerOperation;

// export const isBundlerOperation = (
//   operation: Operation
// ): operation is BundlerOperation => {
//   return (BUNDLER_OPERATIONS as readonly OperationType[]).includes(
//     operation.type
//   );
// };

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
