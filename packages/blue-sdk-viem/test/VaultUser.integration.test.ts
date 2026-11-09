import { ChainId, VaultUser } from "@morpho-org/blue-sdk";
import { vaults } from "@morpho-org/morpho-test";
import { testAccount } from "@morpho-org/test";
import { erc20Abi, parseEther } from "viem";
import { readContract } from "viem/actions";
import { describe, expect } from "vitest";
import { fetchVaultUser, metaMorphoAbi } from "../src/index.js";
import { test } from "./setup.js";

const vault = vaults[ChainId.EthMainnet].steakUsdc.address;

describe("fetchVaultUser", () => {
  for (const isAllocator of [false, true]) {
    for (const allowance of [0n, 123_456n]) {
      test(`allocator=${isAllocator}, underlying allowance=${allowance}`, async ({
        client,
      }) => {
        const user = testAccount(isAllocator ? 1 : 2).address;
        const owner = await readContract(client, {
          address: vault,
          abi: metaMorphoAbi,
          functionName: "owner",
        });
        const asset = await readContract(client, {
          address: vault,
          abi: metaMorphoAbi,
          functionName: "asset",
        });
        await client.setBalance({ address: owner, value: parseEther("1") });
        await client.setBalance({ address: user, value: parseEther("1") });
        if (isAllocator) {
          const allocatorUpdate = await client.writeContract({
            account: owner,
            address: vault,
            abi: metaMorphoAbi,
            functionName: "setIsAllocator",
            args: [user, true],
          });
          await client.waitForTransactionReceipt({ hash: allocatorUpdate });
        }
        const approval = await client.approve({
          account: user,
          address: asset,
          args: [vault, allowance],
        });
        await client.waitForTransactionReceipt({ hash: approval });

        const expectedAllocator = await readContract(client, {
          address: vault,
          abi: metaMorphoAbi,
          functionName: "isAllocator",
          args: [user],
        });
        const expectedAllowance = await readContract(client, {
          address: asset,
          abi: erc20Abi,
          functionName: "allowance",
          args: [user, vault],
        });
        expect(expectedAllocator).toBe(isAllocator);
        expect(expectedAllowance).toBe(allowance);
        const expected = new VaultUser({
          vault,
          user,
          isAllocator: expectedAllocator,
          allowance: expectedAllowance,
        });

        const forced = await fetchVaultUser(vault, user, client, {
          deployless: "force",
        });
        const direct = await fetchVaultUser(vault, user, client, {
          deployless: false,
        });
        expect(forced).toStrictEqual(expected);
        expect(direct).toStrictEqual(expected);
        expect(direct).toStrictEqual(forced);
      });
    }
  }
});
