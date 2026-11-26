import {
  type AccrualPosition,
  getChainAddresses,
  MathLib,
} from "@morpho-org/blue-sdk";
import { blueAbi, fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  decodeFunctionData,
  encodeFunctionData,
  parseEther,
  zeroHash,
} from "viem";
import { mainnet } from "viem/chains";
import { assert, expect } from "vitest";
import { blueBundlesV1Abi } from "../../../src/abis.js";
import {
  applySignatures,
  type BlueRefinancePlanParams,
  BorrowExceedsSafeLtvError,
  blueRefinance,
  buildTransactions,
  DEFAULT_LLTV_BUFFER,
  getPendingSignatureRequests,
  parseTransactionPlan,
  prepareBlueRefinance,
  serializeTransactionPlan,
} from "../../../src/index.js";
import { supplyLoan } from "../../helpers/blue.js";
import { blueBundlesV1Test as test } from "../../helpers/blueBundlesV1.js";
import {
  createRefinanceScenario,
  destinationMarket,
} from "../../helpers/penalizedReallocations.js";

const chainId = mainnet.id;
const bundles = getChainAddress(chainId, "bundles.blueBundlesV1");
const { blue } = getChainAddresses(chainId);

function snapshot(position: AccrualPosition) {
  return {
    marketId: position.marketId,
    marketData: { chainId, market: position.market },
    positionData: { chainId, position },
  };
}

async function fetchParams({
  client,
  sourcePosition,
}: Awaited<ReturnType<typeof createRefinanceScenario>>) {
  const block = await client.getBlock();
  const account = client.account.address;
  const [source, destination] = await Promise.all([
    fetchAccrualPosition(account, sourcePosition.marketId, client, {
      blockNumber: block.number,
    }),
    fetchAccrualPosition(account, destinationMarket.id, client, {
      blockNumber: block.number,
    }),
  ]);
  return {
    chainId,
    account,
    source: snapshot(source),
    destination: snapshot(destination),
    now: block.timestamp,
  };
}

async function authorize(client: AnvilTestClient) {
  await client.writeContract({
    address: blue,
    abi: blueAbi,
    functionName: "setAuthorization",
    args: [bundles, true],
  });
}

async function assertMigration(
  scenario: Awaited<ReturnType<typeof createRefinanceScenario>>,
  params: BlueRefinancePlanParams,
) {
  const { source, destination } = await fetchParams(scenario);
  const sourceAfter = source.positionData.position;
  const destinationAfter = destination.positionData.position;
  const before = params.source.positionData.position;
  const destinationBefore = params.destination.positionData.position;
  expect(sourceAfter.borrowShares).toBe(0n);
  expect(sourceAfter.collateral).toBe(0n);
  expect(sourceAfter.supplyShares).toBe(before.supplyShares);
  expect(destinationAfter.supplyShares).toBe(destinationBefore.supplyShares);
  expect(destinationAfter.borrowShares).toBeGreaterThan(
    destinationBefore.borrowShares,
  );
  expect(destinationAfter.collateral).toBe(
    destinationBefore.collateral + before.collateral,
  );
  return { sourceAfter, destinationAfter };
}

for (const mode of [
  "already authorized",
  "direct step",
  "inline signature",
] as const) {
  test(`refinances with ${mode} and encodes the expected authorization`, async ({
    client,
  }) => {
    const scenario = await createRefinanceScenario(client, []);
    await supplyLoan({
      client,
      chainId,
      market: destinationMarket,
      supplyAmount: parseEther("3"),
    });
    if (mode === "already authorized") {
      await authorize(client);
    }
    const supportSignature = mode !== "direct step";
    const params = { ...(await fetchParams(scenario)), supportSignature };
    const plan = await prepareBlueRefinance(client, params);
    const requests = getPendingSignatureRequests(plan);
    let signedPlan = plan;
    const deadline = BigInt(plan.expiresAt);
    if (mode === "inline signature") {
      const [request] = requests;
      assert(request?.kind === "morphoAuthorization");
      expect(requests).toHaveLength(1);
      const nonce = await client.readContract({
        address: blue,
        abi: blueAbi,
        functionName: "nonce",
        args: [params.account],
      });
      expect(request.args).toEqual({
        owner: params.account,
        authorized: bundles,
        nonce,
        deadline,
      });
      expect(request.typedData.message).toEqual({
        authorizer: params.account,
        authorized: bundles,
        isAuthorized: true,
        nonce,
        deadline,
      });
      const signature = await client.signTypedData(request.typedData);
      signedPlan = applySignatures(plan, [{ id: request.id, signature }]);
    } else {
      expect(requests).toEqual([]);
    }
    expect(plan.steps.map(({ action }) => action.type)).toEqual(
      mode === "direct step"
        ? ["morphoAuthorization", "blueRefinance"]
        : ["blueRefinance"],
    );

    const txs = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(signedPlan)),
    );
    if (mode === "direct step") {
      expect(txs[0]).toMatchObject({
        to: blue,
        data: encodeFunctionData({
          abi: blueAbi,
          functionName: "setAuthorization",
          args: [bundles, true],
        }),
        value: 0n,
      });
    }
    const migration = txs.at(-1);
    assert(migration);
    expect(migration).toMatchObject({ to: bundles, value: 0n });
    const decoded = decodeFunctionData({
      abi: blueBundlesV1Abi,
      data: migration.data,
    });
    assert(decoded.functionName === "blueBundlesV1MigrateBorrowPosition");
    const [
      source,
      destination,
      maxLtv,
      authorization,
      allocations,
      fee,
      ,
      expiresAt,
    ] = decoded.args;
    expect(params.source.marketData.market.params).toMatchObject(source);
    expect(params.destination.marketData.market.params).toMatchObject(
      destination,
    );
    expect(maxLtv).toBe(destinationMarket.lltv - DEFAULT_LLTV_BUFFER);
    expect(allocations).toEqual([]);
    expect(fee).toBe(0n);
    expect(expiresAt).toBe(deadline);
    if (mode === "inline signature") {
      expect(authorization.deadline).toBe(deadline);
      expect(authorization.signature.v).toBeOneOf([27, 28]);
    } else {
      expect(authorization).toEqual({
        nonce: 0n,
        deadline: 0n,
        signature: { v: 0, r: zeroHash, s: zeroHash },
      });
    }
    const loanToken = params.source.marketData.market.params.loanToken;
    const walletBefore = await client.balanceOf({ erc20: loanToken });
    for (const tx of txs) {
      const hash = await client.sendTransaction(tx);
      expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
        "success",
      );
    }
    expect(await client.balanceOf({ erc20: loanToken })).toBe(walletBefore);
    await assertMigration(scenario, params);
  });
}

