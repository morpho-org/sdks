import {
  getChainAddresses,
  MarketParams,
  MathLib,
  marketParamsAbi,
} from "@morpho-org/blue-sdk";
import {
  blueAbi,
  fetchAccrualPosition,
  readContractRestructured,
  vaultV2Abi,
  vaultV2BluePublicAllocatorAbi,
} from "@morpho-org/blue-sdk-viem";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  encodeAbiParameters,
  encodeFunctionData,
  maxUint128,
  parseUnits,
} from "viem";
import { base } from "viem/chains";
import { assert, expect } from "vitest";
import { blueBorrow } from "../../../src/actions/blue/borrow.js";
import {
  buildTransactions,
  DEFAULT_LLTV_BUFFER,
  InputExceedsMaxError,
  parseTransactionPlan,
  prepareBlueBorrow,
  serializeTransactionPlan,
  type VaultV2BlueReallocation,
} from "../../../src/index.js";
import { supplyCollateral } from "../../helpers/blue.js";
import {
  deployMorphoMarketV1AdapterV2,
  deployVaultV2,
  submitAndAcceptVaultV2Call,
} from "../../helpers/vaultV2.js";

const baseTargetMarket = new MarketParams({
  loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  collateralToken: "0x4200000000000000000000000000000000000006",
  oracle: "0xFEa2D58cEfCb9fcb597723c6bAE66fFE4193aFE4",
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
  lltv: 860_000_000_000_000_000n,
});

const baseSourceMarket = new MarketParams({
  loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  oracle: "0xFEa2D58cEfCb9fcb597723c6bAE66fFE4193aFE4",
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
  lltv: 860_000_000_000_000_000n,
});

