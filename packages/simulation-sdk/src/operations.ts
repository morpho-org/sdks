import type { Address, MarketId } from "@morpho-org/blue-sdk";

import type { SimulationState } from "./SimulationState.js";
import type { MaybeDraft } from "./handlers/types.js";

export interface OperationMetadata<T extends string> {
  type: T;
  sender: Address;
  address: Address;
}

export interface WithOperationArgs<
  T extends string,
  A extends Record<T, object>,
> extends OperationMetadata<T> {
  args: A[T];
}

export const BLUE_OPERATIONS = [
  "Blue_AccrueInterest",
  "Blue_SetAuthorization",
  "Blue_Borrow",
  "Blue_Repay",
  "Blue_Supply",
  "Blue_SupplyCollateral",
  "Blue_Withdraw",
  "Blue_WithdrawCollateral",
] as const;

export type BlueOperationType = (typeof BLUE_OPERATIONS)[number];
export interface BlueOperationArgs {
  Blue_AccrueInterest: { id: MarketId };
  Blue_SetAuthorization: {
    owner: Address;
    authorized: Address;
    isAuthorized: boolean;
  };

  Blue_SupplyCollateral: {
    id: MarketId;
    onBehalf: Address;
    assets: bigint;
    callback?: (data: MaybeDraft<SimulationState>) => Operation[];
  };
  Blue_WithdrawCollateral: {
    id: MarketId;
    onBehalf: Address;
    receiver: Address;
    assets: bigint;
  };

  Blue_Supply:
    | {
        id: MarketId;
        onBehalf: Address;
        assets: bigint;
        shares?: never;
        callback?: (data: MaybeDraft<SimulationState>) => Operation[];
        slippage?: bigint;
      }
    | {
        id: MarketId;
        onBehalf: Address;
        assets?: never;
        shares: bigint;
        callback?: (data: MaybeDraft<SimulationState>) => Operation[];
        slippage?: bigint;
      };
  Blue_Withdraw:
    | {
        id: MarketId;
        onBehalf: Address;
        receiver: Address;
        assets: bigint;
        shares?: never;
        slippage?: bigint;
      }
    | {
        id: MarketId;
        onBehalf: Address;
        receiver: Address;
        assets?: never;
        shares: bigint;
        slippage?: bigint;
      };

  Blue_Borrow:
    | {
        id: MarketId;
        onBehalf: Address;
        receiver: Address;
        assets: bigint;
        shares?: never;
        slippage?: bigint;
      }
    | {
        id: MarketId;
        onBehalf: Address;
        receiver: Address;
        assets?: never;
        shares: bigint;
        slippage?: bigint;
      };
  Blue_Repay:
    | {
        id: MarketId;
        onBehalf: Address;
        assets: bigint;
        shares?: never;
        callback?: (data: MaybeDraft<SimulationState>) => Operation[];
        slippage?: bigint;
      }
    | {
        id: MarketId;
        onBehalf: Address;
        assets?: never;
        shares: bigint;
        callback?: (data: MaybeDraft<SimulationState>) => Operation[];
        slippage?: bigint;
      };
}
export type BlueOperations = {
  [OperationType in BlueOperationType]: Omit<
    WithOperationArgs<OperationType, BlueOperationArgs>,
    "address"
  >;
};
export type BlueOperation = BlueOperations[BlueOperationType];

export const METAMORPHO_OPERATIONS = [
  "MetaMorpho_AccrueInterest",
  "MetaMorpho_Deposit",
  "MetaMorpho_Withdraw",
  "MetaMorpho_Reallocate",
  "MetaMorpho_PublicReallocate",
] as const;

