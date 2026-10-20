import { MarketUtils as BlueMarketUtils } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import {
  blueBuyCallbackFactoryAbi,
  Market,
  MarketParams,
  MarketUtils,
  midnightAbi,
  Offer,
  OfferUtils,
  priceRatifierV1Abi,
  RateRatifierV1,
  rateRatifierV1Abi,
  Tree,
} from "@morpho-org/midnight-sdk";
import { ChainId, getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  erc20Abi,
  type Hex,
  maxUint128,
  maxUint256,
  padHex,
  parseEther,
  parseUnits,
  toFunctionSelector,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import type { MidnightMakeOffersOutput } from "../../../src/entities/index.js";
import {
  getMidnightBlueBuyCallbackData,
  isRequirementSignature,
  morphoViemExtension,
} from "../../../src/index.js";
import {
  EmptyBlueParkingMarketError,
  MidnightInvalidAccountAddressError,
  MidnightOfferNoCreditError,
  MidnightOfferNoDebtError,
} from "../../../src/types/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 52_252_000n,
  stepsTracing: false,
});

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const midnightBundlesV2 = getChainAddress(
  ChainId.BaseMainnet,
  "midnightBundlesV2",
);
const priceRatifierV1 = getChainAddress(ChainId.BaseMainnet, "priceRatifierV1");
const rateRatifierV1 = getChainAddress(ChainId.BaseMainnet, "rateRatifierV1");
const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const oracle = "0x0000000000000000000000000000000000080000" as Address;
const groupA = `0x${"aa".repeat(32)}` as Hex;
const groupB = `0x${"bb".repeat(32)}` as Hex;
const makerPositionGroup = `0x${"dd".repeat(32)}` as Hex;
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
const marketData = new Market({
  params: market,
  totalUnits: 0n,
  lossFactor: 0n,
  withdrawable: 0n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
  continuousFee: 0,
  tickSpacing: 1,
});
/** Skips the Midnight mempool API; the fork test covers onchain publication only. */
const validation = {
  apiUrl: "https://api.example/base/",
  fetch: async () =>
    new Response(JSON.stringify({ data: { issues: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
};

const blue = getChainAddress(ChainId.BaseMainnet, "blue");
const blueBuyCallbackFactory = getChainAddress(
  ChainId.BaseMainnet,
  "midnightBlueBuyCallbackFactory",
);
const blueMarket = {
  loanToken: usdc,
  collateralToken: wNative,
  oracle,
  irm: getChainAddress(ChainId.BaseMainnet, "adaptiveCurveIrm"),
  lltv: 860000000000000000n,
};
const callbackSalt = `0x${"cc".repeat(32)}` as Hex;
const taker = "0x0000000000000000000000000000000000007a4e" as Address;

/** Creates `blueMarket` on the fork, optionally seeded with `seedAssets` of supply. */
const createBlueMarket = async (
  client: AnvilTestClient<typeof base>,
  seedAssets: bigint,
) => {
  await client.writeContract({
    address: blue,
    abi: blueAbi,
    functionName: "createMarket",
    args: [blueMarket],
  });
  if (seedAssets === 0n) return;
  await client.deal({
    erc20: usdc,
    account: client.account.address,
    amount: seedAssets,
  });
  await client.approve({ address: usdc, args: [blue, seedAssets] });
  await client.writeContract({
    address: blue,
    abi: blueAbi,
    functionName: "supply",
    args: [blueMarket, seedAssets, 0n, client.account.address, "0x"],
  });
};
const installTestOracle = (client: AnvilTestClient<typeof base>) =>
  client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(10n ** 36n), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });
const rateTree = (
  client: AnvilTestClient<typeof base>,
  params: {
    readonly buy: boolean;
    readonly group: Hex;
    readonly callback?: Address;
    readonly callbackData?: Hex;
    readonly rate?: bigint;
    readonly reduceOnly?: boolean;
    readonly maxUnits?: bigint;
  },
) =>
  Tree.create({
    type: "rateV1",
    entries: [
      {
        offer: Offer.create({
          market,
          buy: params.buy,
          maker: client.account.address,
          expiry: market.maturity,
          tick: 5_000n,
          group: params.group,
          ratifier: rateRatifierV1,
          continuousFeeCap: 0n,
          receiverIfMakerIsSeller: params.buy
            ? zeroAddress
            : client.account.address,
          reduceOnly: params.reduceOnly ?? false,
          maxUnits: params.reduceOnly
            ? parseUnits("1", 6)
            : (params.maxUnits ?? 0n),
          maxAssets:
            params.reduceOnly || params.maxUnits !== undefined
              ? 0n
              : parseUnits("1", 6),
          callback: params.callback ?? zeroAddress,
          callbackData: params.callbackData ?? "0x",
        }),
        rate: params.rate ?? 1_000_000_000n,
      },
    ],
  });

const priceTree = (
  client: AnvilTestClient<typeof base>,
  params: {
    readonly buy: boolean;
    readonly group: Hex;
    readonly reduceOnly?: boolean;
  },
) =>
  Tree.create({
    type: "priceV1",
    entries: [
      {
        offer: Offer.create({
          market,
          buy: params.buy,
          maker: client.account.address,
          expiry: market.maturity,
          tick: 5_000n,
          group: params.group,
          ratifier: priceRatifierV1,
          continuousFeeCap: 0n,
          receiverIfMakerIsSeller: params.buy
            ? zeroAddress
            : client.account.address,
          reduceOnly: params.reduceOnly ?? false,
          maxUnits: params.reduceOnly ? parseUnits("1", 6) : 0n,
          maxAssets: params.reduceOnly ? 0n : parseUnits("1", 6),
        }),
      },
    ],
  });

const isRootRatified = (client: AnvilTestClient<typeof base>, root: Hex) =>
  client.readContract({
    address: rateRatifierV1,
    abi: rateRatifierV1Abi,
    functionName: "isRootRatified",
    args: [client.account.address, root],
  });

const isPriceRootRatified = (client: AnvilTestClient<typeof base>, root: Hex) =>
  client.readContract({
    address: priceRatifierV1,
    abi: priceRatifierV1Abi,
    functionName: "isRootRatified",
    args: [client.account.address, root],
  });

const consumed = (client: AnvilTestClient<typeof base>, group: Hex) =>
  client.readContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "consumed",
    args: [client.account.address, group],
  });

