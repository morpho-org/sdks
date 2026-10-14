import { getChainAddresses, SharesMath } from "@morpho-org/blue-sdk";
import {
  type ActionRequirement,
  isRequirementSignature,
  morphoViemExtension,
  type RequirementSignature,
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
  zeroHash,
} from "viem";
import type { TestAPI } from "vitest";
import { describe, expect } from "vitest";
import {
  type SimulationResult,
  SimulationRevertedError,
  simulate,
  toSimulationAuthorizations,
  type VerifiedSimulationResult,
} from "../../src/index.js";
import {
  createE2eMarket,
  describeE2e,
  E2E_ACTORS,
  type E2eTestContext,
  installE2eAsset,
  withE2eActor,
} from "./setup.js";

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
// The fresh market is empty, so the supply mints exactly this many shares.
const sharesMinted = SharesMath.toShares(assets, 0n, 0n, "Down");

const configFor = (client: AnvilTestClient<Chain>, chainId: number) => ({
  // Cold fork reads may exceed the production default while fetching upstream state.
  timeoutMs: 30_000,
  chains: new Map([[chainId, { simulateV1Url: client.transport.url! }]]),
});

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

/**
 * Funds installed E2E assets with `client.deal` because chains like Tempo reject native value
 * transfers; real wNative continues to be funded by wrapping native tokens.
 */
const wrapNative = async (
  client: AnvilTestClient<Chain>,
  params: { readonly wNative: Address; readonly amount: bigint },
) => {
  if (getE2eAsset(client.chain.id).requiresInstall) {
    await client.deal({
      erc20: params.wNative,
      amount:
        (await client.balanceOf({ erc20: params.wNative })) + params.amount,
    });
    return;
  }

  await client.deal({ amount: params.amount + parseEther("1") });
  await client.writeContract({
    address: params.wNative,
    abi: [
      {
        type: "function",
        name: "deposit",
        stateMutability: "payable",
        inputs: [],
        outputs: [],
      },
    ],
    functionName: "deposit",
    value: params.amount,
  });
};

/** Sends the call requirements and signs the signature requirements, in order. */
const fulfil = async (
  client: AnvilTestClient<Chain>,
  requirements: readonly ActionRequirement[],
) => {
  const signatures: RequirementSignature[] = [];
  for (const requirement of requirements)
    if (isRequirementSignature(requirement))
      signatures.push(await requirement.sign(client, client.account.address));
    else await client.sendTransaction(requirement);

  return signatures;
};

/**
 * Executes `transaction` and expects each ERC-20 balance to move by its simulated diff. The
 * simulated block is the pinned block or its successor, depending on the Anvil version, so the
 * execution block reuses its timestamp when no later block exists: interest then accrues over the
 * same elapsed time.
 */
const expectExecutionMatches = async (
  client: AnvilTestClient<Chain>,
  params: {
    readonly result: VerifiedSimulationResult;
    readonly transaction: ReturnType<typeof toTransaction>;
    readonly balances: readonly { account: Address; token: Address }[];
  },
) => {
  const read = () =>
    Promise.all(
      params.balances.map(({ account, token }) =>
        client.balanceOf({ erc20: token, owner: account }),
      ),
    );
  const before = await read();
  const { timestamp } = await client.getBlock();
  const simulated = params.result.verification.blockTimestamp;
  await client.setNextBlockTimestamp({
    timestamp: simulated > timestamp ? simulated : timestamp,
  });
  await client.sendTransaction(params.transaction);
  const after = await read();
  expect(after.map((balance, i) => balance - before[i]!)).toStrictEqual(
    params.balances.map((balance) => diffOf(params.result, balance)),
  );
};

/** Runs `body` once per actor, each test on a fork whose test account is that actor. */
const describeActors = (
  scenario: E2eScenario,
  body: (test: TestAPI<E2eTestContext>, chainId: number) => void,
) =>
  describeE2e(scenario, (test, { chainId }) => {
    for (const actor of E2E_ACTORS)
      describe(actor, () => body(withE2eActor(test, actor), chainId));
  });

