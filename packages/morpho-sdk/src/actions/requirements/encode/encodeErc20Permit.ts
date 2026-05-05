import type { Address } from "@morpho-org/blue-sdk";
import { fetchToken, getPermitTypedData } from "@morpho-org/blue-sdk-viem";
import { deepFreeze, Time } from "@morpho-org/morpho-ts";
import {
  type Client,
  type Transport,
  verifyTypedData,
  type WalletClient,
} from "viem";
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
 * @param viemClient - viem `Client` for the target chain. Built by the SDK from
 *   `MorphoClient.getViemClient(chainId)` for the entity, or by the integrator directly.
 * @param params - Permit encoding parameters.
 * @param params.token - ERC-20 token address (must support EIP-2612).
 * @param params.spender - Address that will be granted the permit allowance.
 * @param params.amount - Permit allowance amount.
 * @param params.chainId - Target chain id.
 * @param params.nonce - The user's current EIP-2612 nonce on `token`.
 * @param params.supportDeployless - Whether `fetchToken` should use deployless multicall.
 * @returns A `Requirement` whose `sign(walletClient, userAddress)` produces the deep-frozen
 *   signature.
 * @throws {ChainIdMismatchError} from `sign()` when `walletClient.chain?.id !== params.chainId`.
 * @throws {MissingClientPropertyError} from `sign()` when the wallet client has no account.
 * @throws {AddressMismatchError} from `sign()` when the wallet account differs from `userAddress`.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
 */
export const encodeErc20Permit = async (
  viemClient: Client<Transport>,
  params: EncodeErc20PermitParams,
): Promise<Requirement> => {
  const { token, spender, amount, chainId, nonce, supportDeployless } = params;

  const now = Time.timestamp();
  const deadline = now + Time.s.from.h(2n);

  const tokenData = await fetchToken(token, viemClient, {
    deployless: supportDeployless,
    chainId,
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
