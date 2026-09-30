import type { Address, Hex } from "viem";

/** Chain-bound EIP-712 domain, owned locally to absorb upstream type changes. */
export interface AuthorizationDomain {
  readonly name?: string;
  readonly version?: string;
  readonly chainId: number | bigint;
  readonly verifyingContract: Address;
  readonly salt?: Hex;
}

type Field<Name extends string, Type extends string> = {
  readonly name: Name;
  readonly type: Type;
};

/** Exact ERC-2612 wallet payload, including the ordered signed field schema. */
export interface Erc2612TypedData {
  readonly domain: AuthorizationDomain;
  readonly primaryType: "Permit";
  readonly types: {
    readonly Permit: readonly [
      Field<"owner", "address">,
      Field<"spender", "address">,
      Field<"value", "uint256">,
      Field<"nonce", "uint256">,
      Field<"deadline", "uint256">,
    ];
  };
  readonly message: {
    readonly owner: Address;
    readonly spender: Address;
    readonly value: bigint;
    readonly nonce: bigint;
    readonly deadline: bigint;
  };
}

/** One-time Permit2 SignatureTransfer payload; the owner is outside the message. */
export interface Permit2SignatureTransferTypedData {
  readonly domain: AuthorizationDomain;
  readonly primaryType: "PermitTransferFrom";
  readonly types: {
    readonly PermitTransferFrom: readonly [
      Field<"permitted", "TokenPermissions">,
      Field<"spender", "address">,
      Field<"nonce", "uint256">,
      Field<"deadline", "uint256">,
    ];
    readonly TokenPermissions: readonly [
      Field<"token", "address">,
      Field<"amount", "uint256">,
    ];
  };
  readonly message: {
    readonly permitted: {
      readonly token: Address;
      readonly amount: bigint;
    };
    readonly spender: Address;
    readonly nonce: bigint;
    readonly deadline: bigint;
  };
}

/** Exact Morpho authorization wallet payload. */
export interface BlueAuthorizationTypedData {
  readonly domain: AuthorizationDomain;
  readonly primaryType: "Authorization";
  readonly types: {
    readonly Authorization: readonly [
      Field<"authorizer", "address">,
      Field<"authorized", "address">,
      Field<"isAuthorized", "bool">,
      Field<"nonce", "uint256">,
      Field<"deadline", "uint256">,
    ];
  };
  readonly message: {
    readonly authorizer: Address;
    readonly authorized: Address;
    readonly isAuthorized: boolean;
    readonly nonce: bigint;
    readonly deadline: bigint;
  };
}

/** Pending wallet requests in their original order; descriptors do not prove authority. */
export type SimulationAuthorization =
  | {
      readonly type: "erc20Approval";
      readonly token: Address;
      readonly owner: Address;
      readonly spender: Address;
      readonly amount: bigint;
    }
  | { readonly type: "erc2612Permit"; readonly typedData: Erc2612TypedData }
  | {
      readonly type: "permit2SignatureTransfer";
      readonly owner: Address;
      readonly typedData: Permit2SignatureTransferTypedData;
    }
  | {
      readonly type: "blueAuthorization";
      readonly authorizer: Address;
      readonly authorized: Address;
      readonly isAuthorized: boolean;
    }
  | {
      readonly type: "blueAuthorizationSignature";
      readonly typedData: BlueAuthorizationTypedData;
    };
