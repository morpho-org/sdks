import {
  getChainAddresses,
  MarketParams,
  MathLib,
  marketParamsAbi,
} from "@morpho-org/blue-sdk";
import {
  blueAbi,
  fetchAccrualPosition,
  fetchAccrualVaultV2,
  fetchMarket,
  fetchVaultV2BluePublicAllocatorData,
  vaultV2Abi,
  vaultV2BluePublicAllocatorAbi,
} from "@morpho-org/blue-sdk-viem";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  maxUint128,
  parseEther,
  parseUnits,
} from "viem";
import { base } from "viem/chains";
import { assert, expect } from "vitest";
import { blueSupplyCollateralBorrow } from "../../../src/actions/blue/supplyCollateralBorrow.js";
import { VaultV2BlueReallocationData } from "../../../src/entities/vaultV2BlueReallocationData.js";
import {
  applySignatures,
  buildTransactions,
  DEFAULT_LLTV_BUFFER,
  InputExceedsMaxError,
  parseTransactionPlan,
  prepareBlueSupplyCollateralBorrow,
  serializeTransactionPlan,
} from "../../../src/index.js";
import {
  deployMorphoMarketV1AdapterV2,
  deployVaultV2,
  submitAndAcceptVaultV2Call,
} from "../../helpers/vaultV2.js";

const target = new MarketParams({
  loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  collateralToken: "0x4200000000000000000000000000000000000006",
  oracle: "0xFEa2D58cEfCb9fcb597723c6bAE66fFE4193aFE4",
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
  lltv: 860_000_000_000_000_000n,
});
const source = new MarketParams({
  ...target,
  collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
});
const test = createViemTest(base, {
  forkUrl:
    process.env.BASE_RPC_URL ??
    getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 50_438_617n,
  stepsTracing: false,
});

