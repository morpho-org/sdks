import { TypedDataDomain } from "ethers";

export interface SignatureData {
  domain: TypedDataDomain;
  types: Record<
    string,
    {
      name: string;
      type: string;
    }[]
  >;
  value: object;
}

export interface SignatureMessage {
  hash: string;
  data: SignatureData;
}
