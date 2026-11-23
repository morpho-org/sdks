import {
  blueAbi,
  fetchAccrualPosition,
  fetchMarket,
} from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  decodeFunctionData,
  erc20Abi,
  maxUint256,
  parseEther,
  parseUnits,
} from "viem";
import { signTypedData } from "viem/actions";
import { assert, expect } from "vitest";
import { blueBundlesV1Abi } from "../../../src/abis.js";
import { DEFAULT_LLTV_BUFFER } from "../../../src/helpers/constant.js";
import {
  type AuthorizationRequirementSignature,
  applySignatures,
  blueRepayWithdrawCollateral,
  buildTransactions,
  type Erc2612RequirementSignature,
  getPendingSignatureRequests,
  IncompleteTransactionPlanError,
  NativeAmountOnNonWNativeAssetError,
  parseTransactionPlan,
  prepareBlueRepayWithdrawCollateral,
  serializeTransactionPlan,
} from "../../../src/index.js";
import { CbbtcUsdcBlue, WstethWethBlue } from "../../fixtures/blue.js";
import { borrow, supplyCollateral, supplyLoan } from "../../helpers/blue.js";
import { blueBundlesV1Test as test } from "../../helpers/blueBundlesV1.js";

const cases = [
  {
    name: "covered allowance and authorization",
    allowance: true,
    authorized: true,
    signed: true,
  },
  {
    name: "direct infinite approval and direct authorization",
    allowance: false,
    authorized: false,
    signed: false,
  },
  {
    name: "covered allowance with signed authorization",
    allowance: true,
    authorized: false,
    signed: true,
  },
  {
    name: "token permit with existing authorization",
    allowance: false,
    authorized: true,
    signed: true,
  },
  {
    name: "both signatures in one step",
    allowance: false,
    authorized: false,
    signed: true,
  },
  {
    name: "full repay",
    allowance: false,
    authorized: false,
    signed: true,
    full: true,
  },
  {
    name: "share repay",
    allowance: true,
    authorized: true,
    signed: false,
    shares: true,
  },
  {
    name: "native funding",
    allowance: false,
    authorized: false,
    signed: true,
    native: true,
  },
] as const;

