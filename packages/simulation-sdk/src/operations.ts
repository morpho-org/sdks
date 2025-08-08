import type { Address, MarketId } from "@morpho-org/blue-sdk";
import type { Hex } from "viem";
import type { SimulationState } from "./SimulationState.js";
import type { MaybeDraft } from "./handlers/types.js";

export interface OperationMetadata<T extends string> {
  type: T;
  sender: Address;
  address: Address;
  /**
   * Whether to allow the transfer to revert without making the whole bundler revert.
   * Defaults to true upon encoding signature-based operations (ERC20 permits, Morpho authorizations).
   * Defaults to false otherwise.
   */
  skipRevert?: boolean;
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
  "Blue_FlashLoan",
  "Blue_Paraswap_BuyDebt",
] as const;

export type BlueOperationType = (typeof BLUE_OPERATIONS)[number];
export interface BlueOperationArgs {
  Blue_AccrueInterest: { id: MarketId };
  Blue_SetAuthorization: {
    owner: Address;
    // Should not be scoped to GeneralAdapter1 because PreLiquidation contracts use authorizations.
    authorized: Address;
    isAuthorized: boolean;
    /**
     * The maximum block timestamp (included) for which the authorization will be signed and valid.
     * Defaults to the simulation state's timestamp + 2h.
     */
    deadline?: bigint;
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

  Blue_FlashLoan: {
    token: Address;
    assets: bigint;
    callback?: (data: MaybeDraft<SimulationState>) => Operation[];
  };

  Blue_Paraswap_BuyDebt:
    | {
        id: MarketId;
        srcToken: Address;
        priceE27: bigint;
        onBehalf: Address;
        receiver: Address;
        slippage?: bigint;
      }
    | {
        id: MarketId;
        srcToken: Address;
        swap: {
          to: Address;
          data: Hex;
          offsets: ParaswapOffsets;
        };
        onBehalf: Address;
        receiver: Address;
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

export interface ParaswapOffsets {
  exactAmount: bigint;
  limitAmount: bigint;
  quotedAmount: bigint;
}

export const PARASWAP_OPERATIONS = ["Paraswap_Buy", "Paraswap_Sell"] as const;

export type ParaswapOperationType = (typeof PARASWAP_OPERATIONS)[number];
export interface ParaswapOperationArgs {
  Paraswap_Buy:
    | {
        srcToken: Address;
        amount: bigint;
        quotedAmount: bigint;
        receiver: Address;
        slippage?: bigint;
      }
    | {
        srcToken: Address;
        swap: {
          to: Address;
          data: Hex;
          offsets: ParaswapOffsets;
        };
        receiver: Address;
        slippage?: bigint;
      };
  Paraswap_Sell:
    | {
        dstToken: Address;
        amount: bigint;
        quotedAmount: bigint;
        receiver: Address;
        sellEntireBalance?: boolean;
        slippage?: bigint;
      }
    | {
        dstToken: Address;
        swap: {
          to: Address;
          data: Hex;
          offsets: ParaswapOffsets;
        };
        receiver: Address;
        sellEntireBalance?: boolean;
        slippage?: bigint;
      };
}
export type ParaswapOperations = {
  [OperationType in ParaswapOperationType]: WithOperationArgs<
    OperationType,
    ParaswapOperationArgs
  >;
};
export type ParaswapOperation = ParaswapOperations[ParaswapOperationType];

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
    /**
     * The maximum block timestamp (included) for which the permit will be signed and valid.
     * Defaults to the simulation state's timestamp + 2h.
     */
    deadline?: bigint;
  };
  Erc20_Permit2: {
    amount: bigint;
    expiration: bigint;
    nonce: bigint;
    /**
     * The maximum block timestamp (included) for which the permit will be signed and valid.
     * Defaults to the simulation state's timestamp + 2h.
     */
    deadline?: bigint;
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

export const VAULTV2_OPERATIONS = [
  "VaultV2_AccrueInterest",
  "VaultV2_Deposit",
  "VaultV2_Withdraw",
] as const;

export type VaultV2OperationType = (typeof VAULTV2_OPERATIONS)[number];
export interface VaultV2OperationArgs {
  VaultV2_AccrueInterest: {};
  VaultV2_Deposit:
    | {
        assets: bigint;
        shares?: never;
        onBehalf: Address;
        slippage?: bigint;
      }
    | {
        assets?: never;
        shares: bigint;
        onBehalf: Address;
        slippage?: bigint;
      };
  VaultV2_Withdraw:
    | {
        assets: bigint;
        shares?: never;
        onBehalf: Address;
        receiver: Address;
        slippage?: bigint;
      }
    | {
        assets?: never;
        shares: bigint;
        onBehalf: Address;
        receiver: Address;
        slippage?: bigint;
      };
}
export type VaultV2Operations = {
  [OperationType in VaultV2OperationType]: WithOperationArgs<
    OperationType,
    VaultV2OperationArgs
  >;
};
export type VaultV2Operation = VaultV2Operations[VaultV2OperationType];

export interface Operations
  extends BlueOperations,
    MetaMorphoOperations,
    ParaswapOperations,
    Erc20Operations,
    VaultV2Operations {}

export interface OperationArgs
  extends BlueOperationArgs,
    MetaMorphoOperationArgs,
    ParaswapOperationArgs,
    Erc20OperationArgs,
    VaultV2OperationArgs {}

export type OperationType =
  | BlueOperationType
  | MetaMorphoOperationType
  | ParaswapOperationType
  | Erc20OperationType
  | VaultV2OperationType;

export type Operation =
  | BlueOperation
  | MetaMorphoOperation
  | ParaswapOperation
  | Erc20Operation
  | VaultV2Operation;

export const CALLBACK_OPERATIONS = [
  "Blue_Repay",
  "Blue_Supply",
  "Blue_SupplyCollateral",
  "Blue_FlashLoan",
] as const satisfies readonly OperationType[];

export type CallbackOperationType = (typeof CALLBACK_OPERATIONS)[number];
export type CallbackOperations = {
  [OperationType in CallbackOperationType]: WithOperationArgs<
    OperationType,
    OperationArgs
  >;
};
export type CallbackOperation = CallbackOperations[CallbackOperationType];

export const isBlueOperation = (
  operation: Operation,
): operation is BlueOperation => {
  return (BLUE_OPERATIONS as readonly OperationType[]).includes(operation.type);
};

export const isMetaMorphoOperation = (
  operation: Operation,
): operation is MetaMorphoOperation => {
  return (METAMORPHO_OPERATIONS as readonly OperationType[]).includes(
    operation.type,
  );
};

export const isParaswapOperation = (
  operation: Operation,
): operation is ParaswapOperation => {
  return (PARASWAP_OPERATIONS as readonly OperationType[]).includes(
    operation.type,
  );
};

export const isErc20Operation = (
  operation: Operation,
): operation is Erc20Operation => {
  return (ERC20_OPERATIONS as readonly OperationType[]).includes(
    operation.type,
  );
};

export const isVaultV2Operation = (
  operation: Operation,
): operation is VaultV2Operation => {
  return (VAULTV2_OPERATIONS as readonly OperationType[]).includes(
    operation.type,
  );
};

export const isCallbackOperation = (
  operation: Operation,
): operation is CallbackOperation => {
  return (CALLBACK_OPERATIONS as readonly OperationType[]).includes(
    operation.type,
  );
};
