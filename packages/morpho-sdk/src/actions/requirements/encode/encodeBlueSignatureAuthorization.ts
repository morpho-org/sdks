import type { Address } from "@morpho-org/blue-sdk";
import { getAuthorizationTypedData } from "@morpho-org/blue-sdk-viem";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import { type Client, maxUint256, type WalletClient } from "viem";
import { signAndVerifyTypedData } from "../../../helpers/signAndVerifyTypedData.js";
import {
  type AuthorizationAction,
  type AuthorizationRequirementSignature,
  ChainIdMismatchError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  NonPositiveInputError,
  type Requirement,
} from "../../../types/index.js";

/** Parameters for {@link encodeBlueSignatureAuthorization}. */
interface EncodeBlueSignatureAuthorizationParams {
  /** Operator to authorize on Morpho, such as GeneralAdapter1 or BlueBundlesV1. */
  authorized: Address;
  /** Target chain id; must match `viemClient.chain.id`. */
  chainId: number;
  /** The signer's current Morpho authorization nonce. */
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
 * `RequirementSignature` the selected transaction route consumes. Deadline defaults to two hours
 * from `Time.timestamp()`.
 *
 * @param viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId`.
 * @param params - Authorization encoding parameters.
 * @param params.authorized - Operator to authorize, such as GeneralAdapter1 or BlueBundlesV1.
 * @param params.chainId - Target chain id.
 * @param params.nonce - The signer's current Morpho authorization nonce.
 * @param params.isAuthorized - Grant (`true`, default) or revoke (`false`).
 * @param params.deadline - Optional signature deadline in seconds.
 * @returns A `Requirement` whose `sign(client, userAddress)` produces the deep-frozen signature.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`.
 * @throws {NonPositiveInputError} when a provided `deadline` is not positive.
 * @throws {InputExceedsMaxError} when a provided `deadline` exceeds `uint256`.
 * @throws {ExpiredDeadlineError} when a provided `deadline` is positive but not in the future.
 * @throws {MissingClientPropertyError} from `sign()` when the client has no `account.address`.
 * @throws {AddressMismatchError} from `sign()` when the client account differs from `userAddress`.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
 * @example
 * ```ts
 * import { createWalletClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { encodeBlueSignatureAuthorization } from "@morpho-org/morpho-sdk";
 *
 * const client = createWalletClient({ chain: mainnet, transport: http() });
 * const requirement = await encodeBlueSignatureAuthorization(client, {
 *   authorized: generalAdapter1,
 *   chainId: 1,
 *   nonce: 0n,
 * });
 * // requirement satisfies Requirement
 * ```
 */
export const encodeBlueSignatureAuthorization = async (
  viemClient: Client,
  params: EncodeBlueSignatureAuthorizationParams,
): Promise<Requirement<AuthorizationRequirementSignature>> => {
  const { authorized, chainId, nonce, isAuthorized = true } = params;

  if (viemClient.chain?.id !== chainId) {
    throw new ChainIdMismatchError(viemClient.chain?.id, chainId);
  }

  // Reject an invalid or already-expired caller-supplied deadline before signing, so a direct caller
  // is never walked through a wallet EIP-712 prompt for an authorization Morpho would reject with
  // `SIGNATURE_EXPIRED`. Mirrors the sibling `encodeErc20Permit2TransferFrom` and the
  // `getBlueAuthorizationRequirement` resolver guards. An omitted deadline defaults to two hours
  // from now and is always valid.
  if (params.deadline != null) {
    if (params.deadline <= 0n) {
      throw new NonPositiveInputError("deadline", params.deadline);
    }
    if (params.deadline > maxUint256) {
      throw new InputExceedsMaxError({
        field: "deadline",
        value: params.deadline,
        max: maxUint256,
      });
    }
    const timestamp = Time.timestamp();
    if (params.deadline <= timestamp) {
      throw new ExpiredDeadlineError(params.deadline, timestamp);
    }
  }

  const deadline = params.deadline ?? Time.timestamp() + Time.s.from.h(2n);

  const action: AuthorizationAction = {
    type: "authorization",
    args: { authorized, isAuthorized, deadline },
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      const typedData = getAuthorizationTypedData(
        { authorizer: userAddress, authorized, isAuthorized, nonce, deadline },
        chainId,
      );
      const signature = await signAndVerifyTypedData({
        client,
        userAddress,
        typedData,
      });

      return deepFreeze({
        args: {
          owner: userAddress,
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
