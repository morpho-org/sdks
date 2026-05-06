import type { Address } from "@morpho-org/blue-sdk";
import { fetchToken, getPermitTypedData } from "@morpho-org/blue-sdk-viem";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import { type PublicClient, verifyTypedData, type WalletClient } from "viem";
import { signTypedData } from "viem/actions";
import {
  validateChainId,
  validateUserAddress,
} from "../../../helpers/index.js";
import {
  InvalidSignatureError,
  MissingClientPropertyError,
  type PermitAction,
  type Requirement,
} from "../../../types/index.js";

/** Parameters for {@link encodeErc20Permit}. */
interface EncodeErc20PermitParams {
  token: Address;
  spender: Address;
  amount: bigint;
  chainId: number;
  nonce: bigint;
  supportDeployless?: boolean;
}

/**
 * Builds an EIP-2612 permit `Requirement` that, once signed, lets `spender` pull `amount` of
 * `token`.
 *
 * Reads token metadata via `fetchToken`. The returned `Requirement.sign()` produces the EIP-712
 * signature, verifies it against the connected account, and returns a `RequirementSignature`
 * the bundler action helpers can consume. Deadline defaults to two hours from `Time.timestamp()`.
 *
 * @param viemClient - Connected `PublicClient` whose `chain.id` matches `params.chainId`.
 * @param params - Permit encoding parameters.
 * @param params.token - ERC-20 token address (must support EIP-2612).
 * @param params.spender - Address that will be granted the permit allowance.
 * @param params.amount - Permit allowance amount.
 * @param params.chainId - Target chain id.
 * @param params.nonce - The user's current EIP-2612 nonce on `token`.
 * @param params.supportDeployless - Whether `fetchToken` should use deployless multicall.
 * @returns A `Requirement` whose `sign(client, userAddress)` produces the deep-frozen signature.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`, or from `sign()` when the wallet client's `chain.id` differs.
 * @throws {AddressMismatchError} from `sign()` when the client account differs from `userAddress`.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
 * @example
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { encodeErc20Permit } from "@morpho-org/morpho-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const requirement = await encodeErc20Permit(client, {
 *   token: USDC, // L1 mainnet USDC. Bridged USDC.e on L2s often does not implement EIP-2612 — query token metadata before signing on other chains. DAI uses a non-standard permit signature.
 *   spender: generalAdapter1,
 *   amount: 1_000_000n,
 *   chainId: 1,
 *   nonce: 0n,
 * });
 * // requirement satisfies Requirement
 * ```
 */
export const encodeErc20Permit = async (
  viemClient: PublicClient,
  params: EncodeErc20PermitParams,
): Promise<Requirement> => {
  const { token, spender, amount, chainId, nonce, supportDeployless } = params;

  validateChainId(viemClient.chain?.id, chainId);

  const now = Time.timestamp();
  const deadline = now + Time.s.from.h(2n);

  const tokenData = await fetchToken(token, viemClient, {
    deployless: supportDeployless,
  });

  const action: PermitAction = {
    type: "permit",
    args: {
      spender,
      amount,
      deadline,
    },
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      validateChainId(client.chain?.id, chainId);
      if (!client.account)
        throw new MissingClientPropertyError("client.account");
      validateUserAddress(client.account.address, userAddress);
      const account = client.account;

      const typedData = getPermitTypedData(
        {
          erc20: tokenData,
          owner: userAddress,
          spender,
          allowance: amount,
          nonce,
          deadline,
        },
        chainId,
      );

      const signature = await signTypedData(client, {
        ...typedData,
        account,
      });

      const isValid = await verifyTypedData({
        ...typedData,
        address: userAddress, // Verify against the permit's owner.
        signature,
      });

      if (!isValid) {
        throw new InvalidSignatureError();
      }

      return deepFreeze({
        args: {
          owner: userAddress,
          signature,
          deadline,
          amount,
          asset: token,
          nonce,
        },
        action,
      });
    },
  };
};
