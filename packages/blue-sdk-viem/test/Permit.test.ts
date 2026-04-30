import { ChainId, Eip5267Domain, Token } from "@morpho-org/blue-sdk";
import { randomAddress } from "@morpho-org/test";
import { zeroHash } from "viem";
import { describe, expect, test } from "vitest";
import {
  InvalidPermitDomainChainIdError,
  InvalidPermitDomainVerifyingContractError,
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

const tokenWithDomain = (
  address = randomAddress(),
  fields: `0x${string}` = "0x0f",
  chainId = BigInt(ChainId.EthMainnet),
  verifyingContract = address,
) =>
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
      extensions: [],
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

  test("throws when fetched EIP-5267 domain points to another token", () => {
    const token = tokenWithDomain();
    const verifyingContract = randomAddress();
    const tokenWithForeignDomain = tokenWithDomain(
      token.address,
      "0x0f",
      BigInt(ChainId.EthMainnet),
      verifyingContract,
    );

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
    const token = tokenWithDomain(
      randomAddress(),
      "0x0f",
      BigInt(ChainId.PolygonMainnet),
    );

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
    const token = tokenWithDomain(randomAddress(), "0x07");

    expect(() =>
      getPermitTypedData(permitArgs(token), ChainId.EthMainnet),
    ).toThrow(
      new InvalidPermitDomainVerifyingContractError(token.address, undefined),
    );
  });

  test("throws when fetched EIP-5267 domain does not bind to a chain", () => {
    const token = tokenWithDomain(randomAddress(), "0x0b");

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
});
