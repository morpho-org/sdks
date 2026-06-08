import { addressesRegistry, MathLib } from "@morpho-org/blue-sdk";
import { isHex, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  ExcessiveSlippageToleranceError,
  isRequirementApproval,
  isRequirementSignature,
  MarketIdMismatchError,
  morphoViemExtension,
  NativeAmountOnNonWNativeAssetError,
  NegativeNativeAmountError,
  NegativeSlippageToleranceError,
  NegativeSupplyAmountError,
  ZeroSupplyAmountError,
} from "../../../src/index.js";
import {
  CbbtcUsdcBlue,
  WbtcUsdcSourceMarket,
  WstethWethBlue,
} from "../../fixtures/blue.js";
import { testInvariants } from "../../helpers/invariants.js";
import { test } from "../../setup.js";

describe("SupplyBlue", () => {
  test("should supply loan token end-to-end", async ({ client }) => {
    const supplyAmount = parseUnits("1000", 6); // USDC

    await client.deal({
      erc20: CbbtcUsdcBlue.loanToken,
      amount: supplyAmount,
    });

    const {
      markets: {
        CbbtcUsdcBlue: { initialState, finalState, marketAccruedInterest },
      },
    } = await testInvariants({
      client,
      params: { markets: { CbbtcUsdcBlue } },
      actionFn: async () => {
        const morphoClient = client.extend(morphoViemExtension()).morpho;
        const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
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
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
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
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
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

  test("should supply loan token end-to-end with permit2", async ({
    client,
  }) => {
    const {
      permit2,
      bundler3: { generalAdapter1 },
    } = addressesRegistry[mainnet.id];

    const supplyAmount = parseUnits("1000", 6); // USDC

    await client.deal({
      erc20: CbbtcUsdcBlue.loanToken,
      amount: supplyAmount,
    });

    const {
      markets: {
        CbbtcUsdcBlue: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { CbbtcUsdcBlue } },
      actionFn: async () => {
        const morphoClient = client.extend(
          morphoViemExtension({
            supportSignature: true,
          }),
        ).morpho;
        const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
        const marketData = await market.getMarketData();

        const supply = market.supply({
          userAddress: client.account.address,
          amount: supplyAmount,
          marketData,
        });

        const requirements = await supply.getRequirements();
        expect(requirements.length).toBe(2);

        const approvalPermit2 = requirements[0];
        if (!isRequirementApproval(approvalPermit2)) {
          throw new Error("Expected approval requirement for permit2");
        }
        expect(approvalPermit2.action.args.spender).toBe(permit2);
        expect(approvalPermit2.action.args.amount).toBe(MathLib.MAX_UINT_160);
        await client.sendTransaction(approvalPermit2);

        const signaturePermit2 = requirements[1];
        if (!isRequirementSignature(signaturePermit2)) {
          throw new Error("Expected permit2 signature requirement");
        }
        expect(signaturePermit2.action.type).toBe("permit2");
        expect(signaturePermit2.action.args.spender).toBe(generalAdapter1);

        const requirementSignature = await signaturePermit2.sign(
          client,
          client.account.address,
        );
        expect(isHex(requirementSignature.args.signature)).toBe(true);

        const tx = supply.buildTx(requirementSignature);
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
  });

  test("should supply loan token end-to-end with native ETH only (wNative loan)", async ({
    client,
  }) => {
    const nativeAmount = parseUnits("1", 18);

    await client.setBalance({
      address: client.account.address,
      value: nativeAmount + parseUnits("10", 18),
    });

    const {
      markets: {
        WstethWethBlue: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { WstethWethBlue } },
      actionFn: async () => {
        const morphoClient = client.extend(morphoViemExtension()).morpho;
        const market = morphoClient.blue(WstethWethBlue, mainnet.id);
        const marketData = await market.getMarketData();

        const supply = market.supply({
          userAddress: client.account.address,
          amount: 0n,
          nativeAmount,
          marketData,
        });

        // No ERC20 approval needed: only native wrapping inside the bundle.
        const requirements = await supply.getRequirements();
        expect(requirements.length).toBe(0);

        const tx = supply.buildTx();
        expect(tx.value).toEqual(nativeAmount);
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.morphoLoanTokenBalance).toEqual(
      initialState.morphoLoanTokenBalance + nativeAmount,
    );
    expect(finalState.position.supplyShares).toBeGreaterThan(
      initialState.position.supplyShares,
    );
  });

  test("should supply loan token end-to-end with both ERC20 WETH and native ETH", async ({
    client,
  }) => {
    const amount = parseUnits("0.5", 18);
    const nativeAmount = parseUnits("0.5", 18);
    const totalAssets = amount + nativeAmount;

    await client.deal({
      erc20: WstethWethBlue.loanToken,
      amount,
    });
    await client.setBalance({
      address: client.account.address,
      value: nativeAmount + parseUnits("10", 18),
    });

    const {
      markets: {
        WstethWethBlue: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { WstethWethBlue } },
      actionFn: async () => {
        const morphoClient = client.extend(morphoViemExtension()).morpho;
        const market = morphoClient.blue(WstethWethBlue, mainnet.id);
        const marketData = await market.getMarketData();

        const supply = market.supply({
          userAddress: client.account.address,
          amount,
          nativeAmount,
          marketData,
        });

        const requirements = await supply.getRequirements();
        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approval requirement not found");
        }
        await client.sendTransaction(approval);

        const tx = supply.buildTx();
        expect(tx.value).toEqual(nativeAmount);
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance - amount,
    );
    expect(finalState.morphoLoanTokenBalance).toEqual(
      initialState.morphoLoanTokenBalance + totalAssets,
    );
  });

  test("error: MarketIdMismatchError when marketData is for a different market", async ({
    client,
  }) => {
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
    const otherMarket = morphoClient.blue(WbtcUsdcSourceMarket, mainnet.id);
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
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
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
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
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
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
    const marketData = await market.getMarketData();

    expect(() =>
      market.supply({
        userAddress: client.account.address,
        amount: 0n,
        marketData,
      }),
    ).toThrow(ZeroSupplyAmountError);
  });

  test("error: NegativeSlippageToleranceError when slippageTolerance is negative", async ({
    client,
  }) => {
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
    const marketData = await market.getMarketData();

    expect(() =>
      market.supply({
        userAddress: client.account.address,
        amount: parseUnits("100", 6),
        marketData,
        slippageTolerance: -1n,
      }),
    ).toThrow(NegativeSlippageToleranceError);
  });

  test("error: ExcessiveSlippageToleranceError when slippageTolerance is too high", async ({
    client,
  }) => {
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
    const marketData = await market.getMarketData();

    expect(() =>
      market.supply({
        userAddress: client.account.address,
        amount: parseUnits("100", 6),
        marketData,
        slippageTolerance: parseUnits("1", 18),
      }),
    ).toThrow(ExcessiveSlippageToleranceError);
  });

  test("error: NativeAmountOnNonWNativeAssetError when loan token is not wNative", async ({
    client,
  }) => {
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
    const marketData = await market.getMarketData();

    expect(() =>
      market.supply({
        userAddress: client.account.address,
        nativeAmount: parseUnits("1", 18),
        marketData,
      }),
    ).toThrow(NativeAmountOnNonWNativeAssetError);
  });
});
