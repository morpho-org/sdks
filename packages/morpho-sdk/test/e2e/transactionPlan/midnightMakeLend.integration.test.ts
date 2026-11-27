import {
  MAX_TICK,
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
  Offer,
  OfferUtils,
  Payload,
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
} from "viem";
import { base } from "viem/chains";
import { assert, expect } from "vitest";
import {
  buildTransactions,
  getPendingSignatureRequests,
  MidnightOfferMakerMismatchError,
  parseTransactionPlan,
  prepareMidnightMakeLend,
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
const loanAssets = 1_000_000n;
const reservedLoanAssets = 300_000n;
const bound = loanAssets + reservedLoanAssets;
const rate = 1_000_000_000n;

test.for([
  {
    type: "priceV1",
    role: "priceRatifierV1",
    abi: priceRatifierV1Abi,
    preapproved: false,
    allowanceBefore: bound - 1n,
    expiryOffset: 1_800n,
    deadlineOffset: 1_799n,
  },
  {
    type: "rateV1",
    role: "rateRatifierV1",
    abi: rateRatifierV1Abi,
    preapproved: true,
    allowanceBefore: bound,
    expiryOffset: 14_400n,
    deadlineOffset: 7_200n,
  },
] as const)(
  "publishes a restored $type lend offer without moving loan tokens (preapproved: $preapproved)",
  { timeout: 120_000 },
  async (
    {
      type,
      role,
      abi,
      preapproved,
      allowanceBefore,
      expiryOffset,
      deadlineOffset,
    },
    { client },
  ) => {
    const { timestamp: now } = await client.getBlock();
    const { params: market } = await createE2eMidnightMarket(client, chainId, {
      maturity: (now / 86_400n + 365n) * 86_400n + 15n * 3600n,
    });
    const loanToken = market.loanToken;
    const marketId = MarketUtils.toId(market);
    await fundE2eMidnightWallets(client, {
      market,
      wallets: { A: { loanAssets: bound } },
    });
    await client.writeContract({
      account: maker,
      address: loanToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, allowanceBefore],
    });
    if (preapproved) {
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
      buy: true,
      start: now - 100n,
      expiry: now + expiryOffset,
      tick: type === "priceV1" ? MAX_TICK : 4_000n,
      maxAssets: loanAssets,
      group: newGroup,
    });
    const offers =
      type === "priceV1"
        ? Tree.create({ type, entries: [{ offer }] })
        : Tree.create({ type, entries: [{ offer, rate }] });
    const params = {
      chainId,
      account: maker,
      loanToken,
      loanAssets,
      reservedLoanAssets,
      now,
      offers,
      validation: false,
      cancellations: [{ group: oldGroup, maxConsumed: 42n }],
    } as const;
    await expect(
      prepareMidnightMakeLend(client, { ...params, account: other }),
    ).rejects.toBeInstanceOf(MidnightOfferMakerMismatchError);
    const plan = await prepareMidnightMakeLend(client, params);
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    const txs = buildTransactions(restored);
    expect(txs).toEqual(buildTransactions(plan));
    expect(getPendingSignatureRequests(restored)).toEqual([]);
    expect(restored.signatureRequests).toEqual([]);
    expect(restored.account).toBe(maker);
    expect(restored.steps.map(({ action }) => action.type)).toEqual(
      preapproved
        ? ["midnightMakeLend"]
        : ["erc20Approval", "midnightAuthorization", "midnightMakeLend"],
    );
    if (!preapproved) {
      expect(restored.steps[0]?.action).toEqual({
        type: "erc20Approval",
        inputs: {
          chainId,
          account: maker,
          token: loanToken,
          spender: midnight,
          assets: maxUint256,
        },
      });
    }

    const publication = restored.steps.at(-1)?.action;
    const tx = txs.at(-1);
    assert(publication?.type === "midnightMakeLend" && tx);
    const deadline = now + deadlineOffset;
    expect(restored.expiresAt).toBe(Number(deadline));
    expect(publication.inputs.deadline).toBe(deadline);
    expect(deadline).toBeLessThan(offer.expiry);
    expect(publication.inputs.ratifierType).toBe(type);
    expect(publication.inputs.root).toBe(offers.root);
    expect(tx.to).toBe(bundle);
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: tx.data,
    });
    assert(decoded.functionName === "midnightBundlesV2CancelAndMake");
    expect(decoded.args[1]).toBe(0n); // assetsToPark
    expect(decoded.args[4]).toEqual([]); // collateralSupplies
    expect(decoded.args[5]).toBe(ratifier);
    expect(decoded.args[6]).toBe(offers.root);
    expect(decoded.args[15]).toBe(deadline);
    const items = await Payload.decode(decoded.args[14]);
    expect(
      items.map((item) => OfferUtils.toStruct({ offer: item.offer })),
    ).toEqual(
      offers.offers.map((item) => OfferUtils.toStruct({ offer: item })),
    );
    if (type === "rateV1") {
      const [item] = items;
      assert(item);
      const leaf = RateRatifierV1.decodeRatifierData(item.ratifierData);
      expect(leaf.rate).toBe(rate);
      expect(leaf.root).toBe(offers.root);
    }

    const allowance = (spender: Address) =>
      client.readContract({
        address: loanToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [maker, spender],
      });
    const balances = () =>
      Promise.all(
        [maker, midnight, bundle].map((account) =>
          client.readContract({
            address: loanToken,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          }),
        ),
      );
    const activated = () =>
      client.readContract({
        address: ratifier,
        abi,
        functionName: "isRootRatified",
        args: [maker, offers.root],
      });
    const authorized = (operator: Address) =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "isAuthorized",
        args: [maker, operator],
      });
    const consumed = (group: typeof newGroup) =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "consumed",
        args: [maker, group],
      });
    const balancesBefore = await balances();
    assert(balancesBefore[0] !== undefined);
    expect(balancesBefore[0]).toBeGreaterThanOrEqual(bound);
    await expect(allowance(bundle)).resolves.toBe(0n);
    await expect(allowance(midnight)).resolves.toBe(allowanceBefore);
    await expect(activated()).resolves.toBe(false);
    await expect(authorized(bundle)).resolves.toBe(preapproved);

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
        expect(
          (await client.getBlock({ blockNumber: receipt.blockNumber }))
            .timestamp,
        ).toBe(deadline);
      }
    }
    await expect(activated()).resolves.toBe(true);
    await expect(consumed(oldGroup)).resolves.toBe(maxUint128);
    await expect(consumed(newGroup)).resolves.toBe(0n);
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "credit",
        args: [marketId, maker],
      }),
    ).resolves.toBe(0n);
    await expect(balances()).resolves.toEqual(balancesBefore);
    await expect(allowance(bundle)).resolves.toBe(0n);
    await expect(allowance(midnight)).resolves.toBe(
      preapproved ? allowanceBefore : maxUint256,
    );
    await expect(authorized(bundle)).resolves.toBe(true);
    await expect(authorized(ratifier)).resolves.toBe(true);
  },
);
