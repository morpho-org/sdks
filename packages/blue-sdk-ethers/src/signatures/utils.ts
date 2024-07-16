import {
  Signature,
  Signer,
  TypedDataDomain,
  TypedDataEncoder,
  TypedDataField,
  ZeroAddress,
  recoverAddress,
} from "ethers";

import { Address, InvalidSignatureError } from "@morpho-org/blue-sdk";

import { SignatureMessage } from "./types";

export async function safeSignTypedData(
  signer: Signer,
  domain: TypedDataDomain,
  types: Record<string, TypedDataField[]>,
  value: Record<string, any>,
) {
  const populated = await TypedDataEncoder.resolveNames(
    domain,
    types,
    value,
    (name: string) => {
      return signer.resolveName(name) as Promise<string>;
    },
  );

  // Fix the chainId parsing issue
  // Tracking of https://github.com/ethers-io/ethers.js/issues/4649
  const initialPayload = TypedDataEncoder.getPayload(
    populated.domain,
    types,
    populated.value,
  );
  const provider = signer.provider;
  const unsafeChainId = Number(initialPayload.domain.chainId);

  if (provider && "send" in provider && Number.isSafeInteger(unsafeChainId)) {
    const correctedPayload = {
      ...initialPayload,
      domain: {
        ...initialPayload.domain,
        chainId: unsafeChainId, // that is safe now
      },
    };

    try {
      return Signature.from(
        // @ts-ignore if send is defined in the provider, it accepts raw RPC call args
        await signer.provider!.send("eth_signTypedData_v4", [
          // Doing the same thing that inside of the signTypedData function.
          await signer.getAddress().then((r) => r.toLowerCase()),
          JSON.stringify(correctedPayload),
        ]),
      );
    } catch (e: any) {
      if ("reason" in e && e.reason === "rejected") throw e;
    }
  }

  return Signature.from(
    await signer.signTypedData(populated.domain, types, populated.value),
  );
}

export function verifySignature(
  signature: Signature,
  hash: string,
  signerAddress: Address,
) {
  const recoveredAddress = recoverAddress(hash, signature);

  if (recoveredAddress === ZeroAddress || recoveredAddress !== signerAddress)
    throw new InvalidSignatureError(hash, signerAddress, recoveredAddress);
}

export function getMessage(
  domain: TypedDataDomain,
  types: Record<string, TypedDataField[]>,
  value: Record<string, any>,
): SignatureMessage {
  const hash = TypedDataEncoder.hash(domain, types, value);

  return { data: { domain, types, value }, hash };
}
