import { ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
import { blueAbi, fetchMarket } from "@morpho-org/blue-sdk-viem";
import {
  type MarketParams,
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
  Offer,
  OfferUtils,
  Payload,
  priceRatifierV1Abi,
  rateRatifierV1Abi,
  TickLib,
  Tree,
} from "@morpho-org/midnight-sdk";
import { type E2eScenario, wrapE2eNative } from "@morpho-org/morpho-test";
import {
  createE2eMidnightMarket,
  E2E_MIDNIGHT_WALLETS,
  fundE2eMidnightWallets,
  getE2eTakeableOffers,
  postE2eSetterTree,
} from "@morpho-org/morpho-test/midnight";
import { getChainAddress, MathLib, Time } from "@morpho-org/morpho-ts";
import type { AnvilTestClient } from "@morpho-org/test";
import {
  type Address,
  BaseError,
  type Chain,
  decodeErrorResult,
  decodeFunctionData,
  erc20Abi,
  type Hex,
  isAddressEqual,
  maxUint128,
  maxUint256,
  parseEther,
  zeroAddress,
} from "viem";
import { expect } from "vitest";
import type { MidnightActionOutput } from "../../src/entities/midnight/types.js";
import {
  type ActionRequirement,
  type BaseAction,
  getMidnightAuthorizationRequirement,
  getMidnightBlueBuyCallbackAddress,
  getMidnightBlueBuyCallbackData,
  isRequirementSignature,
  MidnightOfferNotReduceOnlyError,
  morphoViemExtension,
} from "../../src/index.js";
import { withChainTimestamp } from "../helpers/time.js";
import { createE2eMarket, describeE2e, seedE2eDeadDeposits } from "./setup.js";

const scenario: E2eScenario = {
  name: "midnight",
  requires: [
    "midnight",
    "midnightBundlesV2",
    "setterRatifier",
    "priceRatifierV1",
  ],
};

const priceTreeFor = (params: {
  readonly chainId: number;
  readonly market: MarketParams;
  readonly maker: Address;
  readonly tick?: bigint;
  readonly buy: boolean;
  readonly reduceOnly: boolean;
  readonly maxUnits: bigint;
  readonly maxAssets: bigint;
}) =>
  Tree.create({
    type: "priceV1",
    entries: [
      {
        offer: Offer.create({
          market: params.market,
          buy: params.buy,
          maker: params.maker,
          expiry: params.market.maturity,
          tick: params.tick ?? 5_000n,
          ratifier: getChainAddress(params.chainId, "priceRatifierV1"),
          receiverIfMakerIsSeller: params.buy ? zeroAddress : params.maker,
          reduceOnly: params.reduceOnly,
          maxUnits: params.maxUnits,
          maxAssets: params.maxAssets,
        }),
      },
    ],
  });

const SECONDS_PER_DAY = 86_400n;
const FIFTEEN_UTC = 15n * 3_600n;

// Midnight payloads only accept 15:00 UTC maturities: use tomorrow's on the fork clock.
const tomorrowAtFifteenUtc = async (client: AnvilTestClient<Chain>) => {
  const { timestamp } = await client.getBlock();
  return (timestamp / SECONDS_PER_DAY + 1n) * SECONDS_PER_DAY + FIFTEEN_UTC;
};

const decodePublishedOffers = async (data: Hex) => {
  const decoded = decodeFunctionData({
    abi: midnightBundlesV2Abi,
    data,
  });
  if (decoded.functionName !== "midnightBundlesV2CancelAndMake") {
    throw new Error("expected a MidnightBundlesV2 maker publication");
  }
  return Payload.decode(decoded.args[14]);
};

const offerTick = 5_000n;
const ratifyOffer = async (
  client: AnvilTestClient<Chain>,
  {
    chainId,
    params,
    buy,
  }: { chainId: number; params: MarketParams; buy: boolean },
) => {
  const maker = E2E_MIDNIGHT_WALLETS.A;
  const units = parseEther("1");
  const tree = Tree.create([
    Offer.create({
      market: params,
      buy,
      maker,
      expiry: params.maturity,
      tick: offerTick,
      ratifier: getChainAddress(chainId, "setterRatifier"),
      maxUnits: 2n * units,
    }),
  ]);
  await postE2eSetterTree(client, { chainId, maker, tree });
  const ratifiedOffer = getE2eTakeableOffers({ tree, units })[0];
  if (!ratifiedOffer) throw new Error("Expected a ratified takeable offer");

  return ratifiedOffer;
};

const setupMidnight = async (
  client: AnvilTestClient<Chain>,
  { chainId, buy }: { chainId: number; buy: boolean },
) => {
  const midnight = getChainAddress(chainId, "midnight");
  const midnightBundlesV2 = getChainAddress(chainId, "midnightBundlesV2");
  const { params, marketData } = await createE2eMidnightMarket(client, chainId);
  const loanToken = params.loanToken;
  const collateralToken = params.collateralParams[0]!.token;
  const maker = E2E_MIDNIGHT_WALLETS.A;
  const units = parseEther("1");
  const collateralAssets = parseEther("10");
  const offerPrice = TickLib.tickToPrice(offerTick);
  const expectedSellerAssets = MathLib.mulDiv(
    units,
    offerPrice,
    MathLib.WAD,
    "Down",
  );
  const expectedBuyerAssets = MathLib.mulDiv(
    units,
    offerPrice,
    MathLib.WAD,
    "Up",
  );

  await fundE2eMidnightWallets(client, {
    market: params,
    wallets: { A: { collateralAssets } },
    approve: midnight,
  });
  await client.writeContract({
    account: maker,
    address: midnight,
    abi: midnightAbi,
    functionName: "supplyCollateral",
    args: [MarketUtils.toStruct(params), 0n, collateralAssets, maker],
  });
  const ratifiedOffer = await ratifyOffer(client, { chainId, params, buy });

  await fundE2eMidnightWallets(client, {
    market: params,
    wallets: { A: { loanAssets: 4n * units } },
    approve: midnight,
  });
  return {
    midnight,
    midnightBundlesV2,
    loanToken,
    collateralToken,
    maker,
    units,
    collateralAssets,
    params,
    marketData,
    ratifiedOffer,
    expectedSellerAssets,
    expectedBuyerAssets,
  };
};

const executeTake = async (
  client: AnvilTestClient<Chain>,
  {
    take,
    expectedTarget,
    account = client.account.address,
  }: {
    take: MidnightActionOutput<BaseAction>;
    expectedTarget: Address;
    account?: Address;
  },
) => {
  for (const requirement of await take.getRequirements()) {
    if (!("to" in requirement))
      throw new Error("Expected an onchain requirement");
    await client.sendTransaction({ ...requirement, account });
  }
  const tx = take.buildTx();
  expect(tx.to).toBe(expectedTarget);
  await client.sendTransaction({ ...tx, account });
};

describeE2e(scenario, (test, { chainId }) => {
  test("take-lend routes through MidnightBundlesV2 and credits the lender", async ({
    client,
  }) => {
    const {
      midnight,
      midnightBundlesV2,
      units,
      params,
      marketData,
      ratifiedOffer,
    } = await setupMidnight(client, { chainId, buy: false });
    const taker = E2E_MIDNIGHT_WALLETS.B;

    await fundE2eMidnightWallets(client, {
      market: params,
      wallets: { B: { loanAssets: units } },
    });
    const take = client
      .extend(morphoViemExtension())
      .morpho.midnight(chainId)
      .takeLend({
        marketData,
        accountAddress: taker,
        target: { type: "units", units, maxBuyerAssets: units },
        takeableOffers: [
          {
            units,
            offer: OfferUtils.toStruct({ offer: ratifiedOffer.offer }),
            ratifierData: ratifiedOffer.ratifierData,
          },
        ],
        maxContinuousFee: maxUint256,
        deadline: Time.timestamp() + 600n,
      });
    await executeTake(client, {
      take,
      expectedTarget: midnightBundlesV2,
      account: taker,
    });
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "credit",
        args: [MarketUtils.toId(params), taker],
      }),
    ).resolves.toBe(units);
  });

  test("L1-M6 cancels a setter-ratified offer group", async ({ client }) => {
    const midnight = getChainAddress(chainId, "midnight");
    const midnightBundlesV2 = getChainAddress(chainId, "midnightBundlesV2");
    const setterRatifier = getChainAddress(chainId, "setterRatifier");
    const maker = E2E_MIDNIGHT_WALLETS.A;
    const taker = E2E_MIDNIGHT_WALLETS.B;
    const units = parseEther("1");
    const takeAssets = units / 2n;
    const collateralAssets = parseEther("10");
    const { params, marketData } = await createE2eMidnightMarket(
      client,
      chainId,
    );
    await fundE2eMidnightWallets(client, {
      market: params,
      wallets: { A: { collateralAssets }, B: { loanAssets: units } },
      approve: midnight,
    });
    await client.writeContract({
      account: maker,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(params), 0n, collateralAssets, maker],
    });

    const tree = Tree.create([
      Offer.create({
        market: params,
        buy: false,
        maker,
        expiry: params.maturity,
        tick: 5_000n,
        ratifier: setterRatifier,
        maxUnits: 2n * units,
      }),
    ]);
    await postE2eSetterTree(client, { chainId, maker, tree });
    const takeableOffers = getE2eTakeableOffers({ tree, units });
    const offerGroup = takeableOffers[0]?.offer.group;
    if (offerGroup === undefined) {
      throw new Error("expected a takeable offer");
    }

    const midnightEntity = client
      .extend(morphoViemExtension())
      .morpho.midnight(chainId);
    const take = midnightEntity.takeLend({
      marketData,
      accountAddress: taker,
      target: { type: "assets", assets: takeAssets, minUnits: 1n },
      takeableOffers,
      maxContinuousFee: maxUint256,
      deadline: Time.timestamp() + 600n,
    });
    await sendRequirements(client, {
      account: taker,
      requirements: await take.getRequirements(),
    });
    const takeTx = take.buildTx();
    expect(takeTx.to).toBe(midnightBundlesV2);
    await expect(
      client.call({
        ...takeTx,
        account: taker,
      }),
    ).resolves.toBeDefined();

    const cancellation = midnightEntity.cancelOffers({
      accountAddress: maker,
      cancellations: [{ group: offerGroup, maxConsumed: 0n }],
      deadline: Time.timestamp() + 600n,
    });
    await sendRequirements(client, {
      account: maker,
      requirements: await cancellation.getRequirements(),
    });
    const cancelTx = cancellation.buildTx();
    expect(cancelTx.to).toBe(midnightBundlesV2);
    await client.sendTransaction({
      ...cancelTx,
      account: maker,
    });

    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "consumed",
        args: [maker, offerGroup],
      }),
    ).resolves.toBe(maxUint128);

    const cancelledTakeError = await client
      .call({
        ...takeTx,
        account: taker,
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(cancelledTakeError).toBeInstanceOf(BaseError);
    if (!(cancelledTakeError instanceof BaseError)) {
      throw new Error("expected the cancelled offer take to revert");
    }
    const revert = cancelledTakeError.walk(
      (error) => typeof (error as { data?: unknown }).data === "string",
    ) as { data: Hex } | null;
    if (revert === null) {
      throw new Error(
        `expected Midnight revert data, got: ${cancelledTakeError.shortMessage}`,
      );
    }
    expect(
      decodeErrorResult({
        abi: midnightBundlesV2Abi,
        data: revert.data,
      }).errorName,
    ).toBe("OutOfOffers");
  });

  test("L1-M7 cancels and replaces a lend offer in one publication", async ({
    client,
  }) => {
    const midnight = getChainAddress(chainId, "midnight");
    const midnightBundlesV2 = getChainAddress(chainId, "midnightBundlesV2");
    const priceRatifierV1 = getChainAddress(chainId, "priceRatifierV1");
    const maker = E2E_MIDNIGHT_WALLETS.A;
    const units = parseEther("1");
    const { params } = await createE2eMidnightMarket(client, chainId, {
      maturity: await tomorrowAtFifteenUtc(client),
    });
    await fundE2eMidnightWallets(client, {
      market: params,
      wallets: { A: { loanAssets: 2n * units } },
      approve: midnight,
    });
    const midnightEntity = client
      .extend(morphoViemExtension())
      .morpho.midnight(chainId);

    const first = await midnightEntity.makeLend({
      accountAddress: maker,
      offers: priceTreeFor({
        chainId,
        market: params,
        maker,
        buy: true,
        reduceOnly: false,
        maxUnits: 0n,
        maxAssets: units,
      }),
      loanToken: params.loanToken,
      loanAssets: units,
      deadline: Time.timestamp() + 600n,
      validation: false,
    });
    await sendRequirements(client, {
      account: maker,
      requirements: await first.getRequirements(),
    });
    const firstTx = first.buildTx();
    expect(firstTx.to).toBe(midnightBundlesV2);
    const firstOffers = await decodePublishedOffers(firstTx.data);
    expect(firstOffers).toHaveLength(1);
    const firstGroup = firstOffers[0]?.offer.group;
    if (firstGroup === undefined) {
      throw new Error("expected a published first offer");
    }
    await client.sendTransaction({
      ...firstTx,
      account: maker,
    });
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "consumed",
        args: [maker, firstGroup],
      }),
    ).resolves.toBe(0n);

    const replacement = await midnightEntity.makeLend({
      accountAddress: maker,
      offers: priceTreeFor({
        chainId,
        market: params,
        maker,
        tick: 4_000n,
        buy: true,
        reduceOnly: false,
        maxUnits: 0n,
        maxAssets: units,
      }),
      loanToken: params.loanToken,
      loanAssets: units,
      cancellations: [{ group: firstGroup, maxConsumed: 0n }],
      deadline: Time.timestamp() + 600n,
      validation: false,
    });
    await sendRequirements(client, {
      account: maker,
      requirements: await replacement.getRequirements(),
    });
    const replacementTx = replacement.buildTx();
    expect(replacementTx.to).toBe(midnightBundlesV2);
    expect(replacementTx.action.type).toBe("midnightCancelAndMake");
    const publishedOffers = await decodePublishedOffers(replacementTx.data);
    expect(publishedOffers).toHaveLength(1);
    const replacementGroup = publishedOffers[0]?.offer.group;
    if (replacementGroup === undefined) {
      throw new Error("expected a published replacement offer");
    }
    expect(replacementGroup).not.toBe(firstGroup);
    await client.sendTransaction({
      ...replacementTx,
      account: maker,
    });

    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "consumed",
        args: [maker, replacementGroup],
      }),
    ).resolves.toBe(0n);
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "consumed",
        args: [maker, firstGroup],
      }),
    ).resolves.toBe(maxUint128);
    await expect(
      client.readContract({
        address: priceRatifierV1,
        abi: priceRatifierV1Abi,
        functionName: "isRootRatified",
        args: [maker, replacement.root],
      }),
    ).resolves.toBe(true);
  });

  test("L1-M8 publishes reduce-only withdraw and repay offers", async ({
    client,
  }) => {
    const midnight = getChainAddress(chainId, "midnight");
    const midnightBundlesV2 = getChainAddress(chainId, "midnightBundlesV2");
    const priceRatifierV1 = getChainAddress(chainId, "priceRatifierV1");
    const setterRatifier = getChainAddress(chainId, "setterRatifier");
    const maker = E2E_MIDNIGHT_WALLETS.A;
    const lender = E2E_MIDNIGHT_WALLETS.B;
    const units = parseEther("1");
    const collateralAssets = parseEther("10");
    const { params, marketData } = await createE2eMidnightMarket(
      client,
      chainId,
      {
        maturity: await tomorrowAtFifteenUtc(client),
      },
    );
    await fundE2eMidnightWallets(client, {
      market: params,
      wallets: {
        A: { collateralAssets, loanAssets: units },
        B: { loanAssets: units },
      },
      approve: midnight,
    });
    await client.writeContract({
      account: maker,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(params), 0n, collateralAssets, maker],
    });

    const setterTree = Tree.create([
      Offer.create({
        market: params,
        buy: false,
        maker,
        expiry: params.maturity,
        tick: 5_000n,
        ratifier: setterRatifier,
        maxUnits: units,
      }),
    ]);
    await postE2eSetterTree(client, {
      chainId,
      maker,
      tree: setterTree,
    });
    const midnightEntity = client
      .extend(morphoViemExtension())
      .morpho.midnight(chainId);
    const { timestamp } = await client.getBlock();
    const take = withChainTimestamp(timestamp, () =>
      midnightEntity.takeLend({
        marketData,
        accountAddress: lender,
        target: { type: "units", units, maxBuyerAssets: units },
        takeableOffers: getE2eTakeableOffers({
          tree: setterTree,
          units,
        }),
        maxContinuousFee: maxUint256,
        deadline: Time.timestamp() + 600n,
      }),
    );
    await executeTake(client, {
      take,
      expectedTarget: midnightBundlesV2,
      account: lender,
    });

    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "credit",
        args: [MarketUtils.toId(params), lender],
      }),
    ).resolves.toBe(units);
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "debt",
        args: [MarketUtils.toId(params), maker],
      }),
    ).resolves.toBe(units);

    const withdrawTree = priceTreeFor({
      chainId,
      market: params,
      maker: lender,
      buy: false,
      reduceOnly: true,
      maxUnits: units,
      maxAssets: 0n,
    });
    const withdraw = await midnightEntity.makeWithdraw({
      accountAddress: lender,
      offers: withdrawTree,
      deadline: Time.timestamp() + 600n,
      validation: false,
    });
    await sendRequirements(client, {
      account: lender,
      requirements: await withdraw.getRequirements(),
    });
    const withdrawTx = withdraw.buildTx();
    expect(withdrawTx.to).toBe(midnightBundlesV2);
    const publishedWithdrawOffers = await decodePublishedOffers(
      withdrawTx.data,
    );
    expect(
      publishedWithdrawOffers.map(({ offer }) => offer.reduceOnly),
    ).toEqual([true]);
    await client.sendTransaction({
      ...withdrawTx,
      account: lender,
    });
    await expect(
      client.readContract({
        address: priceRatifierV1,
        abi: priceRatifierV1Abi,
        functionName: "isRootRatified",
        args: [lender, withdraw.root],
      }),
    ).resolves.toBe(true);

    const invalidWithdrawTree = priceTreeFor({
      chainId,
      market: params,
      maker: lender,
      buy: false,
      reduceOnly: false,
      maxUnits: units,
      maxAssets: 0n,
    });
    await expect(
      midnightEntity.makeWithdraw({
        accountAddress: lender,
        offers: invalidWithdrawTree,
        deadline: Time.timestamp() + 600n,
        validation: false,
      }),
    ).rejects.toBeInstanceOf(MidnightOfferNotReduceOnlyError);

    const repayTree = priceTreeFor({
      chainId,
      market: params,
      maker,
      buy: true,
      reduceOnly: true,
      maxUnits: units,
      maxAssets: 0n,
    });
    const repay = await midnightEntity.makeRepay({
      accountAddress: maker,
      offers: repayTree,
      loanToken: params.loanToken,
      loanAssets: units,
      deadline: Time.timestamp() + 600n,
      validation: false,
    });
    await sendRequirements(client, {
      account: maker,
      requirements: await repay.getRequirements(),
    });
    const repayTx = repay.buildTx();
    expect(repayTx.to).toBe(midnightBundlesV2);
    const publishedRepayOffers = await decodePublishedOffers(repayTx.data);
    expect(publishedRepayOffers.map(({ offer }) => offer.reduceOnly)).toEqual([
      true,
    ]);
    await client.sendTransaction({
      ...repayTx,
      account: maker,
    });
    await expect(
      client.readContract({
        address: priceRatifierV1,
        abi: priceRatifierV1Abi,
        functionName: "isRootRatified",
        args: [maker, repay.root],
      }),
    ).resolves.toBe(true);

    const invalidRepayTree = priceTreeFor({
      chainId,
      market: params,
      maker,
      buy: true,
      reduceOnly: false,
      maxUnits: 0n,
      maxAssets: units,
    });
    await expect(
      midnightEntity.makeRepay({
        accountAddress: maker,
        offers: invalidRepayTree,
        loanToken: params.loanToken,
        loanAssets: units,
        deadline: Time.timestamp() + 600n,
        validation: false,
      }),
    ).rejects.toBeInstanceOf(MidnightOfferNotReduceOnlyError);
  });

  test("L1-T2 supplyCollateralTakeBorrow supplies collateral and opens debt", async ({
    client,
  }) => {
    const {
      midnight,
      loanToken,
      collateralToken,
      units,
      collateralAssets,
      params,
      marketData,
      ratifiedOffer,
      expectedSellerAssets,
    } = await setupMidnight(client, { chainId, buy: true });
    const accountAddress = client.account.address;
    const entity = client
      .extend(morphoViemExtension())
      .morpho.midnight(chainId);
    const marketId = MarketUtils.toId(params);
    await client.deal({
      erc20: collateralToken,
      account: accountAddress,
      amount: collateralAssets,
    });

    const positionData = await entity.getPositionData({
      marketId,
      accountAddress,
    });
    expect(positionData.debt).toBe(0n);
    const before = await client.readContract({
      address: loanToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [accountAddress],
    });
    const take = entity.supplyCollateralTakeBorrow({
      accountAddress,
      marketData,
      positionData,
      collateralPrices: [ORACLE_PRICE_SCALE],
      collateralSupplies: [{ collateralIndex: 0n, assets: collateralAssets }],
      target: { type: "units", units, minSellerAssets: expectedSellerAssets },
      takeableOffers: [
        {
          units,
          offer: OfferUtils.toStruct({ offer: ratifiedOffer.offer }),
          ratifierData: ratifiedOffer.ratifierData,
        },
      ],
      deadline: Time.timestamp() + 600n,
    });
    await executeTake(client, {
      take,
      expectedTarget: getChainAddress(chainId, "midnightBundlesV2"),
    });
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, accountAddress, 0n],
      }),
    ).resolves.toBe(collateralAssets);
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "debt",
        args: [marketId, accountAddress],
      }),
    ).resolves.toBe(units);
    expect(
      await client.readContract({
        address: loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [accountAddress],
      }),
    ).toBe(before + expectedSellerAssets);
  });

  test("L1-T3 takeBorrow borrows against existing collateral", async ({
    client,
  }) => {
    const {
      midnight,
      loanToken,
      collateralToken,
      units,
      collateralAssets,
      params,
      marketData,
      ratifiedOffer,
      expectedSellerAssets,
    } = await setupMidnight(client, { chainId, buy: true });
    const accountAddress = client.account.address;
    const entity = client
      .extend(morphoViemExtension())
      .morpho.midnight(chainId);
    const marketId = MarketUtils.toId(params);
    await client.deal({
      erc20: collateralToken,
      account: accountAddress,
      amount: collateralAssets,
    });
    await client.writeContract({
      address: collateralToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateralAssets],
    });
    await client.writeContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [
        MarketUtils.toStruct(params),
        0n,
        collateralAssets,
        accountAddress,
      ],
    });
    const positionData = await entity.getPositionData({
      marketId,
      accountAddress,
    });
    expect(positionData.debt).toBe(0n);
    const before = await client.readContract({
      address: loanToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [accountAddress],
    });
    const take = entity.takeBorrow({
      accountAddress,
      marketData,
      positionData,
      collateralPrices: [ORACLE_PRICE_SCALE],
      target: { type: "units", units, minSellerAssets: expectedSellerAssets },
      takeableOffers: [
        {
          units,
          offer: OfferUtils.toStruct({ offer: ratifiedOffer.offer }),
          ratifierData: ratifiedOffer.ratifierData,
        },
      ],
      deadline: Time.timestamp() + 600n,
    });
    await executeTake(client, {
      take,
      expectedTarget: getChainAddress(chainId, "midnightBundlesV2"),
    });
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, accountAddress, 0n],
      }),
    ).resolves.toBe(collateralAssets);
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "debt",
        args: [marketId, accountAddress],
      }),
    ).resolves.toBe(units);
    expect(
      await client.readContract({
        address: loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [accountAddress],
      }),
    ).toBe(before + expectedSellerAssets);
  });

  test("L1-T4 takeWithdraw sells lender credit for loan tokens", async ({
    client,
  }) => {
    const {
      midnight,
      loanToken,
      units,
      params,
      marketData,
      ratifiedOffer,
      expectedSellerAssets,
    } = await setupMidnight(client, { chainId, buy: false });
    const accountAddress = client.account.address;
    const marketId = MarketUtils.toId(params);
    await wrapE2eNative(client, { wNative: loanToken, amount: units });
    await client.writeContract({
      address: loanToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, units],
    });
    await client.writeContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "take",
      args: [
        OfferUtils.toStruct({ offer: ratifiedOffer.offer }),
        ratifiedOffer.ratifierData,
        units,
        accountAddress,
        zeroAddress,
        zeroAddress,
        "0x",
      ],
    });
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "credit",
        args: [marketId, accountAddress],
      }),
    ).resolves.toBe(units);
    const buyOffer = await ratifyOffer(client, { chainId, params, buy: true });
    const before = await client.readContract({
      address: loanToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [accountAddress],
    });
    const take = client
      .extend(morphoViemExtension())
      .morpho.midnight(chainId)
      .takeWithdraw({
        accountAddress,
        marketData,
        target: { type: "units", units, minSellerAssets: expectedSellerAssets },
        takeableOffers: [
          {
            units,
            offer: OfferUtils.toStruct({ offer: buyOffer.offer }),
            ratifierData: buyOffer.ratifierData,
          },
        ],
        deadline: Time.timestamp() + 600n,
      });
    await executeTake(client, {
      take,
      expectedTarget: getChainAddress(chainId, "midnightBundlesV2"),
    });
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "credit",
        args: [marketId, accountAddress],
      }),
    ).resolves.toBe(0n);
    // The maker buys back the credit created by its setup borrow, cancelling its debt.
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "debt",
        args: [marketId, buyOffer.offer.maker],
      }),
    ).resolves.toBe(0n);
    expect(
      await client.readContract({
        address: loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [accountAddress],
      }),
    ).toBe(before + expectedSellerAssets);
  });

  test("L1-T5 takeRepayWithdrawCollateral clears debt and returns collateral", async ({
    client,
  }) => {
    const {
      midnight,
      loanToken,
      collateralToken,
      units,
      collateralAssets,
      params,
      ratifiedOffer,
      expectedBuyerAssets,
    } = await setupMidnight(client, { chainId, buy: true });
    const accountAddress = client.account.address;
    const marketId = MarketUtils.toId(params);
    await client.deal({
      erc20: collateralToken,
      account: accountAddress,
      amount: collateralAssets,
    });
    await client.writeContract({
      address: collateralToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateralAssets],
    });
    await client.writeContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [
        MarketUtils.toStruct(params),
        0n,
        collateralAssets,
        accountAddress,
      ],
    });
    await client.writeContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "take",
      args: [
        OfferUtils.toStruct({ offer: ratifiedOffer.offer }),
        ratifiedOffer.ratifierData,
        units,
        accountAddress,
        accountAddress,
        zeroAddress,
        "0x",
      ],
    });
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "debt",
        args: [marketId, accountAddress],
      }),
    ).resolves.toBe(units);
    const sellOffer = await ratifyOffer(client, {
      chainId,
      params,
      buy: false,
    });
    await wrapE2eNative(client, { wNative: loanToken, amount: units });
    const loanBalanceBefore = await client.readContract({
      address: loanToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [accountAddress],
    });
    const before = await client.readContract({
      address: collateralToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [accountAddress],
    });
    const entity = client
      .extend(morphoViemExtension())
      .morpho.midnight(chainId);
    const positionData = await entity.getPositionData({
      marketId,
      accountAddress,
    });
    const take = entity.takeRepayWithdrawCollateral({
      accountAddress,
      marketData: positionData.market,
      positionData,
      collateralPrices: [ORACLE_PRICE_SCALE],
      target: { type: "units", units, maxBuyerAssets: expectedBuyerAssets },
      // The sell offer fills the entire debt; direct repayment fallback is disabled.
      repayEnabled: false,
      collateralWithdrawals: [
        { collateralIndex: 0n, assets: collateralAssets },
      ],
      takeableOffers: [
        {
          units,
          offer: OfferUtils.toStruct({ offer: sellOffer.offer }),
          ratifierData: sellOffer.ratifierData,
        },
      ],
      maxContinuousFee: maxUint256,
      deadline: Time.timestamp() + 600n,
    });
    await executeTake(client, {
      take,
      expectedTarget: getChainAddress(chainId, "midnightBundlesV2"),
    });
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "debt",
        args: [marketId, accountAddress],
      }),
    ).resolves.toBe(0n);
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, accountAddress, 0n],
      }),
    ).resolves.toBe(0n);
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "credit",
        args: [marketId, sellOffer.offer.maker],
      }),
    ).resolves.toBe(0n);
    await expect(
      client.readContract({
        address: collateralToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [accountAddress],
      }),
    ).resolves.toBe(before + collateralAssets);
    await expect(
      client.readContract({
        address: loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [accountAddress],
      }),
    ).resolves.toBe(loanBalanceBefore - expectedBuyerAssets);
  });

  test("authorization: authorizes midnightBundlesV2 on Midnight from fork state", async ({
    client,
  }) => {
    const owner = E2E_MIDNIGHT_WALLETS.A;
    await fundE2eMidnightWallets(client, { wallets: { A: {} } });
    const midnight = getChainAddress(chainId, "midnight");
    const authorized = getChainAddress(chainId, "midnightBundlesV2");
    // The registered operator must be bound to this chain's Midnight.
    const operatorMidnight = await client.readContract({
      address: authorized,
      abi: midnightBundlesV2Abi,
      functionName: "MIDNIGHT",
    });
    expect(isAddressEqual(operatorMidnight, midnight)).toBe(true);

    expect(
      await client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "isAuthorized",
        args: [owner, authorized],
      }),
    ).toBe(false);

    const requirement = await getMidnightAuthorizationRequirement({
      viemClient: client,
      chainId,
      owner,
      authorized,
    });
    if (requirement == null)
      throw new Error("Expected a midnightBundlesV2 authorization requirement");
    expect(requirement.action.type).toBe("midnightAuthorization");
    await client.sendTransaction({ ...requirement, account: owner });

    expect(
      await client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "isAuthorized",
        args: [owner, authorized],
      }),
    ).toBe(true);
    // Once authorized, the helper resolves no further requirement.
    await expect(
      getMidnightAuthorizationRequirement({
        viemClient: client,
        chainId,
        owner,
        authorized,
      }),
    ).resolves.toBeNull();
  });
});

