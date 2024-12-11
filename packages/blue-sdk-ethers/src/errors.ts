import type { Address } from "@morpho-org/blue-sdk";

export class InvalidSignatureError extends Error {
  constructor(
    public readonly hash: string,
    public readonly signer: Address,
    public readonly recovered: Address,
  ) {
    super(
      `invalid signature for hash ${hash}: expected ${signer}, recovered ${recovered}`,
    );
  }
}
