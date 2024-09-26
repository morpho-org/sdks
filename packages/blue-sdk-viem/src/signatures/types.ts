import { TypedDataDomain } from "ethers";
import { HashTypedDataParameters, Hex } from "viem";

export interface SignatureData {
  domain: TypedDataDomain;
  types: Record<
    string,
    {
      name: string;
      type: string;
    }[]
  >;
  message: Record<string, any>;
  primaryType: string;
}

export interface SignatureMessage {
  hash: Hex;
  data: HashTypedDataParameters;
}
