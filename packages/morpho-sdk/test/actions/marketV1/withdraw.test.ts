import { DEFAULT_SLIPPAGE_TOLERANCE } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  computeMinWithdrawSharePrice,
  isRequirementAuthorization,
  MorphoClient,
  marketV1Withdraw,
  type VaultReallocation,
} from "../../../src/index.js";
import {
  CbbtcUsdcMarketV1,
  WbtcUsdcSourceMarket,
} from "../../fixtures/marketV1.js";
import { SteakhouseUsdcVaultV1 } from "../../fixtures/vaultV1.js";
import { testInvariants } from "../../helpers/invariants.js";
import { supplyLoan } from "../../helpers/marketV1.js";
import { test } from "../../setup.js";

describe("WithdrawMarketV1", () => {
  test("should create withdraw bundle by assets", async ({ client }) => {
    const supplyAmount = parseUnits("1000", 6);
    const withdrawAmount = parseUnits("100", 6);

    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcMarketV1,
      supplyAmount,
    });

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    const withdraw = market.withdraw({
      userAddress: client.account.address,
      assets: withdrawAmount,
      positionData,
    });

    const tx = withdraw.buildTx();

    const minSharePrice = computeMinWithdrawSharePrice({
      withdrawAssets: withdrawAmount,
      withdrawShares: 0n,
      market: positionData.market,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });

    const directTx = marketV1Withdraw({
      market: { chainId: mainnet.id, marketParams: CbbtcUsdcMarketV1 },
      args: {
        assets: withdrawAmount,
        shares: 0n,
        onBehalf: client.account.address,
        receiver: client.account.address,
        minSharePrice,
      },
    });

    expect(directTx).toStrictEqual(tx);
  });

  test("should withdraw loan token end-to-end (assets mode)", async ({
    client,
  }) => {
    const supplyAmount = parseUnits("1000", 6);
    const withdrawAmount = parseUnits("500", 6);

    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcMarketV1,
      supplyAmount,
    });

    const {
      markets: {
        CbbtcUsdcMarketV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { CbbtcUsdcMarketV1 } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const withdraw = market.withdraw({
          userAddress: client.account.address,
          assets: withdrawAmount,
          positionData,
        });

        const requirements = await withdraw.getRequirements();
        const authorization = requirements[0];
        if (!isRequirementAuthorization(authorization)) {
          throw new Error("Authorization requirement not found");
        }
        await client.sendTransaction(authorization);

        const tx = withdraw.buildTx();
        expect(tx.value).toBe(0n);

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance + withdrawAmount,
    );
    expect(finalState.position.supplyShares).toBeLessThan(
      initialState.position.supplyShares,
    );
  });

  test("should withdraw loan token end-to-end (shares mode, full close)", async ({
    client,
  }) => {
    const supplyAmount = parseUnits("1000", 6);

    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcMarketV1,
      supplyAmount,
    });

    const {
      markets: {
        CbbtcUsdcMarketV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { CbbtcUsdcMarketV1 } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        // Withdraw all owned supply shares to close the position cleanly.
        const withdraw = market.withdraw({
          userAddress: client.account.address,
          shares: positionData.supplyShares,
          positionData,
        });

        const requirements = await withdraw.getRequirements();
        const authorization = requirements[0];
        if (!isRequirementAuthorization(authorization)) {
          throw new Error("Authorization requirement not found");
        }
        await client.sendTransaction(authorization);

        const tx = withdraw.buildTx();
        expect(tx.value).toBe(0n);

        await client.sendTransaction(tx);
      },
    });

    // Position fully closed.
    expect(finalState.position.supplyShares).toEqual(0n);
    // User received approximately the supplied amount back (interest accrual makes it ≥ supplyAmount).
    expect(finalState.userLoanTokenBalance).toBeGreaterThanOrEqual(
      initialState.userLoanTokenBalance,
    );
  });

  test("should support a different receiver", async ({ client }) => {
    const supplyAmount = parseUnits("1000", 6);
    const withdrawAmount = parseUnits("100", 6);
    const receiver = "0x000000000000000000000000000000000000dEaD" as const;

    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcMarketV1,
      supplyAmount,
    });

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    const withdraw = market.withdraw({
      userAddress: client.account.address,
      receiver,
      assets: withdrawAmount,
      positionData,
    });

    const tx = withdraw.buildTx();
    expect(tx.action.args.receiver).toBe(receiver);
    expect(tx.action.args.onBehalf).toBe(client.account.address);
  });

  test("should require Morpho authorization for GeneralAdapter1", async ({
    client,
  }) => {
    const supplyAmount = parseUnits("1000", 6);

    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcMarketV1,
      supplyAmount,
    });

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    const withdraw = market.withdraw({
      userAddress: client.account.address,
      assets: parseUnits("100", 6),
      positionData,
    });

    const requirements = await withdraw.getRequirements();
    expect(requirements.length).toBe(1);
    expect(isRequirementAuthorization(requirements[0])).toBe(true);
  });

  test("should withdraw with single-vault reallocation", async ({ client }) => {
    // Withdraw < supply: `AccrualPosition.supplyAssets` rounds down via
    // `toSupplyAssets` so a full-supply withdraw trips `WithdrawExceedsSupplyError`
    // by 1 wei. Leave a buffer instead of stressing the rounding edge.
    const supplyAmount = parseUnits("200", 6);
    const withdrawAmount = parseUnits("50", 6);
    const reallocationAmount = parseUnits("2000", 6);

    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcMarketV1,
      supplyAmount,
    });

    const reallocations: readonly VaultReallocation[] = [
      {
        vault: SteakhouseUsdcVaultV1.address,
        fee: 0n,
        withdrawals: [
          {
            marketParams: WbtcUsdcSourceMarket,
            amount: reallocationAmount,
          },
        ],
      },
    ];

    const {
      markets: {
        CbbtcUsdcMarketV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { CbbtcUsdcMarketV1, WbtcUsdcSourceMarket } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.marketV1(CbbtcUsdcMarketV1, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const withdraw = market.withdraw({
          userAddress: client.account.address,
          assets: withdrawAmount,
          positionData,
          reallocations,
        });

        const requirements = await withdraw.getRequirements();
        const authorization = requirements[0];
        if (!isRequirementAuthorization(authorization)) {
          throw new Error("Authorization requirement not found");
        }
        await client.sendTransaction(authorization);

        const tx = withdraw.buildTx();
        expect(tx.value).toBe(0n);
        expect(tx.action.args.reallocationFee).toBe(0n);

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance + withdrawAmount,
    );
  });
});
