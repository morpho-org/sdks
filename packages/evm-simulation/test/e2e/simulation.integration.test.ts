import { getChainAddresses } from "@morpho-org/blue-sdk";
import {
  isRequirementSignature,
  morphoViemExtension,
  type Transaction,
} from "@morpho-org/morpho-sdk";
import { blueAbi, vaultV2FactoryAbi } from "@morpho-org/morpho-sdk/abis";
import { type E2eScenario, getE2eAsset } from "@morpho-org/morpho-test";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  BaseError,
  type Chain,
  ExecutionRevertedError,
  erc4626Abi,
  ethAddress,
  isAddressEqual,
  maxUint256,
  parseEther,
  parseUnits,
  zeroHash,
} from "viem";
import { describe, expect, type TestAPI } from "vitest";
import {
  type SimulationResult,
  SimulationRevertedError,
  simulate,
  toSimulationAuthorizations,
  toSimulationLimits,
} from "../../src/index.js";
import {
  simulateOrThrow,
  simulationClientFor,
  unwrapReport,
} from "../../src/test-helpers/index.js";
import { seededMarketData, seededVaultData } from "../setup.js";
import { fundE2eAsset, getE2eAssets } from "./assets.js";
import {
  createE2eMarket,
  describeE2e,
  E2E_ACTORS,
  type E2eActor,
  type E2eTestContext,
  installE2eAsset,
  installE2eAssetAt,
  withE2eActor,
} from "./setup.js";
import { expectE2eReport, sendE2eSimulated } from "./simulate.js";

const blueSupplyScenario: E2eScenario = {
  name: "simulation",
  requires: ["blue", "adaptiveCurveIrm", "bundles.blueBundlesV1"],
};
const vaultV2Scenario: E2eScenario = {
  name: "simulationVaultV2",
  requires: ["vaultV2Factory", "bundles.vaultBundlesV1"],
};
const blueBorrowScenario: E2eScenario = {
  name: "simulationBlueBorrow",
  requires: ["blue", "adaptiveCurveIrm", "bundles.blueBundlesV1"],
};
const assets = parseEther("1");
const configFor = (client: AnvilTestClient<Chain>) =>
  simulationClientFor(client.transport.url, client.chain);
const diffOf = (
  result: SimulationResult,
  params: { readonly account: Address; readonly token: Address },
) =>
  result.assetChanges
    .find(({ account }) => isAddressEqual(account, params.account))
    ?.changes.find(({ token }) => isAddressEqual(token, params.token))?.diff ??
  0n;
const toTransaction = (
  client: AnvilTestClient<Chain>,
  tx: Pick<Transaction, "to" | "data" | "value">,
) => ({
  from: client.account.address,
  to: tx.to,
  data: tx.data,
  value: tx.value,
});

const describeActors = (
  scenario: E2eScenario,
  body: (
    test: TestAPI<E2eTestContext>,
    params: { readonly chainId: number; readonly actor: E2eActor },
  ) => void,
) =>
  describeE2e(scenario, (test, { chainId }) => {
    for (const actor of E2E_ACTORS)
      describe(actor, () =>
        body(withE2eActor(test, actor), { chainId, actor }),
      );
  });

