import { describe, expect } from "vitest";
import { test, test2 } from "./setup";

import {
  ChainId,
  Eip5267Domain,
  type MarketId,
  addressesRegistry,
} from "@morpho-org/blue-sdk";

import { vaults } from "@morpho-org/morpho-test";
import { zeroAddress, zeroHash } from "viem";
import { Vault } from "../../src/augment/Vault";
import { metaMorphoAbi, publicAllocatorAbi } from "./abis";

const { steakUsdc, steakPaxg } = vaults[ChainId.EthMainnet];

describe("augment/Vault", () => {
  test("should fetch vault data", async ({ client, wallet }) => {
    const owner = await client.readContract({
      address: steakUsdc.address,
      abi: metaMorphoAbi,
      functionName: "owner",
    });

    await client.setBalance({ address: owner, value: BigInt(1e18) });
    await client.writeContract({
      account: owner,
      address: steakUsdc.address,
      abi: metaMorphoAbi,
      functionName: "setIsAllocator",
      args: [addressesRegistry[ChainId.EthMainnet].publicAllocator, true],
    });
    await client.writeContract({
      account: owner,
      address: addressesRegistry[ChainId.EthMainnet].publicAllocator,
      abi: publicAllocatorAbi,
      functionName: "setFee",
      args: [steakUsdc.address, 1n],
    });

    const expectedData = new Vault({
      ...steakUsdc,
      curator: zeroAddress,
      fee: 50000000000000000n,
      feeRecipient: "0x255c7705e8BB334DfCae438197f7C4297988085a",
      guardian: "0xCF0FE65E39C776D2d6Eb420364A5df776c9cFf5f",
      owner: "0x255c7705e8BB334DfCae438197f7C4297988085a",
      pendingGuardian: {
        validAt: 0n,
        value: zeroAddress,
      },
      pendingOwner: zeroAddress,
      pendingTimelock: {
        validAt: 0n,
        value: 0n,
      },
      skimRecipient: zeroAddress,
      publicAllocatorConfig: {
        admin: zeroAddress,
        fee: 1n,
        accruedFee: 0n,
      },
      supplyQueue: [
        "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc" as MarketId,
        "0x54efdee08e272e929034a8f26f7ca34b1ebe364b275391169b28c6d7db24dbc8" as MarketId,
      ],
      timelock: 604800n,
      withdrawQueue: [
        "0x54efdee08e272e929034a8f26f7ca34b1ebe364b275391169b28c6d7db24dbc8" as MarketId,
        "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc" as MarketId,
        "0x495130878b7d2f1391e21589a8bcaef22cbc7e1fbbd6866127193b3cc239d8b1" as MarketId,
        "0x06f2842602373d247c4934f7656e513955ccc4c377f0febc0d9ca2c3bcc191b1" as MarketId,
        "0x3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49" as MarketId,
      ],
      lastTotalAssets: 26129569140552n,
      totalAssets: 26138940196162n,
      totalSupply: 25752992371062043744406063n,
      eip5267Domain: new Eip5267Domain({
        fields: "0x0f",
        name: "Steakhouse USDC",
        version: "1",
        chainId: 1n,
        verifyingContract: steakUsdc.address,
        salt: zeroHash,
        extensions: [],
      }),
    });

    const value = await Vault.fetch(steakUsdc.address, wallet);

    expect(value).toEqual(expectedData);
  });

  test2("should fetch vault v1.1 data", async ({ wallet }) => {
    const expectedData = new Vault({
      ...steakPaxg,
      curator: zeroAddress,
      fee: 50000000000000000n,
      feeRecipient: "0x255c7705e8BB334DfCae438197f7C4297988085a",
      guardian: "0x5148Db8942C69A431167C1B7FA7590c15DF934f1",
      owner: "0x0A0e559bc3b0950a7e448F0d4894db195b9cf8DD",
      pendingGuardian: {
        validAt: 0n,
        value: zeroAddress,
      },
      pendingOwner: zeroAddress,
      pendingTimelock: {
        validAt: 0n,
        value: 0n,
      },
      skimRecipient: zeroAddress,
      publicAllocatorConfig: {
        admin: "0xfeed46c11F57B7126a773EeC6ae9cA7aE1C03C9a",
        fee: 0n,
        accruedFee: 0n,
      },
      supplyQueue: [
        "0xb1963517b52c4315a4ed5f6811aee279ab7adc90d9dfbd8f187e05f2758f4d1a" as MarketId,
      ],
      timelock: 604800n,
      withdrawQueue: [
        "0xb1963517b52c4315a4ed5f6811aee279ab7adc90d9dfbd8f187e05f2758f4d1a" as MarketId,
      ],
      lastTotalAssets: 206000400000000000000n,
      lostAssets: 0n,
      totalAssets: 206000400000000000000n,
      totalSupply: 206000400000000000000n,
      eip5267Domain: new Eip5267Domain({
        fields: "0x0f",
        name: "",
        version: "1",
        chainId: 1n,
        verifyingContract: steakPaxg.address,
        salt: zeroHash,
        extensions: [],
      }),
    });

    const value = await Vault.fetch(steakPaxg.address, wallet);

    expect(value).toEqual(expectedData);
  });
});
