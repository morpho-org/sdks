import {
  type ActionRequirement,
  isRequirementSignature,
  midnightSupplyCollateral,
  morphoViemExtension,
} from "@morpho-org/morpho-sdk";
import { midnightAbi } from "@morpho-org/morpho-sdk/abis";
import {
  MarketParams,
  Offer,
  Tree,
} from "@morpho-org/morpho-sdk/midnight/entities";
import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  maxUint256,
  padHex,
  parseEther,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  ConsumerLimitViolationError,
  simulate,
  toSimulationLimits,
} from "../../src/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  chainId: base.id,
  forkBlockNumber: 52_252_000n,
}).extend<{ client: AnvilTestClient<typeof base> }>({
  client: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const midnightBundlesV2 = getChainAddress(
  ChainId.BaseMainnet,
  "midnightBundlesV2",
);
const rateRatifierV1 = getChainAddress(ChainId.BaseMainnet, "rateRatifierV1");
const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const oracle: Address = "0x0000000000000000000000000000000000080000";
const other: Address = "0x00000000000000000000000000000000000c0E57";
const groupA = `0x${"aa".repeat(32)}` as Hex;
const groupB = `0x${"bb".repeat(32)}` as Hex;
const market = new MarketParams({
  chainId: base.id,
  midnight,
  loanToken: usdc,
  collateralParams: [
    {
      token: wNative,
      lltv: 770000000000000000n,
      liquidationCursor: 300000000000000000n,
      oracle,
    },
  ],
  maturity: 2_000_041_200n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
});
const twoCollateralMarket = new MarketParams({
  chainId: base.id,
  midnight,
  loanToken: usdc,
  collateralParams: [
    {
      token: wNative,
      lltv: 770000000000000000n,
      liquidationCursor: 300000000000000000n,
      oracle,
    },
    {
      token: usdc,
      lltv: 770000000000000000n,
      liquidationCursor: 300000000000000000n,
      oracle,
    },
  ],
  maturity: 2_000_041_200n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
});
const configFor = (client: { transport: { url?: string } }) => ({
  chains: new Map([[base.id, { simulateV1Url: client.transport.url! }]]),
});
const validation = {
  apiUrl: "https://api.example/base/",
  fetch: async () =>
    new Response(JSON.stringify({ data: { issues: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
};

const rateTree = (
  client: AnvilTestClient<typeof base>,
  params: {
    readonly group: Hex;
    readonly market?: MarketParams;
  },
) => {
  const offerMarket = params.market ?? market;
  return Tree.create({
    type: "rateV1",
    entries: [
      {
        offer: Offer.create({
          market: offerMarket,
          buy: false,
          maker: client.account.address,
          expiry: offerMarket.maturity,
          tick: 5_000n,
          group: params.group,
          ratifier: rateRatifierV1,
          continuousFeeCap: 0n,
          receiverIfMakerIsSeller: client.account.address,
          reduceOnly: false,
          maxUnits: 0n,
          maxAssets: parseUnits("1", 6),
          callback: zeroAddress,
          callbackData: "0x",
        }),
        rate: 1_000_000_000n,
      },
    ],
  });
};

const setUp = async (client: AnvilTestClient<typeof base>) => {
  const user = client.account.address;
  await client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(10n ** 36n), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });
  await client.deal({
    erc20: wNative,
    account: user,
    amount: parseEther("10"),
  });
  await client.setBalance({
    address: user,
    value: parseEther("10"),
  });
  await client.setBalance({ address: other, value: parseEther("1") });
  await client.sendTransaction({
    account: other,
    to: midnight,
    data: encodeFunctionData({
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [user, true, other],
    }),
  });
  await client.writeContract({
    account: client.account,
    address: wNative,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, maxUint256],
  });
  const seed = midnightSupplyCollateral({
    chainId: base.id,
    market,
    assets: 1n,
    onBehalf: other,
  });
  await client.sendTransaction({
    account: client.account,
    to: seed.to,
    data: seed.data,
  });
  return user;
};

const setUpTwoCollateralMarket = async (
  client: AnvilTestClient<typeof base>,
) => {
  const user = await setUp(client);
  await client.deal({
    erc20: usdc,
    account: user,
    amount: parseUnits("1000", 6),
  });
  await client.writeContract({
    account: client.account,
    address: usdc,
    abi: erc20Abi,
    functionName: "approve",
    args: [midnight, maxUint256],
  });
  const seed = midnightSupplyCollateral({
    chainId: base.id,
    market: twoCollateralMarket,
    collateralIndex: 1n,
    assets: 1n,
    onBehalf: other,
  });
  await client.sendTransaction({
    account: client.account,
    to: seed.to,
    data: seed.data,
  });
  return user;
};

const makeOutput = (
  client: AnvilTestClient<typeof base>,
  params: {
    readonly group: Hex;
    readonly collateralMarket?: MarketParams;
    readonly supplies: readonly {
      readonly collateralIndex: bigint;
      readonly assets: bigint;
    }[];
    readonly nativeAmount?: bigint;
  },
) => {
  const collateralMarket = params.collateralMarket ?? market;
  return client
    .extend(morphoViemExtension())
    .morpho.midnight(base.id)
    .supplyCollateralMakeBorrow({
      accountAddress: client.account.address,
      offers: rateTree(client, {
        group: params.group,
        market: collateralMarket,
      }),
      collateral: { market: collateralMarket, supplies: params.supplies },
      deadline: maxUint256,
      validation,
      ...(params.nativeAmount !== undefined
        ? { nativeAmount: params.nativeAmount }
        : {}),
    });
};

const fulfilRequirements = async <
  T extends {
    getRequirements: () => Promise<readonly ActionRequirement[]>;
    buildTx: () => { readonly to: Address };
  },
>(
  client: AnvilTestClient<typeof base>,
  output: T,
) => {
  for (const requirement of await output.getRequirements()) {
    if (!isRequirementSignature(requirement)) {
      await client.sendTransaction(requirement);
    }
  }
  await expect(output.getRequirements()).resolves.toEqual([]);
  expect(output.buildTx().to).toBe(midnightBundlesV2);
};

describe.sequential("supplyCollateralMakeBorrow limits — Base fork", () => {
  test("verifies the maker collateral operation from a zero prior position", async ({
    client,
  }) => {
    const user = await setUp(client);
    const assets = parseEther("1");
    const output = await makeOutput(client, {
      group: groupA,
      supplies: [{ collateralIndex: 0n, assets }],
    });
    await fulfilRequirements(client, output);
    const tx = output.buildTx();
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [tx.action.args.market, user, 0n],
      }),
    ).resolves.toBe(0n);

    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [{ from: user, to: tx.to, data: tx.data, value: tx.value }],
      limits: toSimulationLimits(tx.action, { owner: user }),
    });

    expect(result.verification.operations).toEqual([
      {
        operation: "midnightSupplyCollateral",
        marketId: tx.action.args.market,
        collateralIndex: 0n,
        account: user,
        receiver: user,
        checkedLimits: {
          quote: {
            assetsPaid: assets,
            collateralSupplied: assets,
          },
          slippageTolerance: 300000000000000n,
        },
      },
    ]);
  });

  test("aggregates repeated collateral supplies and permits partial native wrapping", async ({
    client,
  }) => {
    const user = await setUp(client);
    const assetsPerSupply = parseEther("0.5");
    const totalAssets = assetsPerSupply * 2n;
    const output = await makeOutput(client, {
      group: groupA,
      supplies: [
        { collateralIndex: 0n, assets: assetsPerSupply },
        { collateralIndex: 0n, assets: assetsPerSupply },
      ],
      nativeAmount: assetsPerSupply,
    });
    await fulfilRequirements(client, output);
    const tx = output.buildTx();
    expect(tx.value).toBe(assetsPerSupply);

    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [{ from: user, to: tx.to, data: tx.data, value: tx.value }],
      limits: toSimulationLimits(tx.action, { owner: user }),
    });

    expect(result.verification.operations).toEqual([
      {
        operation: "midnightSupplyCollateral",
        marketId: tx.action.args.market,
        collateralIndex: 0n,
        account: user,
        receiver: user,
        checkedLimits: {
          quote: {
            assetsPaid: totalAssets,
            collateralSupplied: totalAssets,
          },
          slippageTolerance: 300000000000000n,
        },
      },
    ]);
  });

  test("verifies both collateral indexes in first-seen order", async ({
    client,
  }) => {
    const user = await setUpTwoCollateralMarket(client);
    expect(
      twoCollateralMarket.collateralParams.map(({ token }) => token),
    ).toEqual([wNative, usdc]);
    const usdcAssets = parseUnits("100", 6);
    const wNativeAssets = parseEther("1");
    const output = await makeOutput(client, {
      group: groupA,
      collateralMarket: twoCollateralMarket,
      supplies: [
        { collateralIndex: 1n, assets: usdcAssets },
        { collateralIndex: 0n, assets: wNativeAssets },
      ],
    });
    await fulfilRequirements(client, output);
    const tx = output.buildTx();
    const result = await simulate(configFor(client), {
      chainId: base.id,
      transactions: [{ from: user, to: tx.to, data: tx.data, value: tx.value }],
      limits: toSimulationLimits(tx.action, { owner: user }),
    });

    expect(result.verification.operations).toEqual([
      {
        operation: "midnightSupplyCollateral",
        marketId: tx.action.args.market,
        collateralIndex: 1n,
        account: user,
        receiver: user,
        checkedLimits: {
          quote: {
            assetsPaid: usdcAssets,
            collateralSupplied: usdcAssets,
          },
          slippageTolerance: 300000000000000n,
        },
      },
      {
        operation: "midnightSupplyCollateral",
        marketId: tx.action.args.market,
        collateralIndex: 0n,
        account: user,
        receiver: user,
        checkedLimits: {
          quote: {
            assetsPaid: wNativeAssets,
            collateralSupplied: wNativeAssets,
          },
          slippageTolerance: 300000000000000n,
        },
      },
    ]);
  });

  test("rejects a successful maker transaction when its collateral limit overstates the supply", async ({
    client,
  }) => {
    const user = await setUp(client);
    const intended = await makeOutput(client, {
      group: groupA,
      supplies: [{ collateralIndex: 0n, assets: parseEther("2") }],
    });
    const delivered = await makeOutput(client, {
      group: groupB,
      supplies: [{ collateralIndex: 0n, assets: parseEther("1") }],
    });
    await fulfilRequirements(client, delivered);
    const tx = delivered.buildTx();
    const transactions = [
      { from: user, to: tx.to, data: tx.data, value: tx.value },
    ];

    const successful = await simulate(configFor(client), {
      chainId: base.id,
      transactions,
      limits: toSimulationLimits(tx.action, { owner: user }),
    });
    expect(successful.calls[0]?.status).toBe(true);

    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions,
      limits: toSimulationLimits(intended.buildTx().action, { owner: user }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect(error).toHaveProperty(
      "message",
      expect.stringContaining(
        'Limit operation 0 (midnightSupplyCollateral): slippage for "collateralSupplied"',
      ),
    );

    const hash = await client.sendTransaction(tx);
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
  });

  test("rejects a successful two-index maker transaction when index 1 is overstated", async ({
    client,
  }) => {
    const user = await setUpTwoCollateralMarket(client);
    const delivered = await makeOutput(client, {
      group: groupA,
      collateralMarket: twoCollateralMarket,
      supplies: [
        { collateralIndex: 0n, assets: parseEther("1") },
        { collateralIndex: 1n, assets: parseUnits("100", 6) },
      ],
    });
    const intended = await makeOutput(client, {
      group: groupB,
      collateralMarket: twoCollateralMarket,
      supplies: [
        { collateralIndex: 0n, assets: parseEther("1") },
        { collateralIndex: 1n, assets: parseUnits("200", 6) },
      ],
    });
    await fulfilRequirements(client, delivered);
    const tx = delivered.buildTx();
    const transactions = [
      { from: user, to: tx.to, data: tx.data, value: tx.value },
    ];
    const successful = await simulate(configFor(client), {
      chainId: base.id,
      transactions,
      limits: toSimulationLimits(tx.action, { owner: user }),
    });
    expect(successful.calls[0]?.status).toBe(true);

    const error = await simulate(configFor(client), {
      chainId: base.id,
      transactions,
      limits: toSimulationLimits(intended.buildTx().action, { owner: user }),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConsumerLimitViolationError);
    expect(error).toHaveProperty(
      "message",
      expect.stringContaining(
        'Limit operation 1 (midnightSupplyCollateral): slippage for "collateralSupplied"',
      ),
    );

    const hash = await client.sendTransaction(tx);
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
  });
});
