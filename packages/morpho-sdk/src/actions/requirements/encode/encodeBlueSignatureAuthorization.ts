import type { Address } from "@morpho-org/blue-sdk";
import { getAuthorizationTypedData } from "@morpho-org/blue-sdk-viem";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import type { Client, WalletClient } from "viem";
import { signAndVerifyTypedData } from "../../../helpers/signAndVerifyTypedData.js";
import {
  validateDeadline,
  validateUserAddress,
} from "../../../helpers/validate.js";
import {
  type AuthorizationAction,
  type AuthorizationRequirementSignature,
  ChainIdMismatchError,
  ExpiredDeadlineError,
  type Requirement,
} from "../../../types/index.js";

/** Parameters for {@link encodeBlueSignatureAuthorization}. */
interface EncodeBlueSignatureAuthorizationParams {
  /** Account granting the authorization and signing it (the Morpho `authorizer`). */
  owner: Address;
  /** Operator to authorize on Morpho, such as GeneralAdapter1 or BlueBundlesV1. */
  authorized: Address;
  /** Target chain id; must match `viemClient.chain.id`. */
  chainId: number;
  /** The owner's current Morpho authorization nonce. */
  nonce: bigint;
  /** Whether to grant (`true`, default) or revoke (`false`) the authorization. */
  isAuthorized?: boolean;
  /** Signature deadline in seconds. Defaults to two hours from now. */
  deadline?: bigint;
}

/**
 * Builds a Morpho authorization `Requirement` that, once signed, lets `authorized` operate on
 * Morpho on the signer's behalf. Bundler3 consumes the result through `setAuthorizationWithSig`;
 * BlueBundlesV1 embeds the same signed authorization in its direct-call struct.
 *
 * The returned `Requirement.sign()` produces the EIP-712 signature over Morpho's `Authorization`
 * typed data, verifies it against the connected account, and returns a deep-frozen
 * `RequirementSignature` the selected transaction route consumes. The requirement's
 * `action.typedData` holds that EIP-712 payload so it can be signed with any signer instead of
 * `sign()`. Deadline defaults to two hours from `Time.timestamp()`.
 *
 * @param viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId`.
 * @param params - Authorization encoding parameters.
 * @param params.owner - Account granting the authorization and signing it (the Morpho `authorizer`).
 * @param params.authorized - Operator to authorize, such as GeneralAdapter1 or BlueBundlesV1.
 * @param params.chainId - Target chain id.
 * @param params.nonce - The owner's current Morpho authorization nonce.
 * @param params.isAuthorized - Grant (`true`, default) or revoke (`false`).
 * @param params.deadline - Optional signature deadline in seconds.
 * @returns A `Requirement` whose `action.typedData` is the EIP-712 payload and whose
 *   `sign(client, userAddress)` produces the deep-frozen signature.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`.
 * @throws {NonPositiveInputError} when a provided `deadline` is not positive.
 * @throws {InputExceedsMaxError} when a provided `deadline` exceeds `uint256`.
 * @throws {ExpiredDeadlineError} when a provided `deadline` is positive but not in the future.
 * @throws {MissingClientPropertyError} from `sign()` when the client has no `account.address`.
 * @throws {AddressMismatchError} from `sign()` when the signer differs from `owner`, or when the
 *   client account differs from the signer.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
 * @example
 * ```ts
 * import { createWalletClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { encodeBlueSignatureAuthorization } from "@morpho-org/morpho-sdk";
 *
 * const client = createWalletClient({ chain: mainnet, transport: http() });
 * const requirement = await encodeBlueSignatureAuthorization(client, {
 *   owner,
 *   authorized: generalAdapter1,
 *   chainId: 1,
 *   nonce: 0n,
 * });
 * // Sign it yourself: await walletClient.signTypedData(requirement.action.typedData);
 * ```
 */
export const encodeBlueSignatureAuthorization = async (
  viemClient: Client,
  params: EncodeBlueSignatureAuthorizationParams,
): Promise<Requirement<AuthorizationRequirementSignature>> => {
  const { owner, authorized, chainId, nonce, isAuthorized = true } = params;

  if (viemClient.chain?.id !== chainId) {
    throw new ChainIdMismatchError(viemClient.chain?.id, chainId);
  }

  // Reject an invalid or already-expired caller-supplied deadline before signing, so a direct caller
  // is never walked through a wallet EIP-712 prompt for an authorization Morpho would reject with
  // `SIGNATURE_EXPIRED`. Mirrors the sibling `encodeErc20Permit2SignatureTransfer` and the
  // `getBlueAuthorizationRequirement` resolver guards. An omitted deadline defaults to two hours
  // from now and is always valid.
  if (params.deadline != null) {
    validateDeadline(params.deadline);
    const timestamp = Time.timestamp();
    if (params.deadline <= timestamp) {
      throw new ExpiredDeadlineError(params.deadline, timestamp);
    }
  }

  const deadline = params.deadline ?? Time.timestamp() + Time.s.from.h(2n);

  const typedData = getAuthorizationTypedData(
    { authorizer: owner, authorized, isAuthorized, nonce, deadline },
    chainId,
  );

  const action: AuthorizationAction = {
    type: "authorization",
    args: { authorized, isAuthorized, deadline },
    typedData,
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      // The authorizer is fixed at build time (the fetched nonce is owner-specific), so a different
      // signer cannot produce a valid authorization for it.
      validateUserAddress(userAddress, owner);
      const signature = await signAndVerifyTypedData({
        client,
        userAddress,
        typedData,
      });

      return deepFreeze({
        args: {
          owner,
          authorized,
          isAuthorized,
          nonce,
          deadline,
          signature,
        },
        action,
      });
    },
  };
};