describeActors(blueSupplyScenario, (test, { chainId, actor }) => {
  describe.each(getE2eAssets(chainId))("$symbol", (asset) => {
    test("Blue supply: SDK limits and every tracked balance match execution", {
      tags:
        asset.symbol === getE2eAssets(chainId)[0]!.symbol && actor === "EOA"
          ? []
          : ["nightly"],
    }, async ({ client }) => {
      const { blue } = getChainAddresses(chainId);
      const user = client.account.address;
      const market = await createE2eMarket(client, {
        chainId,
        loanToken: asset.address,
      });
      const { amount } = await fundE2eAsset(client, {
        token: asset.address,
        amount: "1",
      });
      const marketData = await seededMarketData(client, market);
      const output = client
        .extend(morphoViemExtension({ supportSignature: false }))
        .morpho.blue(market, chainId)
        .supply({
          marketData,
          userAddress: user,
          assets: amount,
          deadline: maxUint256,
        });
      expect((await output.getRequirements()).length).toBeGreaterThan(0);
      const { result } = await sendE2eSimulated(client, {
        chainId,
        account: user,
        output,
        preview: true,
        wallets: [user, blue],
        tokens: [asset.address],
        limits: {
          slippageTolerance: 0n,
          expected: { sharesMinted: marketData.toSupplyShares(amount, "Down") },
        },
      });
      expect(result.verification.operations[0]?.operation).toBe("blueSupply");
      expect(result.verification.operations[0]).toMatchObject({
        marketId: market.id,
        checkedLimits: {
          quote: {
            assetsPaid: amount,
            sharesMinted: marketData.toSupplyShares(amount, "Down"),
          },
          slippageTolerance: 0n,
        },
      });
      expect(diffOf(result, { account: user, token: asset.address })).toBe(
        -amount,
      );
    });
  });

  test.skipIf(getChainAddresses(chainId).wNative == null)(
    "final: simulated native-funded supply matches the executed wrap and Blue transfer",
    { tags: ["nightly"] },
    async ({ client }) => {
      const { blue } = getChainAddresses(chainId);
      const market = await createE2eMarket(client, { chainId });
      const tx = client
        .extend(morphoViemExtension({ supportSignature: false }))
        .morpho.blue(market, chainId)
        .supply({
          marketData: await seededMarketData(client, market),
          userAddress: client.account.address,
          assets,
          nativeAmount: assets,
          deadline: maxUint256,
        })
        .buildTx();
      const transaction = toTransaction(client, tx);
      await client.setBalance({
        address: client.account.address,
        value: assets + parseEther("1"),
      });

      const report = await simulate(
        configFor(client),
        {
          // Pin the fork head: Monad otherwise defaults to "finalized", before the fixture setup.
          blockNumber: await client.getBlockNumber({ cacheTime: 0 }),
          limits: toSimulationLimits(tx.action, {
            owner: client.account.address,
            expected: { sharesMinted: 1n },
            slippageTolerance: 0n,
          }),
          transactions: [transaction],
        },
        { timeoutMs: 30_000 },
      );
      expectE2eReport(report);
      const result = unwrapReport(report);
      const simulatedNativeDiff = diffOf(result, {
        account: client.account.address,
        token: ethAddress,
      });
      expect(result.verification.mode).toBe("final");
      expect(result.verification.operations).toMatchObject([
        {
          operation: "blueSupply",
          marketId: market.id,
          checkedLimits: {
            quote: { assetsPaid: assets, sharesMinted: 1n },
            slippageTolerance: 0n,
          },
        },
      ]);
      expect(simulatedNativeDiff).toBe(-assets);
      expect(diffOf(result, { account: blue, token: market.loanToken })).toBe(
        assets,
      );

      // Gas, including L2 data fees, also leaves the sender, so compare the gas-free counterparties.
      const wrappedBefore = await client.getBalance({
        address: market.loanToken,
      });
      const blueBefore = await client.balanceOf({
        erc20: market.loanToken,
        owner: blue,
      });
      await client.sendTransaction(transaction);
      expect(
        (await client.getBalance({ address: market.loanToken })) -
          wrappedBefore,
      ).toBe(diffOf(result, { account: market.loanToken, token: ethAddress }));
      expect(
        (await client.balanceOf({ erc20: market.loanToken, owner: blue })) -
          blueBefore,
      ).toBe(diffOf(result, { account: blue, token: market.loanToken }));
    },
  );

  test("final: an unfunded supply rejects with SimulationRevertedError, as its execution reverts", {
    tags: ["nightly"],
  }, async ({ client }) => {
    const { blueBundlesV1 } = getChainAddresses(chainId).bundles!;
    const market = await createE2eMarket(client, { chainId });
    await client.approve({
      address: market.loanToken,
      args: [blueBundlesV1!, maxUint256],
    });
    expect(await client.balanceOf({ erc20: market.loanToken })).toBe(0n);
    const tx = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(market, chainId)
      .supply({
        marketData: await seededMarketData(client, market),
        userAddress: client.account.address,
        assets,
        deadline: maxUint256,
      })
      .buildTx();
    const transaction = toTransaction(client, tx);

    await expect(
      simulateOrThrow(configFor(client), {
        limits: "none",
        // Pin the fork head: Monad otherwise defaults to "finalized", before the fixture setup.
        blockNumber: await client.getBlockNumber({ cacheTime: 0 }),
        transactions: [transaction],
      }),
    ).rejects.toBeInstanceOf(SimulationRevertedError);
    const error = await client.sendTransaction(transaction).catch((e) => e);
    expect(error).toBeInstanceOf(BaseError);
    expect(
      (error as BaseError).walk((e) => e instanceof ExecutionRevertedError),
    ).toBeInstanceOf(ExecutionRevertedError);
  });
});

