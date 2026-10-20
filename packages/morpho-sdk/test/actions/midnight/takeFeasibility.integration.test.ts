// biome-ignore-all lint/complexity/useMaxParams: Fork helpers keep scenario inputs explicit.
import {
  Market,
  MarketParams,
  MarketUtils,
  midnightAbi,
  Offer,
  OfferUtils,
  SetterRatifierUtils,
  setterRatifierAbi,
  Tree,
} from "@morpho-org/midnight-sdk";
import { ChainId, getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  BaseError,
  concatHex,
  erc20Abi,
  maxUint256,
  padHex,
  parseEther,
  toFunctionSelector,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  type MidnightTakeableOffer,
  midnightTakeBorrow,
  midnightTakeLend,
  morphoViemExtension,
} from "../../../src/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 52_252_000n,
  stepsTracing: false,
});

type Client = AnvilTestClient<typeof base>;

const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const bundles = getChainAddress(ChainId.BaseMainnet, "midnightBundlesV2");
const ratifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");
const oracle = "0x0000000000000000000000000000000000080000" as Address;
const maker = "0x9000000000000000000000000000000000000001" as Address;

const marketFor = (maturity = 2_000_000_000n) =>
  new Market({
    params: new MarketParams({
      chainId: base.id,
      midnight,
      loanToken: usdc,
      collateralParams: [
        {
          token: wNative,
          lltv: 770_000_000_000_000_000n,
          liquidationCursor: 300_000_000_000_000_000n,
          oracle,
        },
      ],
      maturity,
      rcfThreshold: 0n,
      enterGate: zeroAddress,
      liquidatorGate: zeroAddress,
    }),
    totalUnits: 0n,
    lossFactor: 0n,
    withdrawable: 0n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
    continuousFee: 0,
    tickSpacing: 1,
  });

const send = async (
  client: Client,
  tx: { to: Address; data: `0x${string}`; value?: bigint },
  account: Address = client.account.address,
) => {
  const hash = await client.sendTransaction({
    account,
    to: tx.to,
    data: tx.data,
    value: tx.value ?? 0n,
    gas: 5_000_000n,
  });
  return (await client.waitForTransactionReceipt({ hash })).status;
};

/** Revert selector of `tx` when called from the test account. */
const revertOf = async (
  client: Client,
  tx: { to: Address; data: `0x${string}` },
) => {
  try {
    await client.call({
      account: client.account.address,
      to: tx.to,
      data: tx.data,
      gas: 5_000_000n,
    });
  } catch (error) {
    const reverted =
      error instanceof BaseError
        ? (error.walk(
            (cause) => typeof (cause as { data?: unknown }).data === "string",
          ) as { data?: string } | null)
        : null;
    return reverted?.data?.slice(0, 10).toLowerCase();
  }
  return undefined;
};

/** Prices every collateral at 1 loan asset per WAD of collateral. */
const installOracle = (client: Client) =>
  client.setCode({
    address: oracle,
    bytecode: concatHex([
      "0x7f",
      padHex(toHex(10n ** 36n), { size: 32 }),
      "0x60005260206000f3",
    ]),
  });

const authorize = async (client: Client, account: Address) => {
  await client.setBalance({ address: account, value: parseEther("1") });
  await client.writeContract({
    account,
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [ratifier, true, account],
  });
};

/** Ratifies one offer by `offerMaker` through the setter ratifier and funds its side. */
const prepareOffer = async (
  client: Client,
  market: Market,
  params: {
    readonly buy: boolean;
    readonly units: bigint;
    readonly offerMaker?: Address;
    readonly tick?: bigint;
    readonly expiry?: bigint;
  },
): Promise<MidnightTakeableOffer> => {
  const offerMaker = params.offerMaker ?? maker;
  await authorize(client, offerMaker);
  // A self-take is skipped before any transfer, so the taker's own offer needs no funding.
  if (params.buy && offerMaker !== client.account.address) {
    await client.deal({
      erc20: usdc,
      account: offerMaker,
      amount: params.units * 2n,
    });
    await client.writeContract({
      account: offerMaker,
      address: usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, maxUint256],
    });
  } else if (!params.buy) {
    const collateral = parseEther("1000000");
    await client.deal({
      erc20: wNative,
      account: offerMaker,
      amount: collateral,
    });
    await client.writeContract({
      account: offerMaker,
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateral],
    });
    await client.writeContract({
      account: offerMaker,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(market.params), 0n, collateral, offerMaker],
    });
  }
  const offer = Offer.create({
    market: market.params,
    buy: params.buy,
    maker: offerMaker,
    start: 0n,
    expiry: params.expiry ?? market.params.maturity,
    tick: params.tick ?? 5_000n,
    ratifier,
    reduceOnly: false,
    maxUnits: params.units,
    continuousFeeCap: maxUint256,
  });
  const tree = Tree.create([offer]);
  await client.writeContract({
    account: offerMaker,
    address: ratifier,
    abi: setterRatifierAbi,
    functionName: "setIsRootRatified",
    args: [offerMaker, tree.root, true],
  });
  const item = SetterRatifierUtils.ratify({ tree })[0]!;
  return {
    units: params.units,
    offer: OfferUtils.toStruct({ offer: item.offer }),
    ratifierData: item.ratifierData,
  };
};

