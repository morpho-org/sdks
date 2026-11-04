import {
  addressesRegistry,
  ChainId,
  MathLib,
  Token,
} from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import { describe, expect, test } from "vitest";
import { Permit2ExpirationOutOfRangeError } from "../error.js";
import { getAuthorizationTypedData } from "./manager.js";
import { getPermitTypedData } from "./permit.js";
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
      addressesRegistry[ChainId.EthMainnet].blue,
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

describe("getPermit2PermitTypedData", () => {
  test("rejects an expiration above MAX_UINT_48", () => {
    expect(() =>
      getPermit2PermitTypedData(
        {
          erc20: TOKEN,
          allowance: 1n,
          expiration: Number(MathLib.MAX_UINT_48) + 1,
          nonce: 0,
          deadline: 1n,
          spender: SPENDER,
        },
        ChainId.EthMainnet,
      ),
    ).toThrow(Permit2ExpirationOutOfRangeError);
  });

  test.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid expiration %s",
    (expiration) => {
      expect(() =>
        getPermit2PermitTypedData(
          {
            erc20: TOKEN,
            allowance: 1n,
            expiration,
            nonce: 0,
            deadline: 1n,
            spender: SPENDER,
          },
          ChainId.EthMainnet,
        ),
      ).toThrow(Permit2ExpirationOutOfRangeError);
    },
  );

  test("accepts the maximum uint48 expiration", () => {
    const typedData = getPermit2PermitTypedData(
      {
        erc20: TOKEN,
        allowance: 1n,
        expiration: Number(MathLib.MAX_UINT_48),
        nonce: 0,
        deadline: 1n,
        spender: SPENDER,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.message.details).toEqual({
      token: TOKEN,
      amount: 1n,
      expiration: MathLib.MAX_UINT_48,
      nonce: 0,
    });
  });

  test("accepts a zero expiration", () => {
    const typedData = getPermit2PermitTypedData(
      {
        erc20: TOKEN,
        allowance: 1n,
        expiration: 0,
        nonce: 0,
        deadline: 1n,
        spender: SPENDER,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.message.details).toEqual({
      token: TOKEN,
      amount: 1n,
      expiration: 0n,
      nonce: 0,
    });
  });

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
  test("clamps transfer allowance to MAX_UINT_256", () => {
    const typedData = getPermit2TransferFromTypedData(
      {
        erc20: TOKEN,
        allowance: MathLib.MAX_UINT_256 + 1n,
        nonce: 14n,
        deadline: 15n,
        spender: SPENDER,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.message).toEqual({
      permitted: { token: TOKEN, amount: MathLib.MAX_UINT_256 },
      spender: SPENDER,
      nonce: 14n,
      deadline: 15n,
    });
  });
});