describeActors(vaultV2Scenario, (test, { chainId, actor }) => {
  describe.each(getE2eAssets(chainId))("$symbol", (asset) => {
    test("Vault V2 deposit and signed redeem: SDK limits and every tracked balance match execution", {
      tags:
        asset.symbol === getE2eAssets(chainId)[0]!.symbol && actor === "EOA"
          ? []
          : ["nightly"],
    }, async ({ client }) => {
      const { vaultV2Factory } = getChainAddresses(chainId);
      await installE2eAsset(client, chainId);
      const user = client.account.address;
      const { request, result: vault } = await client.simulateContract({
        address: vaultV2Factory!,
        abi: vaultV2FactoryAbi,
        functionName: "createVaultV2",
        args: [user, asset.address, zeroHash],
      });
      await client.writeContract(request);
      const { amount } = await fundE2eAsset(client, {
        token: asset.address,
        amount: "1",
      });
      const vaultV2 = client
        .extend(morphoViemExtension({ supportSignature: true }))
        .morpho.vaultV2(vault, chainId);
      const vaultData = await seededVaultData(client, vaultV2);
      const shares = await client.readContract({
        address: vault,
        abi: erc4626Abi,
        functionName: "previewDeposit",
        args: [amount],
      });
      const deposit = vaultV2.deposit({ amount, userAddress: user, vaultData });
      const depositRequirements = await deposit.getRequirements({
        useSimplePermit: false,
      });
      expect(depositRequirements.length).toBeGreaterThan(0);
      expect(
        toSimulationAuthorizations({
          owner: user,
          requirements: depositRequirements,
        }).at(-1)?.type,
      ).toBe("erc20Approval");
      const { result: deposited } = await sendE2eSimulated(client, {
        preview: true,
        chainId,
        account: user,
        output: {
          ...deposit,
          getRequirements: async () => depositRequirements,
        },
        wallets: [user, vault],
        tokens: [asset.address, vault],
        limits: { slippageTolerance: 0n, expected: { sharesMinted: shares } },
      });
      expect(deposited.verification.operations[0]?.operation).toBe(
        "vaultV2Deposit",
      );
      expect(deposited.verification.operations[0]).toMatchObject({
        vault,
        checkedLimits: {
          quote: { assetsPaid: amount, sharesMinted: shares },
          slippageTolerance: 0n,
        },
      });
      expect(await client.balanceOf({ erc20: vault })).toBe(shares);
      const redeemedAssets = await client.readContract({
        address: vault,
        abi: erc4626Abi,
        functionName: "previewRedeem",
        args: [shares],
      });
      const redeem = vaultV2.redeem({ shares, userAddress: user });
      expect(
        (await redeem.getRequirements()).some(isRequirementSignature),
      ).toBe(true);
      const { result: redeemed } = await sendE2eSimulated(client, {
        chainId,
        account: user,
        output: redeem,
        wallets: [user, vault],
        tokens: [asset.address, vault],
        limits: {
          slippageTolerance: 0n,
          expected: { assetsReceived: redeemedAssets },
        },
      });
      expect(redeemed.verification.operations[0]?.operation).toBe(
        "vaultV2Redeem",
      );
      expect(redeemed.verification.operations[0]).toMatchObject({
        vault,
        checkedLimits: {
          quote: { sharesBurned: shares, assetsReceived: redeemedAssets },
          slippageTolerance: 0n,
        },
      });
      expect(await client.balanceOf({ erc20: vault })).toBe(0n);
    });
  });
});

