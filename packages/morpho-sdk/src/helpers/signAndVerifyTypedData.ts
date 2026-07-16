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

  const isValid = await verifyTypedData({
    ...typedData,
    address: userAddress,
    signature,
  });

  if (!isValid) {
    throw new InvalidSignatureError();
  }

  return signature;
};