const test = createViemTest(base, {
  forkUrl:
    process.env.BASE_RPC_URL ??
    getErpcForkUrl(base.id, process.env.ERPC_SECRET) ??
    (process.env.ALCHEMY_KEY
      ? `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`
      : undefined),
  forkBlockNumber: 50_438_617n,
  stepsTracing: false,
});
test("borrow plan executes market and idle allocations with net penalties", async ({
  client,
}) => {
  const anvilClient = client as AnvilTestClient;
  const { blue: morpho, vaultV2BluePublicAllocator: allocator } =
    getChainAddresses(base.id);
  assert(allocator != null);
  const sourceDepositAssets = parseUnits("100", 6);
  const initialIdleAssets = parseUnits("20", 6);
  const penalty = MathLib.WAD / 100n;
  const operationAssets = parseUnits("2", 6);

  for (const marketParams of [baseSourceMarket, baseTargetMarket]) {
    const marketState = await readContractRestructured(client, {
      address: morpho,
      abi: blueAbi,
      functionName: "market",
      args: [marketParams.id],
    });
    if (marketState.lastUpdate === 0n) {
      await client.writeContract({
        address: morpho,
        abi: blueAbi,
        functionName: "createMarket",
        args: [marketParams],
      });
    }
  }

  const vault = await deployVaultV2({
    client: anvilClient,
    asset: baseTargetMarket.loanToken,
  });
  await submitAndAcceptVaultV2Call(anvilClient, {
    vault,
    data: encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "setIsAllocator",
      args: [client.account.address, true],
    }),
  });
  const targetAdapter = await deployMorphoMarketV1AdapterV2(anvilClient, vault);
  await submitAndAcceptVaultV2Call(anvilClient, {
    vault,
    data: encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "addAdapter",
      args: [targetAdapter],
    }),
  });

  const sharedCapId = encodeAbiParameters(
    [{ type: "string" }, { type: "address" }],
    ["this", targetAdapter],
  );
  const capIds = new Set([
    sharedCapId,
    ...[baseSourceMarket, baseTargetMarket].flatMap((marketParams) => [
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["collateralToken", marketParams.collateralToken],
      ),
      encodeAbiParameters(
        [{ type: "string" }, { type: "address" }, marketParamsAbi],
        ["this/marketParams", targetAdapter, marketParams],
      ),
    ]),
  ]);
  for (const idData of capIds) {
    await submitAndAcceptVaultV2Call(anvilClient, {
      vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "increaseAbsoluteCap",
        args: [idData, maxUint128],
      }),
    });
    await submitAndAcceptVaultV2Call(anvilClient, {
      vault,
      data: encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "increaseRelativeCap",
        args: [idData, MathLib.WAD],
      }),
    });
  }

  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "setLiquidityAdapterAndData",
    args: [
      targetAdapter,
      encodeAbiParameters([marketParamsAbi], [baseSourceMarket]),
    ],
  });

  await submitAndAcceptVaultV2Call(anvilClient, {
    vault,
    data: encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "setIsAllocator",
      args: [allocator, true],
    }),
  });
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setIsActiveAdapter",
    args: [vault, targetAdapter, true],
  });
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setAbsoluteCap",
    args: [vault, targetAdapter, baseTargetMarket, maxUint128],
  });
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setCanPullFromMarket",
    args: [vault, targetAdapter, baseSourceMarket, true],
  });
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setCanPullFromIdle",
    args: [vault, true],
  });
  await client.writeContract({
    address: allocator,
    abi: vaultV2BluePublicAllocatorAbi,
    functionName: "setPenalty",
    args: [vault, penalty],
  });

  await client.deal({
    account: client.account.address,
    erc20: baseTargetMarket.loanToken,
    amount: sourceDepositAssets + initialIdleAssets,
  });
  await client.approve({
    address: baseTargetMarket.loanToken,
    args: [vault, sourceDepositAssets + initialIdleAssets],
  });
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "deposit",
    args: [sourceDepositAssets + initialIdleAssets, client.account.address],
  });
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "deallocate",
    args: [
      targetAdapter,
      encodeAbiParameters([marketParamsAbi], [baseSourceMarket]),
      initialIdleAssets,
    ],
  });
  await client.writeContract({
    address: vault,
    abi: vaultV2Abi,
    functionName: "decreaseRelativeCap",
    args: [sharedCapId, (MathLib.WAD * 9n) / 10n],
  });
  await supplyCollateral({
    client: anvilClient,
    chainId: base.id,
    market: baseTargetMarket,
    collateralAmount: parseUnits("1", 18),
  });
  const block = await client.getBlock();
  const reallocations: readonly VaultV2BlueReallocation[] = [
    {
      vault,
      from: {
        type: "market",
        adapter: targetAdapter,
        marketParams: baseSourceMarket,
      },
      to: { adapter: targetAdapter },
      assets: parseUnits("1", 6),
      penalty,
    },
    {
      vault,
      from: { type: "idle" },
      to: { adapter: targetAdapter },
      assets: parseUnits("1", 6),
      penalty,
    },
  ];
  expect(new Set(reallocations.map(({ from }) => from.type))).toEqual(
    new Set(["market", "idle"]),
  );
  const totalPenalty = reallocations.reduce(
    (sum, allocation) =>
      sum + MathLib.wMulUp(allocation.assets, allocation.penalty),
    0n,
  );
  expect(totalPenalty).toBeGreaterThan(0n);
  expect(totalPenalty).toBeLessThan(operationAssets);
  const position = await fetchAccrualPosition(
    client.account.address,
    baseTargetMarket.id,
    client,
  );
  const params = {
    chainId: base.id,
    account: client.account.address,
    marketId: baseTargetMarket.id,
    marketData: { chainId: base.id, market: position.market },
    positionData: { chainId: base.id, position },
    now: block.timestamp,
    borrowAssets: operationAssets,
    reallocations,
  };
  await expect(
    prepareBlueBorrow(client, { ...params, borrowAssets: totalPenalty - 1n }),
  ).rejects.toBeInstanceOf(InputExceedsMaxError);
  const plan = await prepareBlueBorrow(client, params);
  const before = await client.balanceOf({
    erc20: baseTargetMarket.loanToken,
    owner: client.account.address,
  });
  const transactions = buildTransactions(
    parseTransactionPlan(serializeTransactionPlan(plan)),
  );
  const borrow = transactions.at(-1);
  assert(borrow);
  expect(borrow.data).toBe(
    blueBorrow({
      market: { chainId: base.id, marketParams: baseTargetMarket },
      args: {
        userAddress: client.account.address,
        borrowAssets: operationAssets,
        maxLtv: baseTargetMarket.lltv - DEFAULT_LLTV_BUFFER,
        reallocations,
        deadline: BigInt(plan.expiresAt),
      },
    }).data,
  );
  for (const transaction of transactions) {
    const hash = await client.sendTransaction(transaction);
    await client.waitForTransactionReceipt({ hash });
  }
  expect(
    await client.balanceOf({
      erc20: baseTargetMarket.loanToken,
      owner: client.account.address,
    }),
  ).toBe(before + operationAssets - totalPenalty);
  const after = await fetchAccrualPosition(
    client.account.address,
    baseTargetMarket.id,
    client,
  );
  expect(after.borrowShares).toBeGreaterThan(position.borrowShares);
  expect(after.collateral).toBe(position.collateral);
  expect(after.isHealthy).toBe(true);
});
