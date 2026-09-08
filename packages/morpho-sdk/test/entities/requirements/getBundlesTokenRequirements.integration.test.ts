import { addressesRegistry } from "@morpho-org/blue-sdk";
import { erc2612Abi, permit2Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createViemTest } from "@morpho-org/test/vitest";
import { erc20Abi, maxUint256, parseSignature } from "viem";
import { mainnet } from "viem/chains";
import { assert, describe, expect } from "vitest";
import {
  getBundlesTokenRequirements,
  isRequirementApproval,
  isRequirementSignature,
  Permit2SignatureTransferNonceAlreadyUsedError,
} from "../../../src/index.js";

const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL,
  forkBlockNumber: 25_832_676n,
  stepsTracing: false,
});
const { usdc } = addressesRegistry[mainnet.id];
const permit2 = getChainAddress(mainnet.id, "permit2");

describe.each(["blueBundlesV1", "vaultBundlesV1"] as const)(
  "getBundlesTokenRequirements: %s",
  (deployment) => {
    const spender = getChainAddress(mainnet.id, `bundles.${deployment}`);
    const params = {
      token: usdc,
      spender,
      chainId: mainnet.id,
      amount: 1_000_000n,
      deadline: maxUint256,
    } as const;

    test("default: approves the registered spender and skips a covered pull", async ({
      client,
    }) => {
      await client.approve({ address: usdc, args: [spender, 0n] });
      const request = {
        ...params,
        owner: client.account.address,
        supportSignature: false,
      };
      const requirements = await getBundlesTokenRequirements(client, request);
      expect(requirements).toHaveLength(1);
      const [approval] = requirements;
      assert(isRequirementApproval(approval));
      expect(approval.action.args).toMatchObject({
        spender,
        amount: params.amount,
      });
      await client.sendTransaction(approval);
      expect(
        await client.readContract({
          abi: erc20Abi,
          address: usdc,
          functionName: "allowance",
          args: [client.account.address, spender],
        }),
      ).toBe(params.amount);
      expect(
        await getBundlesTokenRequirements(client, {
          ...request,
          approvalAmount: maxUint256,
        }),
      ).toEqual([]);
    });

    test("behavior: reads the ERC-2612 nonce and produces an executable permit", async ({
      client,
    }) => {
      const nonce = await client.readContract({
        abi: erc2612Abi,
        address: usdc,
        functionName: "nonces",
        args: [client.account.address],
      });
      const requirements = await getBundlesTokenRequirements(client, {
        ...params,
        owner: client.account.address,
        supportSignature: true,
        useSimplePermit: true,
        supportDeployless: false,
      });
      expect(requirements).toHaveLength(1);
      const [requirement] = requirements;
      assert(isRequirementSignature(requirement));
      expect(requirement.action).toMatchObject({
        type: "permit",
        args: { spender, amount: params.amount, nonce },
      });
      const signed = await requirement.sign(client, client.account.address);
      const { r, s, v } = parseSignature(signed.args.signature);
      assert(v != null);
      await client.writeContract({
        abi: erc2612Abi,
        address: usdc,
        functionName: "permit",
        args: [
          client.account.address,
          spender,
          params.amount,
          params.deadline,
          Number(v),
          r,
          s,
        ],
      });
      expect(
        await client.readContract({
          abi: erc20Abi,
          address: usdc,
          functionName: "allowance",
          args: [client.account.address, spender],
        }),
      ).toBe(params.amount);
      expect(
        await client.readContract({
          abi: erc2612Abi,
          address: usdc,
          functionName: "nonces",
          args: [client.account.address],
        }),
      ).toBe(nonce + 1n);
    });

    test("behavior: approves canonical Permit2, executes a signature transfer, and rejects nonce reuse", async ({
      client,
    }) => {
      const wordPosition = 12_345n;
      const bit = 1n << 7n;
      const nonce = (wordPosition << 8n) | 7n;
      await client.deal({ erc20: usdc, amount: params.amount });
      await client.approve({ address: usdc, args: [permit2, 0n] });
      const request = {
        ...params,
        owner: client.account.address,
        supportSignature: true,
        permit2Nonce: nonce,
      };
      const requirements = await getBundlesTokenRequirements(client, request);
      expect(requirements.map(({ action }) => action.type)).toEqual([
        "erc20Approval",
        "permit2SignatureTransfer",
      ]);
      const [approval, requirement] = requirements;
      assert(isRequirementApproval(approval));
      assert(isRequirementSignature(requirement));
      expect(approval.action.args).toMatchObject({
        spender: permit2,
        amount: maxUint256,
      });
      expect(requirement.action.args).toMatchObject({
        spender,
        amount: params.amount,
        nonce,
      });
      await client.sendTransaction(approval);
      expect(
        (await getBundlesTokenRequirements(client, request)).map(
          ({ action }) => action.type,
        ),
      ).toEqual(["permit2SignatureTransfer"]);
      const signed = await requirement.sign(client, client.account.address);
      const beforeBalance = await client.balanceOf({
        erc20: usdc,
        owner: spender,
      });

      // Execute as the registered spender to verify Permit2 accepts the fetched nonce and signed domain.
      await client.setBalance({ address: spender, value: 10n ** 18n });
      await client.writeContract({
        account: spender,
        address: permit2,
        abi: permit2Abi,
        functionName: "permitTransferFrom",
        args: [
          {
            permitted: { token: usdc, amount: params.amount },
            nonce,
            deadline: params.deadline,
          },
          { to: spender, requestedAmount: params.amount },
          client.account.address,
          signed.args.signature,
        ],
      });
      expect(await client.balanceOf({ erc20: usdc, owner: spender })).toBe(
        beforeBalance + params.amount,
      );
      const bitmap = await client.readContract({
        address: permit2,
        abi: permit2Abi,
        functionName: "nonceBitmap",
        args: [client.account.address, wordPosition],
      });
      expect(bitmap & bit).toBe(bit);
      await expect(
        getBundlesTokenRequirements(client, request),
      ).rejects.toBeInstanceOf(Permit2SignatureTransferNonceAlreadyUsedError);
    });
  },
);
