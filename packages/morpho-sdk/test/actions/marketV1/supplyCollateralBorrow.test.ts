import {
  type AccrualPosition,
  DEFAULT_SLIPPAGE_TOLERANCE,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";

import { encodeFunctionData, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { MAX_SLIPPAGE_TOLERANCE } from "../../../src/helpers/constant.js";
import {
  BorrowExceedsSafeLtvError,
  ExcessiveSlippageToleranceError,
  MissingAccrualPositionError,
  MorphoClient,
  computeMinBorrowSharePrice,
  isRequirementApproval,
  isRequirementAuthorization,
  isRequirementSignature,
  marketV1SupplyCollateralBorrow,
} from "../../../src/index.js";
import {
  UsdcEurcvMarketV1,
  WethUsdsMarketV1,
} from "../../fixtures/marketV1.js";
import { testInvariants } from "../../helpers/invariants.js";
import { supplyCollateral } from "../../helpers/marketV1.js";
import { test } from "../../setup.js";

describe("SupplyCollateralBorrowMarketV1", () => {
  test("should create supply collateral borrow bundle", async ({ client }) => {
    const amount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);

    const morphoClient = new MorphoClient(client);
    const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
    const positionData = await market.getPositionData(client.account.address);

    const tx = market
      .supplyCollateralBorrow({
        userAddress: client.account.address,
        amount,
        borrowAmount,
        positionData,
      })
      .buildTx();

    const minSharePrice = computeMinBorrowSharePrice({
      borrowAmount,
      market: positionData.market,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });

    const directTx = marketV1SupplyCollateralBorrow({
      market: { chainId: mainnet.id, marketParams: WethUsdsMarketV1 },
      args: {
        amount,
        borrowAmount,
        onBehalf: client.account.address,
        receiver: client.account.address,
        minSharePrice,
      },
    });

    expect(directTx).toStrictEqual(tx);
  });

  test("should supply collateral and borrow with ERC20 approval and authorization", async ({
    client,
  }) => {
    const amount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);

    await client.deal({ erc20: WethUsdsMarketV1.collateralToken, amount });

    const {
      markets: {
        WethUsdsMarketV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { WethUsdsMarketV1 } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const scb = market.supplyCollateralBorrow({
          userAddress: client.account.address,
          amount,
          borrowAmount,
          positionData,
        });

        const requirements = await scb.getRequirements();
        expect(requirements).toHaveLength(2);
        expect(requirements[0]!.action.type).toBe("erc20Approval");
        expect(requirements[1]!.action.type).toBe("morphoAuthorization");

        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approval requirement not found");
        }
        const authorization = requirements[1];
        if (!isRequirementAuthorization(authorization)) {
          throw new Error("Authorization requirement not found");
        }

        await client.sendTransaction(approval);
        await client.sendTransaction(authorization);

        const tx = scb.buildTx();

        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userCollateralTokenBalance).toEqual(
      initialState.userCollateralTokenBalance - amount,
    );
    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance + borrowAmount,
    );
    expect(finalState.morphoCollateralTokenBalance).toEqual(
      initialState.morphoCollateralTokenBalance + amount,
    );
    expect(finalState.morphoLoanTokenBalance).toEqual(
      initialState.morphoLoanTokenBalance - borrowAmount,
    );
    expect(finalState.position.collateral).toEqual(
      initialState.position.collateral + amount,
    );
    expect(finalState.position.borrowAssets).toEqual(
      initialState.position.borrowAssets + borrowAmount + 1n,
    );
  });

  test("should supply collateral with native ETH only and borrow", async ({
    client,
  }) => {
    const nativeAmount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);

    await client.setBalance({
      address: client.account.address,
      value: nativeAmount + parseUnits("1", 18),
    });

    const {
      markets: {
        WethUsdsMarketV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { WethUsdsMarketV1 } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const scb = market.supplyCollateralBorrow({
          userAddress: client.account.address,
          nativeAmount,
          borrowAmount,
          positionData,
        });

        const requirements = await scb.getRequirements();
        expect(requirements).toHaveLength(1);
        expect(requirements[0]!.action.type).toBe("morphoAuthorization");

        const authorization = requirements[0];
        if (!isRequirementAuthorization(authorization)) {
          throw new Error("Authorization requirement not found");
        }

        await client.sendTransaction(authorization);

        const tx = scb.buildTx();
        expect(tx.value).toEqual(nativeAmount);
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userCollateralTokenBalance).toEqual(
      initialState.userCollateralTokenBalance,
    );
    expect(finalState.morphoCollateralTokenBalance).toEqual(
      initialState.morphoCollateralTokenBalance + nativeAmount,
    );
    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance + borrowAmount,
    );
    expect(finalState.morphoLoanTokenBalance).toEqual(
      initialState.morphoLoanTokenBalance - borrowAmount,
    );
    expect(finalState.position.collateral).toEqual(
      initialState.position.collateral + nativeAmount,
    );
    expect(finalState.position.borrowAssets).toEqual(
      initialState.position.borrowAssets + borrowAmount + 1n,
    );
  });

  test("should supply mixed collateral (ERC20 + native ETH) and borrow", async ({
    client,
  }) => {
    const amount = parseUnits("5", 18);
    const nativeAmount = parseUnits("5", 18);
    const totalCollateral = amount + nativeAmount;
    const borrowAmount = parseUnits("1000", 18);

    await client.deal({ erc20: WethUsdsMarketV1.collateralToken, amount });
    await client.setBalance({
      address: client.account.address,
      value: nativeAmount + parseUnits("1", 18),
    });

    const {
      markets: {
        WethUsdsMarketV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { WethUsdsMarketV1 } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const scb = market.supplyCollateralBorrow({
          userAddress: client.account.address,
          amount,
          nativeAmount,
          borrowAmount,
          positionData,
        });

        const requirements = await scb.getRequirements();
        expect(requirements).toHaveLength(2);
        expect(requirements[0]!.action.type).toBe("erc20Approval");
        expect(requirements[1]!.action.type).toBe("morphoAuthorization");

        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approval requirement not found");
        }
        const authorization = requirements[1];
        if (!isRequirementAuthorization(authorization)) {
          throw new Error("Authorization requirement not found");
        }
        await client.sendTransaction(approval);
        await client.sendTransaction(authorization);

        const tx = scb.buildTx();
        expect(tx.value).toEqual(nativeAmount);
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userCollateralTokenBalance).toEqual(
      initialState.userCollateralTokenBalance - amount,
    );
    expect(finalState.morphoCollateralTokenBalance).toEqual(
      initialState.morphoCollateralTokenBalance + totalCollateral,
    );
    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance + borrowAmount,
    );
    expect(finalState.morphoLoanTokenBalance).toEqual(
      initialState.morphoLoanTokenBalance - borrowAmount,
    );
    expect(finalState.position.collateral).toEqual(
      initialState.position.collateral + totalCollateral,
    );
    expect(finalState.position.borrowAssets).toEqual(
      initialState.position.borrowAssets + borrowAmount + 1n,
    );
  });

  test("should require only ERC20 approval when GeneralAdapter1 is already authorized", async ({
    client,
  }) => {
    const {
      morpho,
      bundler3: { generalAdapter1 },
    } = getChainAddresses(mainnet.id);
    const amount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);

    await client.sendTransaction({
      to: morpho,
      data: encodeFunctionData({
        abi: blueAbi,
        functionName: "setAuthorization",
        args: [generalAdapter1, true],
      }),
      value: 0n,
    });

    await client.deal({ erc20: WethUsdsMarketV1.collateralToken, amount });

    const {
      markets: {
        WethUsdsMarketV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { WethUsdsMarketV1 } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client);
        const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const scb = market.supplyCollateralBorrow({
          userAddress: client.account.address,
          amount,
          borrowAmount,
          positionData,
        });

        const requirements = await scb.getRequirements();
        expect(requirements).toHaveLength(1);

        const approval = requirements[0];
        if (!isRequirementApproval(approval)) {
          throw new Error("Approval requirement not found");
        }
        await client.sendTransaction(approval);

        const tx = scb.buildTx();
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userCollateralTokenBalance).toEqual(
      initialState.userCollateralTokenBalance - amount,
    );
    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance + borrowAmount,
    );
    expect(finalState.position.collateral).toEqual(
      initialState.position.collateral + amount,
    );
    expect(finalState.position.borrowAssets).toEqual(
      initialState.position.borrowAssets + borrowAmount + 1n,
    );
  });

  test("should supply collateral and borrow with permit (EIP-2612) and authorization", async ({
    client,
  }) => {
    const amount = parseUnits("1", 18);
    const borrowAmount = parseUnits("10000", 6);

    await client.deal({
      erc20: UsdcEurcvMarketV1.collateralToken,
      amount,
    });

    const {
      markets: {
        UsdcEurcvMarketV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { UsdcEurcvMarketV1 } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client, {
          supportSignature: true,
        });
        const market = morphoClient.marketV1(UsdcEurcvMarketV1, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const scb = market.supplyCollateralBorrow({
          userAddress: client.account.address,
          amount,
          borrowAmount,
          positionData,
        });

        const requirements = await scb.getRequirements({
          useSimplePermit: true,
        });
        expect(requirements).toHaveLength(2);

        const permitRequirement = requirements[0];
        if (!isRequirementSignature(permitRequirement)) {
          throw new Error("Expected permit signature requirement");
        }

        const requirementSignature = await permitRequirement.sign(
          client,
          client.account.address,
        );

        const authorization = requirements[1];
        if (!isRequirementAuthorization(authorization)) {
          throw new Error("Authorization requirement not found");
        }

        await client.sendTransaction(authorization);

        const tx = scb.buildTx(requirementSignature);
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userCollateralTokenBalance).toEqual(
      initialState.userCollateralTokenBalance - amount,
    );
    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance + borrowAmount,
    );
    expect(finalState.morphoCollateralTokenBalance).toEqual(
      initialState.morphoCollateralTokenBalance + amount,
    );
    expect(finalState.morphoLoanTokenBalance).toEqual(
      initialState.morphoLoanTokenBalance - borrowAmount,
    );
    expect(finalState.position.collateral).toEqual(
      initialState.position.collateral + amount,
    );
    expect(finalState.position.borrowAssets).toEqual(
      initialState.position.borrowAssets + borrowAmount + 1n,
    );
  });

  test("should supply collateral and borrow with permit2 and authorization", async ({
    client,
  }) => {
    const amount = parseUnits("10", 18);
    const borrowAmount = parseUnits("1000", 18);

    await client.deal({
      erc20: WethUsdsMarketV1.collateralToken,
      amount,
    });

    const {
      markets: {
        WethUsdsMarketV1: { initialState, finalState },
      },
    } = await testInvariants({
      client,
      params: { markets: { WethUsdsMarketV1 } },
      actionFn: async () => {
        const morphoClient = new MorphoClient(client, {
          supportSignature: true,
        });
        const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
        const positionData = await market.getPositionData(
          client.account.address,
        );

        const scb = market.supplyCollateralBorrow({
          userAddress: client.account.address,
          amount,
          borrowAmount,
          positionData,
        });

        const requirements = await scb.getRequirements();

        // permit2 requirements: approve token -> permit2 + permit2 signature + morpho authorization
        expect(requirements).toHaveLength(3);

        const approvalPermit2 = requirements[0];
        if (!isRequirementApproval(approvalPermit2)) {
          throw new Error("Expected approval requirement for permit2");
        }

        await client.sendTransaction(approvalPermit2);

        const signaturePermit2 = requirements[1];
        if (!isRequirementSignature(signaturePermit2)) {
          throw new Error("Expected permit2 signature requirement");
        }

        const requirementSignature = await signaturePermit2.sign(
          client,
          client.account.address,
        );

        const authorization = requirements[2];
        if (!isRequirementAuthorization(authorization)) {
          throw new Error("Authorization requirement not found");
        }
        expect(authorization.action.type).toBe("morphoAuthorization");

        await client.sendTransaction(authorization);

        const tx = scb.buildTx(requirementSignature);
        await client.sendTransaction(tx);
      },
    });

    expect(finalState.userCollateralTokenBalance).toEqual(
      initialState.userCollateralTokenBalance - amount,
    );
    expect(finalState.userLoanTokenBalance).toEqual(
      initialState.userLoanTokenBalance + borrowAmount,
    );
    expect(finalState.morphoCollateralTokenBalance).toEqual(
      initialState.morphoCollateralTokenBalance + amount,
    );
    expect(finalState.morphoLoanTokenBalance).toEqual(
      initialState.morphoLoanTokenBalance - borrowAmount,
    );
    expect(finalState.position.collateral).toEqual(
      initialState.position.collateral + amount,
    );
    expect(finalState.position.borrowAssets).toEqual(
      initialState.position.borrowAssets + borrowAmount + 1n,
    );
  });

  describe("errors", () => {
    test("should throw MissingAccrualPositionError when positionData is not provided", async ({
      client,
    }) => {
      const morphoClient = new MorphoClient(client);
      const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);

      expect(() =>
        market.supplyCollateralBorrow({
          userAddress: client.account.address,
          amount: parseUnits("1", 18),
          borrowAmount: parseUnits("100", 18),
          positionData: undefined as unknown as AccrualPosition,
        }),
      ).toThrow(MissingAccrualPositionError);
    });

    test("should throw BorrowExceedsSafeLtvError when borrow exceeds LLTV buffer", async ({
      client,
    }) => {
      const morphoClient = new MorphoClient(client);
      const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
      const positionData = await market.getPositionData(client.account.address);

      expect(() =>
        market.supplyCollateralBorrow({
          userAddress: client.account.address,
          amount: parseUnits("1", 18),
          borrowAmount: parseUnits("10000", 18),
          positionData,
        }),
      ).toThrow(BorrowExceedsSafeLtvError);
    });

    test("should throw BorrowExceedsSafeLtvError when borrow exceeds LLTV buffer on existing position", async ({
      client,
    }) => {
      const morphoClient = new MorphoClient(client);
      const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);

      await supplyCollateral({
        client,
        chainId: mainnet.id,
        market: WethUsdsMarketV1,
        collateralAmount: parseUnits("1", 18),
      });

      const newAccrualPosition = await market.getPositionData(
        client.account.address,
      );

      expect(() =>
        market.supplyCollateralBorrow({
          userAddress: client.account.address,
          amount: 1n,
          borrowAmount: parseUnits("10000", 18),
          positionData: newAccrualPosition,
        }),
      ).toThrow(BorrowExceedsSafeLtvError);
    });

    test("should throw ExcessiveSlippageToleranceError for slippage above maximum", async ({
      client,
    }) => {
      const morphoClient = new MorphoClient(client);
      const market = morphoClient.marketV1(WethUsdsMarketV1, mainnet.id);
      const positionData = await market.getPositionData(client.account.address);

      expect(() =>
        market.supplyCollateralBorrow({
          userAddress: client.account.address,
          amount: parseUnits("10", 18),
          borrowAmount: parseUnits("1000", 18),
          positionData,
          slippageTolerance: MAX_SLIPPAGE_TOLERANCE + 1n,
        }),
      ).toThrow(ExcessiveSlippageToleranceError);
    });
  });
});
