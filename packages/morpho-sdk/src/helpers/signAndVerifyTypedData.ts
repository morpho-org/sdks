import type { Address, Hex, TypedDataDefinition, WalletClient } from "viem";
import { verifyTypedData } from "viem";
import { signTypedData } from "viem/actions";
import { InvalidSignatureError } from "../types/index.js";
import { validateChainId, validateUserAddress } from "./validate.js";

/**
 * Signs EIP-712 typed data with a wallet client, verifies that the produced signature recovers
 * `userAddress`, and returns the signature.
 *
 * Use inside requirement `sign(...)` callbacks before converting a signature
 * into protocol calldata or mempool payload bytes. The verification step keeps
 * wallet/account mismatches from reaching transaction builders.
 *
 * @param params - Signing and verification parameters.
 * @param params.client - Wallet client used to sign the typed data.
 * @param params.userAddress - Address expected to own the produced signature.
 * @param params.typedData - EIP-712 typed data to sign and verify.
 * @returns The verified EIP-712 signature.
 * @throws {MissingClientPropertyError} when the wallet client has no account address.
 * @throws {AddressMismatchError} when the wallet client account differs from `userAddress`.
 * @throws {ChainIdMismatchError} when the wallet client targets a different chain than the typed-data domain.
 * @throws {InvalidSignatureError} when the signature does not recover to `userAddress`.
 * @example
 * ```ts
 * import { signAndVerifyTypedData } from "@morpho-org/morpho-sdk";
 *
 * const signature = await signAndVerifyTypedData({
 *   client: walletClient,
 *   userAddress: maker,
 *   typedData: offerRootTypedData,
 * });
 * ```
 */
export const signAndVerifyTypedData = async (params: {
  readonly client: WalletClient;
  readonly userAddress: Address;
  readonly typedData: TypedDataDefinition<Record<string, unknown>, string>;
}): Promise<Hex> => {
  const { client, userAddress, typedData } = params;
  const account = client.account;
  validateUserAddress(account?.address, userAddress);
  const typedDataChainId = typedData.domain?.chainId;
  if (typedDataChainId != null) {
    validateChainId(client.chain?.id, Number(typedDataChainId));
  }

  const signature = await signTypedData(client, {
    ...typedData,
    account,
  });

  await verifyTypedDataSignature({ userAddress, typedData, signature });

  return signature;
};

/**
 * Verifies that an EIP-712 signature produced elsewhere (remote signer, hardware wallet) recovers
 * `userAddress` for `typedData`.
 *
 * Use inside requirement `withSignature(...)` callbacks so an externally produced signature goes
 * through the same recover-and-verify step as `sign()` before it reaches transaction builders.
 * Verification is offline ECDSA recovery: `userAddress` must be an EOA. ERC-1271 contract-wallet
 * signatures cannot be checked without an RPC client and are rejected.
 *
 * @param params - Verification parameters.
 * @param params.userAddress - EOA expected to own the signature.
 * @param params.typedData - EIP-712 typed data that was signed.
 * @param params.signature - Signature to verify.
 * @returns Resolves without a value once the signature is verified.
 * @throws {InvalidSignatureError} when the signature is malformed or does not recover to `userAddress`.
 * @example
 * ```ts
 * import { verifyTypedDataSignature } from "@morpho-org/morpho-sdk";
 *
 * await verifyTypedDataSignature({
 *   userAddress: owner,
 *   typedData: requirement.action.typedData,
 *   signature,
 * });
 * ```
 */
export const verifyTypedDataSignature = async (params: {
  readonly userAddress: Address;
  readonly typedData: TypedDataDefinition<Record<string, unknown>, string>;
  readonly signature: Hex;
}): Promise<void> => {
  const { userAddress, typedData, signature } = params;

  let isValid: boolean;
  try {
    isValid = await verifyTypedData({
      ...typedData,
      address: userAddress,
      signature,
    });
  } catch (cause) {
    throw new InvalidSignatureError(cause);
  }

  if (!isValid) {
    throw new InvalidSignatureError();
  }
};