const fulfilRequirements = async (
  client: AnvilTestClient<typeof base>,
  output: MidnightMakeOffersOutput,
) => {
  for (const requirement of await output.getRequirements()) {
    if (isRequirementSignature(requirement)) {
      throw new Error("expected only onchain requirements");
    }
    await client.sendTransaction(requirement);
  }
  await expect(output.getRequirements()).resolves.toEqual([]);
  expect(output.buildTx().to).toBe(midnightBundlesV2);
};

const createMakerPosition = async (
  client: AnvilTestClient<typeof base>,
  position: "credit" | "debt",
) => {
  await installTestOracle(client);
  const maker = client.account.address;
  const entity = client.extend(morphoViemExtension()).morpho.midnight(base.id);
  const send = async (
    transaction: Parameters<typeof client.sendTransaction>[0],
  ) => {
    const hash = await client.sendTransaction(transaction);
    await client.waitForTransactionReceipt({ hash });
  };

  if (position === "credit") {
    await client.deal({
      erc20: usdc,
      account: maker,
      amount: parseUnits("2", 6),
    });
    const lendTree = rateTree(client, {
      buy: true,
      group: makerPositionGroup,
      rate: 0n,
    });
    const lend = await entity.makeLend({
      accountAddress: maker,
      offers: lendTree,
      deadline: maxUint256,
      validation,
      loanToken: usdc,
      loanAssets: parseUnits("1", 6),
    });
    await fulfilRequirements(client, lend);
    await send(lend.buildTx());

    const collateralAssets = parseEther("2");
    await client.setBalance({ address: taker, value: parseEther("1") });
    await client.impersonateAccount({ address: taker });
    await client.deal({
      erc20: wNative,
      account: taker,
      amount: collateralAssets,
    });
    await client.writeContract({
      account: taker,
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateralAssets],
    });
    await client.writeContract({
      account: taker,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(market), 0n, collateralAssets, taker],
    });
    const [lendItem] = RateRatifierV1.ratify({
      tree: lendTree.toDescriptor() as never,
    });
    await client.writeContract({
      account: taker,
      address: midnight,
      abi: midnightAbi,
      gas: 8_000_000n,
      functionName: "take",
      args: [
        OfferUtils.toStruct({ offer: lendTree.offers[0]! }),
        lendItem!.ratifierData,
        parseUnits("0.5", 6),
        taker,
        taker,
        zeroAddress,
        "0x",
      ],
    });
  } else {
    const collateralAssets = parseEther("2");
    await client.deal({
      erc20: wNative,
      account: maker,
      amount: collateralAssets,
    });
    await client.approve({
      address: wNative,
      args: [midnight, collateralAssets],
    });
    const borrowTree = Tree.create({
      type: "rateV1",
      entries: [
        {
          offer: Offer.create({
            market,
            buy: false,
            maker,
            expiry: market.maturity,
            tick: 5_000n,
            group: makerPositionGroup,
            ratifier: rateRatifierV1,
            continuousFeeCap: 0n,
            receiverIfMakerIsSeller: maker,
            reduceOnly: false,
            maxUnits: parseUnits("1", 6),
            maxAssets: 0n,
          }),
          rate: 1_000_000_000n,
        },
      ],
    });
    const borrow = await entity.makeBorrow({
      accountAddress: maker,
      offers: borrowTree,
      deadline: maxUint256,
      validation,
    });
    await fulfilRequirements(client, borrow);
    await send(borrow.buildTx());
    await client.writeContract({
      account: maker,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(market), 0n, collateralAssets, maker],
    });

    await client.setBalance({ address: taker, value: parseEther("1") });
    await client.impersonateAccount({ address: taker });
    const loanAssets = parseUnits("10", 6);
    await client.deal({ erc20: usdc, account: taker, amount: loanAssets });
    for (const spender of [midnightBundlesV2, midnight]) {
      await client.writeContract({
        account: taker,
        address: usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, loanAssets],
      });
    }
    const [borrowItem] = RateRatifierV1.ratify({
      tree: borrowTree.toDescriptor() as never,
    });
    const borrowUnits = parseUnits("0.5", 6);
    const take = entity.takeLend({
      marketData,
      accountAddress: taker,
      target: {
        type: "units",
        units: borrowUnits,
        maxBuyerAssets: borrowUnits * 10n + 1n,
      },
      takeableOffers: [
        {
          ...borrowItem!,
          offer: OfferUtils.toStruct({ offer: borrowItem!.offer }),
          units: borrowUnits,
        },
      ],
      maxContinuousFee: maxUint256,
      deadline: Time.timestamp() + 600n,
    });
    for (const requirement of await take.getRequirements()) {
      if (isRequirementSignature(requirement)) {
        expect.unreachable("expected only onchain requirements");
      }
      await send({ ...requirement, account: taker });
    }
    await send({ ...take.buildTx(), account: taker, gas: 8_000_000n });
  }

  await expect(
    client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: position,
      args: [MarketUtils.toId(market), maker],
    }),
  ).resolves.toBeGreaterThan(0n);
};

