import type { Address, Hex } from "viem";

/** @internal EIP-712 domain separator fields of a signature payload. */
export interface Eip712Domain {
  readonly name?: string;
  readonly version?: string;
  readonly chainId: number | bigint;
  readonly verifyingContract: Address;
  readonly salt?: Hex;
}

/** @internal One entry of an EIP-712 `types` field list. */
export interface Eip712Field {
  readonly name: string;
  readonly type: string;
}

/** @internal ERC-2612 `Permit` typed data; `domain.verifyingContract` is the token. */
export interface Erc2612PermitTypedData {
  readonly domain: Eip712Domain;
  readonly primaryType: "Permit";
  readonly types: { readonly Permit: readonly Eip712Field[] };
  readonly message: {
    readonly owner: Address;
    readonly spender: Address;
    readonly value: bigint;
    readonly nonce: bigint;
    readonly deadline: bigint;
  };
}

/** @internal Permit2 `PermitTransferFrom` typed data; the owner is not in the message. */
export interface Permit2TransferTypedData {
  readonly domain: Eip712Domain;
  readonly primaryType: "PermitTransferFrom";
  readonly types: {
    readonly PermitTransferFrom: readonly Eip712Field[];
    readonly TokenPermissions: readonly Eip712Field[];
  };
  readonly message: {
    readonly permitted: { readonly token: Address; readonly amount: bigint };
    readonly spender: Address;
    readonly nonce: bigint;
    readonly deadline: bigint;
  };
}

/** @internal Morpho `Authorization` typed data consumed by `setAuthorizationWithSig`. */
export interface BlueAuthorizationTypedData {
  readonly domain: Eip712Domain;
  readonly primaryType: "Authorization";
  readonly types: { readonly Authorization: readonly Eip712Field[] };
  readonly message: {
    readonly authorizer: Address;
    readonly authorized: Address;
    readonly isAuthorized: boolean;
    readonly nonce: bigint;
    readonly deadline: bigint;
  };
}

/** @internal Raw ERC-20 `approve` request. */
export interface Erc20ApprovalAuthorization {
  readonly type: "erc20Approval";
  readonly token: Address;
  readonly owner: Address;
  readonly spender: Address;
  readonly amount: bigint;
}

/** @internal ERC-2612 permit request. */
export interface Erc2612PermitAuthorization {
  readonly type: "erc2612Permit";
  readonly typedData: Erc2612PermitTypedData;
}

/** @internal Permit2 signature transfer request. */
export interface Permit2TransferAuthorization {
  readonly type: "permit2SignatureTransfer";
  readonly owner: Address;
  readonly typedData: Permit2TransferTypedData;
}

/** @internal Direct Morpho `setAuthorization` request. */
export interface BlueAuthorization {
  readonly type: "blueAuthorization";
  readonly authorizer: Address;
  readonly authorized: Address;
  readonly isAuthorized: boolean;
}

/** @internal Morpho `setAuthorizationWithSig` request. */
export interface BlueAuthorizationSignature {
  readonly type: "blueAuthorizationSignature";
  readonly typedData: BlueAuthorizationTypedData;
}

/** @internal A wallet request the user has not completed yet. */
export type PendingAuthorization =
  | Erc20ApprovalAuthorization
  | Erc2612PermitAuthorization
  | Permit2TransferAuthorization
  | BlueAuthorization
  | BlueAuthorizationSignature;

/** A pending wallet request passed to `simulate()` — the five typed variants. */
export type SimulationAuthorization = PendingAuthorization;
