import {
  addressesRegistry,
  ChainId,
  MathLib,
  Token,
} from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import { describe, expect, test } from "vitest";
import { getAuthorizationTypedData } from "./manager.js";
import { getDaiPermitTypedData, getPermitTypedData } from "./permit.js";
import {
  getPermit2PermitTypedData,
  getPermit2TransferFromTypedData,
} from "./permit2.js";

const OWNER: Address = "0x1111111111111111111111111111111111111111";
const SPENDER: Address = "0x2222222222222222222222222222222222222222";
const TOKEN: Address = "0x3333333333333333333333333333333333333333";

describe("getAuthorizationTypedData", () => {
  test("returns the Morpho authorization typed data", () => {
    const typedData = getAuthorizationTypedData(
      {
        authorizer: OWNER,
        authorized: SPENDER,
        isAuthorized: true,
        nonce: 1n,
        deadline: 2n,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.domain?.verifyingContract).toBe(
      addressesRegistry[ChainId.EthMainnet].morpho,
    );
    expect(typedData.message).toEqual({
      authorizer: OWNER,
      authorized: SPENDER,
      isAuthorized: true,
      nonce: 1n,
      deadline: 2n,
    });
    expect(typedData.primaryType).toBe("Authorization");
  });
});

describe("getPermitTypedData", () => {
  test("builds a default version 2 domain for USDC and EURC", () => {
    const { usdc, eurc } = addressesRegistry[ChainId.EthMainnet];

    for (const address of [usdc, eurc]) {
      const typedData = getPermitTypedData(
        {
          erc20: new Token({ address, name: "USD Coin" }),
          owner: OWNER,
          spender: SPENDER,
          allowance: 1n,
          nonce: 1n,
          deadline: 1n,
        },
        ChainId.EthMainnet,
      );

      expect(typedData.domain?.version).toBe("2");
      expect(typedData.domain?.verifyingContract).toBe(address);
    }
  });

  test("builds a default version 1 domain for other ERC20 tokens", () => {
    const typedData = getPermitTypedData(
      {
        erc20: new Token({ address: TOKEN, name: "Mock Token" }),
        owner: OWNER,
        spender: SPENDER,
        allowance: 1n,
        nonce: 1n,
        deadline: 1n,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.domain).toEqual({
      name: "Mock Token",
      version: "1",
      chainId: ChainId.EthMainnet,
      verifyingContract: TOKEN,
    });
  });
});

describe("getDaiPermitTypedData", () => {
  test("sets allowed true when allowance is positive", () => {
    const typedData = getDaiPermitTypedData(
      {
        owner: OWNER,
        spender: SPENDER,
        allowance: 1n,
        nonce: 2n,
        deadline: 3n,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.domain?.verifyingContract).toBe(
      addressesRegistry[ChainId.EthMainnet].dai,
    );
    expect(typedData.message).toEqual({
      holder: OWNER,
      spender: SPENDER,
      allowed: true,
      nonce: 2n,
      expiry: 3n,
    });
  });

  test("sets allowed false when allowance is zero", () => {
    const typedData = getDaiPermitTypedData(
      {
        owner: OWNER,
        spender: SPENDER,
        allowance: 0n,
        nonce: 2n,
        deadline: 3n,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.message.allowed).toBe(false);
  });
});

describe("getPermit2PermitTypedData", () => {
  test("clamps allowance and defaults expiration to MAX_UINT_48", () => {
    const typedData = getPermit2PermitTypedData(
      {
        erc20: TOKEN,
        allowance: MathLib.MAX_UINT_160 + 1n,
        nonce: 7,
        deadline: 8n,
        spender: SPENDER,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.domain?.verifyingContract).toBe(
      addressesRegistry[ChainId.EthMainnet].permit2,
    );
    expect(typedData.message.details).toEqual({
      token: TOKEN,
      amount: MathLib.MAX_UINT_160,
      expiration: MathLib.MAX_UINT_48,
      nonce: 7,
    });
  });

  test("preserves finite allowance and expiration", () => {
    const typedData = getPermit2PermitTypedData(
      {
        erc20: TOKEN,
        allowance: 10n,
        expiration: 11,
        nonce: 12,
        deadline: 13n,
        spender: SPENDER,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.message.details).toEqual({
      token: TOKEN,
      amount: 10n,
      expiration: 11n,
      nonce: 12,
    });
  });
});

describe("getPermit2TransferFromTypedData", () => {
  test("clamps transfer allowance to MAX_UINT_160", () => {
    const typedData = getPermit2TransferFromTypedData(
      {
        erc20: TOKEN,
        allowance: MathLib.MAX_UINT_160 + 1n,
        nonce: 14n,
        deadline: 15n,
        spender: SPENDER,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.message).toEqual({
      permitted: { token: TOKEN, amount: MathLib.MAX_UINT_160 },
      spender: SPENDER,
      nonce: 14n,
      deadline: 15n,
    });
  });
});