test.for(cases)(
  "Blue repayWithdrawCollateral: $name",
  async (scenario, { client }) => {
    const native = "native" in scenario;
    const full = "full" in scenario;
    const market = native ? WstethWethBlue : CbbtcUsdcBlue;
    const collateral = native ? parseEther("10") : parseUnits("1", 8);
    const debt = native ? parseEther("1") : parseUnits("100", 6);
    const repayAssets = debt / 2n;
    const collateralAssets = full ? collateral : collateral / 10n;
    const spender = getChainAddress(1, "bundles.blueBundlesV1");
    await supplyLoan({ client, chainId: 1, market, supplyAmount: debt * 2n });
    await supplyCollateral({
      client,
      chainId: 1,
      market,
      collateralAmount: collateral,
    });
    await borrow({ client, chainId: 1, market, borrowAmount: debt });
    if (scenario.authorized) {
      await client.writeContract({
        address: getChainAddress(1, "blue"),
        abi: blueAbi,
        functionName: "setAuthorization",
        args: [spender, scenario.authorized],
      });
    }
    await client.approve({
      address: market.loanToken,
      args: [spender, scenario.allowance ? maxUint256 : 0n],
    });
    const position = await fetchAccrualPosition(
      client.account.address,
      market.id,
      client,
    );
    const now = await client.timestamp();
    const repayment = full
      ? { repayShares: maxUint256 }
      : "shares" in scenario
        ? { repayShares: position.borrowShares / 2n }
        : { repayAssets };
    const intent = {
      chainId: 1,
      account: client.account.address,
      marketId: market.id,
      marketData: { chainId: 1, market: await fetchMarket(market.id, client) },
      positionData: { chainId: 1, position },
      collateralAssets,
      now,
      expiresAt: Number(now + 3600n),
      supportSignature: scenario.signed,
      ...repayment,
    };
    const shares = repayment.repayShares ?? 0n;
    const assets = repayment.repayAssets ?? 0n;
    const cap =
      shares > 0n
        ? intent.marketData.market
            .accrueInterest(BigInt(intent.expiresAt))
            .toBorrowAssets(full ? position.borrowShares : shares, "Up")
        : assets;
    await client.deal({ erc20: market.loanToken, amount: cap });
    let plan = await prepareBlueRepayWithdrawCollateral(client, {
      ...intent,
      ...(native ? { funding: { type: "native" as const } } : {}),
    });
    const operation = plan.steps.find(
      (step) => step.action.type === "blueRepayWithdrawCollateral",
    );
    assert(operation?.action.type === "blueRepayWithdrawCollateral");
    const expectedKinds = [
      ...(!scenario.allowance && !native && scenario.signed ? ["permit"] : []),
      ...(!scenario.authorized && scenario.signed
        ? ["morphoAuthorization"]
        : []),
    ];
    expect(plan.signatureRequests.map((request) => request.kind)).toEqual(
      expectedKinds,
    );
    expect(
      plan.steps.filter((step) => step.action.type === "erc20Approval"),
    ).toHaveLength(!scenario.allowance && !native && !scenario.signed ? 1 : 0);
    expect(
      plan.steps.filter((step) => step.action.type === "morphoAuthorization"),
    ).toHaveLength(!scenario.authorized && !scenario.signed ? 1 : 0);
    const signatures = await Promise.all(
      getPendingSignatureRequests(plan).map(async ({ id, typedData }) => ({
        id,
        signature: await signTypedData(client, {
          ...typedData,
          account: client.account,
        }),
      })),
    );
    for (const missing of signatures) {
      const partial = applySignatures(
        plan,
        signatures.filter((signature) => signature.id !== missing.id),
      );
      expect(() => buildTransactions(partial)).toThrow(
        new IncompleteTransactionPlanError(missing.id),
      );
    }
    plan = applySignatures(plan, signatures);
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    const txs = buildTransactions(restored);
    expect(txs).toEqual(buildTransactions(plan));
    if (!scenario.allowance && !native && !scenario.signed) {
      const approval = txs[0];
      assert(approval);
      expect(
        decodeFunctionData({ abi: erc20Abi, data: approval.data }),
      ).toEqual({
        functionName: "approve",
        args: [spender, maxUint256],
      });
    }
    if (expectedKinds.length === 2) {
      expect(Object.values(operation.action.signatureRequestIds)).toHaveLength(
        2,
      );
    }
    const requirementSignatures = plan.signatureRequests.map((request) => {
      assert(request.signature);
      if (request.kind === "permit") {
        return {
          action: {
            type: "permit" as const,
            args: request.args,
            typedData: request.typedData,
          },
          args: {
            owner: client.account.address,
            asset: market.loanToken,
            ...request.args,
            signature: request.signature,
          },
        };
      }
      return {
        action: {
          type: "authorization" as const,
          args: { ...request.args, isAuthorized: true },
          typedData: request.typedData,
        },
        args: {
          ...request.args,
          isAuthorized: true,
          signature: request.signature,
        },
      };
    });
    const reference = blueRepayWithdrawCollateral({
      market: { chainId: 1, marketParams: market },
      args: {
        userAddress: client.account.address,
        repayAssets: assets,
        repayShares: shares,
        maxRepayAssets: cap,
        collateralAssets,
        maxLtv: market.lltv - DEFAULT_LLTV_BUFFER,
        deadline: BigInt(intent.expiresAt),
        requirementSignature: requirementSignatures.find(
          (signature) => signature.action.type === "permit",
        ) as Erc2612RequirementSignature | undefined,
        authorizationSignature: requirementSignatures.find(
          (signature) => signature.action.type === "authorization",
        ) as AuthorizationRequirementSignature | undefined,
        ...(native ? { nativeAmount: cap } : {}),
      },
    });
    expect(txs.at(-1)?.data).toBe(reference.data);
    const transaction = txs.at(-1);
    assert(transaction);
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: transaction.data,
    });
    expect(decoded.functionName).toBe(
      "blueBundlesV1RepayAndWithdrawCollateral",
    );
    assert(decoded.functionName === "blueBundlesV1RepayAndWithdrawCollateral");
    expect(decoded.args.slice(1, 6)).toEqual([
      assets,
      shares,
      cap,
      collateralAssets,
      market.lltv - DEFAULT_LLTV_BUFFER,
    ]);
    expect(decoded).toEqual(
      decodeFunctionData({ abi: blueBundlesV1Abi, data: reference.data }),
    );
    expect(txs.at(-1)?.to).toBe(spender);
    const loanBefore = await client.balanceOf({ erc20: market.loanToken });
    const collateralBefore = await client.balanceOf({
      erc20: market.collateralToken,
    });
    for (const tx of txs) {
      await client.sendTransaction(tx);
    }
    const after = await fetchAccrualPosition(
      client.account.address,
      market.id,
      client,
    );
    expect(after.collateral).toBe(position.collateral - collateralAssets);
    expect(await client.balanceOf({ erc20: market.collateralToken })).toBe(
      collateralBefore + collateralAssets,
    );
    if (full) {
      expect(after.borrowShares).toBe(0n);
    } else {
      expect(after.borrowShares).toBeLessThan(position.borrowShares);
    }
    if (!native) {
      expect(await client.balanceOf({ erc20: market.loanToken })).toBeLessThan(
        loanBefore,
      );
    } else {
      expect(await client.balanceOf({ erc20: market.loanToken })).toBe(
        loanBefore,
      );
    }
    if (!native) {
      await expect(
        prepareBlueRepayWithdrawCollateral(client, {
          ...intent,
          funding: { type: "native" },
        }),
      ).rejects.toBeInstanceOf(NativeAmountOnNonWNativeAssetError);
    }
  },
);
