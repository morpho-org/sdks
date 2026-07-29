import {
  type Address,
  ChainId,
  Eip5267Domain,
  Token,
} from "@morpho-org/blue-sdk";
import { randomAddress } from "@morpho-org/test";
import { zeroHash } from "viem";
import { describe, expect, test } from "vitest";
import {
  InvalidPermitDomainChainIdError,
  InvalidPermitDomainVerifyingContractError,
  UnsupportedPermitDomainExtensionsError,
} from "../src/error.js";
import { getPermitTypedData } from "../src/signatures/permit.js";

const owner = randomAddress();

const spender = randomAddress();

const permitArgs = (token: Token) => ({
  erc20: token,
  owner,
  spender,
  allowance: 1n,
  nonce: 0n,
  deadline: 1n,
});

const tokenWithDomain = ({
  address = randomAddress(),
  fields = "0x0f",
  chainId = BigInt(ChainId.EthMainnet),
  verifyingContract = address,
  extensions = [],
}: {
  address?: Address;
  fields?: `0x${string}`;
  chainId?: bigint;
  verifyingContract?: Address;
  extensions?: readonly bigint[];
} = {}) =>
  new Token({
    address,
    name: "Token",
    eip5267Domain: new Eip5267Domain({
      fields,
      name: "Token",
      version: "1",
      chainId,
      verifyingContract,
      salt: zeroHash,
      extensions,
    }),
  });

describe("getPermitTypedData", () => {
  test("uses fetched EIP-5267 domain when bound to the token and chain", () => {
    const token = tokenWithDomain();

    const typedData = getPermitTypedData(permitArgs(token), ChainId.EthMainnet);

    expect(typedData.domain).toStrictEqual({
      name: "Token",
      version: "1",
      chainId: ChainId.EthMainnet,
      verifyingContract: token.address,
    });
  });

  test("uses fallback permit v2 domain for known USDC regardless of address casing", () => {
    const worldChainUsdc =
      "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1" as Address;
    const token = new Token({
      address: worldChainUsdc,
      name: "USDC",
    });

    const typedData = getPermitTypedData(
      permitArgs(token),
      ChainId.WorldChainMainnet,
    );

    expect(typedData.domain).toStrictEqual({
      name: "USDC",
      version: "2",
      chainId: ChainId.WorldChainMainnet,
      verifyingContract: worldChainUsdc,
    });
  });

  test("throws when fetched EIP-5267 domain points to another token", () => {
    const token = tokenWithDomain();
    const verifyingContract = randomAddress();
    const tokenWithForeignDomain = tokenWithDomain({
      address: token.address,
      chainId: BigInt(ChainId.EthMainnet),
      verifyingContract,
    });

    expect(() =>
      getPermitTypedData(
        permitArgs(tokenWithForeignDomain),
        ChainId.EthMainnet,
      ),
    ).toThrow(
      new InvalidPermitDomainVerifyingContractError(
        token.address,
        verifyingContract,
      ),
    );
  });

  test("throws when fetched EIP-5267 domain points to another chain", () => {
    const token = tokenWithDomain({
      address: randomAddress(),
      chainId: BigInt(ChainId.PolygonMainnet),
    });

    expect(() =>
      getPermitTypedData(permitArgs(token), ChainId.EthMainnet),
    ).toThrow(
      new InvalidPermitDomainChainIdError(
        token.address,
        ChainId.EthMainnet,
        ChainId.PolygonMainnet,
      ),
    );
  });

  test("throws when fetched EIP-5267 domain does not bind to a token address", () => {
    const token = tokenWithDomain({
      address: randomAddress(),
      fields: "0x07",
    });

    expect(() =>
      getPermitTypedData(permitArgs(token), ChainId.EthMainnet),
    ).toThrow(
      new InvalidPermitDomainVerifyingContractError(token.address, undefined),
    );
  });

  test("throws when fetched EIP-5267 domain does not bind to a chain", () => {
    const token = tokenWithDomain({
      address: randomAddress(),
      fields: "0x0b",
    });

    expect(() =>
      getPermitTypedData(permitArgs(token), ChainId.EthMainnet),
    ).toThrow(
      new InvalidPermitDomainChainIdError(
        token.address,
        ChainId.EthMainnet,
        undefined,
      ),
    );
  });

  test("throws when fetched EIP-5267 domain advertises extensions", () => {
    const token = tokenWithDomain({ extensions: [5267n] });

    expect(() =>
      getPermitTypedData(permitArgs(token), ChainId.EthMainnet),
    ).toThrow(UnsupportedPermitDomainExtensionsError);
  });
});
