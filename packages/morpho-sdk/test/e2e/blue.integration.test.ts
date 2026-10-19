import type { E2eScenario } from "@morpho-org/morpho-test";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  maxUint256,
  parseEther,
} from "viem";
import { expect } from "vitest";
import { erc2612Abi } from "../../src/blue/abis.js";
import {
  isRequirementApproval,
  isRequirementSignature,
  morphoViemExtension,
} from "../../src/index.js";
import { satisfyBlueBundlesV1Requirements } from "../helpers/blueBundlesV1.js";
import { createE2eMarket, describeE2e, wrapE2eNative } from "./setup.js";

const blueRequires = [
  "blue",
  "adaptiveCurveIrm",
  "bundles.blueBundlesV1",
] as const;

const blueScenario: E2eScenario = { name: "blue", requires: blueRequires };

const blueSignedScenario: E2eScenario = {
  name: "blueSignedSupply",
  requires: [...blueRequires, "permit2"],
};

const liquidity = parseEther("10");

describeE2e(blueScenario, (test, { chainId }) => {
  test("supply then withdraw: approves the loan token, then authorizes BlueBundlesV1", async ({
    client,
  }) => {
    const market = await createE2eMarket(client, chainId);
    await wrapE2eNative(client, {
      wNative: market.loanToken,
      amount: liquidity,
    });
    const blue = client
      .extend(morphoViemExtension())
      .morpho.blue(market, chainId);
    const supply = blue.supply({
      userAddress: client.account.address,
      assets: liquidity,
      deadline: maxUint256,
    });
    const supplyRequirements = await supply.getRequirements();
    expect(supplyRequirements.map(isRequirementApproval)).toStrictEqual([true]);
    await satisfyBlueBundlesV1Requirements(client, {
      requirements: supplyRequirements,
    });
    await client.sendTransaction(supply.buildTx());
    const supplied = await blue.getPositionData(client.account.address);
    expect(supplied.supplyAssets).toBe(liquidity);

    const assets = parseEther("4");
    const action = blue.withdraw({
      userAddress: client.account.address,
      positionData: supplied,
      assets,
      deadline: maxUint256,
    });
    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements: await action.getRequirements(),
    });
    await client.sendTransaction(action.buildTx(signatures));

    const after = await blue.getPositionData(client.account.address);
    expect(after.supplyAssets).toBe(liquidity - assets);
    expect(await client.balanceOf({ erc20: market.loanToken })).toBe(assets);
  });

  test("supplyCollateralBorrow then repayWithdrawCollateral round-trips a borrow position", async ({
    client,
  }) => {
    const market = await createE2eMarket(client, chainId);
    await wrapE2eNative(client, {
      wNative: market.loanToken,
      amount: liquidity,
    });
    const blue = client
      .extend(morphoViemExtension())
      .morpho.blue(market, chainId);
    const supply = blue.supply({
      userAddress: client.account.address,
      assets: liquidity,
      deadline: maxUint256,
    });
    const supplyRequirements = await supply.getRequirements();
    expect(supplyRequirements.map(isRequirementApproval)).toStrictEqual([true]);
    await satisfyBlueBundlesV1Requirements(client, {
      requirements: supplyRequirements,
    });
    await client.sendTransaction(supply.buildTx());
    const collateralAssets = parseEther("5");
    const borrowAssets = parseEther("2");
    await wrapE2eNative(client, {
      wNative: market.collateralToken,
      amount: collateralAssets,
    });

    const borrow = blue.supplyCollateralBorrow({
      userAddress: client.account.address,
      collateralAssets,
      borrowAssets,
      positionData: await blue.getPositionData(client.account.address),
      deadline: maxUint256,
    });
    await client.sendTransaction(
      borrow.buildTx(
        await satisfyBlueBundlesV1Requirements(client, {
          requirements: await borrow.getRequirements(),
        }),
      ),
    );
    const borrowed = await blue.getPositionData(client.account.address);
    expect(borrowed.collateral).toBe(collateralAssets);
    expect(borrowed.borrowAssets).toBe(borrowAssets);

    const repayAssets = parseEther("1");
    const withdrawAssets = parseEther("1");
    const marketBefore = await blue.getMarketData();
    const repay = blue.repayWithdrawCollateral({
      userAddress: client.account.address,
      positionData: borrowed,
      repayAssets,
      collateralAssets: withdrawAssets,
      deadline: maxUint256,
    });
    await client.sendTransaction(
      repay.buildTx(
        await satisfyBlueBundlesV1Requirements(client, {
          requirements: await repay.getRequirements(),
        }),
      ),
    );

    const after = await blue.getPositionData(client.account.address);
    expect(after.collateral).toBe(collateralAssets - withdrawAssets);
    expect(borrowed.borrowShares - after.borrowShares).toBe(
      marketBefore
        .accrueInterest(await client.timestamp())
        .toBorrowShares(repayAssets, "Down"),
    );
  });
});

describeE2e(blueSignedScenario, (test, { chainId }) => {
  test("supply: signs an ERC-2612 permit, or a Permit2 SignatureTransfer when the token has none", async ({
    client,
  }) => {
    const market = await createE2eMarket(client, chainId);
    await wrapE2eNative(client, {
      wNative: market.loanToken,
      amount: liquidity,
    });
    const blue = client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.blue(market, chainId);

    const action = blue.supply({
      userAddress: client.account.address,
      assets: liquidity,
      deadline: maxUint256,
    });
    const requirements = await action.getRequirements({
      useSimplePermit: true,
    });
    // The SDK picks ERC-2612 exactly when the loan token answers `nonces(owner)`. Only a contract-level
    // miss (a revert, or WETH9's fallback returning no data) means no ERC-2612; any other failure
    // (RPC, transport) fails the test instead of silently expecting Permit2.
    const hasErc2612 = await client
      .readContract({
        address: market.loanToken,
        abi: erc2612Abi,
        functionName: "nonces",
        args: [client.account.address],
      })
      .then(
        () => true,
        (error: unknown) => {
          if (
            error instanceof ContractFunctionExecutionError &&
            (error.cause instanceof ContractFunctionRevertedError ||
              error.cause instanceof ContractFunctionZeroDataError)
          )
            return false;
          throw error;
        },
      );
    const signature = requirements.at(-1);
    if (signature == null || !isRequirementSignature(signature))
      throw new Error("Expected a token-pull signature requirement");
    expect(signature.action.type).toBe(
      hasErc2612 ? "permit" : "permit2SignatureTransfer",
    );
    // A permit needs nothing else; Permit2 may first need its ERC-20 approval, unless the token
    // already grants Permit2 an allowance.
    expect(requirements.slice(0, -1).every(isRequirementApproval)).toBe(true);
    if (hasErc2612) expect(requirements).toHaveLength(1);
    const signatures = await satisfyBlueBundlesV1Requirements(client, {
      requirements,
    });
    await client.sendTransaction(action.buildTx(signatures));

    const after = await blue.getPositionData(client.account.address);
    expect(after.supplyAssets).toBe(liquidity);
    expect(await client.balanceOf({ erc20: market.loanToken })).toBe(0n);
  });
});
