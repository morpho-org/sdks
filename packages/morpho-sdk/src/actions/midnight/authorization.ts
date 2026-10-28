import { midnightAbi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual, zeroAddress } from "viem";
import { encodeMidnightCalldata } from "../../helpers/encodeMidnightCalldata.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateMidnightAddress } from "../../helpers/validateMidnightAccount.js";
import { validateMidnightAuthorizationTarget } from "../../helpers/validateMidnightAuthorizationTarget.js";
import {
  type Metadata,
  type MidnightAuthorizationAction,
  MidnightZeroOnBehalfError,
  type Transaction,
} from "../../types/index.js";

/** Parameters for encoding a direct Midnight `setIsAuthorized` call. */
export interface MidnightSetIsAuthorizedParams {
  readonly chainId: number;
  readonly authorized: Address;
  readonly onBehalf: Address;
  readonly isAuthorized?: boolean;
  readonly metadata?: Metadata;
}

/**
 * Encodes `Midnight.setIsAuthorized`. Grants target MidnightBundlesV2;
 * revocations accept any operator.
 *
 * Prefer requirement helpers or entity `getRequirements()` in app flows; they
 * read `isAuthorized` first and return this transaction only when needed. Use
 * this builder directly when the caller intentionally wants to set or revoke
 * authorization without reading state.
 *
 * @param params.chainId - Chain id used to resolve `Midnight`.
 * @param params.authorized - Supported operator receiving authorization, or any operator losing authorization.
 * @param params.onBehalf - Owner whose authorization mapping is updated.
 * @param params.isAuthorized - Optional target state; defaults to `true`.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightAuthorizationAction>` targeting `Midnight`.
 * @throws {MidnightZeroOnBehalfError} when `onBehalf` is the zero address.
 * @throws {UnsupportedMidnightAuthorizationTargetError} when granting authorization to an unsupported operator.
 * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32`, an out-of-range integer or a malformed address.
 * @example
 * ```ts
 * import { midnightSetIsAuthorized } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightSetIsAuthorized({
 *   chainId: 8453,
 *   authorized: midnightBundlesV2,
 *   onBehalf: user,
 * });
 * ```
 */
export const midnightSetIsAuthorized = (
  params: MidnightSetIsAuthorizedParams,
): Readonly<Transaction<MidnightAuthorizationAction>> => {
  // Reject a malformed account before comparing it with the zero address.
  validateMidnightAddress("onBehalf", params.onBehalf);
  if (isAddressEqual(params.onBehalf, zeroAddress)) {
    throw new MidnightZeroOnBehalfError("onBehalf");
  }
  const isAuthorized = params.isAuthorized ?? true;
  if (isAuthorized) {
    // Restrict grants to known protocol operators; revocations remain permissionless by target.
    validateMidnightAuthorizationTarget({
      chainId: params.chainId,
      authorized: params.authorized,
    });
  }
  const midnight = getChainAddress(params.chainId, "midnight");

  let tx = {
    to: midnight,
    value: 0n,
    data: encodeMidnightCalldata({
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [params.authorized, isAuthorized, params.onBehalf],
    }),
  };

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightAuthorization",
      args: {
        authorized: params.authorized,
        isAuthorized,
        onBehalf: params.onBehalf,
      },
    },
  });
};
