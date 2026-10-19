import {
  Market,
  MarketParams,
  MarketUtils,
  Offer,
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
  padHex,
  parseEther,
  parseUnits,
  toFunctionSelector,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  ExpiredDeadlineError,
  midnightCancelAndMake,
  midnightRepayWithdrawCollateral,
  morphoViemExtension,
} from "../../../src/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 52_252_000n,
  stepsTracing: false,
});

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const rateRatifierV1 = getChainAddress(ChainId.BaseMainnet, "rateRatifierV1");
const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const oracle = "0x0000000000000000000000000000000000080000" as Address;
const groupA = `0x${"aa".repeat(32)}` as Hex;
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
const blueMarket = {
  loanToken: usdc,
  collateralToken: wNative,
  oracle,
  irm: getChainAddress(ChainId.BaseMainnet, "adaptiveCurveIrm"),
  lltv: 860000000000000000n,
};
const deadlinePassed = toFunctionSelector("DeadlinePassed()");

/** A deadline already behind both the fork's clock and the local clock. */
const pastDeadline = async (client: AnvilTestClient<typeof base>) => {
  const { timestamp } = await client.getBlock();
  const now = Time.timestamp();
  return (timestamp < now ? timestamp : now) - 60n;
};

const midnightEntity = (client: AnvilTestClient<typeof base>) =>
  client.extend(morphoViemExtension()).morpho.midnight(base.id);

const offers = (
  client: AnvilTestClient<typeof base>,
  params: { readonly buy: boolean; readonly reduceOnly?: boolean },
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
          group: groupA,
          ratifier: rateRatifierV1,
          continuousFeeCap: 0n,
          receiverIfMakerIsSeller: params.buy
            ? zeroAddress
            : client.account.address,
          reduceOnly: params.reduceOnly ?? false,
          maxUnits: params.reduceOnly ? parseUnits("1", 6) : 0n,
          maxAssets: params.reduceOnly ? 0n : parseUnits("1", 6),
          callback: zeroAddress,
          callbackData: "0x",
        }),
        rate: 1_000_000_000n,
      },
    ],
  });

/** Counts Midnight mempool API reads so the tests prove the guard runs first. */
const countingValidation = () => {
  const calls = { count: 0 };
  return {
    calls,
    validation: {
      apiUrl: "https://api.example/base/",
      fetch: async () => {
        calls.count += 1;
        return new Response(JSON.stringify({ data: { issues: [] } }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  };
};

describe("Midnight deadline guard on fork", () => {
  test("behavior: an expired cancelAndMake deadline reverts DeadlinePassed onchain; cancelOffers rejects it first", async ({
    client,
  }) => {
    const deadline = await pastDeadline(client);
    const cancellations = [{ group: groupA, maxConsumed: 0n }];
    const raw = midnightCancelAndMake({
      chainId: base.id,
      cancellations,
      deadline,
    });
    await expect(
      client.call({ ...raw, account: client.account.address }),
    ).rejects.toThrow(deadlinePassed);

    expect(() =>
      midnightEntity(client).cancelOffers({
        accountAddress: client.account.address,
        cancellations,
        deadline,
      }),
    ).toThrow(ExpiredDeadlineError);
  });

  test("behavior: an expired repayWithdrawCollateral deadline reverts DeadlinePassed onchain; the entity rejects it first", async ({
    client,
  }) => {
    const deadline = await pastDeadline(client);
    const repay = { type: "assets", assets: 1n } as const;
    const raw = midnightRepayWithdrawCollateral({
      chainId: base.id,
      market,
      repay,
      collateralWithdrawals: [],
      collateralReceiver: zeroAddress,
      deadline,
    });
    await expect(
      client.call({ ...raw, account: client.account.address }),
    ).rejects.toThrow(deadlinePassed);

    // Creates the market with a constant oracle so the entity can read its state.
    await client.setCode({
      address: oracle,
      bytecode: concatHex([
        "0x7f",
        padHex(toHex(10n ** 36n), { size: 32 }),
        "0x60005260206000f3",
      ]),
    });
    const collateralAssets = parseEther("1");
    await client.deal({ erc20: wNative, amount: collateralAssets });
    await client.writeContract({
      account: client.account.address,
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateralAssets],
    });
    const entity = midnightEntity(client);
    const supply = entity.supplyCollateral({
      marketData: new Market({
        params: market,
        totalUnits: 0n,
        lossFactor: 0n,
        withdrawable: 0n,
        continuousFeeCredit: 0n,
        settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
        continuousFee: 0,
        tickSpacing: 1,
      }),
      accountAddress: client.account.address,
      collateralAssets,
      reservedCollateralAssets: 0n,
    });
    await client.sendTransaction({
      ...supply.buildTx(),
      account: client.account.address,
    });
    const marketId = MarketUtils.toId(market);
    const marketData = await entity.getMarketData(marketId);
    const positionData = await entity.getPositionData({
      marketId,
      accountAddress: client.account.address,
    });
    expect(() =>
      entity.repayWithdrawCollateral({
        marketData,
        accountAddress: client.account.address,
        positionData,
        collateralPrices: [],
        repay,
        deadline,
      }),
    ).toThrow(ExpiredDeadlineError);
  });

  test("behavior: maker flows reject an expired deadline before any API read", async ({
    client,
  }) => {
    const deadline = await pastDeadline(client);
    const entity = midnightEntity(client);
    const accountAddress = client.account.address;
    const { calls, validation } = countingValidation();
    const lend = { accountAddress, deadline, validation };
    const makers = {
      makeLend: () =>
        entity.makeLend({
          ...lend,
          offers: offers(client, { buy: true }),
          loanToken: usdc,
          loanAssets: parseUnits("1", 6),
        }),
      makeBorrow: () =>
        entity.makeBorrow({ ...lend, offers: offers(client, { buy: false }) }),
      supplyBlueMakeLend: () =>
        entity.supplyBlueMakeLend({
          ...lend,
          offers: offers(client, { buy: true }),
          blueMarket,
          assetsToPark: parseUnits("1", 6),
          callbackSalt: `0x${"cc".repeat(32)}`,
        }),
      makeWithdraw: () =>
        entity.makeWithdraw({
          ...lend,
          offers: offers(client, { buy: false, reduceOnly: true }),
        }),
      makeRepay: () =>
        entity.makeRepay({
          ...lend,
          offers: offers(client, { buy: true, reduceOnly: true }),
          loanToken: usdc,
          loanAssets: parseUnits("1", 6),
        }),
      supplyCollateralMakeBorrow: () =>
        entity.supplyCollateralMakeBorrow({
          ...lend,
          offers: offers(client, { buy: false }),
          collateral: {
            market,
            supplies: [{ collateralIndex: 0n, assets: parseEther("1") }],
          },
        }),
    };
    for (const [name, make] of Object.entries(makers)) {
      await expect(make(), name).rejects.toThrow(ExpiredDeadlineError);
    }
    expect(calls.count).toBe(0);
  });
});
