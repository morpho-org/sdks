import { describe, expect } from "vitest";
import { localTest, test, testTreehouseEth } from "./setup.js";

import {
  ChainId,
  Eip5267Domain,
  ExchangeRateWrappedToken,
  addressesRegistry,
} from "@morpho-org/blue-sdk";
import type { AnvilTestClient } from "@morpho-org/test";
import { randomAddress } from "@morpho-org/test";
import {
  encodeAbiParameters,
  getContractAddress,
  stringToHex,
  zeroAddress,
  zeroHash,
} from "viem";
import { Token } from "../src/augment/Token.js";
import {
  abi as getTokenTryCatchRegressionAbi,
  code as getTokenTryCatchRegressionCode,
} from "../src/queries/test/GetTokenTryCatchRegression.js";

const { mkr, usdc, stEth, wstEth } = addressesRegistry[ChainId.EthMainnet];

const encodeStringReturnData = (value: string) =>
  encodeAbiParameters([{ type: "string" }], [value]);

const encodeUint8ReturnData = (value: number) =>
  encodeAbiParameters([{ type: "uint8" }], [value]);

const encodeBytes32ReturnData = (value: string) =>
  encodeAbiParameters(
    [{ type: "bytes32" }],
    [stringToHex(value, { size: 32 })],
  );

const truncateLastWord = (value: `0x${string}`) =>
  `${value.slice(0, -64)}` as `0x${string}`;

const deployRawReturnToken = async (
  client: AnvilTestClient,
  harnessAddress: `0x${string}`,
  {
    nameReturnData = "0x",
    symbolReturnData = "0x",
    decimalsReturnData = "0x",
    eip5267DomainReturnData = "0x",
    revertName = false,
    revertSymbol = false,
    revertDecimals = false,
    revertEip5267Domain = false,
  }: {
    nameReturnData?: `0x${string}`;
    symbolReturnData?: `0x${string}`;
    decimalsReturnData?: `0x${string}`;
    eip5267DomainReturnData?: `0x${string}`;
    revertName?: boolean;
    revertSymbol?: boolean;
    revertDecimals?: boolean;
    revertEip5267Domain?: boolean;
  },
) => {
  const nonce = await client.getTransactionCount({ address: harnessAddress });

  await client.writeContract({
    address: harnessAddress,
    abi: getTokenTryCatchRegressionAbi,
    functionName: "deployRawReturnToken",
    args: [
      nameReturnData,
      symbolReturnData,
      decimalsReturnData,
      eip5267DomainReturnData,
      revertName,
      revertSymbol,
      revertDecimals,
      revertEip5267Domain,
    ],
  });

  return getContractAddress({ from: harnessAddress, nonce: BigInt(nonce) });
};

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

  test("should fetch invalid ERC20", async ({ client }) => {
    const expectedData = new Token({ address: randomAddress() });

    const value = await Token.fetch(expectedData.address, client);

    expect(value).toStrictEqual(expectedData);
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

  localTest(
    "should ignore malformed eip5267Domain returndata using deployless reads",
    async ({ client }) => {
      const { contractAddress: harnessAddress } =
        await client.deployContractWait({
          abi: getTokenTryCatchRegressionAbi,
          bytecode: getTokenTryCatchRegressionCode,
        });

      const malformedEip5267DomainReturnData = truncateLastWord(
        encodeAbiParameters(
          [
            { type: "bytes1" },
            { type: "string" },
            { type: "string" },
            { type: "uint256" },
            { type: "address" },
            { type: "bytes32" },
            { type: "uint256[]" },
          ],
          [
            "0x0f",
            "Malformed Domain Token",
            "1",
            1n,
            zeroAddress,
            zeroHash,
            [],
          ],
        ),
      );

      const tokenAddress = await deployRawReturnToken(client, harnessAddress, {
        nameReturnData: encodeStringReturnData("Malformed Domain Token"),
        symbolReturnData: encodeStringReturnData("MDT"),
        decimalsReturnData: encodeUint8ReturnData(18),
        eip5267DomainReturnData: malformedEip5267DomainReturnData,
      });

      const value = await Token.fetch(tokenAddress, client, {
        deployless: "force",
      });

      expect(value).toStrictEqual(
        new Token({
          address: tokenAddress,
          decimals: 18,
          symbol: "MDT",
          name: "Malformed Domain Token",
        }),
      );
    },
  );

  localTest(
    "should decode bytes32 name and symbol returndata using deployless reads",
    async ({ client }) => {
      const { contractAddress: harnessAddress } =
        await client.deployContractWait({
          abi: getTokenTryCatchRegressionAbi,
          bytecode: getTokenTryCatchRegressionCode,
        });

      const tokenAddress = await deployRawReturnToken(client, harnessAddress, {
        nameReturnData: encodeBytes32ReturnData("BYTES32_NAME"),
        symbolReturnData: encodeBytes32ReturnData("B32"),
        decimalsReturnData: encodeUint8ReturnData(18),
        revertEip5267Domain: true,
      });

      const value = await Token.fetch(tokenAddress, client, {
        deployless: "force",
      });

      expect(value).toStrictEqual(
        new Token({
          address: tokenAddress,
          decimals: 18,
          symbol: "B32",
          name: "BYTES32_NAME",
        }),
      );
    },
  );

  localTest(
    "should ignore invalid decimals returndata using deployless reads",
    async ({ client }) => {
      const { contractAddress: harnessAddress } =
        await client.deployContractWait({
          abi: getTokenTryCatchRegressionAbi,
          bytecode: getTokenTryCatchRegressionCode,
        });

      const tokenAddress = await deployRawReturnToken(client, harnessAddress, {
        nameReturnData: encodeStringReturnData("No Decimals Token"),
        symbolReturnData: encodeStringReturnData("NDT"),
        decimalsReturnData: encodeAbiParameters([{ type: "uint256" }], [256n]),
        revertEip5267Domain: true,
      });

      const value = await Token.fetch(tokenAddress, client, {
        deployless: "force",
      });

      expect(value).toStrictEqual(
        new Token({
          address: tokenAddress,
          symbol: "NDT",
          name: "No Decimals Token",
        }),
      );
    },
  );
});
