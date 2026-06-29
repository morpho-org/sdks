import type { Address } from "@morpho-org/blue-sdk";
import { getAuthorizationTypedData } from "@morpho-org/blue-sdk-viem";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import { type Client, verifyTypedData, type WalletClient } from "viem";
import { signTypedData } from "viem/actions";
import { validateUserAddress } from "../../../helpers/validate.js";
import {
  type AuthorizationAction,
  type AuthorizationRequirementSignature,
  ChainIdMismatchError,
  InvalidSignatureError,
  type Requirement,
} from "../../../types/index.js";

/** Parameters for {@link encodeAuthorization}. */
interface EncodeAuthorizationParams {
  /** Account to authorize on Morpho (GeneralAdapter1). */
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
 * Morpho on the signer's behalf through `setAuthorizationWithSig` — the offchain-signature
 * alternative to a standalone `setAuthorization` transaction.
 *
 * The returned `Requirement.sign()` produces the EIP-712 signature over Morpho's `Authorization`
 * typed data, verifies it against the connected account, and returns a deep-frozen
 * `RequirementSignature` the bundler action helpers consume. Deadline defaults to two hours from
 * `Time.timestamp()`.
 *
 * @param viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId`.
 * @param params - Authorization encoding parameters.
 * @param params.authorized - Account to authorize (GeneralAdapter1).
 * @param params.chainId - Target chain id.
 * @param params.nonce - The signer's current Morpho authorization nonce.
 * @param params.isAuthorized - Grant (`true`, default) or revoke (`false`).
 * @param params.deadline - Optional signature deadline in seconds.
 * @returns A `Requirement` whose `sign(client, userAddress)` produces the deep-frozen signature.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`.
 * @throws {MissingClientPropertyError} from `sign()` when the client has no `account.address`.
 * @throws {AddressMismatchError} from `sign()` when the client account differs from `userAddress`.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
 * @example
 * ```ts
 * import { createWalletClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { encodeAuthorization } from "@morpho-org/morpho-sdk";
 *
 * const client = createWalletClient({ chain: mainnet, transport: http() });
 * const requirement = await encodeAuthorization(client, {
 *   authorized: generalAdapter1,
 *   chainId: 1,
 *   nonce: 0n,
 * });
 * // requirement satisfies Requirement
 * ```
 */
export const encodeAuthorization = async (
  viemClient: Client,
  params: EncodeAuthorizationParams,
): Promise<Requirement<AuthorizationRequirementSignature>> => {
  const { authorized, chainId, nonce, isAuthorized = true } = params;

  if (viemClient.chain?.id !== chainId) {
    throw new ChainIdMismatchError(viemClient.chain?.id, chainId);
  }

  const deadline = params.deadline ?? Time.timestamp() + Time.s.from.h(2n);

  const action: AuthorizationAction = {
    type: "authorization",
    args: { authorized, isAuthorized, deadline },
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      const account = client.account;
      validateUserAddress(account?.address, userAddress);

      const typedData = getAuthorizationTypedData(
        { authorizer: userAddress, authorized, isAuthorized, nonce, deadline },
        chainId,
      );

      const signature = await signTypedData(client, {
        ...typedData,
        account,
      });

      const isValid = await verifyTypedData({
        ...typedData,
        address: userAddress, // Verify against the authorizer.
        signature,
      });

      if (!isValid) {
        throw new InvalidSignatureError();
      }

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
