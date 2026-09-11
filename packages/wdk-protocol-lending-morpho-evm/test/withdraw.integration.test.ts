import { getChainAddress } from "@morpho-org/blue-sdk";
import type { Erc2612RequirementSignature } from "@morpho-org/morpho-sdk";
import { WalletAccountEvm } from "@tetherto/wdk-wallet-evm";
import {
  WalletAccountEvmErc4337,
  WalletAccountReadOnlyEvmErc4337,
} from "@tetherto/wdk-wallet-evm-erc-4337";
import {
  type Address,
  createWalletClient,
  erc20Abi,
  type Hash,
  http,
  maxUint256,
  parseEther,
  parseUnits,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import MorphoProtocolEvm, {
  UnresolvedVaultWithdrawRequirementsError,
} from "../src/index.js";
import { test } from "./setup.js";

const SEED =
  "cook voyage document eight skate token alien guide drink uncle term abuse";
const VAULT = "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ASSETS = 1_000_000n;

describe.skipIf(!process.env.MAINNET_RPC_URL)(
  "prepared withdrawal quotes on a mainnet fork",
  () => {
    test.for([
      ["writable", 0n],
      ["readOnly", maxUint256],
    ] as const)(
      "behavior: resolves exact approvals for an ERC-4337 %s owner with signatures enabled",
      async ([accountType, initialAllowance], { client }) => {
        const config = {
          chainId: mainnet.id,
          provider: client.transport.url!,
          bundlerUrl: "https://bundler.example.com",
          safeModulesVersion: "0.3.0",
          isSponsored: false,
          useNativeCoins: true,
        } as const;
        const signer = mnemonicToAccount(SEED);
        const account =
          accountType === "writable"
            ? new WalletAccountEvmErc4337(SEED, "0'/0/0", config)
            : new WalletAccountReadOnlyEvmErc4337(signer.address, config);
        const owner = (await account.getAddress()) as Address;
        expect(owner).not.toBe(signer.address);
        const spender = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");
        // Impersonate the Safe to exercise real share allowances without an external AA bundler.
        await client.impersonateAccount({ address: owner });
        await client.setBalance({ address: owner, value: parseEther("10") });
        const resetHash = await client.writeContract({
          account: owner,
          address: VAULT,
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, initialAllowance],
        });
        expect(
          (await client.waitForTransactionReceipt({ hash: resetHash })).status,
        ).toBe("success");
        const morpho = new MorphoProtocolEvm(account, {
          chainId: mainnet.id,
          earnVaultAddress: VAULT,
          supportSignature: true,
        });
        const prepared = await morpho.prepareWithdraw({
          token: USDC,
          amount: ASSETS,
        });

        const requirements = await prepared.getRequirements();

        expect(requirements).toHaveLength(1);
        const requirement = requirements[0]!;
        expect(requirement).not.toHaveProperty("sign");
        if (!("to" in requirement))
          throw new Error("Expected a share approval");
        expect(requirement.to).toBe(VAULT);
        expect(requirement.action.args.spender).toBe(spender);
        expect(requirement.action.args.amount).toBeGreaterThan(0n);
        expect(requirement.action.args.amount).toBeLessThan(maxUint256);
        const hash = await client.sendTransaction({
          ...requirement,
          account: owner,
        });
        expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
          "success",
        );
        expect(await prepared.getRequirements()).toEqual([]);
        expect(
          await client.readContract({
            address: VAULT,
            abi: erc20Abi,
            functionName: "allowance",
            args: [owner, spender],
          }),
        ).toBe(requirement.action.args.amount);
      },
    );

    test.for(["approval", "oversizedApproval", "permit"] as const)(
      "behavior: quotes and submits with satisfied share requirements (%s)",
      async (route, { client }) => {
        const rpcUrl = client.transport.url!;
        const signer = mnemonicToAccount(SEED);
        const owner = signer.address;
        const walletClient = createWalletClient({
          account: signer,
          chain: mainnet,
          transport: http(rpcUrl),
        });
        const account = new WalletAccountEvm(SEED, "0'/0/0", {
          provider: rpcUrl,
        });
        expect(await account.getAddress()).toBe(owner);
        // The public test wallet has EIP-7702 delegation at the pinned block; use a plain EOA.
        await client.setCode({ address: owner, bytecode: "0x" });
        await client.setBalance({ address: owner, value: parseEther("10") });
        await client.deal({
          erc20: VAULT,
          account: owner,
          amount: parseUnits("1000", 18),
        });
        const spender = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");
        const initialAllowance =
          route === "oversizedApproval" ? maxUint256 : 0n;
        const resetHash = await walletClient.writeContract({
          address: VAULT,
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, initialAllowance],
        });
        expect(
          (await client.waitForTransactionReceipt({ hash: resetHash })).status,
        ).toBe("success");

        const morpho = new MorphoProtocolEvm(account, {
          chainId: mainnet.id,
          earnVaultAddress: VAULT,
          supportSignature: route === "permit",
        });
        const options = { token: USDC, amount: ASSETS };
        await expect(morpho.quoteWithdraw(options)).rejects.toBeInstanceOf(
          UnresolvedVaultWithdrawRequirementsError,
        );
        const prepared = await morpho.prepareWithdraw(options);
        await expect(prepared.quote()).rejects.toBeInstanceOf(
          UnresolvedVaultWithdrawRequirementsError,
        );
        const requirements = await prepared.getRequirements();
        expect(requirements).toHaveLength(1);
        const requirement = requirements[0]!;
        let signature: Erc2612RequirementSignature | undefined;
        if ("sign" in requirement) {
          expect(route).toBe("permit");
          signature = await requirement.sign(walletClient, owner);
        } else {
          expect(route).not.toBe("permit");
          const hash = await walletClient.sendTransaction(requirement);
          expect(
            (await client.waitForTransactionReceipt({ hash })).status,
          ).toBe("success");
          expect(await prepared.getRequirements()).toEqual([]);
        }

        const nonceBefore = await client.getTransactionCount({
          address: owner,
        });
        const assetsBefore = await client.readContract({
          address: USDC,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [owner],
        });
        const sharesBefore = await client.readContract({
          address: VAULT,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [owner],
        });
        const quote = await prepared.quote(signature);
        expect(quote.fee).toBeGreaterThan(0n);
        expect(await client.getTransactionCount({ address: owner })).toBe(
          nonceBefore,
        );
        // Estimation neither executes an approval nor consumes the permit.
        if (route === "permit") {
          expect(
            await client.readContract({
              address: VAULT,
              abi: erc20Abi,
              functionName: "allowance",
              args: [owner, spender],
            }),
          ).toBe(0n);
        }
        const result = await prepared.submit(signature);
        expect(
          (
            await client.waitForTransactionReceipt({
              hash: result.hash as Hash,
            })
          ).status,
        ).toBe("success");
        expect(
          await client.readContract({
            address: USDC,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [owner],
          }),
        ).toBe(assetsBefore + ASSETS);
        expect(
          await client.readContract({
            address: VAULT,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [owner],
          }),
        ).toBeLessThan(sharesBefore);
      },
    );
  },
);
