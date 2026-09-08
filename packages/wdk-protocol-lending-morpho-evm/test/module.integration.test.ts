import { getChainAddress, getChainAddresses } from "@morpho-org/blue-sdk";
import {
  isPermitSignature,
  type PermitRequirementSignature,
} from "@morpho-org/morpho-sdk";
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
  test.for([
    "prepared",
    "legacyApproval",
    "legacyPermit2",
    "legacyPermit",
  ] as const)(
    "behavior: %s deposits with its matching requirements",
    async (route, { client }) => {
      const token =
        route === "legacyPermit" ? getChainAddress(1, "usdc") : USDT;
      const vault =
        route === "legacyPermit"
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
        supportSignature: route === "legacyPermit2" || route === "legacyPermit",
      });
      const options = { token, amount: DEPOSIT_AMOUNT };
      const prepared =
        route === "prepared" ? await morpho.prepareSupply(options) : undefined;
      const requirements = prepared
        ? await prepared.getRequirements()
        : await morpho.getSupplyRequirements(options, {
            useSimplePermit: route === "legacyPermit",
          });
      const signingAccount = mnemonicToAccount(SEED);
      expect(signingAccount.address).toBe(accountAddress);
      const walletClient = createWalletClient({
        account: signingAccount,
        chain: mainnet,
        transport: http(rpcUrl),
      });
      let requirementSignature: PermitRequirementSignature | undefined;

      for (const requirement of requirements) {
        if ("sign" in requirement) {
          expect(requirement.action.type).toBe(
            route === "legacyPermit" ? "permit" : "permit2",
          );
          const signature = await requirement.sign(
            walletClient,
            accountAddress,
          );
          if (!isPermitSignature(signature))
            throw new Error("Expected legacy permit");
          requirementSignature = signature;
        } else {
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

      if (route === "legacyPermit" || route === "legacyPermit2")
        expect(requirementSignature).toBeDefined();
      const result = prepared
        ? await prepared.submit()
        : await morpho.supply({ ...options, requirementSignature });

      expect(result.hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      const supplyReceipt = await client.waitForTransactionReceipt({
        hash: result.hash as Hash,
      });
      expect(supplyReceipt.status).toBe("success");
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
  test.for([
    { amount: 0n, nativeAmount: 10n ** 15n },
    { amount: 10n ** 15n, nativeAmount: 10n ** 15n },
  ])(
    "behavior: legacy native funding $amount + $nativeAmount mints vault shares",
    async ({ amount, nativeAmount }, { client }) => {
      const account = new WalletAccountEvm(SEED, "0'/0/0", {
        provider: client.transport.url!,
      });
      const owner = (await account.getAddress()) as Address;
      // Keep the public test wallet a plain EOA at the pinned block.
      await client.setCode({ address: owner, bytecode: "0x" });
      const token = getChainAddress(1, "wNative");
      const vault = "0xBb50A5341368751024ddf33385BA8cf61fE65FF9";
      let nonce = await client.getTransactionCount({ address: owner });
      const sendTransaction = account.sendTransaction.bind(account);
      account.sendTransaction = async (transaction) => {
        if (typeof transaction === "string")
          return sendTransaction(transaction);
        const result = await sendTransaction({ ...transaction, nonce });
        nonce += 1;
        return result;
      };
      await client.setBalance({ address: owner, value: parseEther("10") });
      if (amount > 0n) {
        // WETH's payable fallback wraps the ERC-20 portion before the mixed-funded deposit.
        const funding = await account.sendTransaction({
          to: token,
          value: amount,
          data: "0x",
        });
        expect(
          (
            await client.waitForTransactionReceipt({
              hash: funding.hash as Hash,
            })
          ).status,
        ).toBe("success");
      }
      const morpho = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: vault,
      });
      const options = { token, amount, nativeAmount };
      const requirements = await morpho.getSupplyRequirements(options);
      if (amount === 0n) expect(requirements).toEqual([]);
      for (const requirement of requirements) {
        if (!("to" in requirement)) throw new Error("Expected approval");
        expect(requirement.action.args.spender).toBe(
          getChainAddresses(1).bundler3.generalAdapter1,
        );
        expect(requirement.action.args.amount).toBe(amount);
        const approval = await account.sendTransaction(requirement);
        expect(
          (
            await client.waitForTransactionReceipt({
              hash: approval.hash as Hash,
            })
          ).status,
        ).toBe("success");
      }
      const sharesBefore = await client.readContract({
        address: vault,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      });
      const result = await morpho.supply(options);
      expect(
        (await client.waitForTransactionReceipt({ hash: result.hash as Hash }))
          .status,
      ).toBe("success");
      const sharesAfter = await client.readContract({
        address: vault,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      });
      expect(sharesAfter).toBeGreaterThan(sharesBefore);
      expect(
        await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [owner],
        }),
      ).toBe(0n);
    },
  );
});
