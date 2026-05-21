import { DEFAULT_SLIPPAGE_TOLERANCE } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  computeMaxSupplySharePrice,
  isRequirementApproval,
  MarketIdMismatchError,
  MorphoClient,
  marketV1Supply,
  NegativeNativeAmountError,
  NegativeSupplyAmountError,
  ZeroSupplyAmountError,
} from "../../../src/index.js";
import {
  CbbtcUsdcMarketV1,
  WbtcUsdcSourceMarket,
} from "../../fixtures/marketV1.js";
import { testInvariants } from "../../helpers/invariants.js";
import { test } from "../../setup.js";

describe("SupplyMarketV1", () => {
  test("should create supply bundle", async ({ client }) => {
    const supplyAmount = parseUnits("100", 6);

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);
    const marketData = await market.getMarketData();

    const supply = market.supply({
      userAddress: client.account.address,
      amount: supplyAmount,
      marketData,
    });

    const tx = supply.buildTx();

    const maxSharePrice = computeMaxSupplySharePrice({
      supplyAssets: supplyAmount,
      market: marketData,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });

    const directTx = marketV1Supply({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcMarketV1 },
      args: {
        amount: supplyAmount,
        onBehalf: client.account.address,
        maxSharePrice,
      },
    });

    expect(directTx).toStrictEqual(tx);
  });

  test("should supply loan token end-to-end", async ({ client }) => {
    const supplyAmount = parseUnits("1000", 6); // USDC

    await client.deal({
      erc20: CbbtcUsdcMarketV1.loanToken,
      amount: supplyAmount,
    });

    const {
      markets: {
        CbbtcUsdcMarketV1: { initialState, finalState, marketAccruedInterest },
      },
    } = await testInvariants({
      client,
      params: { markets: { CbbtcUsdcMarketV1 } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);
        const marketData = await market.getMarketData();

        const supply = market.supply({
          userAddress: client.account.address,
          amount: supplyAmount,
          marketData,
        });

        const requirements = await supply.getRequirements();
        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approval requirement not found");
        }
        await client.sendTransaction(approval);

        const tx = supply.buildTx();
        expect(tx.value).toBe(0n);

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance - supplyAmount,
    );
    expect(finalState.position.supplyShares).toBeGreaterThan(
      initialState.position.supplyShares,
    );
    // The market sees the supplied assets minus any accrual delta between blocks.
    expect(
      finalState.position.market.totalSupplyAssets -
        initialState.position.market.totalSupplyAssets,
    ).toEqual(supplyAmount + marketAccruedInterest);
  });

  test("should return requirements as ERC20 approval to GeneralAdapter1", async ({
    client,
  }) => {
    const supplyAmount = parseUnits("100", 6);
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);
    const marketData = await market.getMarketData();

    const supply = market.supply({
      userAddress: client.account.address,
      amount: supplyAmount,
      marketData,
    });

    const requirements = await supply.getRequirements();
    expect(requirements.length).toBeGreaterThan(0);
    const approval = requirements[0];
    expect(approval).toBeDefined();
    expect(isRequirementApproval(approval)).toBe(true);
  });

  test("should compute maxSharePrice from real market state", async ({
    client,
  }) => {
    const supplyAmount = parseUnits("100", 6);
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);
    const marketData = await market.getMarketData();

    const supply = market.supply({
      userAddress: client.account.address,
      amount: supplyAmount,
      marketData,
    });

    const tx = supply.buildTx();

    // Sanity bound only — exact value depends on virtual-share scaling.
    expect(tx.action.args.maxSharePrice).toBeGreaterThan(0n);
  });

  test("error: MarketIdMismatchError when marketData is for a different market", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);
    const otherMarket = morphoClient.marketV1(WbtcUsdcSourceMarket, mainnet.id);
    const wrongMarketData = await otherMarket.getMarketData();

    expect(() =>
      market.supply({
        userAddress: client.account.address,
        amount: parseUnits("100", 6),
        marketData: wrongMarketData,
      }),
    ).toThrow(MarketIdMismatchError);
  });

  test("error: NegativeSupplyAmountError when amount is negative", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);
    const marketData = await market.getMarketData();

    expect(() =>
      market.supply({
        userAddress: client.account.address,
        amount: -1n,
        marketData,
      }),
    ).toThrow(NegativeSupplyAmountError);
  });

  test("error: NegativeNativeAmountError when nativeAmount is negative", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);
    const marketData = await market.getMarketData();

    expect(() =>
      market.supply({
        userAddress: client.account.address,
        amount: parseUnits("100", 6),
        nativeAmount: -1n,
        marketData,
      }),
    ).toThrow(NegativeNativeAmountError);
  });

  test("error: ZeroSupplyAmountError when both amount and nativeAmount are zero", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);
    const marketData = await market.getMarketData();

    expect(() =>
      market.supply({
        userAddress: client.account.address,
        amount: 0n,
        marketData,
      }),
    ).toThrow(ZeroSupplyAmountError);
  });
});
