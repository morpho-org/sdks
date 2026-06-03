import { AccrualPosition as AccrualPositionClass } from "@morpho-org/blue-sdk";
import { parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  AccrualPositionUserMismatchError,
  ExcessiveSlippageToleranceError,
  isRequirementAuthorization,
  MarketIdMismatchError,
  MissingAccrualPositionError,
  MorphoClient,
  MutuallyExclusiveWithdrawAmountsError,
  NegativeSlippageToleranceError,
  NonPositiveWithdrawAmountError,
  type VaultReallocation,
  WithdrawExceedsSupplyError,
  WithdrawSharesExceedSupplyError,
} from "../../../src/index.js";
import { CbbtcUsdcBlue, WbtcUsdcSourceMarket } from "../../fixtures/blue.js";
import { SteakhouseUsdcVaultV1 } from "../../fixtures/vaultV1.js";
import { supplyLoan } from "../../helpers/blue.js";
import { testInvariants } from "../../helpers/invariants.js";
import { test } from "../../setup.js";

describe("WithdrawBlue", () => {
  test("should withdraw loan token end-to-end (assets mode)", async ({
    client,
  }) => {
    const supplyAmount = parseUnits("1000", 6);
    const withdrawAmount = parseUnits("500", 6);

    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcBlue,
      supplyAmount,
    });

    const {
      markets: {
        CbbtcUsdcBlue: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { CbbtcUsdcBlue } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
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
      market: CbbtcUsdcBlue,
      supplyAmount,
    });

    const {
      markets: {
        CbbtcUsdcBlue: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { CbbtcUsdcBlue } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
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
      market: CbbtcUsdcBlue,
      supplyAmount,
    });

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    const withdraw = market.withdraw({
      userAddress: client.account.address,
      receiver,
      assets: withdrawAmount,
      positionData,
    });

    const tx = withdraw.buildTx();
    expect(tx.action.args.receiver).toBe(receiver);
  });

  test("should require Morpho authorization for GeneralAdapter1", async ({
    client,
  }) => {
    const supplyAmount = parseUnits("1000", 6);

    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcBlue,
      supplyAmount,
    });

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
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
      market: CbbtcUsdcBlue,
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
        CbbtcUsdcBlue: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { CbbtcUsdcBlue, WbtcUsdcSourceMarket } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
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

  test("should withdraw by shares with single-vault reallocation", async ({
    client,
  }) => {
    const supplyAmount = parseUnits("200", 6);
    const reallocationAmount = parseUnits("2000", 6);

    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcBlue,
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
        CbbtcUsdcBlue: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { CbbtcUsdcBlue, WbtcUsdcSourceMarket } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        // Withdraw half the supply shares; mode-by-shares exercises the
        // `toSupplyAssets("Down")` path in the slippage helper.
        const withdrawShares = positionData.supplyShares / 2n;

        const withdraw = market.withdraw({
          userAddress: client.account.address,
          shares: withdrawShares,
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
        expect(tx.action.args.shares).toBe(withdrawShares);
        expect(tx.action.args.assets).toBe(0n);

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.position.supplyShares).toBeLessThan(
      initialState.position.supplyShares,
    );
    expect(finalState.userLoanTokenBalance).toBeGreaterThan(
      initialState.userLoanTokenBalance,
    );
  });

  test("should withdraw to a different receiver with reallocation", async ({
    client,
  }) => {
    const supplyAmount = parseUnits("200", 6);
    const withdrawAmount = parseUnits("50", 6);
    const reallocationAmount = parseUnits("2000", 6);
    const receiver = "0x000000000000000000000000000000000000dEaD" as const;

    await supplyLoan({
      client,
      chainId: mainnet.id,
      market: CbbtcUsdcBlue,
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

    const receiverInitialBalance = await client.balanceOf({
      erc20: CbbtcUsdcBlue.loanToken,
      owner: receiver,
    });

    await testInvariants({
      client,
      params: { markets: { CbbtcUsdcBlue, WbtcUsdcSourceMarket } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const withdraw = market.withdraw({
          userAddress: client.account.address,
          receiver,
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
        expect(tx.action.args.receiver).toBe(receiver);
        await client.sendTransaction(tx);
      },
    });

    const receiverFinalBalance = await client.balanceOf({
      erc20: CbbtcUsdcBlue.loanToken,
      owner: receiver,
    });
    expect(receiverFinalBalance).toEqual(
      receiverInitialBalance + withdrawAmount,
    );
  });

  test("error: MutuallyExclusiveWithdrawAmountsError when both assets and shares are non-zero", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.withdraw({
        userAddress: client.account.address,
        assets: parseUnits("1", 6),
        shares: 1n,
        positionData: undefined as never,
      } as never),
    ).toThrow(MutuallyExclusiveWithdrawAmountsError);
  });

  test("error: NonPositiveWithdrawAmountError when shares is negative", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.withdraw({
        userAddress: client.account.address,
        shares: -1n,
        positionData: undefined as never,
      } as never),
    ).toThrow(NonPositiveWithdrawAmountError);
  });

  test("error: MissingAccrualPositionError when positionData is missing", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.withdraw({
        userAddress: client.account.address,
        assets: parseUnits("1", 6),
        positionData: undefined as never,
      }),
    ).toThrow(MissingAccrualPositionError);
  });

  test("error: MarketIdMismatchError when positionData is for a different market", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
    const otherMarket = morphoClient.blue(WbtcUsdcSourceMarket, mainnet.id);
    const wrongPositionData = await otherMarket.getPositionData(
      client.account.address,
    );

    expect(() =>
      market.withdraw({
        userAddress: client.account.address,
        assets: parseUnits("1", 6),
        positionData: wrongPositionData,
      }),
    ).toThrow(MarketIdMismatchError);
  });

  test("error: AccrualPositionUserMismatchError when positionData is for a different user", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
    const otherUser = "0x000000000000000000000000000000000000dEaD" as const;
    const positionData = await market.getPositionData(otherUser);

    expect(() =>
      market.withdraw({
        userAddress: client.account.address,
        assets: parseUnits("1", 6),
        positionData,
      }),
    ).toThrow(AccrualPositionUserMismatchError);
  });

  test("error: WithdrawExceedsSupplyError when assets exceed supplied", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
    const positionData = new AccrualPositionClass(
      {
        user: client.account.address,
        supplyShares: parseUnits("100", 24),
        borrowShares: 0n,
        collateral: 0n,
      },
      {
        params: CbbtcUsdcBlue,
        totalSupplyAssets: parseUnits("1000", 6),
        totalSupplyShares: parseUnits("1000", 24),
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        lastUpdate: 0n,
        fee: 0n,
      },
    );

    expect(() =>
      market.withdraw({
        userAddress: client.account.address,
        assets: parseUnits("1000", 6),
        positionData,
      }),
    ).toThrow(WithdrawExceedsSupplyError);
  });

  test("error: WithdrawSharesExceedSupplyError when shares exceed owned", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);
    const positionData = new AccrualPositionClass(
      {
        user: client.account.address,
        supplyShares: parseUnits("100", 24),
        borrowShares: 0n,
        collateral: 0n,
      },
      {
        params: CbbtcUsdcBlue,
        totalSupplyAssets: parseUnits("1000", 6),
        totalSupplyShares: parseUnits("1000", 24),
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n,
        lastUpdate: 0n,
        fee: 0n,
      },
    );

    expect(() =>
      market.withdraw({
        userAddress: client.account.address,
        shares: parseUnits("101", 24),
        positionData,
      }),
    ).toThrow(WithdrawSharesExceedSupplyError);
  });

  test("error: NegativeSlippageToleranceError when slippageTolerance is negative", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.withdraw({
        userAddress: client.account.address,
        assets: parseUnits("1", 6),
        positionData: undefined as never,
        slippageTolerance: -1n,
      }),
    ).toThrow(NegativeSlippageToleranceError);
  });

  test("error: ExcessiveSlippageToleranceError when slippageTolerance is too high", async ({
    client,
  }) => {
    const morphoClient = new MorphoClient(client);
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.withdraw({
        userAddress: client.account.address,
        assets: parseUnits("1", 6),
        positionData: undefined as never,
        slippageTolerance: parseUnits("1", 18),
      }),
    ).toThrow(ExcessiveSlippageToleranceError);
  });
});