const publishReduceOnlyOffer = async (options: {
  readonly client: AnvilTestClient<typeof base>;
  readonly method: "makeWithdraw" | "makeRepay";
  readonly type: "priceV1" | "rateV1";
}) => {
  const { client, method, type } = options;
  const entity = client.extend(morphoViemExtension()).morpho.midnight(base.id);
  const offers = (type === "priceV1" ? priceTree : rateTree)(client, {
    buy: method === "makeRepay",
    group: groupA,
    reduceOnly: true,
  });
  const params = {
    accountAddress: client.account.address,
    offers,
    deadline: maxUint256,
    validation,
  };
  const output =
    method === "makeRepay"
      ? await entity.makeRepay({
          ...params,
          loanToken: usdc,
          loanAssets: parseUnits("1", 6),
        })
      : await entity.makeWithdraw(params);
  await fulfilRequirements(client, output);
  const hash = await client.sendTransaction(output.buildTx());
  expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
    "success",
  );
  await expect(
    (type === "priceV1" ? isPriceRootRatified : isRootRatified)(
      client,
      output.root,
    ),
  ).resolves.toBe(true);
  await expect(consumed(client, groupA)).resolves.toBe(0n);
};

describe("Midnight maker offers on fork", () => {
  test("rejects zero-address cancelOffers accounts", ({ client }) => {
    expect(() =>
      client
        .extend(morphoViemExtension())
        .morpho.midnight(base.id)
        .cancelOffers({
          accountAddress: zeroAddress,
          cancellations: [{ group: groupA, maxConsumed: 0n }],
          deadline: maxUint256,
        }),
    ).toThrow(MidnightInvalidAccountAddressError);
  });

  for (const method of ["makeWithdraw", "makeRepay"] as const) {
    for (const type of ["priceV1", "rateV1"] as const) {
      const missingPosition = method === "makeRepay" ? "debt" : "credit";
      test(`rejects ${method} through ${type} without maker ${missingPosition}`, async ({
        client,
      }) => {
        await installTestOracle(client);
        const entity = client
          .extend(morphoViemExtension())
          .morpho.midnight(base.id);
        const offers = (type === "priceV1" ? priceTree : rateTree)(client, {
          buy: method === "makeRepay",
          group: groupA,
          reduceOnly: true,
        });
        const params = {
          accountAddress: client.account.address,
          offers,
          deadline: maxUint256,
          validation,
        };
        const publication =
          method === "makeRepay"
            ? entity.makeRepay({
                ...params,
                loanToken: usdc,
                loanAssets: parseUnits("1", 6),
              })
            : entity.makeWithdraw(params);
        await expect(publication).rejects.toBeInstanceOf(
          method === "makeRepay"
            ? MidnightOfferNoDebtError
            : MidnightOfferNoCreditError,
        );
      });
    }
  }

  test("publishes makeWithdraw through priceV1 without a root signature", async ({
    client,
  }) => {
    await createMakerPosition(client, "credit");
    await publishReduceOnlyOffer({
      client,
      method: "makeWithdraw",
      type: "priceV1",
    });
  });

  test("publishes makeWithdraw through rateV1 without a root signature", async ({
    client,
  }) => {
    await createMakerPosition(client, "credit");
    await publishReduceOnlyOffer({
      client,
      method: "makeWithdraw",
      type: "rateV1",
    });
  });

  test("publishes makeRepay through priceV1 without a root signature", async ({
    client,
  }) => {
    await createMakerPosition(client, "debt");
    await publishReduceOnlyOffer({
      client,
      method: "makeRepay",
      type: "priceV1",
    });
  });

  test("publishes makeRepay through rateV1 without a root signature", async ({
    client,
  }) => {
    await createMakerPosition(client, "debt");
    await publishReduceOnlyOffer({
      client,
      method: "makeRepay",
      type: "rateV1",
    });
  });

  test("publishes lend offers, then atomically reposts them", async ({
    client,
  }) => {
    await installTestOracle(client);
    await client.deal({
      erc20: usdc,
      account: client.account.address,
      amount: parseUnits("10", 6),
    });
    const midnightEntity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);

    const first = await midnightEntity.makeLend({
      accountAddress: client.account.address,
      offers: rateTree(client, { buy: true, group: groupA }),
      deadline: maxUint256,
      validation,
      loanToken: usdc,
      loanAssets: parseUnits("1", 6),
    });
    await fulfilRequirements(client, first);
    await client.sendTransaction(first.buildTx());

    await expect(isRootRatified(client, first.root)).resolves.toBe(true);

    const repost = await midnightEntity.makeLend({
      accountAddress: client.account.address,
      offers: rateTree(client, { buy: true, group: groupB }),
      cancellations: [{ group: groupA, maxConsumed: 0n }],
      deadline: maxUint256,
      validation,
      loanToken: usdc,
      loanAssets: parseUnits("1", 6),
    });
    await fulfilRequirements(client, repost);
    await client.sendTransaction(repost.buildTx());

    await expect(consumed(client, groupA)).resolves.toBe(maxUint128);
    await expect(isRootRatified(client, repost.root)).resolves.toBe(true);
  });

  test("publishes lend offers through PriceRatifierV1", async ({ client }) => {
    await installTestOracle(client);
    await client.deal({
      erc20: usdc,
      account: client.account.address,
      amount: parseUnits("10", 6),
    });
    const midnightEntity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);

    const output = await midnightEntity.makeLend({
      accountAddress: client.account.address,
      offers: priceTree(client, { buy: true, group: groupA }),
      deadline: maxUint256,
      validation,
      loanToken: usdc,
      loanAssets: parseUnits("1", 6),
    });
    await fulfilRequirements(client, output);
    const hash = await client.sendTransaction(output.buildTx());
    const receipt = await client.waitForTransactionReceipt({ hash });

    expect(receipt.status).toBe("success");
    await expect(isPriceRootRatified(client, output.root)).resolves.toBe(true);
  });

  test("publishes borrow offers without collateral", async ({ client }) => {
    await installTestOracle(client);
    const midnightEntity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);

    const output = await midnightEntity.makeBorrow({
      accountAddress: client.account.address,
      offers: rateTree(client, { buy: false, group: groupA }),
      deadline: maxUint256,
      validation,
    });
    const requirements = await output.getRequirements();
    expect(requirements.map(({ action }) => action.type)).toEqual([
      "midnightAuthorization",
    ]);
    await fulfilRequirements(client, output);

    const hash = await client.sendTransaction(output.buildTx());
    const receipt = await client.waitForTransactionReceipt({ hash });

    expect(receipt.status).toBe("success");
    await expect(isRootRatified(client, output.root)).resolves.toBe(true);
  });

  test("publishes and fills a borrow offer from its entity tree", async ({
    client,
  }) => {
    await client.setCode({
      address: oracle,
      bytecode: concatHex([
        "0x7f",
        padHex(toHex(10n ** 36n), { size: 32 }),
        "0x60005260206000f3",
      ]),
    });
    const collateralAssets = parseEther("2");
    await client.deal({
      erc20: wNative,
      account: client.account.address,
      amount: collateralAssets,
    });
    await client.approve({
      address: wNative,
      args: [midnight, collateralAssets],
    });
    await client.writeContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [
        MarketUtils.toStruct(market),
        0n,
        collateralAssets,
        client.account.address,
      ],
    });

    const offers = rateTree(client, {
      buy: false,
      group: groupA,
      maxUnits: parseUnits("2", 6),
    });
    const output = await client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id)
      .makeBorrow({
        accountAddress: client.account.address,
        offers,
        deadline: maxUint256,
        validation,
      });
    await fulfilRequirements(client, output);
    await client.sendTransaction(output.buildTx());
    await expect(isRootRatified(client, output.root)).resolves.toBe(true);

    const loanAssets = parseUnits("1", 6);
    const maxBuyerAssets = loanAssets * 10n + 1n;
    await client.setBalance({ address: taker, value: parseEther("1") });
    await client.impersonateAccount({ address: taker });
    await client.deal({ erc20: usdc, account: taker, amount: maxBuyerAssets });
    const [item] = RateRatifierV1.ratify({
      tree: offers.toDescriptor(),
    });
    if (!item) throw new Error("expected a ratified offer");
    const take = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id)
      .takeLend({
        marketData,
        accountAddress: taker,
        target: {
          type: "units",
          units: loanAssets,
          maxBuyerAssets,
        },
        takeableOffers: [
          {
            ...item,
            offer: OfferUtils.toStruct({ offer: item.offer }),
            units: loanAssets,
          },
        ],
        maxContinuousFee: maxUint256,
        deadline: Time.timestamp() + 600n,
      });
    for (const requirement of await take.getRequirements()) {
      if (!("to" in requirement)) {
        throw new Error("expected only onchain requirements");
      }
      await client.sendTransaction({ ...requirement, account: taker });
    }
    await expect(take.getRequirements()).resolves.toEqual([]);
    await client.sendTransaction({ ...take.buildTx(), account: taker });
    await expect(consumed(client, groupA)).resolves.toBe(loanAssets);
  });

  test("error: reverts the whole repost when a cancelled group is consumed above its ceiling", async ({
    client,
  }) => {
    await installTestOracle(client);
    await client.deal({
      erc20: usdc,
      account: client.account.address,
      amount: parseUnits("10", 6),
    });
    const midnightEntity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);

    const first = await midnightEntity.makeLend({
      accountAddress: client.account.address,
      offers: rateTree(client, { buy: true, group: groupA }),
      deadline: maxUint256,
      validation,
      loanToken: usdc,
      loanAssets: parseUnits("1", 6),
    });
    await fulfilRequirements(client, first);
    await client.sendTransaction(first.buildTx());

    // Simulates a partial fill of groupA after the repost was prepared.
    await client.writeContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "setConsumed",
      args: [groupA, 1n, client.account.address],
    });

    const repost = await midnightEntity.makeLend({
      accountAddress: client.account.address,
      offers: rateTree(client, { buy: true, group: groupB }),
      cancellations: [{ group: groupA, maxConsumed: 0n }],
      deadline: maxUint256,
      validation,
      loanToken: usdc,
      loanAssets: parseUnits("1", 6),
    });
    await fulfilRequirements(client, repost);

    await expect(client.sendTransaction(repost.buildTx())).rejects.toThrow(
      toFunctionSelector("ConsumedAboveMax()"),
    );
    await expect(consumed(client, groupA)).resolves.toBe(1n);
    await expect(isRootRatified(client, repost.root)).resolves.toBe(false);
  });

  test("supplies collateral, publishes, and fills borrow offers in one transaction", async ({
    client,
  }) => {
    await installTestOracle(client);
    const collateralAssets = parseEther("2");
    await client.deal({
      erc20: wNative,
      account: client.account.address,
      amount: collateralAssets,
    });
    const offers = rateTree(client, {
      buy: false,
      group: groupA,
      maxUnits: parseUnits("2", 6),
    });
    const output = await client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id)
      .supplyCollateralMakeBorrow({
        accountAddress: client.account.address,
        offers,
        collateral: {
          market,
          supplies: [{ collateralIndex: 0n, assets: collateralAssets }],
        },
        deadline: maxUint256,
        validation,
      });
    await fulfilRequirements(client, output);
    await client.sendTransaction(output.buildTx());

    await expect(isRootRatified(client, output.root)).resolves.toBe(true);
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [MarketUtils.toId(market), client.account.address, 0n],
      }),
    ).resolves.toBe(collateralAssets);

    const loanAssets = parseUnits("1", 6);
    const maxBuyerAssets = loanAssets * 10n + 1n;
    await client.setBalance({ address: taker, value: parseEther("1") });
    await client.impersonateAccount({ address: taker });
    await client.deal({ erc20: usdc, account: taker, amount: maxBuyerAssets });
    const [item] = RateRatifierV1.ratify({
      tree: offers.toDescriptor(),
    });
    if (!item) throw new Error("expected a ratified offer");
    const take = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id)
      .takeLend({
        marketData,
        accountAddress: taker,
        target: {
          type: "units",
          units: loanAssets,
          maxBuyerAssets,
        },
        takeableOffers: [
          {
            ...item,
            offer: OfferUtils.toStruct({ offer: item.offer }),
            units: loanAssets,
          },
        ],
        maxContinuousFee: maxUint256,
        deadline: Time.timestamp() + 600n,
      });
    for (const requirement of await take.getRequirements()) {
      if (!("to" in requirement)) {
        throw new Error("expected only onchain requirements");
      }
      await client.sendTransaction({ ...requirement, account: taker });
    }
    await expect(take.getRequirements()).resolves.toEqual([]);
    await client.sendTransaction({ ...take.buildTx(), account: taker });
    await expect(consumed(client, groupA)).resolves.toBe(loanAssets);
  });

  test("parks loan assets on Blue, publishes callback-funded lend offers, then reposts them", async ({
    client,
  }) => {
    await installTestOracle(client);
    await createBlueMarket(client, parseUnits("1", 6));
    const assetsToPark = parseUnits("2", 6);
    await client.deal({
      erc20: usdc,
      account: client.account.address,
      amount: assetsToPark,
    });
    const { result: callback } = await client.simulateContract({
      address: blueBuyCallbackFactory,
      abi: blueBuyCallbackFactoryAbi,
      functionName: "createBlueBuyCallback",
      args: [client.account.address, callbackSalt],
    });
    const output = await client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id)
      .supplyBlueMakeLend({
        accountAddress: client.account.address,
        offers: rateTree(client, {
          buy: true,
          group: groupA,
          callback,
          callbackData: getMidnightBlueBuyCallbackData(blueMarket),
        }),
        blueMarket,
        assetsToPark,
        callbackSalt,
        deadline: maxUint256,
        validation,
      });
    await fulfilRequirements(client, output);
    await client.sendTransaction(output.buildTx());

    await expect(isRootRatified(client, output.root)).resolves.toBe(true);
    await expect(
      client.readContract({
        address: blueBuyCallbackFactory,
        abi: blueBuyCallbackFactoryAbi,
        functionName: "callbackOf",
        args: [client.account.address, callbackSalt],
      }),
    ).resolves.toBe(callback);
    const [supplyShares] = await client.readContract({
      address: blue,
      abi: blueAbi,
      functionName: "position",
      args: [BlueMarketUtils.getMarketId(blueMarket), callback],
    });
    expect(supplyShares).toBeGreaterThan(0n);

    await client.deal({
      erc20: usdc,
      account: client.account.address,
      amount: assetsToPark,
    });
    const repost = await client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id)
      .supplyBlueMakeLend({
        accountAddress: client.account.address,
        offers: rateTree(client, {
          buy: true,
          group: groupB,
          callback,
          callbackData: getMidnightBlueBuyCallbackData(blueMarket),
        }),
        blueMarket,
        assetsToPark,
        callbackSalt,
        cancellations: [{ group: groupA, maxConsumed: 0n }],
        deadline: maxUint256,
        validation,
      });
    await fulfilRequirements(client, repost);
    await client.sendTransaction(repost.buildTx());

    await expect(isRootRatified(client, repost.root)).resolves.toBe(true);
    await expect(consumed(client, groupA)).resolves.toBe(maxUint128);
    await expect(
      client.readContract({
        address: blueBuyCallbackFactory,
        abi: blueBuyCallbackFactoryAbi,
        functionName: "callbackOf",
        args: [client.account.address, callbackSalt],
      }),
    ).resolves.toBe(callback);
    const [repostSupplyShares] = await client.readContract({
      address: blue,
      abi: blueAbi,
      functionName: "position",
      args: [BlueMarketUtils.getMarketId(blueMarket), callback],
    });
    expect(repostSupplyShares).toBeGreaterThan(supplyShares);
  });

  test("funds a taker's fill from the maker's callback", async ({ client }) => {
    await createBlueMarket(client, parseUnits("1", 6));
    await installTestOracle(client);
    const assetsToPark = parseUnits("2", 6);
    await client.deal({
      erc20: usdc,
      account: client.account.address,
      amount: assetsToPark,
    });
    const { result: callback } = await client.simulateContract({
      address: blueBuyCallbackFactory,
      abi: blueBuyCallbackFactoryAbi,
      functionName: "createBlueBuyCallback",
      args: [client.account.address, callbackSalt],
    });
    const offers = rateTree(client, {
      buy: true,
      group: groupA,
      callback,
      callbackData: getMidnightBlueBuyCallbackData(blueMarket),
      rate: 0n,
    });
    const output = await client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id)
      .supplyBlueMakeLend({
        accountAddress: client.account.address,
        offers,
        blueMarket,
        assetsToPark,
        callbackSalt,
        deadline: maxUint256,
        validation,
      });
    await fulfilRequirements(client, output);
    await client.sendTransaction(output.buildTx());

    const collateralAssets = parseEther("1");
    await client.setBalance({ address: taker, value: parseEther("1") });
    await client.deal({
      erc20: wNative,
      account: taker,
      amount: collateralAssets,
    });
    await client.approve({
      account: taker,
      address: wNative,
      args: [midnight, collateralAssets],
    });
    await client.writeContract({
      account: taker,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(market), 0n, collateralAssets, taker],
    });
    const callbackSupplyBefore = await client.readContract({
      address: blue,
      abi: blueAbi,
      functionName: "position",
      args: [BlueMarketUtils.getMarketId(blueMarket), callback],
    });
    const [item] = RateRatifierV1.ratify({
      tree: offers.toDescriptor(),
    });
    if (!item) throw new Error("expected a ratified offer");
    await client.writeContract({
      account: taker,
      address: midnight,
      abi: midnightAbi,
      functionName: "take",
      args: [
        OfferUtils.toStruct({ offer: item.offer }),
        item.ratifierData,
        parseUnits("1", 6) / 2n,
        taker,
        taker,
        zeroAddress,
        "0x",
      ],
    });

    const borrowed = await client.balanceOf({ erc20: usdc, owner: taker });
    expect(borrowed).toBeGreaterThan(0n);
    await expect(
      client.balanceOf({ erc20: usdc, owner: client.account.address }),
    ).resolves.toBe(0n);
    const [callbackSupplyAfter] = await client.readContract({
      address: blue,
      abi: blueAbi,
      functionName: "position",
      args: [BlueMarketUtils.getMarketId(blueMarket), callback],
    });
    expect(callbackSupplyAfter).toBeLessThan(callbackSupplyBefore[0]);
  });

  test("error: rejects parking in a Blue market with no supply", async ({
    client,
  }) => {
    await installTestOracle(client);
    await createBlueMarket(client, 0n);
    const { result: callback } = await client.simulateContract({
      address: blueBuyCallbackFactory,
      abi: blueBuyCallbackFactoryAbi,
      functionName: "createBlueBuyCallback",
      args: [client.account.address, callbackSalt],
    });

    await expect(
      client
        .extend(morphoViemExtension())
        .morpho.midnight(base.id)
        .supplyBlueMakeLend({
          accountAddress: client.account.address,
          offers: rateTree(client, {
            buy: true,
            group: groupA,
            callback,
            callbackData: getMidnightBlueBuyCallbackData(blueMarket),
          }),
          blueMarket,
          assetsToPark: parseUnits("1", 6),
          callbackSalt,
          deadline: maxUint256,
          validation,
        }),
    ).rejects.toThrow(EmptyBlueParkingMarketError);
  });
});
