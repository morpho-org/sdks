import {
  ChainId,
  Eip5267Domain,
  Token,
  addressesRegistry,
} from "@morpho-org/blue-sdk";
import { type Address, zeroHash } from "viem";
import { describe, expect, it } from "vitest";
import { getPermitTypedData } from "../src/signatures/permit.js";

const { usdc } = addressesRegistry[ChainId.EthMainnet];
const owner = "0x0000000000000000000000000000000000000001" as Address;
const spender = "0x0000000000000000000000000000000000000002" as Address;
const baseArgs = {
  owner,
  spender,
  allowance: 1n,
  nonce: 0n,
  deadline: 0n,
};

describe("getPermitTypedData", () => {
  it("ignores EIP-5267 domain when chainId mismatches active chain", () => {
    const erc20 = new Token({
      address: usdc,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
      eip5267Domain: new Eip5267Domain({
        fields: "0x0f",
        name: "USD Coin",
        version: "2",
        chainId: BigInt(ChainId.BaseMainnet),
        verifyingContract: usdc,
        salt: zeroHash,
        extensions: [],
      }),
    });

    const { domain } = getPermitTypedData(
      { ...baseArgs, erc20 },
      ChainId.EthMainnet,
    );

    expect(domain?.chainId).toBe(ChainId.EthMainnet);
    expect(domain?.verifyingContract).toBe(usdc);
  });

  it("uses EIP-5267 domain when chainId matches active chain", () => {
    const erc20 = new Token({
      address: usdc,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
      eip5267Domain: new Eip5267Domain({
        fields: "0x0f",
        name: "USD Coin",
        version: "2",
        chainId: BigInt(ChainId.EthMainnet),
        verifyingContract: usdc,
        salt: zeroHash,
        extensions: [],
      }),
    });

    const { domain } = getPermitTypedData(
      { ...baseArgs, erc20 },
      ChainId.EthMainnet,
    );

    expect(domain?.chainId).toBe(ChainId.EthMainnet);
    expect(domain?.name).toBe("USD Coin");
    expect(domain?.version).toBe("2");
  });

  it("ignores EIP-5267 domain when chainId field is absent", () => {
    const erc20 = new Token({
      address: usdc,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
      eip5267Domain: new Eip5267Domain({
        fields: "0x0b",
        name: "USD Coin",
        version: "2",
        chainId: 0n,
        verifyingContract: usdc,
        salt: zeroHash,
        extensions: [],
      }),
    });

    const { domain } = getPermitTypedData(
      { ...baseArgs, erc20 },
      ChainId.EthMainnet,
    );

    expect(domain?.chainId).toBe(ChainId.EthMainnet);
  });
});
