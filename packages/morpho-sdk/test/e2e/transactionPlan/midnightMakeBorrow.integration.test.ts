import {
  type BuildOfferParams,
  MAX_TICK,
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
} from "@morpho-org/morpho-test/midnight";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { BASE_FORK_BLOCK, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  type Chain,
  createWalletClient,
  decodeFunctionData,
  http,
  maxUint128,
  numberToHex,
} from "viem";
import { base } from "viem/chains";
import { assert, expect, vi } from "vitest";
import {
  buildTransactions,
  MidnightOfferCallbackNotSupportedError,
  MidnightOfferExpiredError,
  MidnightOfferMakerMismatchError,
  MidnightOfferMarketAddressMismatchError,
  MidnightOfferReduceOnlyError,
  MidnightOfferSideMismatchError,
  MidnightReplacementGroupCancelledError,
  parseTransactionPlan,
  prepareMidnightMakeBorrow,
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
const { A: maker, B: other } = E2E_MIDNIGHT_WALLETS;
const midnight = getChainAddress(chainId, "midnight");
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const oldGroup = numberToHex(1, { size: 32 });
const newGroup = numberToHex(2, { size: 32 });
const cancellations = [{ group: oldGroup, maxConsumed: maxUint128 }];
const maturityFor = (now: bigint) =>
  (now / 86_400n + 365n) * 86_400n + 15n * 3600n;

function offerTerms(options: {
  market: BuildOfferParams["market"];
  now: bigint;
  ratifier: Address;
}): BuildOfferParams {
  return {
    market: options.market,
    ratifier: options.ratifier,
    buy: false,
    maker,
    start: options.now - 100n,
    expiry: options.now + 1800n,
    tick: MAX_TICK,
    maxUnits: 1_000_000n,
    group: newGroup,
  };
}

test.for([
  {
    type: "priceV1",
    role: "priceRatifierV1",
    abi: priceRatifierV1Abi,
    preauthorized: false,
  },
  {
    type: "rateV1",
    role: "rateRatifierV1",
    abi: rateRatifierV1Abi,
    preauthorized: true,
  },
] as const)(
  "executes a restored $type makeBorrow from the maker",
  { timeout: 120_000 },
  async ({ type, role, abi, preauthorized }, { client }) => {
    const { timestamp: now } = await client.getBlock();
    const { params: market } = await createE2eMidnightMarket(client, chainId, {
      maturity: maturityFor(now),
    });
    const marketId = MarketUtils.toId(market);
    await fundE2eMidnightWallets(client, { wallets: { A: {} } });
    const authorized = (operator: Address) =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "isAuthorized",
        args: [maker, operator],
      });
    if (preauthorized) {
      await client.writeContract({
        account: maker,
        address: midnight,
        abi: midnightAbi,
        functionName: "setIsAuthorized",
        args: [bundle, true, maker],
      });
    }
    const ratifier = getChainAddress(chainId, role);
    const offer = Offer.create(offerTerms({ market, now, ratifier }));
    const laterOffer = Offer.create({
      ...offerTerms({ market, now, ratifier }),
      expiry: offer.expiry + 60n,
      group: numberToHex(3, { size: 32 }),
    });
    const offers =
      type === "priceV1"
        ? Tree.create({ type, entries: [{ offer }, { offer: laterOffer }] })
        : Tree.create({ type, entries: [{ offer, rate: 1_000_000_000n }] });
    const fetch = vi.fn(async () => Response.json({ data: { issues: [] } }));
    const validation = preauthorized
      ? false
      : { apiUrl: "https://api.example/base/", fetch };
    const plan = await prepareMidnightMakeBorrow(client, {
      chainId,
      account: maker,
      now,
      expiresAt: preauthorized ? Number(now + 600n) : undefined,
      cancellations,
      offers,
      validation,
    });
    expect(fetch).toHaveBeenCalledTimes(preauthorized ? 0 : 1);
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    const txs = buildTransactions(restored);
    expect(txs).toEqual(buildTransactions(plan));
    expect(restored.signatureRequests).toEqual([]);
    expect(restored.steps.map(({ action }) => action.type)).toEqual(
      preauthorized
        ? ["midnightMakeBorrow"]
        : ["midnightAuthorization", "midnightMakeBorrow"],
    );
    const publication = restored.steps.at(-1)?.action;
    assert(publication?.type === "midnightMakeBorrow");
    expect(publication.inputs.root).toBe(offers.root);
    const deadline = preauthorized ? now + 600n : offer.expiry - 1n;
    expect(publication.inputs.deadline).toBe(deadline);
    expect(restored.expiresAt).toBe(Number(deadline));
    expect(restored.account).toBe(maker);
    const activated = () =>
      client.readContract({
        address: ratifier,
        abi,
        functionName: "isRootRatified",
        args: [maker, offers.root],
      });
    const consumed = (group: typeof oldGroup) =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "consumed",
        args: [maker, group],
      });
    const debt = () =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "debt",
        args: [marketId, maker],
      });
    const collateral = () =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, maker, 0n],
      });
    await expect(activated()).resolves.toBe(false);
    await expect(consumed(oldGroup)).resolves.toBe(0n);
    await expect(authorized(bundle)).resolves.toBe(preauthorized);
    await expect(authorized(ratifier)).resolves.toBe(false);
    for (const { to, data, value } of txs) {
      expect(value).toBe(0n);
      if (to === bundle) {
        const { functionName, args } = decodeFunctionData({
          abi: midnightBundlesV2Abi,
          data,
        });
        assert(functionName === "midnightBundlesV2CancelAndMake");
        const newRoot = args[6];
        const payload = args[14];
        expect(newRoot).toBe(offers.root);
        const items = await Payload.decode(payload);
        expect(
          items.map((item) => OfferUtils.toStruct({ offer: item.offer })),
        ).toEqual(
          offers.offers.map((entry) => OfferUtils.toStruct({ offer: entry })),
        );
        const ratifierModule =
          type === "priceV1" ? PriceRatifierV1 : RateRatifierV1;
        for (const item of items) {
          expect(ratifierModule.verifyRatifierData(item).root).toBe(
            offers.root,
          );
        }
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
        expect(
          (await client.getBlock({ blockNumber: receipt.blockNumber }))
            .timestamp,
        ).toBe(deadline);
      }
    }
    await expect(activated()).resolves.toBe(true);
    await expect(consumed(oldGroup)).resolves.toBe(maxUint128);
    await expect(consumed(newGroup)).resolves.toBe(0n);
    await expect(debt()).resolves.toBe(0n);
    await expect(collateral()).resolves.toBe(0n);
    await expect(authorized(bundle)).resolves.toBe(true);
    await expect(authorized(ratifier)).resolves.toBe(true);
  },
);

