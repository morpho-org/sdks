import { WalletAccountEvm } from "@tetherto/wdk-wallet-evm";
import {
  type Address,
  erc20Abi,
  type Hash,
  parseEther,
  parseUnits,
} from "viem";
import { describe, expect } from "vitest";
import MorphoProtocolEvm from "../../src/index.js";
import { test } from "./setup.js";

const SEED =
  "cook voyage document eight skate token alien guide drink uncle term abuse";
const USDT: Address = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_WHALE: Address = "0x28C6c06298d514Db089934071355E5743bf21d60";
const VAULT: Address = "0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11";
const DEPOSIT_AMOUNT = 1_000_000n;

const maybeDescribe = process.env.MAINNET_RPC_URL ? describe : describe.skip;

maybeDescribe("MorphoProtocolEvm fork e2e", () => {
  test("default", async ({ client }) => {
    const rpcUrl = client.transport.url!;
    const account = new WalletAccountEvm(SEED, "0'/0/0", { provider: rpcUrl });
    const accountAddress = (await account.getAddress()) as Address;
    let nextNonce = await client.getTransactionCount({
      address: accountAddress,
      blockTag: "pending",
    });
    const sendTransaction = account.sendTransaction.bind(account);
    // WDK caches pending nonces briefly, so rapid Anvil transactions provide them explicitly.
    account.sendTransaction = async (transaction) => {
      if (typeof transaction === "string") return sendTransaction(transaction);

      const result = await sendTransaction({
        ...transaction,
        nonce: nextNonce,
      });
      nextNonce += 1;
      return result;
    };

    await client.setBalance({
      address: accountAddress,
      value: parseEther("1000"),
    });
    await client.setBalance({
      address: USDT_WHALE,
      value: parseEther("1000"),
    });
    await client.impersonateAccount({ address: USDT_WHALE });
    try {
      const hash = await client.writeContract({
        account: USDT_WHALE,
        address: USDT,
        abi: erc20Abi,
        functionName: "transfer",
        args: [accountAddress, parseUnits("10", 6)],
      });
      await client.waitForTransactionReceipt({ hash });
    } finally {
      await client.stopImpersonatingAccount({ address: USDT_WHALE });
    }

    expect(
      await client.readContract({
        address: USDT,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [accountAddress],
      }),
    ).toBeGreaterThanOrEqual(DEPOSIT_AMOUNT);

    const morpho = new MorphoProtocolEvm(account, {
      chainId: 1,
      earnVaultAddress: VAULT,
    });
    const requirements = await morpho.getSupplyRequirements({
      token: USDT,
      amount: DEPOSIT_AMOUNT,
    });

    for (const requirement of requirements) {
      if ("to" in requirement) {
        const { hash } = await account.sendTransaction({
          to: requirement.to,
          value: requirement.value ?? 0n,
          data: requirement.data,
        });
        await client.waitForTransactionReceipt({ hash: hash as Hash });
      }
    }

    const result = await morpho.supply({
      token: USDT,
      amount: DEPOSIT_AMOUNT,
    });

    expect(result.hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    await client.waitForTransactionReceipt({ hash: result.hash as Hash });
  });
});
