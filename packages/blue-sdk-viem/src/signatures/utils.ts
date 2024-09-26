import { Address, InvalidSignatureError } from "@morpho-org/blue-sdk";

import { Hex, Signature, recoverAddress, zeroAddress } from "viem";

export async function verifySignature(
  signature: Signature,
  hash: Hex,
  signerAddress: Address,
) {
  const recoveredAddress = await recoverAddress({ hash, signature });

  if (recoveredAddress === zeroAddress || recoveredAddress !== signerAddress)
    throw new InvalidSignatureError(hash, signerAddress, recoveredAddress);
}
