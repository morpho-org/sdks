import {
  AccrualPosition,
  Market,
  MarketParams,
  MathLib,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { type Address, erc20Abi, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  DEFAULT_LLTV_BUFFER,
  validatePositionHealth,
  validatePositionHealthAfterWithdraw,
} from "../../helpers/index.js";
import {
  AccrualPositionUserMismatchError,
  type BlueBundlesV1TokenRequirementSignature,
  BorrowExceedsSafeLtvError,
  ChainIdMismatchError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  MarketIdMismatchError,
  MaxRepayAssetsBelowRepayAssetsError,
  MissingAccrualPositionError,
  MissingReferralFeeRecipientError,
  NegativeInputError,
  RepayExceedsDebtError,
  RepaySharesExceedDebtError,
  type VaultV2BlueReallocation,
  WithdrawExceedsCollateralError,
  WithdrawExceedsSupplyError,
  WithdrawMakesPositionUnhealthyError,
  WithdrawSharesExceedSupplyError,
} from "../../types/index.js";

const userAddress: Address = "0x00000000000000000000000000000000000000A1";
const otherUserAddress: Address = "0x00000000000000000000000000000000000000A2";
const marketParams = new MarketParams({
  loanToken: "0x0000000000000000000000000000000000000011",
  collateralToken: "0x0000000000000000000000000000000000000012",
  oracle: "0x0000000000000000000000000000000000000013",
  irm: "0x0000000000000000000000000000000000000014",
  lltv: 860000000000000000n,
});
const destinationMarketParams = new MarketParams({
  loanToken: marketParams.loanToken,
  collateralToken: marketParams.collateralToken,
  oracle: "0x0000000000000000000000000000000000000023",
  irm: marketParams.irm,
  lltv: marketParams.lltv,
});

const getMinimumSafeCollateral = (borrowAssets: bigint) =>
  MathLib.wDivUp(borrowAssets, marketParams.lltv - DEFAULT_LLTV_BUFFER);

const makePosition = (
  params: MarketParams,
  overrides: {
    user?: Address;
    collateral?: bigint;
    borrowShares?: bigint;
    supplyShares?: bigint;
    lastUpdate?: bigint;
    rateAtTarget?: bigint;
  } = {},
) =>
  new AccrualPosition(
    {
      user: overrides.user ?? userAddress,
      supplyShares: overrides.supplyShares ?? 0n,
      borrowShares: overrides.borrowShares ?? 10n ** 18n,
      collateral: overrides.collateral ?? 10n ** 24n,
    },
    new Market({
      params,
      totalSupplyAssets: 10n ** 24n,
      totalBorrowAssets: 10n ** 24n / 2n,
      totalSupplyShares: 10n ** 24n,
      totalBorrowShares: 10n ** 24n / 2n,
      lastUpdate: overrides.lastUpdate ?? 1_700_000_000n,
      fee: 0n,
      price: ORACLE_PRICE_SCALE,
      rateAtTarget: overrides.rateAtTarget,
    }),
  );

const makeEntity = (entityChainId: number = mainnet.id) =>
  createMockClient(mainnet)
    .client.extend(morphoViemExtension())
    .morpho.blue(marketParams, entityChainId);

const getCommonWriteCalls = (
  entity: ReturnType<typeof makeEntity>,
  common: {
    deadline: bigint;
    referralFeePct?: bigint;
    referralFeeRecipient?: Address;
  } = { deadline: maxUint256 },
) => {
  const positionData = makePosition(marketParams);
  const destinationPositionData = makePosition(destinationMarketParams, {
    borrowShares: 0n,
    collateral: 0n,
  });

  return [
    ["supply", () => entity.supply({ userAddress, assets: 1n, ...common })],
    [
      "withdraw",
      () =>
        entity.withdraw({
          userAddress,
          positionData: makePosition(marketParams, {
            borrowShares: 0n,
            supplyShares: 10n,
          }),
          assets: 1n,
          ...common,
        }),
    ],
    [
      "supplyCollateralBorrow",
      () =>
        entity.supplyCollateralBorrow({
          userAddress,
          collateralAssets: 1n,
          borrowAssets: 0n,
          ...common,
        }),
    ],
    [
      "repayWithdrawCollateral",
      () =>
        entity.repayWithdrawCollateral({
          userAddress,
          positionData,
          repayAssets: 1n,
          collateralAssets: 0n,
          ...common,
        }),
    ],
    [
      "refinance",
      () =>
        entity.refinance({
          userAddress,
          positionData,
          destination: {
            marketParams: destinationMarketParams,
            positionData: destinationPositionData,
          },
          ...common,
        }),
    ],
  ] as const;
};

const getPositionWriteCalls = (
  entity: ReturnType<typeof makeEntity>,
  positionData: AccrualPosition,
) =>
  [
    [
      "withdraw",
      () =>
        entity.withdraw({
          userAddress,
          positionData,
          assets: 1n,
          deadline: maxUint256,
        }),
    ],
    [
      "supplyCollateralBorrow",
      () =>
        entity.supplyCollateralBorrow({
          userAddress,
          collateralAssets: 0n,
          borrowAssets: 1n,
          positionData,
          deadline: maxUint256,
        }),
    ],
    [
      "repayWithdrawCollateral",
      () =>
        entity.repayWithdrawCollateral({
          userAddress,
          positionData,
          repayAssets: 1n,
          collateralAssets: 0n,
          deadline: maxUint256,
        }),
    ],
    [
      "refinance",
      () =>
        entity.refinance({
          userAddress,
          positionData,
          destination: {
            marketParams: destinationMarketParams,
            positionData: makePosition(destinationMarketParams, {
              borrowShares: 0n,
              collateral: 0n,
            }),
          },
          deadline: maxUint256,
        }),
    ],
  ] as const;

describe("MorphoBlue write surface", () => {
  test("exposes the established nine Blue write methods", () => {
    const morpho = createMockClient(mainnet).client.extend(
      morphoViemExtension(),
    ).morpho;
    const entity = morpho.blue(marketParams, mainnet.id);

    for (const method of [
      "supply",
      "withdraw",
      "supplyCollateral",
      "borrow",
      "supplyCollateralBorrow",
      "repay",
      "withdrawCollateral",
      "repayWithdrawCollateral",
      "refinance",
    ]) {
      expect(method in entity).toBe(true);
    }
    for (const method of [
      "supplyCollateralAndBorrow",
      "repayAndWithdrawCollateral",
      "migrateBorrowPosition",
    ]) {
      expect(method in entity).toBe(false);
    }
    expect("blueBundlesV1" in morpho).toBe(false);
  });

  test("disable the LTV cap only for pure collateral supply and pure repay", () => {
    const entity = createMockClient(mainnet)
      .client.extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);
    const positionData = makePosition(marketParams);
    const destinationPositionData = makePosition(destinationMarketParams, {
      borrowShares: 0n,
      collateral: 0n,
    });
    const bufferedLtv = marketParams.lltv - DEFAULT_LLTV_BUFFER;

    const pureCollateral = entity
      .supplyCollateral({
        userAddress,
        collateralAssets: 1n,
        deadline: maxUint256,
      })
      .buildTx();
    const borrow = entity
      .borrow({
        userAddress,
        borrowAssets: 1n,
        positionData,
        deadline: maxUint256,
      })
      .buildTx();
    const pureRepay = entity
      .repay({
        userAddress,
        positionData,
        repayAssets: 1n,
        deadline: maxUint256,
      })
      .buildTx();
    const collateralWithdrawal = entity
      .withdrawCollateral({
        userAddress,
        positionData,
        collateralAssets: 1n,
        deadline: maxUint256,
      })
      .buildTx();
    const migration = entity
      .refinance({
        userAddress,
        positionData,
        destination: {
          marketParams: destinationMarketParams,
          positionData: destinationPositionData,
        },
        deadline: maxUint256,
      })
      .buildTx();

    expect(pureCollateral.action.args.maxLtv).toBe(maxUint256);
    expect(pureCollateral.action.type).toBe("blueSupplyCollateral");
    expect(pureCollateral.action.args.borrowAssets).toBe(0n);
    expect(pureRepay.action.args.maxLtv).toBe(maxUint256);
    expect(pureRepay.action.type).toBe("blueRepay");
    expect(pureRepay.action.args.collateralAssets).toBe(0n);
    expect(borrow.action.args.maxLtv).toBe(bufferedLtv);
    expect(borrow.action.type).toBe("blueBorrow");
    expect(borrow.action.args.collateralAssets).toBe(0n);
    expect(collateralWithdrawal.action.args.maxLtv).toBe(bufferedLtv);
    expect(collateralWithdrawal.action.type).toBe("blueWithdrawCollateral");
    expect(collateralWithdrawal.action.args.repayAssets).toBe(0n);
    expect(collateralWithdrawal.action.args.repayShares).toBe(0n);
    expect(migration.action.args.maxLtv).toBe(
      destinationMarketParams.lltv - DEFAULT_LLTV_BUFFER,
    );
  });

  test("target BlueBundlesV1 for token approval and Morpho authorization", async () => {
    const handle = createMockClient(mainnet);
    const blueBundlesV1 = getChainAddress(mainnet.id, "bundles.blueBundlesV1");
    mockRead(handle, {
      address: marketParams.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    mockRead(handle, {
      address: getChainAddress(mainnet.id, "morpho"),
      abi: blueAbi,
      functionName: "isAuthorized",
      result: false,
    });
    const entity = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(marketParams, mainnet.id);

    const tokenRequirements = await entity
      .supply({
        userAddress,
        assets: 1n,
        deadline: maxUint256,
      })
      .getRequirements();
    const authorizationRequirements = await entity
      .withdraw({
        userAddress,
        positionData: makePosition(marketParams, {
          borrowShares: 0n,
          supplyShares: 10n ** 18n,
        }),
        assets: 1n,
        deadline: maxUint256,
      })
      .getRequirements();

    expect(tokenRequirements).toMatchObject([
      {
        action: {
          type: "erc20Approval",
          args: { spender: blueBundlesV1 },
        },
      },
    ]);
    expect(authorizationRequirements).toMatchObject([
      {
        action: {
          type: "blueAuthorization",
          args: { authorized: blueBundlesV1, isAuthorized: true },
        },
      },
    ]);
  });

  test("supply forwards a reusable approvalAmount to the token requirement", async () => {
    const handle = createMockClient(mainnet);
    const blueBundlesV1 = getChainAddress(mainnet.id, "bundles.blueBundlesV1");
    mockRead(handle, {
      address: marketParams.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const market = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(marketParams, mainnet.id);

    const requirements = await market
      .supply({ assets: 1n, userAddress, deadline: maxUint256 })
      .getRequirements({ approvalAmount: maxUint256 });

    expect(requirements).toMatchObject([
      {
        action: {
          type: "erc20Approval",
          args: { spender: blueBundlesV1, amount: maxUint256 },
        },
      },
    ]);
  });

  test("supply funds a wrapped-native market with tx value and no requirements", async () => {
    const nativeMarketParams = new MarketParams({
      loanToken: getChainAddress(mainnet.id, "wNative"),
      collateralToken: marketParams.collateralToken,
      oracle: marketParams.oracle,
      irm: marketParams.irm,
      lltv: marketParams.lltv,
    });
    const market = createMockClient(mainnet)
      .client.extend(morphoViemExtension())
      .morpho.blue(nativeMarketParams, mainnet.id);

    const assets = 10n ** 18n;
    const action = market.supply({
      userAddress,
      assets,
      nativeAmount: assets,
      deadline: maxUint256,
    });

    // The native branch short-circuits before any on-chain read: it emits no
    // token approval/permit (and no Morpho authorization), rides the funded
    // amount as `tx.value`, and leaves the encoded token permit empty. A
    // regression that dropped the branch would demand a token requirement or
    // omit the value, and would revert on-chain rather than fail here.
    expect(await action.getRequirements()).toEqual([]);
    const tx = action.buildTx();
    expect(tx.value).toBe(assets);
    expect(tx.action.args.nativeAmount).toBe(assets);
    expect(tx.action.args.assets).toBe(assets);
  });

  test("repay forwards a reusable approvalAmount to the token requirement", async () => {
    const handle = createMockClient(mainnet);
    const blueBundlesV1 = getChainAddress(mainnet.id, "bundles.blueBundlesV1");
    mockRead(handle, {
      address: marketParams.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const market = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(marketParams, mainnet.id);

    const requirements = await market
      .repay({
        userAddress,
        positionData: makePosition(marketParams),
        repayAssets: 1n,
        deadline: maxUint256,
      })
      .getRequirements({ approvalAmount: maxUint256 });

    expect(requirements).toMatchObject([
      {
        action: {
          type: "erc20Approval",
          args: { spender: blueBundlesV1, amount: maxUint256 },
        },
      },
    ]);
  });

  test("supplyCollateral forwards a reusable approvalAmount to the token requirement", async () => {
    const handle = createMockClient(mainnet);
    const blueBundlesV1 = getChainAddress(mainnet.id, "bundles.blueBundlesV1");
    mockRead(handle, {
      address: marketParams.collateralToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const market = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(marketParams, mainnet.id);

    const requirements = await market
      .supplyCollateral({
        userAddress,
        collateralAssets: 1n,
        deadline: maxUint256,
      })
      .getRequirements({ approvalAmount: maxUint256 });

    expect(requirements).toMatchObject([
      {
        action: {
          type: "erc20Approval",
          args: { spender: blueBundlesV1, amount: maxUint256 },
        },
      },
    ]);
  });
});

describe("MorphoBlue common write validation", () => {
  test("error: ChainIdMismatchError across all direct entrypoint paths", () => {
    for (const [method, call] of getCommonWriteCalls(makeEntity(137))) {
      expect(call, method).toThrow(ChainIdMismatchError);
    }
  });

  test("error: ExpiredDeadlineError across all direct entrypoint paths", () => {
    for (const [method, call] of getCommonWriteCalls(makeEntity(), {
      deadline: 1n,
    })) {
      expect(call, method).toThrow(ExpiredDeadlineError);
    }
  });

  test("error: ExpiredDeadlineError when a deadline expires before requirements", () => {
    const now = 1_800_000_000n;
    const action = withChainTimestamp(now, () =>
      makeEntity().supply({
        userAddress,
        assets: 1n,
        deadline: now + 1n,
      }),
    );
    expect(() =>
      withChainTimestamp(now + 1n, () => action.getRequirements()),
    ).toThrow(ExpiredDeadlineError);
  });

  test("error: referral controls across all direct entrypoint paths", () => {
    const entity = makeEntity();
    for (const [method, call] of getCommonWriteCalls(entity, {
      deadline: maxUint256,
      referralFeePct: -1n,
    })) {
      expect(call, method).toThrow(NegativeInputError);
    }
    for (const [method, call] of getCommonWriteCalls(entity, {
      deadline: maxUint256,
      referralFeePct: 1n,
    })) {
      expect(call, method).toThrow(MissingReferralFeeRecipientError);
    }
    for (const [method, call] of getCommonWriteCalls(entity, {
      deadline: maxUint256,
      referralFeePct: MathLib.WAD,
      referralFeeRecipient: otherUserAddress,
    })) {
      expect(call, method).toThrow(InputExceedsMaxError);
    }
  });
});

describe("MorphoBlue position validation", () => {
  test("error: MarketIdMismatchError across position-backed methods", () => {
    const entity = makeEntity();
    for (const [method, call] of getPositionWriteCalls(
      entity,
      makePosition(destinationMarketParams),
    )) {
      expect(call, method).toThrow(MarketIdMismatchError);
    }

    expect(() =>
      entity.refinance({
        userAddress,
        positionData: makePosition(marketParams),
        destination: {
          marketParams: destinationMarketParams,
          positionData: makePosition(marketParams),
        },
        deadline: maxUint256,
      }),
    ).toThrow(MarketIdMismatchError);
  });

  test("error: AccrualPositionUserMismatchError across position-backed methods", () => {
    const entity = makeEntity();
    for (const [method, call] of getPositionWriteCalls(
      entity,
      makePosition(marketParams, { user: otherUserAddress }),
    )) {
      expect(call, method).toThrow(AccrualPositionUserMismatchError);
    }

    expect(() =>
      entity.refinance({
        userAddress,
        positionData: makePosition(marketParams),
        destination: {
          marketParams: destinationMarketParams,
          positionData: makePosition(destinationMarketParams, {
            user: otherUserAddress,
          }),
        },
        deadline: maxUint256,
      }),
    ).toThrow(AccrualPositionUserMismatchError);
  });

  test("error: MissingAccrualPositionError across position-backed methods", () => {
    const entity = makeEntity();
    for (const [method, call] of getPositionWriteCalls(
      entity,
      undefined as never,
    )) {
      expect(call, method).toThrow(MissingAccrualPositionError);
    }

    expect(() =>
      entity.refinance({
        userAddress,
        positionData: makePosition(marketParams),
        destination: {
          marketParams: destinationMarketParams,
          positionData: undefined as never,
        },
        deadline: maxUint256,
      }),
    ).toThrow(MissingAccrualPositionError);
  });

  test("error: supply, debt, and collateral bounds", () => {
    const entity = makeEntity();
    const supplyPosition = makePosition(marketParams, {
      supplyShares: 10n,
      borrowShares: 0n,
    });
    const debtPosition = makePosition(marketParams);

    expect(() =>
      entity.withdraw({
        userAddress,
        positionData: supplyPosition,
        assets: supplyPosition.supplyAssets + 1n,
        deadline: maxUint256,
      }),
    ).toThrow(WithdrawExceedsSupplyError);
    expect(() =>
      entity.withdraw({
        userAddress,
        positionData: supplyPosition,
        shares: supplyPosition.supplyShares + 1n,
        deadline: maxUint256,
      }),
    ).toThrow(WithdrawSharesExceedSupplyError);
    expect(() =>
      entity.repay({
        userAddress,
        positionData: debtPosition,
        repayAssets: debtPosition.borrowAssets + 1n,
        deadline: maxUint256,
      }),
    ).toThrow(RepayExceedsDebtError);
    expect(() =>
      entity.repay({
        userAddress,
        positionData: debtPosition,
        repayShares: debtPosition.borrowShares + 1n,
        deadline: maxUint256,
      }),
    ).toThrow(RepaySharesExceedDebtError);
    expect(() =>
      entity.withdrawCollateral({
        userAddress,
        positionData: debtPosition,
        collateralAssets: debtPosition.collateral + 1n,
        deadline: maxUint256,
      }),
    ).toThrow(WithdrawExceedsCollateralError);
  });

  test("error: BorrowExceedsSafeLtvError on borrow and fee-bearing migration", () => {
    const entity = makeEntity();
    expect(() =>
      entity.borrow({
        userAddress,
        positionData: makePosition(marketParams),
        borrowAssets: 10n ** 24n,
        deadline: maxUint256,
      }),
    ).toThrow(BorrowExceedsSafeLtvError);

    const sourcePosition = makePosition(marketParams, {
      collateral: 2n * 10n ** 18n,
    });
    const destinationPosition = makePosition(destinationMarketParams, {
      borrowShares: 0n,
      collateral: 0n,
    });
    expect(() =>
      entity.refinance({
        userAddress,
        positionData: sourcePosition,
        destination: {
          marketParams: destinationMarketParams,
          positionData: destinationPosition,
        },
        deadline: maxUint256,
      }),
    ).not.toThrow();
    expect(() =>
      entity.refinance({
        userAddress,
        positionData: sourcePosition,
        destination: {
          marketParams: destinationMarketParams,
          positionData: destinationPosition,
        },
        deadline: maxUint256,
        referralFeePct: MathLib.WAD / 2n,
        referralFeeRecipient: otherUserAddress,
      }),
    ).toThrow(BorrowExceedsSafeLtvError);
  });

  test("error: InputExceedsMaxError when the migration penalty exceeds current source debt", () => {
    const now = 1_800_000_000n;
    const entity = makeEntity();
    // Interest-bearing source: the current quoted debt is strictly below the `now + 2h` health
    // projection the method uses elsewhere, so a penalty just above the current debt lands between
    // the two figures. The cap must bind against the current quote, not the forecast, to reject it.
    const sourcePosition = makePosition(marketParams, {
      lastUpdate: now - 5n * 24n * 3_600n,
      rateAtTarget: 3_170_979_198n,
      collateral: 10n ** 24n,
    });
    const destinationPosition = makePosition(destinationMarketParams, {
      borrowShares: 0n,
      collateral: 0n,
    });
    const currentDebt = sourcePosition.borrowAssets;
    const forecastDebt = sourcePosition.accrueInterest(
      now + 7_200n,
    ).borrowAssets;
    // Guard the fixture: the penalty sits in the (current, forecast] gap the bug would have missed.
    expect(forecastDebt).toBeGreaterThan(currentDebt + 1n);
    // penaltyAssets = ceil(assets × penalty / WAD) = currentDebt + 1n with penalty = 100%.
    const reallocation = {
      vault: "0x0000000000000000000000000000000000000031",
      from: { type: "idle" },
      to: { adapter: "0x0000000000000000000000000000000000000032" },
      assets: currentDebt + 1n,
      penalty: MathLib.WAD,
    } satisfies VaultV2BlueReallocation;

    expect(() =>
      withChainTimestamp(now, () =>
        entity.refinance({
          userAddress,
          positionData: sourcePosition,
          destination: {
            marketParams: destinationMarketParams,
            positionData: destinationPosition,
          },
          reallocations: [reallocation],
          deadline: maxUint256,
        }),
      ),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: WithdrawMakesPositionUnhealthyError after collateral withdrawal", () => {
    const entity = makeEntity();
    expect(() =>
      entity.withdrawCollateral({
        userAddress,
        positionData: makePosition(marketParams, {
          collateral: 2n * 10n ** 18n,
        }),
        collateralAssets: 10n ** 18n,
        deadline: maxUint256,
      }),
    ).toThrow(WithdrawMakesPositionUnhealthyError);
  });

  test("error: collateral-withdraw health uses forward-accrued debt", () => {
    const now = 1_800_000_000n;
    const quoteTimestamp = now + 7_200n;
    const withdrawAmount = 10n ** 17n;
    const basePosition = makePosition(marketParams, {
      lastUpdate: now - 5n * 24n * 3_600n,
      rateAtTarget: 3_170_979_198n,
    });
    const positionData = makePosition(marketParams, {
      collateral:
        getMinimumSafeCollateral(basePosition.borrowAssets) + withdrawAmount,
      lastUpdate: basePosition.market.lastUpdate,
      rateAtTarget: basePosition.market.rateAtTarget,
    });
    const validationParams = {
      withdrawAmount,
      lltv: marketParams.lltv,
      marketId: marketParams.id,
    };

    expect(() =>
      validatePositionHealthAfterWithdraw({
        ...validationParams,
        positionData,
      }),
    ).not.toThrow();
    expect(() =>
      validatePositionHealthAfterWithdraw({
        ...validationParams,
        positionData: positionData.accrueInterest(quoteTimestamp),
      }),
    ).toThrow(WithdrawMakesPositionUnhealthyError);
    expect(() =>
      withChainTimestamp(now, () =>
        makeEntity().withdrawCollateral({
          userAddress,
          positionData,
          collateralAssets: withdrawAmount,
          deadline: maxUint256,
        }),
      ),
    ).toThrow(WithdrawMakesPositionUnhealthyError);
  });

  test("error: migration health accrues source and destination debt", () => {
    const now = 1_800_000_000n;
    const quoteTimestamp = now + 7_200n;
    const marketOverrides = {
      lastUpdate: now - 5n * 24n * 3_600n,
      rateAtTarget: 3_170_979_198n,
    };
    const baseSourcePosition = makePosition(marketParams, marketOverrides);
    const destinationPosition = makePosition(destinationMarketParams, {
      ...marketOverrides,
      collateral: 0n,
    });
    const sourcePosition = makePosition(marketParams, {
      ...marketOverrides,
      collateral: getMinimumSafeCollateral(
        baseSourcePosition.borrowAssets + destinationPosition.borrowAssets + 1n,
      ),
    });
    const validationParams = {
      additionalCollateral: sourcePosition.collateral,
      marketId: destinationMarketParams.id,
      lltv: destinationMarketParams.lltv,
    };

    expect(() =>
      validatePositionHealth({
        ...validationParams,
        positionData: destinationPosition,
        borrowAmount: sourcePosition.borrowAssets,
      }),
    ).not.toThrow();
    expect(
      sourcePosition.accrueInterest(quoteTimestamp).borrowAssets,
    ).toBeGreaterThan(sourcePosition.borrowAssets);
    expect(
      destinationPosition.accrueInterest(quoteTimestamp).borrowAssets,
    ).toBeGreaterThan(destinationPosition.borrowAssets);
    expect(() =>
      validatePositionHealth({
        ...validationParams,
        positionData: destinationPosition.accrueInterest(quoteTimestamp),
        borrowAmount:
          sourcePosition.accrueInterest(quoteTimestamp).borrowAssets,
      }),
    ).toThrow(BorrowExceedsSafeLtvError);
    expect(() =>
      withChainTimestamp(now, () =>
        makeEntity().refinance({
          userAddress,
          positionData: sourcePosition,
          destination: {
            marketParams: destinationMarketParams,
            positionData: destinationPosition,
          },
          deadline: maxUint256,
        }),
      ),
    ).toThrow(BorrowExceedsSafeLtvError);
  });

  test("error: borrow health uses forward-accrued debt", () => {
    const now = 1_800_000_000n;
    const quoteTimestamp = now + 7_200n;
    const borrowAmount = 1n;
    const basePosition = makePosition(marketParams, {
      lastUpdate: now - 5n * 24n * 3_600n,
      rateAtTarget: 3_170_979_198n,
    });
    const positionData = makePosition(marketParams, {
      collateral: getMinimumSafeCollateral(
        basePosition.borrowAssets + borrowAmount + 1n,
      ),
      lastUpdate: basePosition.market.lastUpdate,
      rateAtTarget: basePosition.market.rateAtTarget,
    });
    const validationParams = {
      additionalCollateral: 0n,
      borrowAmount,
      marketId: marketParams.id,
      lltv: marketParams.lltv,
    };

    expect(() =>
      validatePositionHealth({ ...validationParams, positionData }),
    ).not.toThrow();
    expect(() =>
      validatePositionHealth({
        ...validationParams,
        positionData: positionData.accrueInterest(quoteTimestamp),
      }),
    ).toThrow(BorrowExceedsSafeLtvError);
    expect(() =>
      withChainTimestamp(now, () =>
        makeEntity().borrow({
          userAddress,
          positionData,
          borrowAssets: borrowAmount,
          deadline: maxUint256,
        }),
      ),
    ).toThrow(BorrowExceedsSafeLtvError);
  });

  test("behavior: full-repay sentinel enforces its quote horizon and funding cap", () => {
    const now = 1_800_000_000n;
    const deadline = now + 7_200n;
    const referralFeePct = MathLib.WAD / 10n;
    const positionData = makePosition(marketParams, {
      lastUpdate: now - 5n * 24n * 3_600n,
      rateAtTarget: 3_170_979_198n,
    });

    expect(() =>
      withChainTimestamp(now, () =>
        makeEntity().repay({
          userAddress,
          positionData,
          repayShares: maxUint256,
          deadline: deadline + 1n,
        }),
      ),
    ).toThrow(InputExceedsMaxError);

    const transaction = withChainTimestamp(now, () =>
      makeEntity()
        .repay({
          userAddress,
          positionData,
          repayShares: maxUint256,
          deadline,
          referralFeePct,
          referralFeeRecipient: otherUserAddress,
        })
        .buildTx(),
    );
    const forwardRepayAssets = positionData.market
      .accrueInterest(deadline)
      .toBorrowAssets(positionData.borrowShares, "Up");
    const referralFeeAssets = MathLib.mulDivDown(
      forwardRepayAssets,
      referralFeePct,
      MathLib.WAD - referralFeePct,
    );

    expect(transaction.action.args.repayShares).toBe(maxUint256);
    expect(transaction.action.args.maxRepayAssets).toBe(
      forwardRepayAssets + referralFeeAssets,
    );
    expect(transaction.action.args.maxRepayAssets).toBeGreaterThan(
      positionData.borrowAssets,
    );
  });

  test("behavior: share repay reuses a still-sufficient signed funding cap", () => {
    const now = 1_800_000_000n;
    const deadline = now + 3_600n;
    const positionData = makePosition(marketParams, { lastUpdate: now });
    const action = withChainTimestamp(now, () =>
      makeEntity().repay({
        userAddress,
        positionData,
        repayShares: maxUint256,
        deadline,
      }),
    );
    const minimum = action.buildTx().action.args.maxRepayAssets;
    const signature = (amount: bigint) =>
      ({
        args: {
          owner: userAddress,
          nonce: 1n,
          asset: marketParams.loanToken,
          signature: "0x1234",
          amount,
          deadline,
        },
        action: {
          type: "permit2TransferFrom",
          args: {
            spender: getChainAddress(mainnet.id, "bundles.blueBundlesV1"),
            amount,
            deadline,
          },
        },
      }) satisfies BlueBundlesV1TokenRequirementSignature;

    expect(
      action.buildTx([signature(minimum + 1n)]).action.args.maxRepayAssets,
    ).toBe(minimum + 1n);
    expect(() => action.buildTx([signature(minimum - 1n)])).toThrow(
      MaxRepayAssetsBelowRepayAssetsError,
    );
  });

  test("behavior: saturated share repay approval covers a later quote", async () => {
    const now = 1_800_000_000n;
    const positionData = makePosition(marketParams, {
      lastUpdate: now,
      rateAtTarget: 3_170_979_198n,
    });
    const handle = createMockClient(mainnet);
    const entity = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(marketParams, mainnet.id);
    const firstAction = withChainTimestamp(now, () =>
      entity.repay({
        userAddress,
        positionData,
        repayShares: maxUint256,
        deadline: now + 7_200n,
      }),
    );
    const firstFundingCap = firstAction.buildTx().action.args.maxRepayAssets;
    // The BlueBundlesV1 token resolver only requests an approval when the current allowance is below
    // the pull amount (it compares against `amount`, not `approvalAmount`, to avoid a redundant
    // zero-reset on approve-once tokens). Start from a zero allowance so the saturated repay emits
    // its reusable max approval, which by construction also covers any later, larger funding cap.
    mockRead(handle, {
      address: marketParams.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const requirements = await withChainTimestamp(now, () =>
      firstAction.getRequirements(),
    );
    const laterTransaction = withChainTimestamp(now + 1n, () =>
      entity
        .repay({
          userAddress,
          positionData,
          repayShares: maxUint256,
          deadline: now + 7_201n,
        })
        .buildTx(),
    );

    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { amount: maxUint256 },
    });
    expect(laterTransaction.action.args.maxRepayAssets).toBeGreaterThan(
      firstFundingCap,
    );
    expect(laterTransaction.action.args.maxRepayAssets).toBeLessThan(
      maxUint256,
    );
  });
});