const makerScenario: E2eScenario = {
  name: "midnight-make",
  requires: [
    "midnight",
    "midnightBundlesV2",
    "priceRatifierV1",
    "rateRatifierV1",
    "midnightBlueBuyCallbackFactory",
    "blue",
    "adaptiveCurveIrm",
  ],
};

const ratifierTypes = ["priceV1", "rateV1"] as const;
type RatifierType = (typeof ratifierTypes)[number];

const offerAssets = parseEther("1");
const collateralAssets = parseEther("10");

const createMidnightMarket = async (
  client: AnvilTestClient<Chain>,
  {
    chainId,
    maturity,
  }: { readonly chainId: number; readonly maturity?: bigint },
) => {
  let marketMaturity = maturity;
  if (marketMaturity === undefined) {
    const block = await client.getBlock();
    const targetMaturity = block.timestamp + 365n * 86_400n;
    const maturityAtFifteenUtc =
      (targetMaturity / 86_400n) * 86_400n + 15n * 3_600n;
    marketMaturity =
      maturityAtFifteenUtc > targetMaturity
        ? maturityAtFifteenUtc
        : maturityAtFifteenUtc + 86_400n;
  }
  const { params, marketData } = await createE2eMidnightMarket(
    client,
    chainId,
    {
      maturity: marketMaturity,
    },
  );
  return {
    market: marketData,
    params,
    loanToken: params.loanToken,
    collateralToken: params.collateralParams[0]!.token,
  };
};