test("market and idle allocations preserve inputs and pay borrow proceeds net of aggregate penalty", async ({
  client,
}) => {
  const anvil = client as AnvilTestClient;
  await client.setBalance({
    address: client.account.address,
    value: parseEther("100"),
  });
  const { blue, vaultV2BluePublicAllocator: allocator } = getChainAddresses(
    base.id,
  );
  assert(allocator !== undefined);
  for (const market of [source, target]) {
    const state = await client.readContract({
      address: blue,
      abi: blueAbi,
      functionName: "market",
      args: [market.id],
    });
    if (state[4] === 0n) {
      await client.writeContract({
        address: blue,
        abi: blueAbi,
        functionName: "createMarket",
        args: [market],
      });
    }
  }
  const vault = await deployVaultV2({ client: anvil, asset: target.loanToken });
  const accept = (data: `0x${string}`) =>
    submitAndAcceptVaultV2Call(anvil, { vault, data });
  await accept(
    encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "setIsAllocator",
      args: [client.account.address, true],
    }),
  );
  const adapter = await deployMorphoMarketV1AdapterV2(anvil, vault);
  await accept(
    encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "addAdapter",
      args: [adapter],
    }),
  );
  const sharedCapId = encodeAbiParameters(
    [{ type: "string" }, { type: "address" }],
    ["this", adapter],
  );
  const capIds = new Set([
    sharedCapId,
    ...[source, target].flatMap((marketParams) => [
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["collateralToken", marketParams.collateralToken],
      ),
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }, marketParamsAbi],
        ["this/marketParams", adapter, marketParams],
      ),
    ]),
  ]);
  for (const id of capIds) {
    await accept(
      encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "increaseAbsoluteCap",
        args: [id, maxUint128],
      }),
    );
    await accept(
      encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "increaseRelativeCap",
        args: [id, MathLib.WAD],
      }),
    );
  }
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "setLiquidityAdapterAndData",
    args: [adapter, encodeAbiParameters([marketParamsAbi], [source])],
  });
  await accept(
    encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "setIsAllocator",
      args: [allocator, true],
    }),
  );
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setIsActiveAdapter",
    args: [vault, adapter, true],
  });
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setAbsoluteCap",
    args: [vault, adapter, target, maxUint128],
  });
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setCanPullFromMarket",
    args: [vault, adapter, source, true],
  });
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setCanPullFromIdle",
    args: [vault, true],
  });
  const penalty = MathLib.WAD / 100n;
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setPenalty",
    args: [vault, penalty],
  });
  await client.deal({ erc20: target.loanToken, amount: parseUnits("120", 6) });
  await client.approve({
    address: target.loanToken,
    args: [vault, parseUnits("120", 6)],
  });
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "deposit",
    args: [parseUnits("120", 6), client.account.address],
  });
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "deallocate",
    args: [
      adapter,
      encodeAbiParameters([marketParamsAbi], [source]),
      parseUnits("20", 6),
    ],
  });
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "decreaseRelativeCap",
    args: [sharedCapId, (MathLib.WAD * 9n) / 10n],
  });
  const block = await client.getBlock();
  const fetchParams = { blockNumber: block.number };
  const snapshot = await fetchMarket(target.id, client, fetchParams);
  const vaultData = await fetchAccrualVaultV2(vault, client, fetchParams);
  const allocatorData = await fetchVaultV2BluePublicAllocatorData(
    vaultData,
    client,
    {
      ...fetchParams,
      targetMarketParams: target,
    },
  );
  const blueBalance = await client.readContract({
    address: target.loanToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [blue],
    blockNumber: block.number,
  });
  const reallocationData = new VaultV2BlueReallocationData({
    chainId: base.id,
    timestamp: block.timestamp,
    blueBalances: { [target.loanToken]: blueBalance },
    markets: { [snapshot.id]: snapshot },
    vaults: { [vault]: vaultData },
    allocations: { [vault]: allocatorData.allocations },
    publicAllocatorConfigs: { [vault]: allocatorData.publicAllocatorConfig },
    activeAdapters: { [vault]: allocatorData.activeAdapters },
    marketPublicAllocatorConfigs: {
      [vault]: allocatorData.marketPublicAllocatorConfigs,
    },
  });
  const { reallocations } = reallocationData.computeVaultV2BlueReallocations(
    target.id,
    {
      timestamp: block.timestamp,
      maxPenalty: penalty,
    },
  );
  expect(reallocations.some(({ from }) => from.type === "market")).toBe(true);
  expect(reallocations.some(({ from }) => from.type === "idle")).toBe(true);
  const penaltyAssets = reallocations.reduce(
    (sum, entry) => sum + MathLib.wMulUp(entry.assets, entry.penalty),
    0n,
  );
  expect(penaltyAssets).toBeGreaterThan(0n);
  const position = await fetchAccrualPosition(
    client.account.address,
    target.id,
    client,
    fetchParams,
  );
  const params = {
    chainId: base.id,
    account: client.account.address,
    marketId: target.id,
    marketData: { chainId: base.id, market: snapshot },
    positionData: { chainId: base.id, position },
    collateralAssets: parseEther("1"),
    borrowAssets: parseUnits("2", 6),
    funding: { type: "native" as const },
    reallocations,
    maxPenalty: penalty,
    now: block.timestamp,
    expiresAt: Number(block.timestamp + 3600n),
    supportSignature: true,
  };
  await expect(
    prepareBlueSupplyCollateralBorrow(client, {
      ...params,
      borrowAssets: penaltyAssets - 1n,
    }),
  ).rejects.toBeInstanceOf(InputExceedsMaxError);
  await client.setCode({ address: client.account.address, bytecode: "0x" });
  const plan = await prepareBlueSupplyCollateralBorrow(client, params);
  const signed = applySignatures(
    plan,
    await Promise.all(
      plan.signatureRequests.map(async (pending) => ({
        id: pending.id,
        signature: await client.signTypedData({
          ...pending.typedData,
          account: client.account,
        }),
      })),
    ),
  );
  const restored = parseTransactionPlan(serializeTransactionPlan(signed));
  const operation = restored.steps.at(-1)!;
  assert(operation.action.type === "blueSupplyCollateralBorrow");
  expect(operation.action.inputs.reallocations).toEqual(reallocations);
  const transactions = buildTransactions(restored);
  await client.setBalance({
    address: client.account.address,
    value: parseEther("100"),
  });
  const request = signed.signatureRequests[0]!;
  assert(
    request.kind === "morphoAuthorization" && request.signature !== undefined,
  );
  const reference = blueSupplyCollateralBorrow({
    market: { chainId: base.id, marketParams: target },
    args: {
      userAddress: client.account.address,
      collateralAssets: params.collateralAssets,
      borrowAssets: params.borrowAssets,
      nativeAmount: params.collateralAssets,
      reallocations,
      maxPenalty: penalty,
      maxLtv: MathLib.zeroFloorSub(target.lltv, DEFAULT_LLTV_BUFFER),
      deadline: BigInt(params.expiresAt),
      authorizationSignature: {
        action: {
          type: "authorization",
          args: {
            authorized: request.args.authorized,
            isAuthorized: true,
            deadline: request.args.deadline,
          },
        },
        args: {
          ...request.args,
          isAuthorized: true,
          signature: request.signature,
        },
      },
    },
  });
  expect(transactions.at(-1)?.data).toBe(reference.data);
  expect(transactions.at(-1)?.value).toBe(reference.value);
  const balanceBefore = await client.balanceOf({ erc20: target.loanToken });
  for (const transaction of transactions) {
    const hash = await client.sendTransaction(transaction);
    expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
      "success",
    );
  }
  expect(
    (await client.balanceOf({ erc20: target.loanToken })) - balanceBefore,
  ).toBe(params.borrowAssets - penaltyAssets);
  const after = await fetchAccrualPosition(
    client.account.address,
    target.id,
    client,
  );
  expect(after.collateral - position.collateral).toBe(params.collateralAssets);
  expect(after.borrowShares).toBeGreaterThan(position.borrowShares);
  expect(after.supplyShares).toBe(position.supplyShares);
});
