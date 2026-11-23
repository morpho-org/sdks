import { MathLib } from "@morpho-org/blue-sdk";
import {
  blueAbi,
  fetchAccrualPosition,
  fetchMarket,
} from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  decodeFunctionData,
  encodeFunctionData,
  maxUint256,
  parseEther,
} from "viem";
import { signTypedData } from "viem/actions";
import { mainnet } from "viem/chains";
import { assert, describe, expect } from "vitest";
import { blueBundlesV1Abi } from "../../../src/abis.js";
import { blueSupplyCollateralBorrow } from "../../../src/actions/blue/supplyCollateralBorrow.js";
import {
  applySignatures,
  buildTransactions,
  DEFAULT_LLTV_BUFFER,
  getPendingSignatureRequests,
  IncompleteTransactionPlanError,
  NativeAmountOnNonWNativeAssetError,
  parseTransactionPlan,
  prepareBlueSupplyCollateralBorrow,
  serializeTransactionPlan,
  TransactionPlanSignatureMismatchError,
} from "../../../src/index.js";
import { WethUsdsBlue, WstethWethBlue } from "../../fixtures/blue.js";
import { supplyLoan } from "../../helpers/blue.js";

const test = createViemTest(mainnet, {
  forkUrl:
    process.env.MAINNET_RPC_URL ??
    getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  forkBlockNumber: 25_832_676n,
});