const makeOfferTree = ({
  chainId,
  market,
  maker,
  type,
  buy,
  group,
  callback = zeroAddress,
  callbackData = "0x",
}: {
  readonly chainId: number;
  readonly market: MarketParams;
  readonly maker: Address;
  readonly type: RatifierType;
  readonly buy: boolean;
  readonly group: Hex;
  readonly callback?: Address;
  readonly callbackData?: Hex;
}) => {
  const offer = Offer.create({
    market,
    buy,
    maker,
    expiry: market.maturity,
    tick: 5_000n,
    group,
    callback,
    callbackData,
    receiverIfMakerIsSeller: buy ? zeroAddress : maker,
    ratifier: getChainAddress(
      chainId,
      type === "priceV1" ? "priceRatifierV1" : "rateRatifierV1",
    ),
    reduceOnly: false,
    maxUnits: buy ? 0n : offerAssets,
    maxAssets: buy ? offerAssets : 0n,
    continuousFeeCap: 0n,
  });
  return type === "priceV1"
    ? Tree.create({ type, entries: [{ offer }] })
    : Tree.create({
        type,
        entries: [{ offer, rate: 1_000_000_000n }],
      });
};

const sendRequirements = async (
  client: AnvilTestClient<Chain>,
  {
    requirements,
    account = client.account.address,
  }: {
    readonly requirements: readonly ActionRequirement[];
    readonly account?: Address;
  },
) => {
  for (const requirement of requirements) {
    if (isRequirementSignature(requirement))
      throw new Error("expected an onchain call requirement");
    await client.sendTransaction({ ...requirement, account });
  }
};

