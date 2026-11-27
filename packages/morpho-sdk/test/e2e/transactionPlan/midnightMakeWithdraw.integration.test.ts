import {
  MAX_TICK,
  type MarketParams,
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
  Offer,
  OfferUtils,
  Payload,
  PriceRatifierV1,
  priceRatifierV1Abi,
  RateRatifierV1,
  rateRatifierV1Abi,
  Tree,
} from "@morpho-org/midnight-sdk";
import {
  createE2eMidnightMarket,
  E2E_MIDNIGHT_WALLETS,
  fundE2eMidnightWallets,
  getE2eTakeableOffers,
  postE2eSetterTree,
} from "@morpho-org/morpho-test/midnight";
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  type AnvilTestClient,
  BASE_FORK_BLOCK,
  getErpcForkUrl,
} from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  type Chain,
  decodeFunctionData,
  erc20Abi,
  maxUint128,
  maxUint256,
  numberToHex,
  parseAbi,
  parseEther,
  parseEventLogs,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { assert, expect } from "vitest";
import {
  buildTransactions,
  MidnightOfferNoCreditError,
  parseTransactionPlan,
  prepareMidnightMakeWithdraw,
  serializeTransactionPlan,
} from "../../../src/index.js";

const chain: Chain = base;
const chainId = base.id;
const test = createViemTest(chain, {
  forkUrl:
    process.env.BASE_RPC_URL ??
    getErpcForkUrl(chainId, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_FORK_BLOCK,
  stepsTracing: false,
});
const { A: maker, B: borrower } = E2E_MIDNIGHT_WALLETS;
const midnight = getChainAddress(chainId, "midnight");
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const logAbi = parseAbi(["event Data(bytes data)"]);
const units = parseEther("0.1");
const oldGroup = numberToHex(1, { size: 32 });
const newGroup = numberToHex(2, { size: 32 });
const laterGroup = numberToHex(3, { size: 32 });
const cancellations = [{ group: oldGroup, maxConsumed: maxUint128 }];

async function seedCredit(
  client: AnvilTestClient<Chain>,
  market: MarketParams,
) {
  const collateral = parseEther("10");
  await fundE2eMidnightWallets(client, {
    market,
    wallets: { A: { loanAssets: units }, B: { collateralAssets: collateral } },
    approve: midnight,
  });
  await client.writeContract({
    account: borrower,
    address: midnight,
    abi: midnightAbi,
    functionName: "supplyCollateral",
    args: [MarketUtils.toStruct(market), 0n, collateral, borrower],
  });
  const { timestamp } = await client.getBlock();
  const tree = Tree.create([
    Offer.create({
      market,
      maker,
      buy: true,
      start: timestamp,
      expiry: timestamp + 7200n,
      tick: MAX_TICK,
      ratifier: getChainAddress(chainId, "setterRatifier"),
      maxUnits: units,
      continuousFeeCap: maxUint256,
    }),
  ]);
  await postE2eSetterTree(client, { chainId, maker, tree });
  const [lend] = getE2eTakeableOffers({ tree, units });
  assert(lend);
  await client.writeContract({
    account: borrower,
    address: midnight,
    abi: midnightAbi,
    functionName: "take",
    args: [
      lend.offer,
      lend.ratifierData,
      lend.units,
      borrower,
      borrower,
      zeroAddress,
      "0x",
    ],
  });
}

test.for([
  {
    type: "priceV1",
    role: "priceRatifierV1",
    abi: priceRatifierV1Abi,
    preauthorized: false,
    offerLifetime: 1800n,
    planLifetime: 1799n,
  },
  {
    type: "rateV1",
    role: "rateRatifierV1",
    abi: rateRatifierV1Abi,
    preauthorized: true,
    offerLifetime: 10_800n,
    planLifetime: 7200n,
  },
] as const)(
  "publishes restored $type reduce-only offers from the maker without drawing credit",
  { timeout: 120_000 },
  async (
    { type, role, abi, preauthorized, offerLifetime, planLifetime },
    { client },
  ) => {
    const { timestamp: now } = await client.getBlock();
    const { params: market } = await createE2eMidnightMarket(client, chainId, {
      maturity: (now / 86_400n + 365n) * 86_400n + 15n * 3600n,
    });
    const marketId = MarketUtils.toId(market);
    const ratifier = getChainAddress(chainId, role);
    const offer = Offer.create({
      market,
      maker,
      ratifier,
      buy: false,
      reduceOnly: true,
      start: now,
      expiry: now + offerLifetime,
      tick: MAX_TICK,
      group: newGroup,
      maxUnits: units,
    });
    const later = Offer.create({
      ...offer,
      expiry: offer.expiry + 60n,
      group: laterGroup,
    });
    const offers =
      type === "priceV1"
        ? Tree.create({ type, entries: [{ offer: later }, { offer }] })
        : Tree.create({ type, entries: [{ offer, rate: 1_000_000_000n }] });
    const params = {
      chainId,
      account: maker,
      offers,
      now,
      cancellations,
      validation: false,
    } as const;
    await expect(
      prepareMidnightMakeWithdraw(client, params),
    ).rejects.toBeInstanceOf(MidnightOfferNoCreditError);

    await seedCredit(client, market);
    if (preauthorized) {
      await client.writeContract({
        account: maker,
        address: midnight,
        abi: midnightAbi,
        functionName: "setIsAuthorized",
        args: [bundle, true, maker],
      });
    }
    const plan = await prepareMidnightMakeWithdraw(client, params);
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    const txs = buildTransactions(restored);
    expect(txs).toEqual(buildTransactions(plan));
    expect(restored.account).toBe(maker);
    expect(restored.signatureRequests).toEqual([]);
    expect(restored.steps.map(({ action }) => action.type)).toEqual(
      preauthorized
        ? ["midnightMakeWithdraw"]
        : ["midnightAuthorization", "midnightMakeWithdraw"],
    );
    const deadline = now + planLifetime;
    expect(restored.expiresAt).toBe(Number(deadline));

    const activated = () =>
      client.readContract({
        address: ratifier,
        abi,
        functionName: "isRootRatified",
        args: [maker, offers.root],
      });
    const credit = () =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "credit",
        args: [marketId, maker],
      });
    const balance = (account: Address) =>
      client.readContract({
        address: market.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      });
    const consumed = (group: typeof oldGroup) =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "consumed",
        args: [maker, group],
      });
    const authorized = (operator: Address) =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "isAuthorized",
        args: [maker, operator],
      });

    const [makerBalance, coreBalance] = await Promise.all([
      balance(maker),
      balance(midnight),
    ]);
    await expect(credit()).resolves.toBe(units);
    await expect(activated()).resolves.toBe(false);
    await expect(consumed(oldGroup)).resolves.toBe(0n);
    await expect(authorized(bundle)).resolves.toBe(preauthorized);
    await expect(authorized(ratifier)).resolves.toBe(false);
    const publication = txs.at(-1);
    assert(publication);
    expect(publication.to).toBe(bundle);
    const { functionName, args } = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: publication.data,
    });
    assert(functionName === "midnightBundlesV2CancelAndMake");
    expect(args[5]).toBe(ratifier);
    expect(args[6]).toBe(offers.root);
    expect(args[13]).toEqual(cancellations);
    expect(args[15]).toBe(deadline);
    expect(args[15]).toBeLessThan(offer.expiry);
    const expectedItems =
      offers.type === "priceV1"
        ? PriceRatifierV1.ratify({ tree: offers })
        : RateRatifierV1.ratify({ tree: offers });
    const logAddress = await client.readContract({
      address: bundle,
      abi: midnightBundlesV2Abi,
      functionName: "LOG",
    });

    for (const { to, data, value } of txs) {
      expect(value).toBe(0n);
      if (to === bundle) {
        await client.setNextBlockTimestamp({ timestamp: deadline });
      }
      const hash = await client.sendTransaction({
        account: restored.account,
        to,
        data,
        value,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe("success");
      expect(receipt.from.toLowerCase()).toBe(maker.toLowerCase());
      if (to === bundle) {
        const [published, ...others] = parseEventLogs({
          abi: logAbi,
          logs: receipt.logs.filter(
            ({ address }) => address.toLowerCase() === logAddress.toLowerCase(),
          ),
        });
        assert(published);
        expect(others).toHaveLength(0);
        expect(published.args.data).toBe(args[14]);
        const items = await Payload.decode(published.args.data);
        expect(
          items.map((item) => OfferUtils.toStruct({ offer: item.offer })),
        ).toEqual(
          offers.offers.map((entry) => OfferUtils.toStruct({ offer: entry })),
        );
        expect(items.map(({ ratifierData }) => ratifierData)).toEqual(
          expectedItems.map(({ ratifierData }) => ratifierData),
        );
        expect(
          (await client.getBlock({ blockNumber: receipt.blockNumber }))
            .timestamp,
        ).toBe(deadline);
      }
    }
    await expect(activated()).resolves.toBe(true);
    await expect(consumed(oldGroup)).resolves.toBe(maxUint128);
    await expect(consumed(newGroup)).resolves.toBe(0n);
    await expect(authorized(bundle)).resolves.toBe(true);
    await expect(authorized(ratifier)).resolves.toBe(true);
    await expect(credit()).resolves.toBe(units);
    await expect(balance(maker)).resolves.toBe(makerBalance);
    await expect(balance(midnight)).resolves.toBe(coreBalance);
  },
);
