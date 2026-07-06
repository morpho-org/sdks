import type { Address, Hex, TypedDataDefinition, WalletClient } from "viem";
import { verifyTypedData } from "viem";
import { signTypedData } from "viem/actions";
import { validateUserAddress } from "../../helpers/validate.js";
import { InvalidSignatureError } from "../../types/index.js";

type SignAndVerifyTypedDataDefinition = TypedDataDefinition<
  Record<string, unknown>,
  string
>;

/**
 * @internal
 * Signs typed data with `client`, verifies the signature against `userAddress`, and returns it.
 */
export const signAndVerifyTypedData = async (params: {
  readonly client: WalletClient;
  readonly userAddress: Address;
  readonly typedData: SignAndVerifyTypedDataDefinition;
}): Promise<Hex> => {
  const { client, userAddress, typedData } = params;
  const account = client.account;
  validateUserAddress(account?.address, userAddress);

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
