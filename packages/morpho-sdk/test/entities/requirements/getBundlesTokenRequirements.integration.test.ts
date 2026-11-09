import { addressesRegistry } from "@morpho-org/blue-sdk";
import { erc2612Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { erc20Abi, maxUint256, parseSignature } from "viem";
import { mainnet } from "viem/chains";
import { assert, describe, expect } from "vitest";
import {
  getBundlesTokenRequirements,
  isRequirementApproval,
  isRequirementSignature,
} from "../../../src/index.js";

const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: 25_832_676n,
  stepsTracing: false,
});
const { usdc, dai } = addressesRegistry[mainnet.id];

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

    describe.each([
      { token: usdc, useSimplePermit: true, signatureType: "permit" },
      {
        token: dai,
        useSimplePermit: true,
        signatureType: "erc20Approval",
      },
      {
        token: usdc,
        useSimplePermit: false,
        signatureType: "erc20Approval",
      },
    ] as const)(
      "direct allowance: $token, simple permit: $useSimplePermit",
      (options) => {
        test("skips covered pulls and resolves funding for insufficient direct allowance", async ({
          client,
        }) => {
          const request = {
            ...params,
            ...options,
            owner: client.account.address,
            supportSignature: true,
            supportDeployless: false,
          };
          for (const allowance of [
            params.amount,
            params.amount + 1n,
            maxUint256,
          ]) {
            await client.approve({
              address: options.token,
              args: [spender, allowance],
            });
            expect(await getBundlesTokenRequirements(client, request)).toEqual(
              [],
            );
          }

          await client.approve({
            address: options.token,
            args: [spender, params.amount - 1n],
          });
          expect(
            (await getBundlesTokenRequirements(client, request)).map(
              ({ action }) => action.type,
            ),
          ).toEqual([options.signatureType]);

          await client.approve({ address: options.token, args: [spender, 0n] });
          expect(
            (await getBundlesTokenRequirements(client, request)).map(
              ({ action }) => action.type,
            ),
          ).toEqual([options.signatureType]);
        });
      },
    );

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
        amount: maxUint256,
      });
      await client.sendTransaction(approval);
      expect(
        await client.readContract({
          abi: erc20Abi,
          address: usdc,
          functionName: "allowance",
          args: [client.account.address, spender],
        }),
      ).toBe(maxUint256);
      expect(await getBundlesTokenRequirements(client, request)).toEqual([]);
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

    test("behavior: explicitly disabling simple permit approves the bundles spender", async ({
      client,
    }) => {
      await client.approve({ address: usdc, args: [spender, 0n] });
      const request = {
        ...params,
        owner: client.account.address,
        supportSignature: true,
        useSimplePermit: false,
      };
      const requirements = await getBundlesTokenRequirements(client, request);
      expect(requirements).toHaveLength(1);
      const [approval] = requirements;
      assert(isRequirementApproval(approval));
      expect(approval.action.args).toMatchObject({
        spender,
        amount: maxUint256,
      });
      await client.sendTransaction(approval);
      expect(await getBundlesTokenRequirements(client, request)).toEqual([]);
    });
  },
);