describeActors(blueBorrowScenario, (test, { chainId, actor }) => {
  const native = getE2eAsset(chainId);
  const collateralFallback: Address =
    "0xE2e0000000000000000000000000000000000004";
  describe.each(getE2eAssets(chainId))("$symbol loan", (asset) => {
    test("Blue supplyCollateralBorrow and full repayWithdrawCollateral: SDK limits match execution", {
      tags:
        asset.symbol === getE2eAssets(chainId)[0]!.symbol && actor === "EOA"
          ? []
          : ["nightly"],
    }, async ({ client }) => {
      const user = client.account.address;
      const { blue: morpho } = getChainAddresses(chainId);
      const collateralToken = isAddressEqual(asset.address, native.address)
        ? collateralFallback
        : native.address;
      if (collateralToken === collateralFallback)
        await installE2eAssetAt(client, collateralFallback);
      const market = await createE2eMarket(client, {
        chainId,
        loanToken: asset.address,
        collateralToken,
      });
      const { decimals: loanDecimals } = await fundE2eAsset(client, {
        token: asset.address,
        amount: "11",
      });
      const { amount: collateralAssets } = await fundE2eAsset(client, {
        token: collateralToken,
        amount: "5",
      });
      const liquidity = parseUnits("10", loanDecimals);
      const borrowAssets = parseUnits("2", loanDecimals);
      await client.approve({
        address: asset.address,
        args: [morpho, liquidity],
      });
      await client.writeContract({
        address: morpho,
        abi: blueAbi,
        functionName: "supply",
        args: [market, liquidity, 0n, user, "0x"],
      });
      await seededMarketData(client, market);
      const blue = client
        .extend(morphoViemExtension({ supportSignature: true }))
        .morpho.blue(market, chainId);
      const positionData = await blue.getPositionData(user);
      const borrow = blue.supplyCollateralBorrow({
        userAddress: user,
        collateralAssets,
        borrowAssets,
        positionData,
        deadline: maxUint256,
      });
      expect(
        (await borrow.getRequirements()).some(isRequirementSignature),
      ).toBe(true);
      const tracked = {
        wallets: [user, morpho],
        tokens: [asset.address, collateralToken],
      };
      const { result: borrowedResult } = await sendE2eSimulated(client, {
        preview: true,
        chainId,
        account: user,
        output: borrow,
        ...tracked,
        limits: {
          slippageTolerance: 0n,
          expected: {
            sharesMinted: positionData.market.toBorrowShares(
              borrowAssets,
              "Up",
            ),
            assetsReceived: borrowAssets,
          },
        },
      });
      expect(borrowedResult.verification.operations[0]?.operation).toBe(
        "blueSupplyCollateralBorrow",
      );
      expect(borrowedResult.verification.operations[0]).toMatchObject({
        marketId: market.id,
        checkedLimits: {
          quote: {
            assetsPaid: collateralAssets,
            collateralSupplied: collateralAssets,
            assetsReceived: borrowAssets,
            sharesMinted: positionData.market.toBorrowShares(
              borrowAssets,
              "Up",
            ),
          },
          slippageTolerance: 0n,
        },
      });
      const borrowed = await blue.getPositionData(user);
      expect(borrowed.borrowShares).toBe(
        positionData.market.toBorrowShares(borrowAssets, "Up"),
      );
      expect(borrowed.collateral).toBe(collateralAssets);
      const repayNow = (await client.getBlock()).timestamp;
      const repay = blue.repayWithdrawCollateral({
        now: repayNow,
        userAddress: user,
        positionData: borrowed,
        repayShares: borrowed.borrowShares,
        collateralAssets,
        deadline: repayNow + 3_600n,
      });
      const { result: repaidResult } = await sendE2eSimulated(client, {
        chainId,
        account: user,
        output: repay,
        ...tracked,
        limits: {
          slippageTolerance: 0n,
          expected: { assetsReceived: collateralAssets },
        },
      });
      expect(repaidResult.verification.operations[0]?.operation).toBe(
        "blueRepayWithdrawCollateral",
      );
      expect(repaidResult.verification.operations[0]).toMatchObject({
        marketId: market.id,
        checkedLimits: {
          quote: {
            sharesBurned: borrowed.borrowShares,
            assetsPaid: repay.buildTx().action.args.maxRepayAssets,
            collateralWithdrawn: collateralAssets,
            assetsReceived: collateralAssets,
          },
          slippageTolerance: 0n,
        },
      });
      const repaid = await blue.getPositionData(user);
      expect([repaid.borrowShares, repaid.collateral]).toStrictEqual([0n, 0n]);
    });
  });
});
