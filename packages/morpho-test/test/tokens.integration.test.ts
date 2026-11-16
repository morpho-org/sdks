import { addressesRegistry, ChainId } from "@morpho-org/blue-sdk";
import { erc2612Abi } from "@morpho-org/morpho-ts/abis";
import { getErpcForkUrl, testAccount } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  erc20Abi,
  isAddressEqual,
  maxUint256,
  parseAbi,
  parseSignature,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { withSimplePermit } from "../src/fixtures/tokens.js";

const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: 22_000_000,
});
const permitAbi = [
  ...erc2612Abi,
  ...parseAbi([
    "function version() view returns (string)",
    "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
    "function permit(address holder, address spender, uint256 nonce, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s)",
  ]),
] as const;
const spender = testAccount(1).address;
const { dai } = addressesRegistry[ChainId.EthMainnet];

describe("mainnet simple permit fixtures", () => {
  test.for([...withSimplePermit[ChainId.EthMainnet]!])(
    "%s accepts an ERC-2612 permit",
    async (token, { client }) => {
      const owner = client.account.address;
      let name = await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "name",
      });
      let version = "1";
      try {
        const domain = await client.readContract({
          address: token,
          abi: permitAbi,
          functionName: "eip712Domain",
        });
        name = domain[1];
        version = domain[2];
      } catch (error) {
        if (
          !(error instanceof BaseError) ||
          !error.walk(
            (cause) =>
              cause instanceof ContractFunctionRevertedError ||
              cause instanceof ContractFunctionZeroDataError,
          )
        )
          throw error;
        try {
          version = await client.readContract({
            address: token,
            abi: permitAbi,
            functionName: "version",
          });
        } catch (versionError) {
          if (
            !(versionError instanceof BaseError) ||
            !versionError.walk(
              (cause) =>
                cause instanceof ContractFunctionRevertedError ||
                cause instanceof ContractFunctionZeroDataError,
            )
          )
            throw versionError;
        }
      }
      const nonce = await client.readContract({
        address: token,
        abi: permitAbi,
        functionName: "nonces",
        args: [owner],
      });
      const value = 123n;
      const deadline = maxUint256;
      const signature = parseSignature(
        await client.signTypedData({
          domain: {
            name,
            version,
            chainId: mainnet.id,
            verifyingContract: token,
          },
          types: {
            Permit: [
              { name: "owner", type: "address" },
              { name: "spender", type: "address" },
              { name: "value", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          primaryType: "Permit",
          message: { owner, spender, value, nonce, deadline },
        }),
      );
      const hash = await client.writeContract({
        address: token,
        abi: permitAbi,
        functionName: "permit",
        args: [
          owner,
          spender,
          value,
          deadline,
          Number(signature.v),
          signature.r,
          signature.s,
        ],
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe("success");
      expect(
        await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [owner, spender],
        }),
      ).toBe(value);
    },
  );

  test("DAI accepts its legacy permit", async ({ client }) => {
    const holder = client.account.address;
    const nonce = await client.readContract({
      address: dai,
      abi: permitAbi,
      functionName: "nonces",
      args: [holder],
    });
    const expiry = maxUint256;
    const signature = parseSignature(
      await client.signTypedData({
        domain: {
          name: "Dai Stablecoin",
          version: "1",
          chainId: mainnet.id,
          verifyingContract: dai,
        },
        types: {
          Permit: [
            { name: "holder", type: "address" },
            { name: "spender", type: "address" },
            { name: "nonce", type: "uint256" },
            { name: "expiry", type: "uint256" },
            { name: "allowed", type: "bool" },
          ],
        },
        primaryType: "Permit",
        message: { holder, spender, nonce, expiry, allowed: true },
      }),
    );
    const hash = await client.writeContract({
      address: dai,
      abi: permitAbi,
      functionName: "permit",
      args: [
        holder,
        spender,
        nonce,
        expiry,
        true,
        Number(signature.v),
        signature.r,
        signature.s,
      ],
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
    expect(
      await client.readContract({
        address: dai,
        abi: erc20Abi,
        functionName: "allowance",
        args: [holder, spender],
      }),
    ).toBe(maxUint256);
  });

  test("DAI is excluded from the ERC-2612 set", () => {
    expect(
      [...withSimplePermit[ChainId.EthMainnet]!].some((token) =>
        isAddressEqual(token, dai),
      ),
    ).toBe(false);
  });
});
