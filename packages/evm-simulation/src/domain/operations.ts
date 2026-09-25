import type { InputMarketParams, MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";
import type { SimulationDeallocation } from "./limits.js";

/** Original user call index and nested recipe path; never an execution-plan offset. */
export interface OperationIdentity {
  readonly transactionIndex: number;
  readonly callPath: readonly number[];
}

/** Concrete Blue market binding recovered from calldata. */
export interface MarketBinding {
  readonly marketId: MarketId;
  readonly params: Readonly<InputMarketParams>;
}

/** Exclusive exact-assets or exact-shares amount; fullClose is resolved against pinned state. */
export type OperationAmount =
  | {
      readonly type: "assets";
      readonly assets: bigint;
      readonly shares?: never;
    }
  | {
      readonly type: "shares";
      readonly shares: bigint;
      readonly assets?: never;
    };

/** Exclusive funding source; native assets must bind to the registered wrapped token. */
export type OperationFunding =
  | { readonly type: "none" }
  | { readonly type: "erc20"; readonly token: Address; readonly assets: bigint }
  | {
      readonly type: "native";
      readonly wrappedToken: Address;
      readonly assets: bigint;
    };

/**
 * Signature form decoded from calldata, without returning signature bytes.
 *
 * Token permits encoded through the fixed bundles `Permit{kind,data}` parameter carry no nonce
 * (kind 1 data is `abi.encode(deadline, v, r, s)`), so `nonce` is absent there; vault-share
 * `SharesPermit{value,nonce,deadline,v,r,s}` structs do carry one.
 */
export type OperationSignature =
  | { readonly type: "none" }
  | {
      readonly type: "erc2612Permit";
      readonly nonce?: bigint;
      readonly deadline: bigint;
    }
  | {
      readonly type: "permit2SignatureTransfer";
      readonly nonce: bigint;
      readonly deadline: bigint;
    }
  | {
      readonly type: "blueAuthorizationSignature";
      readonly nonce: bigint;
      readonly deadline: bigint;
    };

/** Calldata referral fee; reconciliation does not imply discretionary fee consent. */
export interface ReferralFee {
  readonly rateWad: bigint;
  readonly recipient: Address;
}

/** Decoded Vault V2 public-allocation leg, preserving idle versus market sourcing. */
export interface OperationReallocation {
  readonly vault: Address;
  readonly from:
    | { readonly type: "idle" }
    | {
        readonly type: "market";
        readonly adapter: Address;
        readonly market: MarketBinding;
      };
  readonly to: { readonly adapter: Address; readonly market: MarketBinding };
  readonly assets: bigint;
  readonly penaltyWad: bigint;
}

interface BundledOperation {
  readonly deadline: bigint;
  readonly referralFee: ReferralFee;
}

interface BlueOperation extends BundledOperation {
  readonly tokenSignature: Exclude<
    OperationSignature,
    { readonly type: "blueAuthorizationSignature" }
  >;
  readonly authorizationSignature: Extract<
    OperationSignature,
    { readonly type: "none" | "blueAuthorizationSignature" }
  >;
  readonly route: "blueBundlesV1";
  readonly market: MarketBinding;
  readonly onBehalf: Address;
  readonly receiver: Address;
}

interface BorrowFields {
  readonly borrowAssets: bigint;
  readonly maxLtvWad: bigint;
  readonly reallocations: readonly OperationReallocation[];
}

interface RepayFields {
  readonly repay: OperationAmount;
  readonly maxRepayAssets: bigint;
  readonly fullClose: boolean;
  readonly funding: OperationFunding;
}

interface VaultOperation extends BundledOperation {
  readonly tokenSignature: Extract<
    OperationSignature,
    { readonly type: "none" | "erc2612Permit" }
  >;
  readonly route: "vaultBundlesV1";
  readonly vault: Address;
  readonly asset: Address;
  readonly receiver: Address;
}

/** Operation-specific decoded v6 parameters; the parser independently verifies bindings. */
export interface DecodedOperationFields {
  readonly blueSupply: Omit<BlueOperation, "authorizationSignature"> & {
    /** The supply entrypoint carries no Morpho authorization. */
    readonly authorizationSignature: Extract<
      OperationSignature,
      { readonly type: "none" }
    >;
    readonly assets: bigint;
    readonly funding: OperationFunding;
  };
  readonly blueWithdraw: Omit<BlueOperation, "tokenSignature"> & {
    /** The withdraw entrypoint pulls no user tokens, so it carries no token permit. */
    readonly tokenSignature: Extract<
      OperationSignature,
      { readonly type: "none" }
    >;
    readonly amount: OperationAmount;
    readonly fullClose: boolean;
    readonly reallocations: readonly OperationReallocation[];
  };
  readonly blueSupplyCollateral: Omit<
    BlueOperation,
    "authorizationSignature"
  > & {
    /** A zero protected leg carries no Morpho authorization. */
    readonly authorizationSignature: Extract<
      OperationSignature,
      { readonly type: "none" }
    >;
    readonly collateralAssets: bigint;
    readonly funding: OperationFunding;
    readonly maxLtvWad: bigint;
  };
  readonly blueBorrow: Omit<BlueOperation, "tokenSignature"> & {
    /** A zero funded leg carries no token permit. */
    readonly tokenSignature: Extract<
      OperationSignature,
      { readonly type: "none" }
    >;
  } & BorrowFields;
  readonly blueSupplyCollateralBorrow: BlueOperation &
    BorrowFields & {
      readonly collateralAssets: bigint;
      readonly funding: OperationFunding;
    };
  readonly blueRepay: Omit<BlueOperation, "authorizationSignature"> & {
    /** A zero protected leg carries no Morpho authorization. */
    readonly authorizationSignature: Extract<
      OperationSignature,
      { readonly type: "none" }
    >;
  } & RepayFields;
  readonly blueWithdrawCollateral: Omit<BlueOperation, "tokenSignature"> & {
    /** A zero funded leg carries no token permit. */
    readonly tokenSignature: Extract<
      OperationSignature,
      { readonly type: "none" }
    >;
    readonly collateralAssets: bigint;
    readonly maxLtvWad: bigint;
  };
  readonly blueRepayWithdrawCollateral: BlueOperation &
    RepayFields & {
      readonly collateralAssets: bigint;
      readonly maxLtvWad: bigint;
    };
  readonly blueRefinance: BundledOperation & {
    readonly authorizationSignature: BlueOperation["authorizationSignature"];
    readonly route: "blueBundlesV1";
    readonly sourceMarket: MarketBinding;
    readonly targetMarket: MarketBinding;
    readonly onBehalf: Address;
    readonly maxLtvWad: bigint;
    readonly reallocations: readonly OperationReallocation[];
    /** The released recipe always closes the source debt and moves all collateral. */
    readonly sourceFullClose: true;
  };
  readonly blueAuthorization: {
    readonly route: "morpho";
    readonly authorizer: Address;
    readonly authorized: Address;
    readonly isAuthorized: boolean;
    /** Distinguishes the operator subject even though both call setAuthorization. */
    readonly operator:
      | { readonly type: "bundles" }
      | { readonly type: "preLiquidation"; readonly market: MarketBinding };
    readonly signature: Extract<OperationSignature, { readonly type: "none" }>;
  };
  readonly vaultV1Deposit: Omit<VaultOperation, "tokenSignature"> & {
    readonly tokenSignature: BlueOperation["tokenSignature"];
    readonly funding: Exclude<OperationFunding, { readonly type: "none" }>;
    readonly maxSharePriceE27: bigint;
  };
  readonly vaultV2Deposit: DecodedOperationFields["vaultV1Deposit"];
  readonly vaultV1Withdraw: VaultOperation & { readonly assets: bigint };
  readonly vaultV2Withdraw: DecodedOperationFields["vaultV1Withdraw"];
  readonly vaultV1Redeem: VaultOperation & { readonly shares: bigint };
  readonly vaultV2Redeem: DecodedOperationFields["vaultV1Redeem"];
  readonly vaultV2ForceWithdraw: BundledOperation & {
    readonly tokenSignature: VaultOperation["tokenSignature"];
    readonly route: "vaultExitBundlesV1";
    readonly vault: Address;
    readonly asset: Address;
    readonly adapter: Address;
    /** Gross, penalty-inclusive exit amount in underlying assets. */
    readonly exitAssets: bigint;
    readonly minSharePriceE27: bigint;
    readonly onBehalf: Address;
    readonly receiver: Address;
  };
  readonly vaultV2ForceRedeem: {
    readonly route: "vaultV2Multicall";
    readonly vault: Address;
    readonly asset: Address;
    readonly onBehalf: Address;
    readonly receiver: Address;
    readonly shares: bigint;
    readonly deallocations: readonly (SimulationDeallocation & {
      readonly data: Hex;
    })[];
  };
  readonly vaultV1InKindRedeem: {
    readonly route: "vaultExitBundlesV1";
    readonly vault: Address;
    readonly asset: Address;
    readonly assets: bigint;
    readonly markets: readonly MarketBinding[];
    readonly onBehalf: Address;
    readonly deadline: bigint;
    readonly tokenSignature: VaultOperation["tokenSignature"];
  };
  readonly vaultV2InKindRedeem: DecodedOperationFields["vaultV1InKindRedeem"] & {
    readonly adapter: Address;
  };
  readonly vaultV1MigrateToV2: BundledOperation & {
    readonly tokenSignature: VaultOperation["tokenSignature"];
    readonly route: "vaultBundlesV1";
    readonly sourceVault: Address;
    readonly targetVault: Address;
    readonly asset: Address;
    readonly amount: OperationAmount;
    readonly receiver: Address;
    readonly maxTargetSharePriceE27: bigint;
  };
}

/** Supported operation, with original identity and the actual chain, deployment, and sender. */
export type DecodedOperation = {
  [Type in keyof DecodedOperationFields]: OperationIdentity & {
    readonly type: Type;
    readonly chainId: number;
    readonly deployment: Address;
    readonly owner: Address;
  } & DecodedOperationFields[Type];
}[keyof DecodedOperationFields];
