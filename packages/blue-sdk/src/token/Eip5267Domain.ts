import type { Address } from "../types.js";

export const EIP_712_FIELDS = [
  "name",
  "version",
  "chainId",
  "verifyingContract",
  "salt",
] as const;

export type Eip712Field = (typeof EIP_712_FIELDS)[number];

export interface IEip5267Domain {
  fields: `0x${string}`;
  name: string;
  version: string;
  chainId: bigint;
  verifyingContract: Address;
  salt: `0x${string}`;
  extensions: readonly bigint[];
}

export class Eip5267Domain implements IEip5267Domain {
  /**
   * A bit map where bit i is set to 1 if and only if domain field i is present (0 ≤ i ≤ 4).
   * Bits are read from least significant to most significant, and fields are indexed in the order that is specified by EIP-712, identical to the order in which they are listed in the function type.
   */
  public readonly fields;

  /**
   * The user readable name of signing domain, i.e. the name of the DApp or the protocol.
   */
  public readonly name;

  /**
   * The current major version of the signing domain.
   * Signatures from different versions are not compatible.
   */
  public readonly version;

  /**
   * The EIP-155 chain id.
   */
  public readonly chainId;

  /**
   * The address of the contract that will verify the EIP-712 signature.
   */
  public readonly verifyingContract;

  /**
   * A disambiguating salt for the protocol.
   * This can be used as a domain separator of last resort.
   */
  public readonly salt;

  /**
   * A list of EIP numbers, each of which MUST refer to an EIP that extends EIP-712 with new domain fields, along with a method to obtain the value for those fields, and potentially conditions for inclusion.
   * The value of fields does not affect their inclusion.
   */
  public readonly extensions;

  public readonly eip712Domain;

  constructor({
    fields,
    name,
    version,
    chainId,
    verifyingContract,
    salt,
    extensions,
  }: IEip5267Domain) {
    this.fields = fields;
    this.name = name;
    this.version = version;
    this.chainId = chainId;
    this.verifyingContract = verifyingContract;
    this.salt = salt;
    this.extensions = extensions;

    this.eip712Domain = this.asEip712Domain();
  }

  private asEip712Domain() {
    const fields = BigInt(this.fields);

    return EIP_712_FIELDS.reduce<{
      [field in Eip712Field]?: Eip5267Domain[field];
    }>((acc, field, i) => {
      // @ts-expect-error Typescript doesn't infer value type based on field.
      if (fields & BigInt(i)) acc[field] = this[field];

      return acc;
    }, {});
  }
}
