import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  decodeFunctionData,
  erc20Abi,
  maxUint256,
  parseEther,
  zeroAddress,
  zeroHash,
} from "viem";
import { signTypedData } from "viem/actions";
import { assert, expect } from "vitest";
import { blueBundlesV1Abi } from "../../../src/abis.js";
import { BundlesPermitKind } from "../../../src/actions/bundles/index.js";
import { fetchMarket, fetchPosition } from "../../../src/blue/fetch.js";
import {
  applySignatures,
  buildTransactions,
  getPendingSignatureRequests,
  NativeAmountOnNonWNativeAssetError,
  parseTransactionPlan,
  prepareBlueSupplyCollateral,
  serializeTransactionPlan,
} from "../../../src/index.js";
import { WethUsdsBlue, WstethWethBlue } from "../../fixtures/blue.js";
import { blueBundlesV1Test as test } from "../../helpers/blueBundlesV1.js";

for (const funding of [
  "existing allowance",
  "approval",
  "permit",
  "native",
] as const) {
  test(`supplies Blue collateral with ${funding}`, async ({ client }) => {
    const chainId = client.chain.id;
    const account = client.account.address;
    const spender = getChainAddress(chainId, "bundles.blueBundlesV1");
    const marketParams = funding === "permit" ? WstethWethBlue : WethUsdsBlue;
    const token = marketParams.collateralToken;
    const collateralAssets = parseEther("1");
    const native = funding === "native";
    const supportSignature = funding !== "approval";
    if (native) {
      await client.deal({ amount: parseEther("2") });
    } else {
      await client.deal({ erc20: token, amount: collateralAssets });
    }
    if (funding === "existing allowance") {
      await client.approve({
        address: token,
        args: [spender, collateralAssets],
      });
    }
    if (funding === "approval") {
      await client.approve({
        address: token,
        args: [getChainAddress(chainId, "permit2"), maxUint256],
      });
    }

    const before = await fetchPosition(account, marketParams.id, client);
    const tokenBalance = await client.balanceOf({ erc20: token });
    const nativeBalance = await client.getBalance({ address: account });
    const market = await fetchMarket(marketParams.id, client);
    const { timestamp: now } = await client.getBlock();
    const deadline = now + 600n;
    const plan = await prepareBlueSupplyCollateral(client, {
      chainId,
      account,
      marketId: marketParams.id,
      marketData: { chainId, market },
      collateralAssets,
      funding: { type: native ? "native" : "erc20" },
      supportSignature,
      deployless: false,
      now,
      expiresAt: Number(deadline),
    });
    expect(plan.steps.map(({ action }) => action.type)).toEqual(
      funding === "approval"
        ? ["erc20Approval", "blueSupplyCollateral"]
        : ["blueSupplyCollateral"],
    );
    const requests = getPendingSignatureRequests(plan);
    expect(plan.signatureRequests).toEqual(
      funding === "permit"
        ? [
            expect.objectContaining({
              kind: "permit",
              args: expect.objectContaining({ spender }),
            }),
          ]
        : [],
    );
    if (funding === "approval") {
      expect(plan.steps[0]?.action.inputs).toMatchObject({
        token,
        spender,
        assets: maxUint256,
      });
    }

    const signatures = await Promise.all(
      requests.map(async ({ id, typedData }) => ({
        id,
        signature: await signTypedData(client, {
          ...typedData,
          account: client.account,
        }),
      })),
    );
    const signedPlan = applySignatures(plan, signatures);
    const transactions = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(signedPlan)),
    );
    const supply = transactions.at(-1);
    assert(supply);
    expect(supply.to).toBe(spender);
    expect(supply.value).toBe(native ? collateralAssets : 0n);
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: supply.data,
    });
    assert(decoded.functionName === "blueBundlesV1SupplyCollateralAndBorrow");
    const { loanToken, collateralToken, oracle, irm, lltv } = marketParams;
    expect(decoded.args).toEqual([
      { loanToken, collateralToken, oracle, irm, lltv },
      collateralAssets,
      0n,
      maxUint256,
      funding === "permit"
        ? {
            kind: BundlesPermitKind.ERC2612,
            data: expect.not.stringMatching(/^0x$/),
          }
        : { kind: BundlesPermitKind.None, data: "0x" },
      {
        signature: { v: 0, r: zeroHash, s: zeroHash },
        nonce: 0n,
        deadline: 0n,
      },
      [],
      0n,
      zeroAddress,
      deadline,
    ]);

    let gasCost = 0n;
    for (const tx of transactions) {
      const hash = await client.sendTransaction(tx);
      const receipt = await client.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe("success");
      gasCost += receipt.gasUsed * receipt.effectiveGasPrice;
    }
    const after = await fetchPosition(account, marketParams.id, client);
    expect(after.collateral - before.collateral).toBe(collateralAssets);
    expect(after.supplyShares).toBe(before.supplyShares);
    expect(after.borrowShares).toBe(before.borrowShares);
    expect(await client.balanceOf({ erc20: token })).toBe(
      native ? tokenBalance : tokenBalance - collateralAssets,
    );
    expect(await client.getBalance({ address: account })).toBe(
      nativeBalance - gasCost - (native ? collateralAssets : 0n),
    );
    if (funding === "approval") {
      expect(
        await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [account, spender],
        }),
      ).toBe(maxUint256);
    }
  });
}

test("rejects native funding for non-wNative collateral", async ({
  client,
}) => {
  const chainId = client.chain.id;
  const market = await fetchMarket(WstethWethBlue.id, client);
  await expect(
    prepareBlueSupplyCollateral(client, {
      chainId,
      account: client.account.address,
      marketId: WstethWethBlue.id,
      marketData: { chainId, market },
      collateralAssets: parseEther("1"),
      funding: { type: "native" },
      now: (await client.getBlock()).timestamp,
    }),
  ).rejects.toBeInstanceOf(NativeAmountOnNonWNativeAssetError);
});