/** Funds and authorizes the test account as a MidnightBundlesV2 taker. */
const prepareTaker = async (client: Client, assets: bigint) => {
  await client.deal({
    erc20: usdc,
    account: client.account.address,
    amount: assets,
  });
  await client.writeContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "approve",
    args: [bundles, maxUint256],
  });
  await client.writeContract({
    address: midnight,
    abi: midnightAbi,
    functionName: "setIsAuthorized",
    args: [bundles, true, client.account.address],
  });
};

const deadlineFor = async (client: Client) => {
  const { timestamp } = await client.getBlock();
  const now = Time.timestamp();
  return (timestamp > now ? timestamp : now) + 600n;
};

const entityFor = (client: Client) =>
  client.extend(morphoViemExtension()).morpho.midnight(base.id);

describe("Midnight take feasibility (Base fork)", () => {
  test("behavior: takeLend rejects an expired offer that MidnightBundlesV2 skips into OutOfOffers()", async ({
    client,
  }) => {
    await installOracle(client);
    const market = marketFor();
    const now = (await client.getBlock()).timestamp;
    const expired = await prepareOffer(client, market, {
      buy: false,
      units: 100_000n,
      expiry: now - 1n,
    });
    await prepareTaker(client, 100_000n);
    const deadline = await deadlineFor(client);
    const target = {
      type: "units",
      units: 100_000n,
      maxBuyerAssets: 100_000n,
    } as const;

    const raw = midnightTakeLend({
      chainId: base.id,
      market: market.params,
      target,
      takeableOffers: [expired],
      maxContinuousFee: maxUint256,
      deadline,
    });
    expect(await revertOf(client, raw)).toBe(
      toFunctionSelector("OutOfOffers()"),
    );
    expect(() =>
      entityFor(client).takeLend({
        marketData: market,
        accountAddress: client.account.address,
        target,
        takeableOffers: [expired],
        maxContinuousFee: maxUint256,
        deadline,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightTakeableOffersNotFillableError",
        offers: [{ index: 0, reason: "expired" }],
      }),
    );
  });

  test("behavior: takeLend drops a tick-0 offer that reverts an assets target with Panic(0x12)", async ({
    client,
  }) => {
    await installOracle(client);
    const market = marketFor();
    const zeroPrice = await prepareOffer(client, market, {
      buy: false,
      units: 1_000_000_000n,
      tick: 0n,
    });
    const live = await prepareOffer(client, market, {
      buy: false,
      units: 2_000_000n,
      offerMaker: "0x9000000000000000000000000000000000000002",
    });
    const assets = 1_000_000n;
    await prepareTaker(client, assets);
    const params = {
      marketData: market,
      accountAddress: client.account.address,
      target: { type: "assets", assets, minUnits: 1n },
      takeableOffers: [zeroPrice, live],
      maxContinuousFee: maxUint256,
      deadline: await deadlineFor(client),
    } as const;

    const raw = midnightTakeLend({
      chainId: base.id,
      market: market.params,
      ...params,
    });
    expect(await revertOf(client, raw)).toBe("0x4e487b71");
    const tx = entityFor(client).takeLend(params).buildTx();
    expect(tx.action.args.takeableOffers).toBe(1);
    expect(await send(client, tx)).toBe("success");
    const credit = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "credit",
      args: [MarketUtils.toId(market.params), client.account.address],
    });
    expect(credit).toBeGreaterThanOrEqual(assets);
  });

  test("behavior: takeLend rejects a maxContinuousFee below the market fee", async ({
    client,
  }) => {
    await installOracle(client);
    const market = marketFor();
    const offer = await prepareOffer(client, market, {
      buy: false,
      units: 100_000n,
    });
    const fee = 10_000_000n;
    const feeSetter = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "feeSetter",
    });
    await client.setBalance({ address: feeSetter, value: parseEther("1") });
    await client.writeContract({
      account: feeSetter,
      address: midnight,
      abi: midnightAbi,
      functionName: "setMarketContinuousFee",
      args: [MarketUtils.toId(market.params), fee],
    });
    const marketData = await entityFor(client).getMarketData(
      MarketUtils.toId(market.params),
    );
    await prepareTaker(client, 100_000n);
    const params = {
      marketData,
      accountAddress: client.account.address,
      target: { type: "units", units: 100_000n, maxBuyerAssets: 100_000n },
      takeableOffers: [offer],
      maxContinuousFee: 0n,
      deadline: await deadlineFor(client),
    } as const;

    const raw = midnightTakeLend({
      chainId: base.id,
      market: market.params,
      ...params,
    });
    expect(await revertOf(client, raw)).toBe(
      toFunctionSelector("ContinuousFeeAboveMax()"),
    );
    expect(() => entityFor(client).takeLend(params)).toThrow(
      expect.objectContaining({
        name: "MidnightContinuousFeeAboveMaxError",
        maxContinuousFee: 0n,
        continuousFee: fee,
      }),
    );
  });

  test("behavior: takeBorrow drops a tick-0 offer that reverts the sell with Panic(0x12)", async ({
    client,
  }) => {
    await installOracle(client);
    const market = marketFor();
    const zeroPrice = await prepareOffer(client, market, {
      buy: true,
      units: 200_000n,
      tick: 0n,
    });
    const live = await prepareOffer(client, market, {
      buy: true,
      units: 200_000n,
      offerMaker: "0x9000000000000000000000000000000000000002",
    });
    await prepareTaker(client, 0n);
    const collateral = parseEther("10");
    await client.deal({
      erc20: wNative,
      account: client.account.address,
      amount: collateral,
    });
    await client.writeContract({
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateral],
    });
    await client.writeContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [
        MarketUtils.toStruct(market.params),
        0n,
        collateral,
        client.account.address,
      ],
    });
    const deadline = await deadlineFor(client);
    const target = {
      type: "units",
      units: 100_000n,
      minSellerAssets: 1n,
    } as const;

    const raw = midnightTakeBorrow({
      chainId: base.id,
      market: market.params,
      target,
      receiver: client.account.address,
      takeableOffers: [zeroPrice, live],
      deadline,
    });
    expect(await revertOf(client, raw)).toBe("0x4e487b71");
    const positionData = await entityFor(client).getPositionData({
      marketId: MarketUtils.toId(market.params),
      accountAddress: client.account.address,
    });
    const tx = entityFor(client)
      .takeBorrow({
        marketData: market,
        positionData,
        collateralPrices: [10n ** 36n],
        accountAddress: client.account.address,
        target,
        takeableOffers: [zeroPrice, live],
        deadline,
      })
      .buildTx();
    expect(await send(client, tx)).toBe("success");
  });

  test("behavior: takeBorrow rejects maxUnits below assets and a self-take", async ({
    client,
  }) => {
    await installOracle(client);
    const market = marketFor();
    // At the max tick a unit sells for exactly one asset, the best price any offer gives.
    const lendOffer = await prepareOffer(client, market, {
      buy: true,
      units: 200_000n,
      tick: 6_744n,
    });
    await prepareTaker(client, 0n);
    const collateral = parseEther("10");
    await client.deal({
      erc20: wNative,
      account: client.account.address,
      amount: collateral,
    });
    await client.writeContract({
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateral],
    });
    await client.writeContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [
        MarketUtils.toStruct(market.params),
        0n,
        collateral,
        client.account.address,
      ],
    });
    const deadline = await deadlineFor(client);
    const target = {
      type: "assets",
      assets: 100_000n,
      maxUnits: 99_999n,
    } as const;

    // maxUnits = assets is the tightest bound any price can meet.
    const raw = midnightTakeBorrow({
      chainId: base.id,
      market: market.params,
      target: { ...target, maxUnits: 100_000n },
      receiver: client.account.address,
      takeableOffers: [lendOffer],
      deadline,
    });
    expect(await send(client, raw)).toBe("success");
    expect(() =>
      midnightTakeBorrow({
        chainId: base.id,
        market: market.params,
        target,
        receiver: client.account.address,
        takeableOffers: [lendOffer],
        deadline,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightTakeTargetUnreachableError",
        field: "target.maxUnits",
        value: 99_999n,
        limit: 100_000n,
      }),
    );

    const selfOffer = await prepareOffer(client, market, {
      buy: true,
      units: 100_000n,
      offerMaker: client.account.address,
    });
    const positionData = await entityFor(client).getPositionData({
      marketId: MarketUtils.toId(market.params),
      accountAddress: client.account.address,
    });
    const selfTake = {
      chainId: base.id,
      market: market.params,
      target: { type: "units", units: 50_000n, minSellerAssets: 1n },
      receiver: client.account.address,
      takeableOffers: [selfOffer],
      deadline,
    } as const;
    expect(await revertOf(client, midnightTakeBorrow(selfTake))).toBe(
      toFunctionSelector("OutOfOffers()"),
    );
    expect(() =>
      entityFor(client).takeBorrow({
        marketData: market,
        positionData,
        collateralPrices: [10n ** 36n],
        accountAddress: client.account.address,
        target: selfTake.target,
        takeableOffers: [selfOffer],
        deadline,
      }),
    ).toThrow(
      expect.objectContaining({
        name: "MidnightTakeableOffersNotFillableError",
        offers: [{ index: 0, reason: "selfTake" }],
      }),
    );
  });
});