export type MetaMorphoOperationType = (typeof METAMORPHO_OPERATIONS)[number];
export interface MetaMorphoOperationArgs {
  MetaMorpho_AccrueInterest: {};
  MetaMorpho_Deposit:
    | {
        assets: bigint;
        shares?: never;
        owner: Address;
        slippage?: bigint;
      }
    | {
        assets?: never;
        shares: bigint;
        owner: Address;
        slippage?: bigint;
      };
  MetaMorpho_Withdraw:
    | {
        assets: bigint;
        shares?: never;
        owner: Address;
        receiver: Address;
        slippage?: bigint;
      }
    | {
        assets?: never;
        shares: bigint;
        owner: Address;
        receiver: Address;
        slippage?: bigint;
      };

  MetaMorpho_Reallocate: {
    id: MarketId;
    assets: bigint;
  }[];
  MetaMorpho_PublicReallocate: {
    withdrawals: {
      id: MarketId;
      assets: bigint;
    }[];
    supplyMarketId: MarketId;
  };
}
export type MetaMorphoOperations = {
  [OperationType in MetaMorphoOperationType]: WithOperationArgs<
    OperationType,
    MetaMorphoOperationArgs
  >;
};
export type MetaMorphoOperation = MetaMorphoOperations[MetaMorphoOperationType];

export const ERC20_OPERATIONS = [
  "Erc20_Approve",
  "Erc20_Permit",
  "Erc20_Permit2",
  "Erc20_Transfer",
  "Erc20_Transfer2",
  "Erc20_Wrap",
  "Erc20_Unwrap",
] as const;

export type Erc20OperationType = (typeof ERC20_OPERATIONS)[number];
export interface Erc20OperationArgs {
  Erc20_Approve: {
    spender: Address;
    amount: bigint;
  };
  Erc20_Permit: {
    spender: Address;
    amount: bigint;
    nonce: bigint;
  };
  Erc20_Permit2: {
    amount: bigint;
    expiration: bigint;
    nonce: bigint;
  };

  Erc20_Transfer: {
    amount: bigint;
    from: Address;
    to: Address;
  };
  Erc20_Transfer2: {
    amount: bigint;
    from: Address;
    to: Address;
  };

  Erc20_Wrap: {
    /** The input amount of unwrapped tokens. */
    amount: bigint;
    owner: Address;
    slippage?: bigint;
  };
  Erc20_Unwrap: {
    /** The input amount of wrapped tokens. */
    amount: bigint;
    receiver: Address;
    slippage?: bigint;
  };
}
export type Erc20Operations = {
  [OperationType in Erc20OperationType]: WithOperationArgs<
    OperationType,
    Erc20OperationArgs
  >;
};
export type Erc20Operation = Erc20Operations[Erc20OperationType];

export interface Operations
  extends BlueOperations,
    Erc20Operations,
    MetaMorphoOperations {}

export interface OperationArgs
  extends BlueOperationArgs,
    Erc20OperationArgs,
    MetaMorphoOperationArgs {}

export type OperationType =
  | BlueOperationType
  | Erc20OperationType
  | MetaMorphoOperationType;

export type Operation = BlueOperation | Erc20Operation | MetaMorphoOperation;

export const CALLBACK_OPERATIONS = [
  "Blue_Repay",
  "Blue_Supply",
  "Blue_SupplyCollateral",
] as const satisfies readonly OperationType[];

export type CallbackOperationType = (typeof CALLBACK_OPERATIONS)[number];
export type CallbackOperations = {
  [OperationType in CallbackOperationType]: WithOperationArgs<
    OperationType,
    OperationArgs
  >;
};
export type CallbackOperation = CallbackOperations[CallbackOperationType];

export const isBlueOperation = (operation: {
  type: OperationType;
}): operation is BlueOperation => {
  return (BLUE_OPERATIONS as readonly OperationType[]).includes(operation.type);
};

export const isMetaMorphoOperation = (operation: {
  type: OperationType;
}): operation is MetaMorphoOperation => {
  return (METAMORPHO_OPERATIONS as readonly OperationType[]).includes(
    operation.type,
  );
};

export const isErc20Operation = (operation: {
  type: OperationType;
}): operation is Erc20Operation => {
  return (ERC20_OPERATIONS as readonly OperationType[]).includes(
    operation.type,
  );
};
