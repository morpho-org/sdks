import { MarketUtils as BlueMarketUtils } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import {
  blueBuyCallbackAbi,
  blueBuyCallbackFactoryAbi,
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
import { createE2eMidnightMarket } from "@morpho-org/morpho-test/midnight";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { BASE_FORK_BLOCK, getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  type Chain,
  decodeFunctionData,
  encodeAbiParameters,
  erc20Abi,
  keccak256,
  maxUint128,
  maxUint256,
  numberToHex,
  parseAbi,
  parseEventLogs,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { assert, expect, vi } from "vitest";
import {
  buildTransactions,
  EmptyBlueParkingMarketError,
  getMidnightBlueBuyCallbackAddress,
  getMidnightBlueBuyCallbackData,
  InputExceedsMaxError,
  MidnightOfferCallbackMismatchError,
  parseTransactionPlan,
  prepareMidnightSupplyBlueMakeLend,
  serializeTransactionPlan,
  ZeroBlueParkingSharesError,
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
const blue = getChainAddress(chainId, "blue");
const midnight = getChainAddress(chainId, "midnight");
const bundle = getChainAddress(chainId, "midnightBundlesV2");
const factory = getChainAddress(chainId, "midnightBlueBuyCallbackFactory");
const wNative = getChainAddress(chainId, "wNative");
const usdc = getChainAddress(chainId, "usdc");
const callbackSalt = numberToHex(2334, { size: 32 });
const oldGroup = numberToHex(1, { size: 32 });
const newGroup = numberToHex(2, { size: 32 });
const assetsToPark = 1_000_000n;
const logAbi = parseAbi(["event Data(bytes data)"]);

test.for([
  {
    type: "priceV1",
    role: "priceRatifierV1",
    abi: priceRatifierV1Abi,
    loanToken: usdc,
    nativeAmount: 0n,
    expiryOffset: 1800n,
    deadlineOffset: 1799n,
  },
  {
    type: "rateV1",
    role: "rateRatifierV1",
    abi: rateRatifierV1Abi,
    loanToken: wNative,
    nativeAmount: 500_000n,
    expiryOffset: 14400n,
    deadlineOffset: 7200n,
  },
] as const)(
  "executes the restored $type publication on pinned Base",
  { timeout: 120_000 },
  async (
    { type, role, abi, loanToken, nativeAmount, expiryOffset, deadlineOffset },
    { client },
  ) => {
    const maker = client.account.address;
    const { timestamp } = await client.getBlock();
    const { params: fixture } = await createE2eMidnightMarket(client, chainId, {
      maturity: (timestamp / 86_400n + 365n) * 86_400n + 15n * 3600n,
    });
    const [collateral] = fixture.collateralParams;
    assert(collateral);
    const market = new MarketParams({ ...fixture, loanToken });
    const marketId = MarketUtils.toId(market);
    const blueMarket = {
      loanToken,
      collateralToken: collateral.token,
      oracle: collateral.oracle,
      irm: zeroAddress,
      lltv: 860_000_000_000_000_000n,
    };
    await client.writeContract({
      address: blue,
      abi: blueAbi,
      functionName: "createMarket",
      args: [blueMarket],
    });
    const callback = getMidnightBlueBuyCallbackAddress({
      chainId,
      owner: maker,
      salt: callbackSalt,
    });
    const { result: factoryPrediction } = await client.simulateContract({
      address: factory,
      abi: blueBuyCallbackFactoryAbi,
      functionName: "createBlueBuyCallback",
      args: [maker, callbackSalt],
    });
    expect(factoryPrediction).toBe(callback);
    const ratifier = getChainAddress(chainId, role);
    const { timestamp: now } = await client.getBlock();
    const offer = Offer.create({
      market,
      maker,
      ratifier,
      buy: true,
      start: now - 10n,
      expiry: now + expiryOffset,
      tick: MAX_TICK,
      maxUnits: 1_000_000n,
      group: newGroup,
      callback,
      callbackData: getMidnightBlueBuyCallbackData(blueMarket),
    });
    const offers =
      type === "priceV1"
        ? Tree.create({
            type,
            entries: [
              {
                offer: Offer.create({
                  ...offer,
                  group: numberToHex(3, { size: 32 }),
                  expiry: offer.expiry + 60n,
                }),
              },
              { offer },
            ],
          })
        : Tree.create({ type, entries: [{ offer, rate: 0n }] });
    const params = {
      chainId,
      account: maker,
      now,
      blueMarket,
      assetsToPark,
      callbackSalt,
      nativeAmount,
      offers,
      cancellations: [{ group: oldGroup, maxConsumed: 0n }],
      validation: false,
    } as const;

    if (type === "priceV1") {
      const fetch = vi.fn();
      await expect(
        prepareMidnightSupplyBlueMakeLend(client, {
          ...params,
          validation: { fetch },
        }),
      ).rejects.toBeInstanceOf(EmptyBlueParkingMarketError);
      await expect(
        prepareMidnightSupplyBlueMakeLend(client, {
          ...params,
          callbackSalt: oldGroup,
          validation: { fetch },
        }),
      ).rejects.toBeInstanceOf(MidnightOfferCallbackMismatchError);
      await expect(
        prepareMidnightSupplyBlueMakeLend(client, {
          ...params,
          expiresAt: Number(offer.expiry),
          validation: { fetch },
        }),
      ).rejects.toBeInstanceOf(InputExceedsMaxError);
      expect(fetch).not.toHaveBeenCalled();
    }

    const seed = 2_000_000n;
    const tokenFunding = assetsToPark - nativeAmount;
    await client.deal({
      erc20: loanToken,
      account: maker,
      amount: seed + tokenFunding,
    });
    await client.writeContract({
      address: loanToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [blue, seed],
    });
    await client.writeContract({
      address: blue,
      abi: blueAbi,
      functionName: "supply",
      args: [blueMarket, seed, 0n, maker, "0x"],
    });
    if (type === "priceV1") {
      // Blue's market mapping at slot 3 packs supply assets and shares into its first word.
      const slot = keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "uint256" }],
          [BlueMarketUtils.getMarketId(blueMarket), 3n],
        ),
      );
      const value = await client.getStorageAt({ address: blue, slot });
      assert(value);
      expect(BigInt(value) & maxUint128).toBe(seed);
      await client.setStorageAt({
        address: blue,
        index: slot,
        value: numberToHex((BigInt(value) & ~maxUint128) | (10n ** 24n), {
          size: 32,
        }),
      });
      const fetch = vi.fn();
      try {
        await expect(
          prepareMidnightSupplyBlueMakeLend(client, {
            ...params,
            assetsToPark: 1n,
            validation: { fetch },
          }),
        ).rejects.toBeInstanceOf(ZeroBlueParkingSharesError);
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        await client.setStorageAt({ address: blue, index: slot, value });
      }
    }
    if (nativeAmount > 0n) {
      // Covering just the ERC-20 portion must not suppress the full-pull approval.
      await client.writeContract({
        address: loanToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [bundle, tokenFunding],
      });
      await client.writeContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "setIsAuthorized",
        args: [bundle, true, maker],
      });
    }
    const plan = await prepareMidnightSupplyBlueMakeLend(client, params);
    const restored = parseTransactionPlan(serializeTransactionPlan(plan));
    const transactions = buildTransactions(restored);
    expect(transactions).toEqual(buildTransactions(plan));
    expect(restored.signatureRequests).toEqual([]);
    expect(restored.steps.map(({ action }) => action.type)).toEqual([
      "erc20Approval",
      ...(nativeAmount === 0n ? ["midnightAuthorization"] : []),
      "midnightSupplyBlueMakeLend",
    ]);
    const approval = transactions[0];
    const publication = transactions.at(-1);
    assert(approval && publication);
    expect(approval.to).toBe(loanToken);
    expect(decodeFunctionData({ abi: erc20Abi, data: approval.data })).toEqual({
      functionName: "approve",
      args: [bundle, maxUint256],
    });
    expect(publication.to).toBe(bundle);
    expect(publication.value).toBe(nativeAmount);
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: publication.data,
    });
    assert(decoded.functionName === "midnightBundlesV2CancelAndMake");
    const deadline = now + deadlineOffset;
    expect(deadline).toBeLessThan(offer.expiry);
    expect(restored.expiresAt).toBe(Number(deadline));
    expect(decoded.args[0]).toEqual(blueMarket);
    expect(decoded.args[1]).toBe(assetsToPark);
    expect(decoded.args[2]).toBe(callbackSalt);
    expect(decoded.args[6]).toBe(offers.root);
    expect(decoded.args[15]).toBe(deadline);
    expect(decoded.args[16]).toBe(nativeAmount > 0n ? wNative : zeroAddress);
    const expectedItems =
      offers.type === "priceV1"
        ? PriceRatifierV1.ratify({ tree: offers })
        : RateRatifierV1.ratify({ tree: offers });
    const logAddress = await client.readContract({
      address: bundle,
      abi: midnightBundlesV2Abi,
      functionName: "LOG",
    });

    const balance = (address: Address) =>
      client.balanceOf({ erc20: loanToken, owner: address });
    const allowance = (spender: Address) =>
      client.readContract({
        address: loanToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [maker, spender],
      });
    const shares = async (account: Address) => {
      const [supplyShares] = await client.readContract({
        address: blue,
        abi: blueAbi,
        functionName: "position",
        args: [BlueMarketUtils.getMarketId(blueMarket), account],
      });
      return supplyShares;
    };
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
    const credit = () =>
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "credit",
        args: [marketId, maker],
      });
    const makerSharesBefore = await shares(maker);
    const blueBalanceBefore = await balance(blue);
    const midnightBalanceBefore = await balance(midnight);
    await expect(active()).resolves.toBe(false);
    await expect(shares(callback)).resolves.toBe(0n);
    await expect(credit()).resolves.toBe(0n);
    await expect(allowance(bundle)).resolves.toBe(
      nativeAmount > 0n ? tokenFunding : 0n,
    );
    await expect(allowance(midnight)).resolves.toBe(0n);
    for (const { to, value, data } of transactions) {
      if (to === bundle)
        await client.setNextBlockTimestamp({ timestamp: deadline });
      const hash = await client.sendTransaction({
        to,
        value,
        data,
        account: restored.account,
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
        expect(published.args.data).toBe(decoded.args[14]);
        const items = await Payload.decode(published.args.data);
        expect(
          items.map((item) => OfferUtils.toStruct({ offer: item.offer })),
        ).toEqual(
          offers.offers.map((entry) => OfferUtils.toStruct({ offer: entry })),
        );
        expect(items.map(({ ratifierData }) => ratifierData)).toEqual(
          expectedItems.map(({ ratifierData }) => ratifierData),
        );
      }
    }
    await expect(
      client.readContract({
        address: factory,
        abi: blueBuyCallbackFactoryAbi,
        functionName: "callbackOf",
        args: [maker, callbackSalt],
      }),
    ).resolves.toBe(callback);
    await expect(
      client.readContract({
        address: callback,
        abi: blueBuyCallbackAbi,
        functionName: "OWNER",
      }),
    ).resolves.toBe(maker);
    await expect(shares(callback)).resolves.toBe(assetsToPark * 1_000_000n);
    await expect(shares(maker)).resolves.toBe(makerSharesBefore);
    await expect(balance(maker)).resolves.toBe(0n);
    await expect(balance(blue)).resolves.toBe(blueBalanceBefore + assetsToPark);
    await expect(balance(midnight)).resolves.toBe(midnightBalanceBefore);
    await expect(allowance(midnight)).resolves.toBe(0n);
    await expect(active()).resolves.toBe(true);
    await expect(consumed(oldGroup)).resolves.toBe(maxUint128);
    await expect(consumed(newGroup)).resolves.toBe(0n);
    await expect(credit()).resolves.toBe(0n);
  },
);