describeActors(blueSupplyScenario, (test, chainId) => {
  test("preview: simulated test-asset supply with a pending approval matches the executed bundle", async ({
    client,
  }) => {
    const { blue } = getChainAddresses(chainId);
    const market = await createE2eMarket(client, chainId);
    await wrapNative(client, { wNative: market.loanToken, amount: assets });
    const action = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(market, chainId)
      .supply({
        userAddress: client.account.address,
        assets,
        deadline: maxUint256,
      });
    const requirements = await action.getRequirements();
    expect(requirements).not.toHaveLength(0);
    const transaction = toTransaction(client, action.buildTx());
    // Pin the fork head: Monad otherwise defaults to "finalized", before the fixture setup.
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });

    const result = await simulate(configFor(client, chainId), {
      chainId,
      blockNumber,
      mode: "preview",
      authorizations: toSimulationAuthorizations({
        chainId,
        mode: "preview",
        blockNumber,
        owner: client.account.address,
        requirements,
      }),
      limits: {
        operations: [
          {
            type: "blueSupply",
            marketId: market.id,
            quote: { assetsPaid: assets, sharesMinted },
            slippageTolerance: 0n,
          },
        ],
      },
      transactions: [transaction],
    });
    const simulatedUserDiff = diffOf(result, {
      account: client.account.address,
      token: market.loanToken,
    });
    const simulatedBlueDiff = diffOf(result, {
      account: blue,
      token: market.loanToken,
    });
    expect(result.verification.authorizations).toHaveLength(
      requirements.length,
    );
    expect(result.verification.operations).toMatchObject([
      {
        operation: "blueSupply",
        marketId: market.id,
        checkedLimits: {
          quote: { assetsPaid: assets, sharesMinted },
          slippageTolerance: 0n,
        },
      },
    ]);
    expect(result.calls.map(({ status }) => status)).toStrictEqual([true]);
    expect(simulatedUserDiff).toBe(-assets);
    expect(simulatedBlueDiff).toBe(assets);

    // Preview is read-only: the same bundle executed for real moves exactly the simulated amounts.
    await fulfil(client, requirements);
    await expectExecutionMatches(client, {
      result,
      transaction,
      balances: [
        { account: client.account.address, token: market.loanToken },
        { account: blue, token: market.loanToken },
      ],
    });
  });

  test.skipIf(getChainAddresses(chainId).wNative == null)(
    "final: simulated native-funded supply matches the executed wrap and Blue transfer",
    async ({ client }) => {
      const { blue } = getChainAddresses(chainId);
      const market = await createE2eMarket(client, chainId);
      const tx = client
        .extend(morphoViemExtension({ supportSignature: false }))
        .morpho.blue(market, chainId)
        .supply({
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

      const result = await simulate(configFor(client, chainId), {
        chainId,
        // Pin the fork head: Monad otherwise defaults to "finalized", before the fixture setup.
        blockNumber: await client.getBlockNumber({ cacheTime: 0 }),
        limits: {
          operations: [
            {
              type: "blueSupply",
              marketId: market.id,
              assetPaid: ethAddress,
              quote: { assetsPaid: assets },
              slippageTolerance: 0n,
            },
          ],
        },
        transactions: [transaction],
      });
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
            quote: { assetsPaid: assets },
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

  test("final: an unfunded supply rejects with SimulationRevertedError, as its execution reverts", async ({
    client,
  }) => {
    const { blueBundlesV1 } = getChainAddresses(chainId).bundles!;
    const market = await createE2eMarket(client, chainId);
    await client.approve({
      address: market.loanToken,
      args: [blueBundlesV1!, maxUint256],
    });
    expect(await client.balanceOf({ erc20: market.loanToken })).toBe(0n);
    const tx = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(market, chainId)
      .supply({
        userAddress: client.account.address,
        assets,
        deadline: maxUint256,
      })
      .buildTx();
    const transaction = toTransaction(client, tx);

    await expect(
      simulate(configFor(client, chainId), {
        chainId,
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

describeActors(vaultV2Scenario, (test, chainId) => {
  test("Vault V2: a previewed deposit (Permit2 signature or ERC-20 approval) and a final permit-signed redeem match their execution", async ({
    client,
  }) => {
    const { vaultV2Factory, permit2 } = getChainAddresses(chainId);
    const asset = getE2eAsset(chainId);
    await installE2eAsset(client, chainId);
    const user = client.account.address;
    const { request, result: vault } = await client.simulateContract({
      address: vaultV2Factory!,
      abi: vaultV2FactoryAbi,
      functionName: "createVaultV2",
      args: [user, asset.address, zeroHash],
    });
    await client.writeContract(request);
    await wrapNative(client, { wNative: asset.address, amount: assets });
    const vaultV2 = client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.vaultV2(vault, chainId);
    const balances = [
      { account: user, token: asset.address },
      { account: vault, token: asset.address },
      { account: user, token: vault },
    ];

    const shares = await client.readContract({
      address: vault,
      abi: erc4626Abi,
      functionName: "previewDeposit",
      args: [assets],
    });
    const deposit = vaultV2.deposit({
      amount: assets,
      userAddress: user,
      vaultData: await vaultV2.getData(),
    });
    const depositRequirements = await deposit.getRequirements();
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    const authorizations = toSimulationAuthorizations({
      chainId,
      mode: "preview",
      blockNumber,
      owner: user,
      requirements: depositRequirements,
    });
    expect(authorizations.at(-1)?.type).toBe(
      permit2 == null ? "erc20Approval" : "permit2SignatureTransfer",
    );
    const depositQuote = { assetsPaid: assets, sharesMinted: shares };
    const depositResult = await simulate(configFor(client, chainId), {
      chainId,
      blockNumber,
      mode: "preview",
      authorizations,
      limits: {
        operations: [
          {
            type: "vaultV2Deposit",
            vault,
            quote: depositQuote,
            slippageTolerance: 0n,
          },
        ],
      },
      transactions: [toTransaction(client, deposit.buildTx())],
    });
    expect(
      depositResult.verification.authorizations.map(
        ({ authorization }) => authorization,
      ),
    ).toStrictEqual(authorizations);
    expect(depositResult.verification.operations).toMatchObject([
      {
        operation: "vaultV2Deposit",
        vault,
        checkedLimits: { quote: depositQuote, slippageTolerance: 0n },
      },
    ]);
    const depositSignatures = await fulfil(client, depositRequirements);
    await expectExecutionMatches(client, {
      result: depositResult,
      transaction: toTransaction(client, deposit.buildTx(depositSignatures)),
      balances,
    });
    expect(await client.balanceOf({ erc20: vault })).toBe(shares);

    const redeemed = await client.readContract({
      address: vault,
      abi: erc4626Abi,
      functionName: "previewRedeem",
      args: [shares],
    });
    const redeem = vaultV2.redeem({ shares, userAddress: user });
    const redeemRequirements = await redeem.getRequirements();
    expect(
      toSimulationAuthorizations({
        chainId,
        mode: "final",
        blockNumber,
        owner: user,
        requirements: redeemRequirements,
      }).map(({ type }) => type),
    ).toStrictEqual(["erc2612Permit"]);
    const redeemTransaction = toTransaction(
      client,
      redeem.buildTx(await fulfil(client, redeemRequirements)),
    );
    const redeemQuote = { sharesBurned: shares, assetsReceived: redeemed };
    const redeemResult = await simulate(configFor(client, chainId), {
      chainId,
      blockNumber: await client.getBlockNumber({ cacheTime: 0 }),
      limits: {
        operations: [
          {
            type: "vaultV2Redeem",
            vault,
            quote: redeemQuote,
            slippageTolerance: 0n,
          },
        ],
      },
      transactions: [redeemTransaction],
    });
    expect(redeemResult.verification.operations).toMatchObject([
      {
        operation: "vaultV2Redeem",
        vault,
        checkedLimits: { quote: redeemQuote, slippageTolerance: 0n },
      },
    ]);
    await expectExecutionMatches(client, {
      result: redeemResult,
      transaction: redeemTransaction,
      balances,
    });
  });
});

describeActors(blueBorrowScenario, (test, chainId) => {
  test("Blue: a previewed supplyCollateralBorrow with a Morpho authorization signature and a final full repayWithdrawCollateral match their execution", async ({
    client,
  }) => {
    const { blue: morpho } = getChainAddresses(chainId);
    const user = client.account.address;
    const market = await createE2eMarket(client, chainId);
    const liquidity = parseEther("10");
    const collateralAssets = parseEther("5");
    const borrowAssets = parseEther("2");
    // The extra test asset covers the interest accrued before the full repay.
    await wrapNative(client, {
      wNative: market.loanToken,
      amount: liquidity + collateralAssets + assets,
    });
    await client.approve({
      address: market.loanToken,
      args: [morpho, liquidity],
    });
    await client.writeContract({
      address: morpho,
      abi: blueAbi,
      functionName: "supply",
      args: [market, liquidity, 0n, user, "0x"],
    });
    const blue = client
      .extend(morphoViemExtension({ supportSignature: true }))
      .morpho.blue(market, chainId);
    // Loan and collateral use the same asset, so debt shares isolate one leg's effect.
    const balances = [
      { account: user, token: market.loanToken },
      { account: morpho, token: market.loanToken },
    ];

    const borrow = blue.supplyCollateralBorrow({
      userAddress: user,
      collateralAssets,
      borrowAssets,
      positionData: await blue.getPositionData(user),
      deadline: maxUint256,
    });
    const borrowRequirements = await borrow.getRequirements();
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    const authorizations = toSimulationAuthorizations({
      chainId,
      mode: "preview",
      blockNumber,
      owner: user,
      requirements: borrowRequirements,
    });
    expect(authorizations.map(({ type }) => type)).toContain(
      "blueAuthorizationSignature",
    );
    // No debt exists yet, so the borrow mints exactly this many shares.
    const borrowQuote = {
      sharesMinted: SharesMath.toShares(borrowAssets, 0n, 0n, "Up"),
    };
    const borrowResult = await simulate(configFor(client, chainId), {
      chainId,
      blockNumber,
      mode: "preview",
      authorizations,
      limits: {
        operations: [
          {
            type: "blueSupplyCollateralBorrow",
            marketId: market.id,
            quote: borrowQuote,
            slippageTolerance: 0n,
          },
        ],
      },
      transactions: [toTransaction(client, borrow.buildTx())],
    });
    expect(
      borrowResult.verification.authorizations.map(
        ({ authorization }) => authorization,
      ),
    ).toStrictEqual(authorizations);
    expect(borrowResult.verification.operations).toMatchObject([
      {
        operation: "blueSupplyCollateralBorrow",
        marketId: market.id,
        checkedLimits: { quote: borrowQuote, slippageTolerance: 0n },
      },
    ]);
    expect(diffOf(borrowResult, balances[0]!)).toBe(
      borrowAssets - collateralAssets,
    );
    const borrowSignatures = await fulfil(client, borrowRequirements);
    await expectExecutionMatches(client, {
      result: borrowResult,
      transaction: toTransaction(client, borrow.buildTx(borrowSignatures)),
      balances,
    });
    const borrowed = await blue.getPositionData(user);
    expect(borrowed.borrowShares).toBe(borrowQuote.sharesMinted);

    const repay = blue.repayWithdrawCollateral({
      userAddress: user,
      positionData: borrowed,
      repayShares: borrowed.borrowShares,
      collateralAssets,
      // A full repay funds the debt accrued until the deadline, capped at two hours ahead.
      deadline: BigInt(Math.floor(Date.now() / 1000)) + 3_600n,
    });
    const repayTransaction = toTransaction(
      client,
      repay.buildTx(await fulfil(client, await repay.getRequirements())),
    );
    const repayQuote = { sharesBurned: borrowed.borrowShares };
    const repayResult = await simulate(configFor(client, chainId), {
      chainId,
      blockNumber: await client.getBlockNumber({ cacheTime: 0 }),
      limits: {
        operations: [
          {
            type: "blueRepayWithdrawCollateral",
            marketId: market.id,
            quote: repayQuote,
            slippageTolerance: 0n,
          },
        ],
      },
      transactions: [repayTransaction],
    });
    expect(repayResult.verification.operations).toMatchObject([
      {
        operation: "blueRepayWithdrawCollateral",
        marketId: market.id,
        checkedLimits: { quote: repayQuote, slippageTolerance: 0n },
      },
    ]);
    await expectExecutionMatches(client, {
      result: repayResult,
      transaction: repayTransaction,
      balances,
    });
    const repaid = await blue.getPositionData(user);
    expect([repaid.borrowShares, repaid.collateral]).toStrictEqual([0n, 0n]);
  });
});
