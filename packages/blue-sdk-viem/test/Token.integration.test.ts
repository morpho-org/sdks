import {
  addressesRegistry,
  ChainId,
  Eip5267Domain,
  ExchangeRateWrappedToken,
  UnknownTokenError,
} from "@morpho-org/blue-sdk";
import { randomAddress } from "@morpho-org/test";
import { zeroHash } from "viem";
import { describe, expect } from "vitest";
import { expectMalformedMetadataFailure } from "../src/__test__/errors.js";
import { Token } from "../src/augment/Token.js";
import { MalformedTokenMetadataError } from "../src/error.js";
import { test, testTreehouseEth } from "./setup.js";

const { mkr, usdc, stEth, wstEth } = addressesRegistry[ChainId.EthMainnet];

describe("augment/Token", () => {
  test("should fetch token data", async ({ client }) => {
    const expectedData = new Token({
      address: usdc,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
    });

    const value = await Token.fetch(usdc, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch wrapped token data", async ({ client }) => {
    const expectedData = new ExchangeRateWrappedToken(
      {
        address: wstEth,
        decimals: 18,
        symbol: "wstETH",
        name: "Wrapped liquid staked Ether 2.0",
      },
      stEth,
      expect.any(BigInt),
    );

    const value = await Token.fetch(wstEth, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch MKR token data", async ({ client }) => {
    const expectedData = new Token({
      address: mkr,
      decimals: 18,
      symbol: "MKR",
      name: "Maker",
    });

    const value = await Token.fetch(mkr, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch MKR token data with multicall reads", async ({
    client,
  }) => {
    const expectedData = new Token({
      address: mkr,
      decimals: 18,
      symbol: "MKR",
      name: "Maker",
    });

    const value = await Token.fetch(mkr, client, { deployless: false });

    expect(value).toStrictEqual(expectedData);
  });

  test("should reject an invalid ERC20 with UnknownTokenError", async ({
    client,
  }) => {
    const address = randomAddress();

    await expect(Token.fetch(address, client)).rejects.toBeInstanceOf(
      UnknownTokenError,
    );
    await expect(
      Token.fetch(address, client, { deployless: false }),
    ).rejects.toBeInstanceOf(UnknownTokenError);
  });

  test("should fetch token data with eip5267Domain using deployless reads", async ({
    client,
  }) => {
    const steakUSDC = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
    const expectedData = new Token({
      address: steakUSDC,
      decimals: 18,
      symbol: "steakUSDC",
      name: "Steakhouse USDC",
      eip5267Domain: new Eip5267Domain({
        fields: "0x0f",
        name: "Steakhouse USDC",
        version: "1",
        chainId: 1n,
        verifyingContract: steakUSDC,
        salt: zeroHash,
        extensions: [],
      }),
    });

    const value = await Token.fetch(expectedData.address, client, {
      deployless: "force",
    });

    expect(value).toStrictEqual(expectedData);
  });

  // Bytecode that answers every call with 32 bytes `0x…12`: `decimals()`
  // reads 18, `name()`/`symbol()` decode as bytes32, and `eip712Domain()`
  // returns malformed data — so the deployless query reverts.
  test("should reject malformed metadata from the deployless query", async ({
    client,
  }) => {
    const address = randomAddress();
    const stateOverride = [
      { address, code: "0x601260005260206000f3" as `0x${string}` },
    ];

    const forceError = await Token.fetch(address, client, {
      deployless: "force",
      stateOverride,
    }).catch((failure: unknown) => failure);
    expectMalformedMetadataFailure(forceError, "eip712Domain");

    // Under `deployless: true` the query's `MalformedReturnData` result also
    // throws `MalformedTokenMetadataError` directly, with no fallback.
    const error = await Token.fetch(address, client, {
      deployless: true,
      stateOverride,
    }).catch((failure: unknown) => failure);
    expectMalformedMetadataFailure(error, "eip712Domain");
  });

  // Bytecode that reverts `eip712Domain()` and otherwise answers 64 bytes
  // `0x…12,0x12`: `decimals()` reads 18 while `name()`/`symbol()` return data
  // that is neither a valid string nor exactly 32 bytes, so the deployless
  // query reverts `MalformedReturnData` — on `name`, which it queries first.
  // The direct bytes32 retry rejects the same 64-byte returndata, so every
  // mode rejects — with `name` from the deployless query (which reads `name`
  // first), and with whichever of `name`/`symbol` the concurrent direct reads
  // reject on first.
  test("should reject malformed string metadata in every deployless mode", async ({
    client,
  }) => {
    const address = randomAddress();
    const stateOverride = [
      {
        address,
        code: "0x6384b0196e60003560e01c14601e576012600052601260205260406000f35b60006000fd" as `0x${string}`,
      },
    ];

    for (const deployless of ["force", true, false] as const) {
      const error = await Token.fetch(address, client, {
        deployless,
        stateOverride,
      }).catch((failure: unknown) => failure);
      expectMalformedMetadataFailure(error);
      if (error instanceof MalformedTokenMetadataError) {
        if (deployless === false)
          expect(["name", "symbol"]).toContain(error.field);
        else expect(error.field).toBe("name");
      }
    }
  });

  testTreehouseEth(
    "should fetch Treehouse ETH data with eip5267Domain using deployless reads",
    async ({ client }) => {
      const treehouseEth = "0xD11c452fc99cF405034ee446803b6F6c1F6d5ED8";
      const expectedData = new Token({
        address: treehouseEth,
        decimals: 18,
        symbol: "tETH",
        name: "Treehouse ETH",
        eip5267Domain: new Eip5267Domain({
          fields: "0x0f",
          name: "Treehouse ETH",
          version: "1",
          chainId: 1n,
          verifyingContract: treehouseEth,
          salt: zeroHash,
          extensions: [],
        }),
      });

      const value = await Token.fetch(expectedData.address, client, {
        deployless: "force",
      });

      expect(value).toStrictEqual(expectedData);
    },
  );
});
