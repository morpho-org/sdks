import {
  MAX_TICK,
  MarketParams,
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
  getPendingSignatureRequests,
  midnightCancelAndMake,
  parseTransactionPlan,
  prepareMidnightSupplyCollateralMakeBorrow,
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
const { A: maker } = E2E_MIDNIGHT_WALLETS;
const midnight = getChainAddress(chainId, "midnight");
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const wNative = getChainAddress(chainId, "wNative");
const oldGroup = numberToHex(1, { size: 32 });
const newGroup = numberToHex(2, { size: 32 });
const tokenAssets = parseEther("0.03");
const wrappedAssets = parseEther("0.02");
const nativeAssets = parseEther("0.01");
const logAbi = parseAbi(["event Data(bytes data)"]);

test.for([
  {
    type: "priceV1",
    role: "priceRatifierV1",
    abi: priceRatifierV1Abi,
    withNative: false,
    expiryOffset: 1_800n,
    deadlineOffset: 1_799n,
  },
  {
    type: "rateV1",
    role: "rateRatifierV1",
    abi: rateRatifierV1Abi,
    withNative: true,
    expiryOffset: 14_400n,
    deadlineOffset: 7_200n,
  },
] as const)(
  "executes restored $type collateral supply and publication from the maker (native funding: $withNative)",
  { timeout: 120_000 },
  async (
    { type, role, abi, withNative, expiryOffset, deadlineOffset },
    { client },
  ) => {
    const { timestamp: now } = await client.getBlock();
    const { params: baseMarket } = await createE2eMidnightMarket(
      client,
      chainId,
      {
        maturity: (now / 86_400n + 365n) * 86_400n + 15n * 3600n,
      },
    );
    const [tokenCollateral] = baseMarket.collateralParams;
    assert(tokenCollateral);
    const market = withNative
      ? new MarketParams({
          ...baseMarket,
          loanToken: getChainAddress(chainId, "usdc"),
          collateralParams: [
            tokenCollateral,
            { ...tokenCollateral, token: wNative },
          ],
        })
      : baseMarket;
    const marketId = MarketUtils.toId(market);
    const pulls = market.collateralParams.map(({ token }, index) => ({
      token,
      collateralIndex: BigInt(index),
      assets: token === wNative ? wrappedAssets : tokenAssets,
    }));
    const supplies = pulls.map(({ collateralIndex, assets }) => ({
      collateralIndex,
      assets,
    }));
    const funding = withNative ? nativeAssets : 0n;
    await fundE2eMidnightWallets(client, {
      market: baseMarket,
      wallets: { A: { collateralAssets: tokenAssets } },
    });
    if (withNative) {
      const wrap = await client.sendTransaction({
        account: maker,
        to: wNative,
        value: wrappedAssets - funding,
      });
      expect(
        (await client.waitForTransactionReceipt({ hash: wrap })).status,
      ).toBe("success");
      // Enough for the non-native portion, but the bundle pulls the full wrapped amount.
      await client.writeContract({
        account: maker,
        address: wNative,
        abi: erc20Abi,
        functionName: "approve",
        args: [bundle, wrappedAssets - funding],
      });
      await client.writeContract({
        account: maker,
        address: midnight,
        abi: midnightAbi,
        functionName: "setIsAuthorized",
        args: [bundle, true, maker],
      });
    }
    const ratifier = getChainAddress(chainId, role);
    const offer = Offer.create({
      market,
      maker,
      ratifier,
      buy: false,
      start: now - 100n,
      expiry: now + expiryOffset,
      tick: MAX_TICK,
      maxUnits: 1_000_000n,
      group: newGroup,
    });
    const laterOffer = Offer.create({
      ...offer,
      expiry: offer.expiry + 60n,
      group: numberToHex(3, { size: 32 }),
    });
    const offers =
      type === "priceV1"
        ? Tree.create({ type, entries: [{ offer: laterOffer }, { offer }] })
        : Tree.create({ type, entries: [{ offer, rate: 1_000_000_000n }] });
    const cancellations = [{ group: oldGroup, maxConsumed: 0n }];
    const plan = await prepareMidnightSupplyCollateralMakeBorrow(client, {
      chainId,
      account: maker,
      now,
      offers,
      collateral: { market, supplies },
      ...(withNative && { nativeAmount: funding }),
      cancellations,
      validation: false,
    });
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    const txs = buildTransactions(restored);
    expect(txs).toEqual(buildTransactions(plan));
    expect(restored.account).toBe(maker);
    expect(restored.signatureRequests).toEqual([]);
    expect(getPendingSignatureRequests(restored)).toEqual([]);
    expect(restored.steps.map((step) => step.action.type)).toEqual([
      ...pulls.map(() => "erc20Approval"),
      ...(withNative ? [] : ["midnightAuthorization"]),
      "midnightSupplyCollateralMakeBorrow",
    ]);
    for (const [index, { token }] of pulls.entries()) {
      const approval = txs[index];
      assert(approval);
      expect(approval.to).toBe(token);
      expect(
        decodeFunctionData({ abi: erc20Abi, data: approval.data }),
      ).toEqual({
        functionName: "approve",
        args: [bundle, maxUint256],
      });
    }
    const action = restored.steps.at(-1)?.action;
    const tx = txs.at(-1);
    assert(action?.type === "midnightSupplyCollateralMakeBorrow" && tx);
    const deadline = now + deadlineOffset;
    expect(deadline).toBeLessThan(offer.expiry);
    expect(restored.expiresAt).toBe(Number(deadline));
    expect(action.inputs.deadline).toBe(deadline);
    expect(tx).toEqual(
      midnightCancelAndMake({
        chainId,
        deadline,
        cancellations,
        nativeAmount: funding,
        publication: {
          ratifier,
          root: offers.root,
          groups: action.inputs.groups,
          payload: action.inputs.payload,
          collateral: { market, supplies },
        },
      }),
    );
    expect(tx.to).toBe(bundle);
    expect(tx.value).toBe(funding);
    const { functionName, args } = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });
    assert(functionName === "midnightBundlesV2CancelAndMake");
    expect(args[3]).toEqual(MarketUtils.toStruct(market));
    expect(args[4]).toEqual(supplies);
    expect(args[15]).toBe(deadline);
    expect(args[16]).toBe(withNative ? wNative : zeroAddress);
    const expectedItems =
      offers.type === "priceV1"
        ? PriceRatifierV1.ratify({ tree: offers })
        : RateRatifierV1.ratify({ tree: offers });
    const logAddress = await client.readContract({
      address: bundle,
      abi: midnightBundlesV2Abi,
      functionName: "LOG",
    });

    const balance = (token: Address, account: Address) =>
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      });
    const allowance = (token: Address) =>
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [maker, bundle],
      });
    const authorized = (operator: Address) =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "isAuthorized",
        args: [maker, operator],
      });
    const active = () =>
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
    const collateralAt = (index: bigint) =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "collateral",
        args: [marketId, maker, index],
      });
    const balances = () =>
      Promise.all(
        pulls.map(async ({ token, collateralIndex }) => ({
          maker: await balance(token, maker),
          midnight: await balance(token, midnight),
          bundle: await balance(token, bundle),
          collateral: await collateralAt(collateralIndex),
        })),
      );

    const before = await balances();
    const loanBefore = await balance(market.loanToken, maker);
    await expect(debt()).resolves.toBe(0n);
    await expect(active()).resolves.toBe(false);
    await expect(authorized(bundle)).resolves.toBe(withNative);
    await expect(authorized(ratifier)).resolves.toBe(false);
    if (withNative) {
      await expect(allowance(wNative)).resolves.toBe(wrappedAssets - funding);
    }
    for (const { to, data, value } of txs) {
      if (to === bundle) {
        for (const { token } of pulls) {
          await expect(allowance(token)).resolves.toBe(maxUint256);
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
        expect((await client.getTransaction({ hash })).value).toBe(funding);
      }
    }
    expect(await balances()).toEqual(
      pulls.map(({ token, assets }, index) => {
        const previous = before[index];
        assert(previous);
        return {
          maker: previous.maker - assets + (token === wNative ? funding : 0n),
          midnight: previous.midnight + assets,
          bundle: previous.bundle,
          collateral: previous.collateral + assets,
        };
      }),
    );
    await expect(active()).resolves.toBe(true);
    await expect(debt()).resolves.toBe(0n);
    await expect(balance(market.loanToken, maker)).resolves.toBe(loanBefore);
    await expect(consumed(oldGroup)).resolves.toBe(maxUint128);
    await expect(consumed(newGroup)).resolves.toBe(0n);
    await expect(authorized(bundle)).resolves.toBe(true);
    await expect(authorized(ratifier)).resolves.toBe(true);
  },
);
