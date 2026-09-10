import { getChainAddress } from "@morpho-org/blue-sdk";
import type { BundlesTokenRequirementSignature } from "@morpho-org/morpho-sdk";
import { WalletAccountEvm } from "@tetherto/wdk-wallet-evm";
import {
  type Address,
  createWalletClient,
  erc20Abi,
  type Hash,
  http,
  parseEther,
  parseUnits,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import MorphoProtocolEvm from "../src/index.js";
import { test } from "./setup.js";

const SEED =
  "cook voyage document eight skate token alien guide drink uncle term abuse";
const USDT: Address = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_WHALE: Address = "0x28C6c06298d514Db089934071355E5743bf21d60";
const VAULT: Address = "0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11";
const DEPOSIT_AMOUNT = 1_000_000n;

const maybeDescribe = process.env.MAINNET_RPC_URL ? describe : describe.skip;

maybeDescribe("MorphoProtocolEvm fork e2e", () => {
  test.for(["approval", "permit2", "permit"] as const)(
    "behavior: %s deposits with its matching requirements",
    async (route, { client }) => {
      const token = route === "permit" ? getChainAddress(1, "usdc") : USDT;
      const vault =
        route === "permit"
          ? "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145"
          : VAULT;

      const rpcUrl = client.transport.url!;
      const account = new WalletAccountEvm(SEED, "0'/0/0", {
        provider: rpcUrl,
      });
      const accountAddress = (await account.getAddress()) as Address;
      // This public test wallet has EIP-7702 delegation at the pinned block; exercise plain EOA permits.
      await client.setCode({ address: accountAddress, bytecode: "0x" });
      let nextNonce = await client.getTransactionCount({
        address: accountAddress,
        blockTag: "pending",
      });
      const sendTransaction = account.sendTransaction.bind(account);
      // WDK caches pending nonces briefly, so rapid Anvil transactions provide them explicitly.
      account.sendTransaction = async (transaction) => {
        if (typeof transaction === "string")
          return sendTransaction(transaction);

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
          address: token,
          abi: erc20Abi,
          functionName: "transfer",
          args: [accountAddress, parseUnits("10", 6)],
        });
        const fundingReceipt = await client.waitForTransactionReceipt({ hash });
        expect(fundingReceipt.status).toBe("success");
      } finally {
        await client.stopImpersonatingAccount({ address: USDT_WHALE });
      }

      expect(
        await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [accountAddress],
        }),
      ).toBeGreaterThanOrEqual(DEPOSIT_AMOUNT);
      const sharesBefore = await client.readContract({
        address: vault,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [accountAddress],
      });

      const morpho = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: vault,
        supportSignature: route === "permit2" || route === "permit",
      });
      const options = { token, amount: DEPOSIT_AMOUNT };
      const prepared = await morpho.prepareSupply(options);
      const requirements = await prepared.getRequirements({
        useSimplePermit: route === "permit",
        permit2Nonce: 42n,
      });
      const signingAccount = mnemonicToAccount(SEED);
      expect(signingAccount.address).toBe(accountAddress);
      const walletClient = createWalletClient({
        account: signingAccount,
        chain: mainnet,
        transport: http(rpcUrl),
      });
      let requirementSignature: BundlesTokenRequirementSignature | undefined;

      for (const requirement of requirements) {
        if ("sign" in requirement) {
          expect(requirement.action.type).toBe(
            route === "permit" ? "permit" : "permit2SignatureTransfer",
          );
          expect(requirement.action.args.spender).toBe(
            getChainAddress(1, "bundles.vaultBundlesV1"),
          );
          requirementSignature = await requirement.sign(
            walletClient,
            accountAddress,
          );
        } else {
          expect(requirement.action.args.spender).toBe(
            route === "permit2"
              ? getChainAddress(1, "permit2")
              : getChainAddress(1, "bundles.vaultBundlesV1"),
          );
          const { hash } = await account.sendTransaction({
            to: requirement.to,
            value: requirement.value ?? 0n,
            data: requirement.data,
          });
          const requirementReceipt = await client.waitForTransactionReceipt({
            hash: hash as Hash,
          });
          expect(requirementReceipt.status).toBe("success");
        }
      }

      if (route === "permit" || route === "permit2")
        expect(requirementSignature).toBeDefined();
      const result =
        route === "approval"
          ? await morpho.supply(options)
          : await prepared.submit(requirementSignature);

      expect(result.hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      const supplyReceipt = await client.waitForTransactionReceipt({
        hash: result.hash as Hash,
      });
      expect(supplyReceipt.status).toBe("success");
      expect(supplyReceipt.to?.toLowerCase()).toBe(
        getChainAddress(1, "bundles.vaultBundlesV1").toLowerCase(),
      );
      expect(
        await client.readContract({
          address: vault,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [accountAddress],
        }),
      ).toBeGreaterThan(sharesBefore);
    },
  );
  test("behavior: native funding mints vault shares through VaultBundlesV1", async ({
    client,
  }) => {
    const account = new WalletAccountEvm(SEED, "0'/0/0", {
      provider: client.transport.url!,
    });
    const owner = (await account.getAddress()) as Address;
    // Keep the public test wallet a plain EOA at the pinned block.
    await client.setCode({ address: owner, bytecode: "0x" });
    await client.setBalance({ address: owner, value: parseEther("10") });
    const token = getChainAddress(1, "wNative");
    const vault = "0xBb50A5341368751024ddf33385BA8cf61fE65FF9";
    const morpho = new MorphoProtocolEvm(account, {
      chainId: 1,
      earnVaultAddress: vault,
    });
    const prepared = await morpho.prepareSupply({
      token,
      nativeAmount: 10n ** 15n,
    });
    expect(await prepared.getRequirements()).toEqual([]);
    const sharesBefore = await client.readContract({
      address: vault,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    });
    const result = await prepared.submit();
    const receipt = await client.waitForTransactionReceipt({
      hash: result.hash as Hash,
    });
    expect(receipt.status).toBe("success");
    expect(receipt.to?.toLowerCase()).toBe(
      getChainAddress(1, "bundles.vaultBundlesV1").toLowerCase(),
    );
    const sharesAfter = await client.readContract({
      address: vault,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    });
    expect(sharesAfter).toBeGreaterThan(sharesBefore);
  });
});