describe("Blue supplyCollateralBorrow plans at mainnet block 25,832,676", () => {
  test.for([
    { funding: "allowance", authorized: true, supportSignature: true },
    { funding: "approval", authorized: true, supportSignature: false },
    { funding: "allowance", authorized: false, supportSignature: false },
    { funding: "allowance", authorized: false, supportSignature: true },
    { funding: "permit", authorized: false, supportSignature: true },
    { funding: "native", authorized: false, supportSignature: true },
  ] as const)(
    "funding=$funding authorized=$authorized signatures=$supportSignature",
    async ({ funding, authorized, supportSignature }, { client }) => {
      await client.setCode({ address: client.account.address, bytecode: "0x" });
      await client.setBalance({
        address: client.account.address,
        value: parseEther("100"),
      });
      const marketParams = funding === "permit" ? WstethWethBlue : WethUsdsBlue;
      const chainId = client.chain.id;
      const spender = getChainAddress(chainId, "bundles.blueBundlesV1");
      const collateralAssets = parseEther("10");
      const borrowAssets =
        funding === "permit" ? parseEther("0.01") : parseEther("100");
      await supplyLoan({
        client,
        chainId,
        market: marketParams,
        supplyAmount: borrowAssets * 2n,
      });
      await client.deal({
        erc20: marketParams.collateralToken,
        amount: collateralAssets,
      });
      await client.approve({
        address: marketParams.collateralToken,
        args: [spender, funding === "allowance" ? maxUint256 : 0n],
      });
      if (authorized) {
        await client.sendTransaction({
          to: getChainAddress(chainId, "blue"),
          data: encodeFunctionData({
            abi: blueAbi,
            functionName: "setAuthorization",
            args: [spender, authorized],
          }),
        });
      }
      const positionData = await fetchAccrualPosition(
        client.account.address,
        marketParams.id,
        client,
      );
      const marketData = await fetchMarket(marketParams.id, client);
      const now = (await client.getBlock()).timestamp;
      const expiresAt = Number(now + 3600n);
      let plan = await prepareBlueSupplyCollateralBorrow(client, {
        chainId,
        account: client.account.address,
        marketId: marketParams.id,
        marketData: { chainId, market: marketData },
        positionData: { chainId, position: positionData },
        collateralAssets,
        borrowAssets,
        funding: { type: funding === "native" ? "native" : "erc20" },
        supportSignature,
        now,
        expiresAt,
      });
      const operation = plan.steps.at(-1)!;
      assert(operation.action.type === "blueSupplyCollateralBorrow");
      expect(
        plan.steps.filter((step) => step.action.type === "erc20Approval"),
      ).toHaveLength(funding === "approval" ? 1 : 0);
      for (const step of plan.steps) {
        if (step.action.type === "erc20Approval") {
          expect(step.action.inputs).toMatchObject({
            spender,
            assets: maxUint256,
          });
        }
      }
      expect(
        plan.signatureRequests.filter((request) => request.kind === "permit"),
      ).toHaveLength(funding === "permit" ? 1 : 0);
      expect(
        plan.steps.filter((step) => step.action.type === "morphoAuthorization"),
      ).toHaveLength(!authorized && !supportSignature ? 1 : 0);
      expect(
        plan.signatureRequests.filter(
          (request) => request.kind === "morphoAuthorization",
        ),
      ).toHaveLength(!authorized && supportSignature ? 1 : 0);
      const authorizationRequest = plan.signatureRequests.find(
        (request) => request.kind === "morphoAuthorization",
      );
      expect(operation.action.signatureRequestIds.morphoAuthorization).toBe(
        authorizationRequest?.id,
      );
      for (const step of plan.steps) {
        if (step.action.type === "morphoAuthorization") {
          expect(step.action).not.toHaveProperty("signatureRequestIds");
          expect(step).not.toBe(operation);
        }
      }
      const pending = getPendingSignatureRequests(plan);
      const signatures = await Promise.all(
        pending.map(async ({ id, typedData }) => ({
          id,
          signature: await signTypedData(client, {
            ...typedData,
            account: client.account,
          }),
        })),
      );
      if (funding === "permit") {
        await expect(
          prepareBlueSupplyCollateralBorrow(client, {
            chainId,
            account: client.account.address,
            marketId: marketParams.id,
            marketData: { chainId, market: marketData },
            positionData: { chainId, position: positionData },
            collateralAssets,
            borrowAssets,
            funding: { type: "native" },
            now,
            expiresAt,
          }),
        ).rejects.toBeInstanceOf(NativeAmountOnNonWNativeAssetError);
        expect(Object.keys(operation.action.signatureRequestIds)).toHaveLength(
          2,
        );
        for (const missing of signatures) {
          const partial = applySignatures(
            plan,
            signatures.filter(({ id }) => id !== missing.id),
          );
          expect(() => buildTransactions(partial)).toThrow(
            IncompleteTransactionPlanError,
          );
          expect(() => buildTransactions(partial)).toThrow(
            expect.objectContaining({ id: missing.id }),
          );
        }
        const misbound = {
          ...plan,
          signatureRequests: plan.signatureRequests.map((request) =>
            request.kind === "morphoAuthorization"
              ? {
                  ...request,
                  args: { ...request.args, nonce: request.args.nonce + 1n },
                  typedData: {
                    ...request.typedData,
                    message: {
                      ...request.typedData.message,
                      nonce: request.args.nonce + 1n,
                    },
                  },
                }
              : request,
          ),
        };
        expect(() => applySignatures(misbound, [])).toThrow(
          TransactionPlanSignatureMismatchError,
        );
      }
      plan = applySignatures(plan, signatures);
      const restored = parseTransactionPlan(serializeTransactionPlan(plan));
      const transactions = buildTransactions(restored);
      const decoded = decodeFunctionData({
        abi: blueBundlesV1Abi,
        data: transactions.at(-1)!.data,
      });
      assert(decoded.functionName === "blueBundlesV1SupplyCollateralAndBorrow");
      if (authorizationRequest?.kind === "morphoAuthorization") {
        expect(decoded.args[5]).toMatchObject({
          nonce: authorizationRequest.args.nonce,
          deadline: authorizationRequest.args.deadline,
        });
        expect(decoded.args[5].signature.v).not.toBe(0);
      } else {
        expect(decoded.args[5].signature.v).toBe(0);
      }
      if (!authorized && !supportSignature) {
        expect(transactions[0]?.to).toBe(getChainAddress(chainId, "blue"));
        expect(
          decodeFunctionData({ abi: blueAbi, data: transactions[0]!.data }),
        ).toEqual({ functionName: "setAuthorization", args: [spender, true] });
      }
      expect(buildTransactions(plan)).toEqual(transactions);
      const permit = restored.signatureRequests.find(
        (request) => request.kind === "permit",
      );
      const authorization = restored.signatureRequests.find(
        (request) => request.kind === "morphoAuthorization",
      );
      const reference = blueSupplyCollateralBorrow({
        market: { chainId, marketParams },
        args: {
          userAddress: client.account.address,
          collateralAssets,
          borrowAssets,
          maxLtv: MathLib.zeroFloorSub(marketParams.lltv, DEFAULT_LLTV_BUFFER),
          nativeAmount: funding === "native" ? collateralAssets : undefined,
          deadline: BigInt(expiresAt),
          requirementSignature:
            permit?.signature === undefined
              ? undefined
              : {
                  action: {
                    type: "permit" as const,
                    args: permit.args,
                    typedData: permit.typedData,
                  },
                  args: {
                    owner: client.account.address,
                    asset: marketParams.collateralToken,
                    ...permit.args,
                    signature: permit.signature,
                  },
                },
          authorizationSignature:
            authorization?.signature === undefined
              ? undefined
              : {
                  action: {
                    type: "authorization" as const,
                    args: {
                      authorized: authorization.args.authorized,
                      isAuthorized: true,
                      deadline: authorization.args.deadline,
                    },
                  },
                  args: {
                    ...authorization.args,
                    isAuthorized: true,
                    signature: authorization.signature,
                  },
                },
        },
      });
      expect(transactions.at(-1)?.data).toBe(reference.data);
      expect(transactions.at(-1)?.value).toBe(reference.value);
      expect(transactions.at(-1)?.to).toBe(spender);
      const balanceBefore = await client.balanceOf({
        erc20: marketParams.loanToken,
      });
      for (const transaction of transactions) {
        const hash = await client.sendTransaction(transaction);
        expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
          "success",
        );
      }
      const after = await fetchAccrualPosition(
        client.account.address,
        marketParams.id,
        client,
      );
      expect(after.collateral - positionData.collateral).toBe(collateralAssets);
      expect(after.borrowShares).toBeGreaterThan(positionData.borrowShares);
      expect(after.supplyShares).toBe(positionData.supplyShares);
      expect(
        (await client.balanceOf({ erc20: marketParams.loanToken })) -
          balanceBefore,
      ).toBe(borrowAssets);
      expect(
        await client.balanceOf({ erc20: marketParams.collateralToken }),
      ).toBe(funding === "native" ? collateralAssets : 0n);
    },
  );
});