const assertPublished = async ({
  client,
  chainId,
  maker,
  ratifierType,
  root,
}: {
  readonly client: AnvilTestClient<Chain>;
  readonly chainId: number;
  readonly maker: Address;
  readonly ratifierType: RatifierType;
  readonly root: Hex;
}) => {
  const midnight = getChainAddress(chainId, "midnight");
  const midnightBundlesV2 = getChainAddress(chainId, "midnightBundlesV2");
  const ratifier = getChainAddress(
    chainId,
    ratifierType === "priceV1" ? "priceRatifierV1" : "rateRatifierV1",
  );
  expect(
    await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "isAuthorized",
      args: [maker, ratifier],
    }),
  ).toBe(true);
  expect(
    await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "isAuthorized",
      args: [maker, midnightBundlesV2],
    }),
  ).toBe(true);
  expect(
    await client.readContract({
      address: ratifier,
      abi: ratifierType === "priceV1" ? priceRatifierV1Abi : rateRatifierV1Abi,
      functionName: "isRootRatified",
      args: [maker, root],
    }),
  ).toBe(true);
};

describeE2e(makerScenario, (test, { chainId }) => {
  for (const ratifierType of ratifierTypes)
    test(`makeLend publishes a ${ratifierType} offer without moving loan tokens`, async ({
      client,
    }) => {
      const { params, loanToken } = await createMidnightMarket(client, {
        chainId,
      });
      const maker = client.account.address;
      const midnight = getChainAddress(chainId, "midnight");
      const midnightBundlesV2 = getChainAddress(chainId, "midnightBundlesV2");
      await wrapE2eNative(client, { wNative: loanToken, amount: offerAssets });
      const tree = makeOfferTree({
        chainId,
        market: params,
        maker,
        type: ratifierType,
        buy: true,
        group: `0x${"11".repeat(32)}` as Hex,
      });
      const balancesBefore = await Promise.all(
        [maker, midnight, midnightBundlesV2].map((account) =>
          client.readContract({
            address: loanToken,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          }),
        ),
      );
      const entity = client
        .extend(morphoViemExtension())
        .morpho.midnight(chainId);
      const output = await entity.makeLend({
        accountAddress: maker,
        offers: tree,
        loanToken,
        loanAssets: offerAssets,
        deadline: maxUint256,
        validation: false,
      });
      expect(output.root).toBe(tree.root);
      expect(output.ratifierType).toBe(ratifierType);
      await sendRequirements(client, {
        requirements: await output.getRequirements(),
      });
      const tx = output.buildTx();
      await client.sendTransaction(tx);
      expect(
        await Promise.all(
          [maker, midnight, midnightBundlesV2].map((account) =>
            client.readContract({
              address: loanToken,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [account],
            }),
          ),
        ),
      ).toStrictEqual(balancesBefore);
      await assertPublished({
        client,
        chainId,
        maker,
        ratifierType,
        root: tree.root,
      });
    });

  for (const ratifierType of ratifierTypes)
    test(`supplyBlueMakeLend parks loan assets for a ${ratifierType} offer`, async ({
      client,
    }) => {
      const { params, loanToken } = await createMidnightMarket(client, {
        chainId,
      });
      const maker = client.account.address;
      const blueMarket = await createE2eMarket(client, chainId);
      await seedE2eDeadDeposits(client, { chainId, market: blueMarket });
      const seedAssets = offerAssets;
      const blue = getChainAddress(chainId, "blue");
      await wrapE2eNative(client, {
        wNative: loanToken,
        amount: seedAssets + offerAssets,
      });
      await client.approve({
        address: loanToken,
        args: [blue, seedAssets],
      });
      await client.writeContract({
        account: client.account,
        address: blue,
        abi: blueAbi,
        functionName: "supply",
        args: [blueMarket, seedAssets, 0n, maker, "0x"],
      });
      const callbackSalt = `0x${"22".repeat(32)}` as Hex;
      const callback = getMidnightBlueBuyCallbackAddress({
        chainId,
        owner: maker,
        salt: callbackSalt,
      });
      const tree = makeOfferTree({
        chainId,
        market: params,
        maker,
        type: ratifierType,
        buy: true,
        group: `0x${"22".repeat(32)}` as Hex,
        callback,
        callbackData: getMidnightBlueBuyCallbackData(blueMarket),
      });
      const before = await client.readContract({
        address: loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [maker],
      });
      const output = await client
        .extend(morphoViemExtension())
        .morpho.midnight(chainId)
        .supplyBlueMakeLend({
          accountAddress: maker,
          offers: tree,
          blueMarket,
          assetsToPark: offerAssets,
          callbackSalt,
          deadline: maxUint256,
          validation: false,
        });
      const blueSnapshot = await fetchMarket(blueMarket.id, client);
      expect(output.root).toBe(tree.root);
      expect(output.ratifierType).toBe(ratifierType);
      await sendRequirements(client, {
        requirements: await output.getRequirements(),
      });
      await client.sendTransaction(output.buildTx());
      expect(await client.getCode({ address: callback })).toBeDefined();
      expect(
        await client.readContract({
          address: loanToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [maker],
        }),
      ).toBe(before - offerAssets);
      const [callbackSupplyShares] = await client.readContract({
        address: getChainAddress(chainId, "blue"),
        abi: blueAbi,
        functionName: "position",
        args: [blueMarket.id, callback],
      });
      expect(callbackSupplyShares).toBe(
        blueSnapshot.toSupplyShares(offerAssets, "Down"),
      );
      await assertPublished({
        client,
        chainId,
        maker,
        ratifierType,
        root: tree.root,
      });
    });

  for (const ratifierType of ratifierTypes)
    test(`supplyCollateralMakeBorrow supplies collateral and publishes a ${ratifierType} offer`, async ({
      client,
    }) => {
      const { params, collateralToken } = await createMidnightMarket(client, {
        chainId,
      });
      const maker = client.account.address;
      await client.deal({
        erc20: collateralToken,
        account: maker,
        amount: collateralAssets,
      });
      const tree = makeOfferTree({
        chainId,
        market: params,
        maker,
        type: ratifierType,
        buy: false,
        group: `0x${"33".repeat(32)}` as Hex,
      });
      const before = await client.readContract({
        address: collateralToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [maker],
      });
      const output = await client
        .extend(morphoViemExtension())
        .morpho.midnight(chainId)
        .supplyCollateralMakeBorrow({
          accountAddress: maker,
          offers: tree,
          collateral: {
            market: params,
            supplies: [{ collateralIndex: 0n, assets: collateralAssets }],
          },
          deadline: maxUint256,
          validation: false,
        });
      expect(output.root).toBe(tree.root);
      expect(output.ratifierType).toBe(ratifierType);
      await sendRequirements(client, {
        requirements: await output.getRequirements(),
      });
      await client.sendTransaction(output.buildTx());
      expect(
        await client.readContract({
          address: collateralToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [maker],
        }),
      ).toBe(before - collateralAssets);
      expect(
        await client.readContract({
          address: getChainAddress(chainId, "midnight"),
          abi: midnightAbi,
          functionName: "collateral",
          args: [MarketUtils.toId(params), maker, 0n],
        }),
      ).toBe(collateralAssets);
      await assertPublished({
        client,
        chainId,
        maker,
        ratifierType,
        root: tree.root,
      });
    });

  test("makeBorrow publishes a rateV1 offer without moving supplied collateral", async ({
    client,
  }) => {
    const { market, params, collateralToken } = await createMidnightMarket(
      client,
      { chainId },
    );
    const maker = client.account.address;
    await client.deal({
      erc20: collateralToken,
      account: maker,
      amount: collateralAssets,
    });
    const entity = client
      .extend(morphoViemExtension())
      .morpho.midnight(chainId);
    const supply = entity.supplyCollateral({
      accountAddress: maker,
      marketData: market,
      collateralAssets,
    });
    await sendRequirements(client, {
      requirements: await supply.getRequirements(),
    });
    await client.sendTransaction(supply.buildTx());
    const marketId = MarketUtils.toId(params);
    const positionBefore = await client.readContract({
      address: getChainAddress(chainId, "midnight"),
      abi: midnightAbi,
      functionName: "collateral",
      args: [marketId, maker, 0n],
    });
    const balanceBefore = await client.readContract({
      address: collateralToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [maker],
    });
    const tree = makeOfferTree({
      chainId,
      market: params,
      maker,
      type: "rateV1",
      buy: false,
      group: `0x${"44".repeat(32)}` as Hex,
    });
    const output = await entity.makeBorrow({
      accountAddress: maker,
      offers: tree,
      deadline: maxUint256,
      validation: false,
    });
    expect(output.root).toBe(tree.root);
    expect(output.ratifierType).toBe("rateV1");
    await sendRequirements(client, {
      requirements: await output.getRequirements(),
    });
    await client.sendTransaction(output.buildTx());
    expect(
      await client.readContract({
        address: getChainAddress(chainId, "midnight"),
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, maker, 0n],
      }),
    ).toBe(positionBefore);
    expect(
      await client.readContract({
        address: collateralToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [maker],
      }),
    ).toBe(balanceBefore);
    await assertPublished({
      client,
      chainId,
      maker,
      ratifierType: "rateV1",
      root: tree.root,
    });
  });
});