test("ordered market and idle allocations fund a refinance; penalties increase destination debt", async ({
  client,
}) => {
  const penalty = parseEther("0.1");
  const scenario = await createRefinanceScenario(client, [
    { assets: parseEther("0.7"), penalty, liquiditySource: "market" },
    { assets: parseEther("20"), penalty },
  ]);
  await authorize(client);
  const params = await fetchParams(scenario);
  const sourceBefore = params.source.positionData.position;
  const destinationBefore = params.destination.positionData.position;
  const [marketVault, idleVault] = scenario.vaults;
  assert(marketVault && idleVault);
  const reallocations = [
    {
      vault: marketVault.vault,
      from: {
        type: "market",
        adapter: marketVault.adapter,
        marketParams: sourceBefore.market.params,
      },
      to: { adapter: marketVault.adapter },
      assets: parseEther("0.5"),
      penalty,
    },
    {
      vault: idleVault.vault,
      from: { type: "idle" },
      to: { adapter: idleVault.adapter },
      assets: parseEther("0.8"),
      penalty,
    },
  ] as const;

  const plan = await prepareBlueRefinance(client, {
    ...params,
    reallocations,
    maxPenalty: penalty,
  });
  const [step] = plan.steps;
  assert(step?.action.type === "blueRefinance");
  expect(step.action.inputs.reallocations).toEqual(reallocations);
  const [tx] = buildTransactions(
    parseTransactionPlan(serializeTransactionPlan(plan)),
  );
  assert(tx?.action.type === "blueRefinance");
  const decoded = decodeFunctionData({ abi: blueBundlesV1Abi, data: tx.data });
  assert(decoded.functionName === "blueBundlesV1MigrateBorrowPosition");
  const maxLtv = destinationMarket.lltv - DEFAULT_LLTV_BUFFER;
  expect(decoded.args[2]).toBe(maxLtv);
  expect(tx.data).toBe(
    blueRefinance({
      market: {
        chainId,
        sourceMarketParams: sourceBefore.market.params,
        destinationMarketParams: destinationMarket,
      },
      args: {
        userAddress: params.account,
        maxLtv,
        deadline: BigInt(plan.expiresAt),
        reallocations,
        maxPenalty: penalty,
      },
    }).data,
  );

  const [impossibleLtv] = buildTransactions({
    ...plan,
    steps: [
      {
        ...step,
        action: {
          ...step.action,
          inputs: { ...step.action.inputs, maxLtv: 1n },
        },
      },
    ],
  });
  assert(impossibleLtv);
  await expect(
    client.call({ ...impossibleLtv, account: params.account }),
  ).rejects.toThrow(/revert/i);
  const hash = await client.sendTransaction(tx);
  const receipt = await client.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  const { destinationAfter } = await assertMigration(scenario, params);
  expect(destinationAfter.ltv).toBeLessThanOrEqual(maxLtv);

  const { timestamp } = await client.getBlock({
    blockNumber: receipt.blockNumber,
  });
  const expectedPenalty = reallocations.reduce(
    (sum, leg) => sum + MathLib.wMulUp(leg.assets, leg.penalty),
    0n,
  );
  const debtIncrease =
    destinationAfter.borrowAssets -
    destinationBefore.accrueInterest(timestamp).borrowAssets;
  const expectedIncrease =
    sourceBefore.accrueInterest(timestamp).borrowAssets + expectedPenalty;
  expect(debtIncrease).toBeGreaterThanOrEqual(expectedIncrease);
  expect(debtIncrease).toBeLessThanOrEqual(expectedIncrease + 2n);
});

test("[INV-03] individually safe allocator penalties are rejected when their sum exceeds destination LLTV headroom", async ({
  client,
}) => {
  const penalty = parseEther("0.95");
  const assets = parseEther("8");
  const scenario = await createRefinanceScenario(client, [
    { assets, penalty },
    { assets, penalty },
  ]);
  const params = await fetchParams(scenario);
  const reallocations = scenario.vaults.map(({ vault, adapter }) => ({
    vault,
    from: { type: "idle" } as const,
    to: { adapter },
    assets,
    penalty,
  }));
  for (const leg of reallocations) {
    await expect(
      prepareBlueRefinance(client, {
        ...params,
        reallocations: [leg],
        maxPenalty: penalty,
      }),
    ).resolves.toBeDefined();
  }
  await expect(
    prepareBlueRefinance(client, {
      ...params,
      reallocations,
      maxPenalty: penalty,
    }),
  ).rejects.toBeInstanceOf(BorrowExceedsSafeLtvError);
});