test("reverts with DeadlinePassed at offer expiry without cancelling the old group", {
  timeout: 120_000,
}, async ({ client }) => {
  const { timestamp: now } = await client.getBlock();
  const { params: market } = await createE2eMidnightMarket(client, chainId, {
    maturity: maturityFor(now),
  });
  await fundE2eMidnightWallets(client, { wallets: { A: {} } });
  const ratifier = getChainAddress(chainId, "priceRatifierV1");
  const offer = Offer.create(offerTerms({ market, now, ratifier }));
  const offers = Tree.create({ type: "priceV1", entries: [{ offer }] });
  const plan = await prepareMidnightMakeBorrow(client, {
    chainId,
    account: maker,
    now,
    offers,
    cancellations,
    validation: false,
  });
  const [authorization, publication] = buildTransactions(plan);
  assert(authorization && publication);
  await client.sendTransaction({ ...authorization, account: maker });
  await client.setNextBlockTimestamp({ timestamp: offer.expiry });
  // The traced client throws on reverted sends instead of returning the mined hash.
  const wallet = createWalletClient({
    chain,
    transport: http(client.transport.url),
  });
  const hash = await wallet.sendTransaction({
    ...publication,
    account: maker,
    gas: 1_000_000n,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("reverted");
  expect(
    (await client.getBlock({ blockNumber: receipt.blockNumber })).timestamp,
  ).toBe(offer.expiry);
  const { functionName, args } = decodeFunctionData({
    abi: midnightBundlesV2Abi,
    data: publication.data,
  });
  assert(functionName === "midnightBundlesV2CancelAndMake");
  await expect(
    client.simulateContract({
      account: maker,
      address: bundle,
      abi: midnightBundlesV2Abi,
      functionName,
      args,
      blockNumber: receipt.blockNumber,
    }),
  ).rejects.toMatchObject({ cause: { data: { errorName: "DeadlinePassed" } } });
  await expect(
    client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "consumed",
      args: [maker, oldGroup],
    }),
  ).resolves.toBe(0n);
  await expect(
    client.readContract({
      address: ratifier,
      abi: priceRatifierV1Abi,
      functionName: "isRootRatified",
      args: [maker, offers.root],
    }),
  ).resolves.toBe(false);
});

test("rejects invalid borrow offers even without API validation", {
  timeout: 120_000,
}, async ({ client }) => {
  const { timestamp: now } = await client.getBlock();
  const { params: market } = await createE2eMidnightMarket(client, chainId, {
    maturity: maturityFor(now),
  });
  const ratifier = getChainAddress(chainId, "priceRatifierV1");
  const terms = offerTerms({ market, now, ratifier });
  for (const { overrides, error } of [
    { overrides: { maker: other }, error: MidnightOfferMakerMismatchError },
    { overrides: { buy: true }, error: MidnightOfferSideMismatchError },
    { overrides: { reduceOnly: true }, error: MidnightOfferReduceOnlyError },
    {
      overrides: { callback: other },
      error: MidnightOfferCallbackNotSupportedError,
    },
    { overrides: { expiry: now - 1n }, error: MidnightOfferExpiredError },
    {
      overrides: { market: { ...market, midnight: other } },
      error: MidnightOfferMarketAddressMismatchError,
    },
  ]) {
    const offer = Offer.create({ ...terms, ...overrides });
    await expect(
      prepareMidnightMakeBorrow(client, {
        chainId,
        account: maker,
        now,
        offers: { type: "priceV1", entries: [{ offer }] },
        validation: false,
      }),
    ).rejects.toBeInstanceOf(error);
  }
  await expect(
    prepareMidnightMakeBorrow(client, {
      chainId,
      account: maker,
      now,
      offers: { type: "priceV1", entries: [{ offer: Offer.create(terms) }] },
      cancellations: [{ group: newGroup, maxConsumed: maxUint128 }],
      validation: false,
    }),
  ).rejects.toBeInstanceOf(MidnightReplacementGroupCancelledError);
});
