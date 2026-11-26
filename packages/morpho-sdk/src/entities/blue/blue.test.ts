import {
  AccrualPosition,
  BlueErrors,
  getChainAddresses,
  type InputMarketParams,
  Market,
  MarketParams,
  MarketUtils,
  MathLib,
  ORACLE_PRICE_SCALE,
  UnsupportedMarketIrmError,
} from "@morpho-org/blue-sdk";
import { blueAbi, erc2612Abi, erc5267Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { expectFailClosed } from "@morpho-org/test/chaos";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  getTypesForEIP712Domain,
  hashDomain,
  maxUint256,
  numberToHex,
  type TypedData,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import {
  signerAddress,
  signerWalletClient,
} from "../../../test/helpers/signer.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { blueBundlesV1Abi } from "../../abis.js";
import {
  blueBorrow,
  blueRefinance,
  blueRepay,
  blueRepayWithdrawCollateral,
  blueSupply,
  blueSupplyCollateral,
  blueSupplyCollateralBorrow,
  blueWithdraw,
  blueWithdrawBuyCallback,
  blueWithdrawCollateral,
} from "../../actions/blue/index.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  DEFAULT_LLTV_BUFFER,
  MIN_DEAD_SHARES,
  validatePositionHealth,
  validatePositionHealthAfterWithdraw,
} from "../../helpers/index.js";
import {
  AccrualPositionUserMismatchError,
  type ActionRequirement,
  BorrowExceedsSafeLtvError,
  type BundlesTokenRequirementSignature,
  ChainIdMismatchError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  isRequirementSignature,
  MarketIdMismatchError,
  MaxRepayAssetsBelowRepayAssetsError,
  MissingAccrualPositionError,
  MissingContractCodeError,
  NegativeInputError,
  NonPositiveInputError,
  ReferralFeePctExceededError,
  ReferralFeeRecipientMissingError,
  RepayExceedsDebtError,
  RepaySharesExceedDebtError,
  type RequirementSignature,
  type VaultV2BlueReallocation,
  WithdrawExceedsCollateralError,
  WithdrawExceedsSupplyError,
  WithdrawMakesPositionUnhealthyError,
  WithdrawSharesExceedSupplyError,
} from "../../types/index.js";
import type { BlueActions } from "./blue.js";

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
    deadSupplyShares?: bigint;
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
      rateAtTarget: overrides.rateAtTarget ?? 0n,
      deadSupplyShares: overrides.deadSupplyShares ?? MIN_DEAD_SHARES,
    }),
  );

const supplyMarketData = makePosition(marketParams).market;

describe("native requirements served chain validation", () => {
  test.each([
    "supply",
    "supplyCollateral",
    "supplyCollateralBorrow",
    "repay",
    "repayWithdrawCollateral",
    "supplyCollateralBorrow with authorization",
    "repayWithdrawCollateral with authorization",
  ] as const)(
    "[INV-05] %s validates the served chain exactly once",
    async (flow) => {
      for (const servedChain of ["0x2105", "0x1"]) {
        const handle = createMockClient(mainnet);
        handle.request.mockImplementation(async ({ method }) => {
          if (method === "eth_chainId") return servedChain;
          if (method === "eth_getCode") return "0x6000";
          if (method === "eth_call") return `0x${"0".repeat(64)}`;
          throw new Error(`unexpected ${method}`);
        });
        const nativeMarketParams = new MarketParams({
          ...marketParams,
          loanToken: getChainAddress(mainnet.id, "wNative"),
          collateralToken: getChainAddress(mainnet.id, "wNative"),
        });
        const entity = handle.client
          .extend(morphoViemExtension({ supportSignature: false }))
          .morpho.blue(nativeMarketParams, mainnet.id);
        const common = { userAddress, nativeAmount: 1n, deadline: maxUint256 };
        const positionData = makePosition(nativeMarketParams);
        const action = (() => {
          switch (flow) {
            case "supply":
              return entity.supply({
                ...common,
                assets: 1n,
                marketData: positionData.market,
              });
            case "supplyCollateral":
              return entity.supplyCollateral({
                ...common,
                collateralAssets: 1n,
              });
            case "supplyCollateralBorrow":
            case "supplyCollateralBorrow with authorization":
              return entity.supplyCollateralBorrow({
                ...common,
                positionData,
                collateralAssets: 1n,
                borrowAssets: flow.endsWith("authorization") ? 1n : 0n,
              });
            case "repay":
              return entity.repay({ ...common, positionData, repayAssets: 1n });
            case "repayWithdrawCollateral":
            case "repayWithdrawCollateral with authorization":
              return entity.repayWithdrawCollateral({
                ...common,
                positionData,
                repayAssets: 1n,
                collateralAssets: flow.endsWith("authorization") ? 1n : 0n,
              });
          }
        })();
        if (servedChain === "0x1") {
          const requirements = await action.getRequirements();
          expect(requirements).toHaveLength(
            flow.endsWith("authorization") ? 1 : 0,
          );
        } else {
          await expect(action.getRequirements()).rejects.toBeInstanceOf(
            ChainIdMismatchError,
          );
        }
        expect(
          handle.request.mock.calls.filter(
            ([call]) => call.method === "eth_chainId",
          ),
        ).toHaveLength(1);
      }
    },
  );
});

describe.sequential("clock skew reproduction", () => {
  test.each([
    { supplied: true, changedNow: undefined },
    { supplied: true, changedNow: 1_800_086_400n },
    { supplied: false, changedNow: 1_800_000_000n },
  ])(
    "snapshots reference time when supplied=$supplied and now changes to $changedNow",
    async ({ supplied, changedNow }) => {
      const now = 1_800_000_000n;
      const handle = createMockClient(mainnet);
      const entity = handle.client
        .extend(morphoViemExtension())
        .morpho.blue(marketParams, mainnet.id);
      mockRead(handle, {
        address: marketParams.loanToken,
        abi: erc20Abi,
        functionName: "allowance",
        result: maxUint256,
      });
      const params = {
        userAddress,
        assets: 1n,
        deadline: now + 1_200n,
        now: supplied ? now : undefined,
      };
      const output = withChainTimestamp(now, () => entity.supply(params));
      const tx = output.buildTx();
      params.now = changedNow;
      if (supplied) {
        await expect(
          withChainTimestamp(now + 86_400n, () => output.getRequirements()),
        ).resolves.toEqual([]);
      } else {
        expect(() =>
          withChainTimestamp(now + 86_400n, () => output.getRequirements()),
        ).toThrow(ExpiredDeadlineError);
      }
      expect(output.buildTx()).toEqual(tx);
    },
  );

  test.each([-9_000n, 10_800n])(
    "entity metadata records reference time despite device skew %s",
    (skew) => {
      const now = 1_800_000_000n;
      const handle = createMockClient(mainnet);
      const entity = handle.client
        .extend(
          morphoViemExtension({
            metadata: { origin: "deadbeef", timestamp: true },
          }),
        )
        .morpho.blue(marketParams, mainnet.id);
      const tx = withChainTimestamp(now + skew, () =>
        entity
          .supply({ userAddress, assets: 1n, deadline: now + 1_200n, now })
          .buildTx(),
      );
      expect(`0x${tx.data.slice(-16, -8)}`).toBe(numberToHex(now, { size: 4 }));
      expect(tx.data.slice(-8)).toBe("deadbeef");
    },
  );

  test.each([-1n, 1n << 32n])(
    "rejects metadata timestamp %s at handle creation",
    (timestamp) => {
      const handle = createMockClient(mainnet);
      const entity = handle.client
        .extend(
          morphoViemExtension({ metadata: { origin: "cafe", timestamp } }),
        )
        .morpho.blue(marketParams, mainnet.id);
      expect(() =>
        entity.supply({
          userAddress,
          marketData: supplyMarketData,
          assets: 1n,
          now: 1_800_000_000n,
          deadline: 1_800_001_200n,
        }),
      ).toThrowError(
        timestamp < 0n ? NegativeInputError : InputExceedsMaxError,
      );
    },
  );
  test("preserves reference time and metadata across whole-operation constructors", () => {
    const now = 1_800_000_000n;
    const entity = createMockClient(mainnet)
      .client.extend(
        morphoViemExtension({
          metadata: { origin: "deadbeef", timestamp: true },
        }),
      )
      .morpho.blue(marketParams, mainnet.id);
    const common = { userAddress, deadline: now + 1_200n, now };
    const positionData = makePosition(marketParams);
    const calls = [
      ...getCommonWriteCalls(entity, common),
      [
        "supplyCollateral",
        () => entity.supplyCollateral({ ...common, collateralAssets: 1n }),
      ],
      [
        "borrow",
        () => entity.borrow({ ...common, positionData, borrowAssets: 1n }),
      ],
      [
        "repay",
        () => entity.repay({ ...common, positionData, repayAssets: 1n }),
      ],
      [
        "withdrawCollateral",
        () =>
          entity.withdrawCollateral({
            ...common,
            positionData,
            collateralAssets: 1n,
          }),
      ],
      [
        "withdrawBuyCallback",
        () =>
          entity.withdrawBuyCallback({
            ...common,
            callbackAddress: otherUserAddress,
            positionData: makePosition(marketParams, {
              user: otherUserAddress,
              supplyShares: 10n,
              borrowShares: 0n,
            }),
          }),
      ],
    ] as const;
    for (const [name, create] of calls) {
      const tx = withChainTimestamp(now + 10_800n, () => create().buildTx());
      expect(`0x${tx.data.slice(-16, -8)}`, name).toBe(
        numberToHex(now, { size: 4 }),
      );
      expect(tx.data.slice(-8), name).toBe("deadbeef");
      expect(Object.isFrozen(tx), name).toBe(true);
    }
  });
  test("explicit reference time survives requirement re-checks while omission preserves expiry", async () => {
    const now = 1_800_000_000n;
    const handle = createMockClient(mainnet);
    const entity = handle.client
      .extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);
    mockRead(handle, {
      address: marketParams.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    const params = {
      userAddress,
      marketData: supplyMarketData,
      assets: 1n,
      deadline: now + 1_200n,
    };
    const explicit = withChainTimestamp(now + 10_800n, () =>
      entity.supply({ ...params, now }),
    );
    expect(
      await withChainTimestamp(now + 86_400n, () => explicit.getRequirements()),
    ).toEqual([]);
    expect(() =>
      withChainTimestamp(now + 10_800n, () => entity.supply(params)),
    ).toThrow(ExpiredDeadlineError);
    expect(() =>
      withChainTimestamp(now - 10_800n, () =>
        entity.supply({ ...params, now: params.deadline }),
      ),
    ).toThrow(ExpiredDeadlineError);
    const legacy = withChainTimestamp(now, () => entity.supply(params));
    expect(() =>
      withChainTimestamp(now + 86_400n, () => legacy.getRequirements()),
    ).toThrow(ExpiredDeadlineError);
    expect(() =>
      entity.repay({
        userAddress,
        positionData: makePosition(marketParams, { lastUpdate: now - 5_400n }),
        repayShares: maxUint256,
        now,
        deadline: now + 7_201n,
      }),
    ).toThrow(InputExceedsMaxError);
  });
  test("chain deadline remains valid with a fast device clock", () => {
    const chainNow = 1_800_000_000n;
    vi.useFakeTimers();
    vi.setSystemTime(Number(chainNow + 10_800n) * 1_000);
    try {
      expect(() =>
        makeEntity()
          .supply({
            userAddress,
            marketData: supplyMarketData,
            assets: 1n,
            deadline: chainNow + 1_200n,
            now: chainNow,
          })
          .buildTx(),
      ).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
  test("max repay accepts chain-time quote horizon with a slow device clock", () => {
    const chainNow = 1_800_000_000n;
    vi.useFakeTimers();
    vi.setSystemTime(Number(chainNow - 9_000n) * 1_000);
    try {
      expect(() =>
        makeEntity()
          .repay({
            userAddress,
            positionData: makePosition(marketParams, {
              lastUpdate: chainNow - 5_400n,
            }),
            repayShares: maxUint256,
            deadline: chainNow + 7_200n,
            now: chainNow,
          })
          .buildTx(),
      ).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

const makeEntity = (entityChainId: number = mainnet.id) =>
  createMockClient(mainnet)
    .client.extend(morphoViemExtension())
    .morpho.blue(marketParams, entityChainId);

describe("MorphoBlue reallocation penalty bounds", () => {
  test.each(["borrow", "combined", "withdraw", "refinance"] as const)(
    "behavior: %s rejects unapproved penalties before returning a handle",
    (kind) => {
      const entity = makeEntity();
      const positionData = makePosition(marketParams, { supplyShares: 100n });
      const run = (penalty: bigint, maxPenalty?: bigint) => {
        const params = {
          userAddress,
          positionData,
          deadline: maxUint256,
          maxPenalty,
          reallocations: [
            {
              vault: otherUserAddress,
              from: { type: "idle" },
              to: { adapter: otherUserAddress },
              assets: 10n,
              penalty,
            } satisfies VaultV2BlueReallocation,
          ],
        };
        switch (kind) {
          case "borrow":
            return entity.borrow({ ...params, borrowAssets: 10n });
          case "combined":
            return entity.supplyCollateralBorrow({
              ...params,
              collateralAssets: 1n,
              borrowAssets: 10n,
            });
          case "withdraw":
            return entity.withdraw({ ...params, assets: 10n });
          case "refinance":
            return entity.refinance({
              ...params,
              destination: {
                marketParams: destinationMarketParams,
                positionData: makePosition(destinationMarketParams, {
                  borrowShares: 0n,
                  collateral: 0n,
                }),
              },
            });
        }
      };
      expect(() => run(1n)).toThrow(InputExceedsMaxError);
      expect(() => run(2n, 1n)).toThrow(InputExceedsMaxError);
      expect(() => run(0n, -1n)).toThrow(NegativeInputError);
      expect(() => run(0n, MathLib.WAD + 1n)).toThrow(InputExceedsMaxError);
      expect(run(1n, 1n).buildTx().action.args.reallocationPenaltyAssets).toBe(
        1n,
      );
    },
  );

  test("behavior: snapshots the explicit penalty bound before lazy build", () => {
    const params = {
      userAddress,
      positionData: makePosition(marketParams),
      borrowAssets: 10n,
      deadline: maxUint256,
      maxPenalty: 1n,
      reallocations: [
        {
          vault: otherUserAddress,
          from: { type: "idle" },
          to: { adapter: otherUserAddress },
          assets: 10n,
          penalty: 1n,
        } satisfies VaultV2BlueReallocation,
      ],
    };
    const handle = makeEntity().borrow(params);
    const expected = handle.buildTx();
    params.maxPenalty = 0n;
    expect(handle.buildTx()).toEqual(expected);
  });
});

const getCommonWriteCalls = (
  entity: ReturnType<typeof makeEntity>,
  common: {
    deadline: bigint;
    now?: bigint;
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
    [
      "supply",
      () =>
        entity.supply({
          marketData: supplyMarketData,
          userAddress,
          assets: 1n,
          ...common,
        }),
    ],
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
      address: getChainAddress(mainnet.id, "blue"),
      abi: blueAbi,
      functionName: "isAuthorized",
      result: false,
    });
    const entity = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(marketParams, mainnet.id);

    const tokenRequirements = await entity
      .supply({
        marketData: supplyMarketData,
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

  test("supply uses an unlimited classic approval", async () => {
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
      .supply({
        marketData: supplyMarketData,
        assets: 1n,
        userAddress,
        deadline: maxUint256,
      })
      .getRequirements();

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
      marketData: makePosition(nativeMarketParams).market,
      userAddress,
      assets,
      nativeAmount: assets,
      deadline: maxUint256,
    });

    // The native branch emits no token approval/permit (and no Morpho
    // authorization) after the contract-code guard's `eth_getCode` reads: it
    // rides the funded amount as `tx.value`, and leaves the encoded token
    // permit empty. A regression that dropped the branch would demand a token
    // requirement or omit the value, and would revert on-chain rather than
    // fail here.
    expect(await action.getRequirements()).toEqual([]);
    const tx = action.buildTx();
    expect(tx.value).toBe(assets);
    expect(tx.action.args.nativeAmount).toBe(assets);
    expect(tx.action.args.assets).toBe(assets);
  });

  test("repay uses an unlimited classic approval", async () => {
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
      .getRequirements();

    expect(requirements).toMatchObject([
      {
        action: {
          type: "erc20Approval",
          args: { spender: blueBundlesV1, amount: maxUint256 },
        },
      },
    ]);
  });

  test("supplyCollateral uses an unlimited classic approval", async () => {
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
      .getRequirements();

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

describe.sequential("MorphoBlue common write validation", () => {
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

  test("error: ExpiredDeadlineError when a deadline expires before requirements", async () => {
    const now = 1_800_000_000n;
    const positionData = makePosition(marketParams);
    const destinationPositionData = makePosition(destinationMarketParams, {
      borrowShares: 0n,
      collateral: 0n,
    });
    const makeBlue = () => {
      const handle = createMockClient(mainnet);
      const entity = handle.client
        .extend(morphoViemExtension())
        .morpho.blue(marketParams, mainnet.id);
      return { handle, entity };
    };

    // supply validated its deadline synchronously before the contract-code check
    // and keeps that behaviour.
    const { handle: supplyHandle, entity: supplyEntity } = makeBlue();
    const supply = withChainTimestamp(now, () =>
      supplyEntity.supply({
        marketData: supplyMarketData,
        userAddress,
        assets: 1n,
        deadline: now + 1n,
      }),
    );
    expect(() =>
      withChainTimestamp(now + 1n, () => supply.getRequirements()),
    ).toThrow(ExpiredDeadlineError);
    expect(supplyHandle.request.mock.calls, "supply").toHaveLength(0);

    // withdraw and refinance return a rejected promise, as they did before the
    // deadline was moved ahead of the contract-code check.
    const cases = [
      [
        "withdraw",
        (entity: ReturnType<typeof makeEntity>) =>
          entity.withdraw({
            userAddress,
            positionData: makePosition(marketParams, {
              borrowShares: 0n,
              supplyShares: 10n,
            }),
            assets: 1n,
            deadline: now + 1n,
          }),
      ],
      [
        "refinance",
        (entity: ReturnType<typeof makeEntity>) =>
          entity.refinance({
            userAddress,
            positionData,
            destination: {
              marketParams: destinationMarketParams,
              positionData: destinationPositionData,
            },
            deadline: now + 1n,
          }),
      ],
    ] as const;
    for (const [method, call] of cases) {
      const { handle, entity } = makeBlue();
      const action = withChainTimestamp(now, () => call(entity));
      const promise = withChainTimestamp(now + 1n, () =>
        action.getRequirements(),
      );
      await expect(promise, method).rejects.toBeInstanceOf(
        ExpiredDeadlineError,
      );
      expect(handle.request.mock.calls, method).toHaveLength(0);
    }
  });

  test("supply, repay, and supplyCollateral validate against one requirement timestamp", async () => {
    const now = 1_800_000_000n;
    const deadline = now + 1n;
    const positionData = makePosition(marketParams);
    const cases = [
      {
        method: "supply",
        token: marketParams.loanToken,
        createAction: (entity: ReturnType<typeof makeEntity>) =>
          entity.supply({
            marketData: supplyMarketData,
            userAddress,
            assets: 1n,
            deadline,
          }),
      },
      {
        method: "repay",
        token: marketParams.loanToken,
        createAction: (entity: ReturnType<typeof makeEntity>) =>
          entity.repay({
            userAddress,
            positionData,
            repayAssets: 1n,
            deadline,
          }),
      },
      {
        method: "supplyCollateral",
        token: marketParams.collateralToken,
        createAction: (entity: ReturnType<typeof makeEntity>) =>
          entity.supplyCollateral({
            userAddress,
            collateralAssets: 1n,
            deadline,
          }),
      },
    ];

    for (const { method, token, createAction } of cases) {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
      const entity = handle.client
        .extend(morphoViemExtension({ supportSignature: false }))
        .morpho.blue(marketParams, mainnet.id);
      const action = withChainTimestamp(now, () => createAction(entity));
      const timestamp = vi
        .spyOn(Time, "timestamp")
        .mockReturnValueOnce(now)
        .mockReturnValueOnce(deadline);

      try {
        await expect(action.getRequirements(), method).resolves.toBeDefined();
      } finally {
        timestamp.mockRestore();
      }
    }
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
      expect(call, method).toThrow(ReferralFeeRecipientMissingError);
    }
    for (const [method, call] of getCommonWriteCalls(entity, {
      deadline: maxUint256,
      referralFeePct: MathLib.WAD,
      referralFeeRecipient: otherUserAddress,
    })) {
      expect(call, method).toThrow(ReferralFeePctExceededError);
      // The Blue JSDoc has always promised InputExceedsMaxError here; the shared
      // bundles normalizer must not break integrators pattern-matching it.
      expect(call, method).toThrow(InputExceedsMaxError);
    }
  });
});

describe("MorphoBlue observed chain guards", () => {
  test("getMarketData rejects before making any other RPC request", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockImplementation(async ({ method }) => {
      if (method === "eth_chainId") return "0x2105";
      throw new Error(`unexpected ${method}`);
    });
    const blue = handle.client
      .extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);

    await expect(blue.getMarketData()).rejects.toBeInstanceOf(
      ChainIdMismatchError,
    );
    expect(handle.request.mock.calls.map(([{ method }]) => method)).toEqual([
      "eth_chainId",
    ]);
  });

  test("getPositionData rejects before making any other RPC request", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockImplementation(async ({ method }) => {
      if (method === "eth_chainId") return "0x2105";
      throw new Error(`unexpected ${method}`);
    });
    const blue = handle.client
      .extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);

    await expect(blue.getPositionData(userAddress)).rejects.toBeInstanceOf(
      ChainIdMismatchError,
    );
    expect(handle.request.mock.calls.map(([{ method }]) => method)).toEqual([
      "eth_chainId",
    ]);
  });
});

describe("MorphoBlue position validation", () => {
  test.each(["withdrawCollateral", "repayWithdrawCollateral"] as const)(
    "behavior: debt-free %s skips deadline accrual but validates collateral amounts",
    (method) => {
      const now = 1_800_000_000n;
      const deadline = now + Time.s.from.d(7n);
      const maxTotal = (1n << 128n) - 1n;
      const snapshot = makePosition(marketParams, {
        borrowShares: 0n,
        lastUpdate: now,
        rateAtTarget: 100_000_000_000_000n,
      });
      const positionData = new AccrualPosition(
        snapshot,
        new Market({
          ...snapshot.market,
          totalSupplyAssets: maxTotal / 2n,
          totalSupplyShares: maxTotal / 2n,
          totalBorrowAssets: maxTotal / 4n,
          totalBorrowShares: maxTotal / 4n,
        }),
      );
      expect(() => positionData.accrueInterest(now + 7200n)).not.toThrow();
      expect(() => positionData.accrueInterest(deadline)).toThrow(
        BlueErrors.TotalOverflow,
      );
      const entity = makeEntity();
      const params = { now, deadline, userAddress, positionData };
      const build = (collateralAssets: bigint) =>
        method === "withdrawCollateral"
          ? entity.withdrawCollateral({ ...params, collateralAssets })
          : entity.repayWithdrawCollateral({
              ...params,
              repayAssets: 0n,
              collateralAssets,
            });
      expect(
        build(positionData.collateral).buildTx().action.args,
      ).toMatchObject({
        collateralAssets: positionData.collateral,
        maxRepayAssets: 0n,
        maxLtv: marketParams.lltv - DEFAULT_LLTV_BUFFER,
        deadline,
      });
      expect(() => build(positionData.collateral + 1n)).toThrow(
        WithdrawExceedsCollateralError,
      );
      expect(() => build(0n)).toThrow(NonPositiveInputError);
      expect(positionData.market.lastUpdate).toBe(now);
    },
  );

  test("behavior: repay-only funding does not accrue to a multi-day health deadline", () => {
    const now = 1_800_000_000n;
    const deadline = now + Time.s.from.d(7n);
    const maxTotal = (1n << 128n) - 1n;
    const snapshot = makePosition(marketParams, {
      lastUpdate: now,
      rateAtTarget: 100_000_000_000_000n,
    });
    const positionData = new AccrualPosition(
      snapshot,
      new Market({
        ...snapshot.market,
        totalSupplyAssets: maxTotal / 2n,
        totalSupplyShares: maxTotal / 2n,
        totalBorrowAssets: maxTotal / 4n,
        totalBorrowShares: maxTotal / 4n,
      }),
    );
    expect(() => positionData.accrueInterest(now + 7200n)).not.toThrow();
    expect(() => positionData.accrueInterest(deadline)).toThrow(
      BlueErrors.TotalOverflow,
    );
    const entity = makeEntity();
    const params = {
      now,
      deadline,
      userAddress,
      positionData,
      repayAssets: 1n,
    };
    for (const action of [
      entity.repay(params),
      entity.repayWithdrawCollateral({ ...params, collateralAssets: 0n }),
    ]) {
      expect(action.buildTx().action.args).toMatchObject({
        repayAssets: 1n,
        maxRepayAssets: 1n,
        maxLtv: maxUint256,
        deadline,
      });
    }
    expect(() =>
      entity.repayWithdrawCollateral({ ...params, collateralAssets: 1n }),
    ).toThrow(BlueErrors.TotalOverflow);
    expect(() =>
      entity.repay({
        now,
        deadline,
        userAddress,
        positionData,
        repayShares: 1n,
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("error: UnsupportedMarketIrmError for exact-asset repayment", () => {
    const entity = makeEntity();
    const position = makePosition(marketParams);
    const positionData = new AccrualPosition(
      position,
      new Market({ ...position.market, rateAtTarget: undefined }),
    );
    const now = positionData.market.lastUpdate + 1n;

    expect(() =>
      entity.repay({
        userAddress,
        positionData,
        repayAssets: 1n,
        now,
        deadline: now + 60n,
      }),
    ).toThrow(UnsupportedMarketIrmError);
  });

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

  test("[INV-07] error: supply, debt, and collateral bounds", () => {
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

  test("[INV-03] error: BorrowExceedsSafeLtvError on borrow and fee-bearing migration", () => {
    const entity = makeEntity();
    expect(() =>
      entity.borrow({
        userAddress,
        positionData: makePosition(marketParams),
        borrowAssets: 10n ** 24n,
        deadline: maxUint256,
      }),
    ).toThrow(BorrowExceedsSafeLtvError);

    const now = 1_700_000_000n;
    const sourcePosition = makePosition(marketParams, {
      collateral:
        (getMinimumSafeCollateral(makePosition(marketParams).borrowAssets) *
          105n) /
        100n,
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
        now,
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
        now,
        deadline: maxUint256,
        referralFeePct: MathLib.WAD / 10n,
        referralFeeRecipient: otherUserAddress,
      }),
    ).toThrow(BorrowExceedsSafeLtvError);
  });

  test("behavior: migration accepts a penalty above current source debt when healthy", () => {
    const entity = makeEntity();
    const sourcePosition = makePosition(marketParams, {
      collateral: 10n ** 24n,
    });
    const destinationPosition = makePosition(destinationMarketParams, {
      borrowShares: 0n,
      collateral: 0n,
    });
    const currentDebt = sourcePosition.borrowAssets;
    // penaltyAssets = ceil(assets × penalty / WAD) = currentDebt + 1n with penalty = 100%.
    const reallocation = {
      vault: "0x0000000000000000000000000000000000000031",
      from: { type: "idle" },
      to: { adapter: "0x0000000000000000000000000000000000000032" },
      assets: currentDebt + 1n,
      penalty: MathLib.WAD,
    } satisfies VaultV2BlueReallocation;

    expect(() =>
      entity.refinance({
        userAddress,
        positionData: sourcePosition,
        destination: {
          marketParams: destinationMarketParams,
          positionData: destinationPosition,
        },
        reallocations: [reallocation],
        maxPenalty: MathLib.WAD,
        deadline: maxUint256,
      }),
    ).not.toThrow();
  });

  test("[INV-03] error: WithdrawMakesPositionUnhealthyError after collateral withdrawal", () => {
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

  test.each([
    { horizon: 1_800n, safeHorizon: 3_600n, accepted: true },
    { horizon: 7_200n, safeHorizon: 3_600n, accepted: false },
    { horizon: 86_400n, safeHorizon: 10_800n, accepted: false },
  ])(
    "refinance health uses deadline +$horizon seconds",
    ({ horizon, safeHorizon, accepted }) => {
      const now = 1_800_000_000n;
      const deadline = now + horizon;
      const marketOverrides = {
        lastUpdate: now,
        rateAtTarget: 100_000_000_000_000n,
      };
      const baseSource = makePosition(marketParams, marketOverrides);
      const destination = makePosition(destinationMarketParams, {
        ...marketOverrides,
        collateral: 0n,
      });
      const collateral = getMinimumSafeCollateral(
        baseSource.accrueInterest(now + safeHorizon).borrowAssets +
          destination.accrueInterest(now + safeHorizon).borrowAssets,
      );
      const positionData = makePosition(marketParams, {
        ...marketOverrides,
        collateral,
      });
      const validateAt = (timestamp: bigint) =>
        validatePositionHealth({
          positionData: destination.accrueInterest(timestamp),
          additionalCollateral: collateral,
          borrowAmount: positionData.accrueInterest(timestamp).borrowAssets,
          marketId: destinationMarketParams.id,
          lltv: destinationMarketParams.lltv,
        });
      if (accepted) {
        expect(() => validateAt(deadline)).not.toThrow();
        expect(() => validateAt(now + 7_200n)).toThrow(
          BorrowExceedsSafeLtvError,
        );
      } else if (horizon > 7_200n) {
        expect(() => validateAt(now + 7_200n)).not.toThrow();
        expect(() => validateAt(deadline)).toThrow(BorrowExceedsSafeLtvError);
      } else {
        expect(() => validateAt(now + 3_601n)).toThrow(
          BorrowExceedsSafeLtvError,
        );
      }
      const build = () =>
        makeEntity().refinance({
          now,
          userAddress,
          positionData,
          destination: {
            marketParams: destinationMarketParams,
            positionData: destination,
          },
          deadline,
        });
      if (accepted) {
        const args = build().buildTx().action.args;
        expect(args.deadline).toBe(deadline);
        expect(args.maxLtv).toBe(marketParams.lltv - DEFAULT_LLTV_BUFFER);
      } else {
        expect(build).toThrow(BorrowExceedsSafeLtvError);
      }
    },
  );

  test.each([
    "borrow",
    "supplyCollateralBorrow",
    "withdrawCollateral",
    "repayWithdrawCollateral",
    "refinance",
  ] as const)(
    "%s health supports finite deadlines and unlimited sentinels",
    (method) => {
      const now = 1_800_000_000n;
      const marketOverrides = {
        lastUpdate: now,
        rateAtTarget: 100_000_000_000_000n,
      };
      const basePosition = makePosition(marketParams, marketOverrides);
      const destination = makePosition(destinationMarketParams, {
        ...marketOverrides,
        collateral: 0n,
      });
      const borrowAssets = 10n ** 17n;
      const collateralAssets = 10n ** 17n;
      const isBorrow =
        method === "borrow" || method === "supplyCollateralBorrow";
      const positionData = makePosition(marketParams, {
        ...marketOverrides,
        collateral:
          getMinimumSafeCollateral(
            basePosition.accrueInterest(now + 10_800n).borrowAssets +
              (method === "refinance"
                ? destination.accrueInterest(now + 10_800n).borrowAssets
                : isBorrow
                  ? borrowAssets
                  : 0n),
          ) + (isBorrow || method === "refinance" ? 0n : collateralAssets),
      });
      const build = (deadline: bigint) => {
        const common = { now, userAddress, positionData, deadline };
        const entity = makeEntity();
        switch (method) {
          case "borrow":
            return entity.borrow({ ...common, borrowAssets });
          case "supplyCollateralBorrow":
            return entity.supplyCollateralBorrow({
              ...common,
              borrowAssets,
              collateralAssets: 1n,
            });
          case "withdrawCollateral":
            return entity.withdrawCollateral({ ...common, collateralAssets });
          case "repayWithdrawCollateral":
            return entity.repayWithdrawCollateral({
              ...common,
              collateralAssets,
              repayAssets: 1n,
            });
          case "refinance":
            return entity.refinance({
              ...common,
              destination: {
                marketParams: destinationMarketParams,
                positionData: destination,
              },
            });
        }
      };
      const legacyMaxLtv = build(now + 7_200n).buildTx().action.args.maxLtv;
      for (const deadline of [
        now + 1_800n,
        now + 7_200n,
        maxUint256,
        (1n << 48n) - 1n,
      ]) {
        const args = build(deadline).buildTx().action.args;
        expect(args.deadline).toBe(deadline);
        expect(args.maxLtv).toBe(legacyMaxLtv);
        expect(args.maxLtv).toBe(marketParams.lltv - DEFAULT_LLTV_BUFFER);
      }
      expect(() => build(now + 86_400n)).toThrow(
        isBorrow || method === "refinance"
          ? BorrowExceedsSafeLtvError
          : WithdrawMakesPositionUnhealthyError,
      );
    },
  );

  test.each([0n, 3_600n])(
    "health sentinel boundary uses max(now, lastUpdate) with snapshot offset %s",
    (offset) => {
      const now = 1_800_000_000n;
      const minTimestamp = now + offset;
      const boundary = minTimestamp + Time.s.from.d(365n);
      const basePosition = makePosition(marketParams, {
        lastUpdate: minTimestamp,
        rateAtTarget: 3_170_979_198n,
      });
      const borrowAssets = 1n;
      const positionData = makePosition(marketParams, {
        lastUpdate: minTimestamp,
        rateAtTarget: basePosition.market.rateAtTarget,
        collateral: getMinimumSafeCollateral(
          basePosition.accrueInterest(minTimestamp + 10_800n).borrowAssets +
            borrowAssets,
        ),
      });
      const build = (deadline: bigint) =>
        makeEntity().borrow({
          now,
          userAddress,
          positionData,
          borrowAssets,
          deadline,
        });
      expect(() => build(minTimestamp + 7_200n)).not.toThrow();
      expect(() => build(boundary)).toThrow(BorrowExceedsSafeLtvError);
      expect(() => build(boundary + 1n)).not.toThrow();
    },
  );

  test.each([3_600n, 7_200n])(
    "behavior: deadline health horizon never precedes either market snapshot (source offset %s)",
    (sourceOffset) => {
      const now = 1_800_000_000n;
      const source = makePosition(marketParams, {
        lastUpdate: now + sourceOffset,
        rateAtTarget: 100_000_000_000_000n,
      });
      const destination = makePosition(destinationMarketParams, {
        lastUpdate: now + 10_800n - sourceOffset,
        rateAtTarget: 100_000_000_000_000n,
        collateral: 0n,
      });
      const positionData = makePosition(marketParams, {
        lastUpdate: source.market.lastUpdate,
        rateAtTarget: source.market.rateAtTarget,
        collateral: getMinimumSafeCollateral(
          source.borrowAssets + destination.borrowAssets + 1n,
        ),
      });
      const validationParams = {
        additionalCollateral: positionData.collateral,
        marketId: destinationMarketParams.id,
        lltv: destinationMarketParams.lltv,
      };
      expect(() =>
        validatePositionHealth({
          ...validationParams,
          positionData: destination,
          borrowAmount: positionData.borrowAssets,
        }),
      ).not.toThrow();
      expect(() =>
        validatePositionHealth({
          ...validationParams,
          positionData: destination.accrueInterest(now + 7_200n),
          borrowAmount: positionData.accrueInterest(now + 7_200n).borrowAssets,
        }),
      ).toThrow(BorrowExceedsSafeLtvError);
      expect(() =>
        makeEntity().refinance({
          now,
          userAddress,
          deadline: now + 1_800n,
          positionData,
          destination: {
            marketParams: destinationMarketParams,
            positionData: destination,
          },
        }),
      ).toThrow(BorrowExceedsSafeLtvError);
    },
  );

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
          type: "permit2SignatureTransfer",
          args: {
            spender: getChainAddress(mainnet.id, "bundles.blueBundlesV1"),
            amount,
            nonce: 1n,
            deadline,
          },
        },
      }) satisfies BundlesTokenRequirementSignature;

    expect(
      action.buildTx([signature(minimum + 1n)]).action.args.maxRepayAssets,
    ).toBe(minimum + 1n);
    expect(() => action.buildTx([signature(minimum - 1n)])).toThrow(
      MaxRepayAssetsBelowRepayAssetsError,
    );
  });

  const withSimplePermit = <
    T extends {
      getRequirements: (params?: {
        useSimplePermit?: boolean;
      }) => Promise<readonly ActionRequirement[]>;
    },
  >(
    action: T,
  ) => ({
    ...action,
    getRequirements: () => action.getRequirements({ useSimplePermit: true }),
  });

  test.each([
    {
      method: "supply",
      expectedSignatures: 0,
      prepare: (entity: ReturnType<typeof makeEntity>, deadline: bigint) =>
        withSimplePermit(
          entity.supply({
            marketData: supplyMarketData,
            userAddress: signerAddress,
            assets: 1_000n,
            deadline,
          }),
        ),
    },
    {
      method: "supplyCollateralBorrow",
      expectedSignatures: 1,
      prepare: (entity: ReturnType<typeof makeEntity>, deadline: bigint) =>
        withSimplePermit(
          entity.supplyCollateralBorrow({
            userAddress: signerAddress,
            positionData: makePosition(marketParams, { user: signerAddress }),
            collateralAssets: 1_000n,
            borrowAssets: 1n,
            deadline,
          }),
        ),
    },
    {
      method: "withdraw",
      expectedSignatures: 1,
      prepare: (entity: ReturnType<typeof makeEntity>, deadline: bigint) =>
        entity.withdraw({
          userAddress: signerAddress,
          positionData: makePosition(marketParams, {
            user: signerAddress,
            borrowShares: 0n,
            supplyShares: 10n ** 18n,
          }),
          assets: 1n,
          deadline,
        }),
    },
    {
      method: "repay",
      expectedSignatures: 0,
      prepare: (entity: ReturnType<typeof makeEntity>, deadline: bigint) =>
        withSimplePermit(
          entity.repay({
            userAddress: signerAddress,
            positionData: makePosition(marketParams, {
              user: signerAddress,
              lastUpdate: deadline - 3_600n,
            }),
            repayShares: maxUint256,
            deadline,
          }),
        ),
    },
    {
      method: "supplyCollateral",
      expectedSignatures: 0,
      prepare: (entity: ReturnType<typeof makeEntity>, deadline: bigint) =>
        withSimplePermit(
          entity.supplyCollateral({
            userAddress: signerAddress,
            collateralAssets: 1_000n,
            deadline,
          }),
        ),
    },
    {
      method: "borrow",
      expectedSignatures: 1,
      prepare: (entity: ReturnType<typeof makeEntity>, deadline: bigint) =>
        entity.borrow({
          userAddress: signerAddress,
          positionData: makePosition(marketParams, { user: signerAddress }),
          borrowAssets: 1n,
          deadline,
        }),
    },
    {
      method: "withdrawCollateral",
      expectedSignatures: 1,
      prepare: (entity: ReturnType<typeof makeEntity>, deadline: bigint) =>
        entity.withdrawCollateral({
          userAddress: signerAddress,
          positionData: makePosition(marketParams, {
            user: signerAddress,
            borrowShares: 0n,
          }),
          collateralAssets: 1n,
          deadline,
        }),
    },
    {
      method: "repayWithdrawCollateral",
      expectedSignatures: 1,
      prepare: (entity: ReturnType<typeof makeEntity>, deadline: bigint) =>
        withSimplePermit(
          entity.repayWithdrawCollateral({
            userAddress: signerAddress,
            positionData: makePosition(marketParams, {
              user: signerAddress,
              lastUpdate: deadline - 3_600n,
            }),
            repayShares: maxUint256,
            collateralAssets: 1n,
            deadline,
          }),
        ),
    },
    {
      method: "refinance",
      expectedSignatures: 1,
      prepare: (entity: ReturnType<typeof makeEntity>, deadline: bigint) =>
        entity.refinance({
          userAddress: signerAddress,
          positionData: makePosition(marketParams, { user: signerAddress }),
          destination: {
            marketParams: destinationMarketParams,
            positionData: makePosition(destinationMarketParams, {
              user: signerAddress,
              borrowShares: 0n,
              collateral: 0n,
            }),
          },
          deadline,
        }),
    },
  ])(
    "behavior: $method signatures prepared on one handle finalize on a fresh handle",
    async ({ method, expectedSignatures, prepare }) => {
      const now = 1_800_000_000n;
      const deadline = now + 3_600n;
      const makeSignatureEntity = () => {
        const handle = createMockClient(mainnet);
        for (const address of [
          marketParams.loanToken,
          marketParams.collateralToken,
        ]) {
          const domain = {
            name: "Token",
            version: "1",
            chainId: mainnet.id,
            verifyingContract: address,
          };
          mockRead(handle, {
            address,
            abi: erc2612Abi,
            functionName: "DOMAIN_SEPARATOR",
            result: hashDomain<TypedData>({
              domain,
              types: { EIP712Domain: getTypesForEIP712Domain({ domain }) },
            }),
          });
          mockRead(handle, {
            address,
            abi: erc2612Abi,
            functionName: "nonces",
            result: 0n,
          });
          mockRead(handle, {
            address,
            abi: erc20Abi,
            functionName: "decimals",
            result: 18,
          });
          mockRead(handle, {
            address,
            abi: erc20Abi,
            functionName: "name",
            result: "Token",
          });
          mockRead(handle, {
            address,
            abi: erc20Abi,
            functionName: "symbol",
            result: "TKN",
          });
          mockRead(handle, {
            address,
            abi: erc5267Abi,
            functionName: "eip712Domain",
            result: [
              "0x0f",
              "Token",
              "1",
              BigInt(mainnet.id),
              address,
              `0x${"00".repeat(32)}`,
              [],
            ],
          });
          mockRead(handle, {
            address,
            abi: erc20Abi,
            functionName: "allowance",
            result: 0n,
          });
        }
        mockRead(handle, {
          address: getChainAddress(mainnet.id, "blue"),
          abi: blueAbi,
          functionName: "isAuthorized",
          result: false,
        });
        mockRead(handle, {
          address: getChainAddress(mainnet.id, "blue"),
          abi: blueAbi,
          functionName: "nonce",
          result: 0n,
        });
        return handle.client
          .extend(
            morphoViemExtension({
              supportSignature: true,
              supportDeployless: false,
            }),
          )
          .morpho.blue(marketParams, mainnet.id);
      };

      const actionA = withChainTimestamp(now, () =>
        prepare(makeSignatureEntity(), deadline),
      );
      const requirements = (
        await withChainTimestamp(now, () => actionA.getRequirements())
      ).filter(isRequirementSignature);
      const tokenPermits = [
        "supply",
        "supplyCollateral",
        "supplyCollateralBorrow",
        "repay",
        "repayWithdrawCollateral",
      ].includes(method)
        ? 1
        : 0;
      expect(
        requirements.filter(({ action }) => action.type === "permit"),
      ).toHaveLength(tokenPermits);
      expect(requirements).toHaveLength(expectedSignatures + tokenPermits);
      const signatures = await Promise.all(
        requirements.map((requirement) =>
          requirement.sign(signerWalletClient, signerAddress),
        ),
      );

      const actionB = withChainTimestamp(now, () =>
        prepare(makeSignatureEntity(), deadline),
      );
      expect(actionB.buildTx(signatures)).toEqual(actionA.buildTx(signatures));
    },
  );

  test("behavior: full repay allowance threshold uses the encoded maxRepayAssets", async () => {
    const now = 1_800_000_000n;
    const positionData = makePosition(marketParams, {
      lastUpdate: now,
      rateAtTarget: 3_170_979_198n,
    });
    const deadline = now + 7_200n;
    const createRepay = (allowance: bigint) => {
      const handle = createMockClient(mainnet);
      const entity = handle.client
        .extend(morphoViemExtension({ supportSignature: false }))
        .morpho.blue(marketParams, mainnet.id);
      mockRead(handle, {
        address: marketParams.loanToken,
        abi: erc20Abi,
        functionName: "allowance",
        result: allowance,
      });
      return withChainTimestamp(now, () =>
        entity.repay({
          userAddress,
          positionData,
          repayShares: maxUint256,
          deadline,
        }),
      );
    };
    const baseline = createRepay(0n);
    const minimum = withChainTimestamp(
      now,
      () => baseline.buildTx().action.args.maxRepayAssets,
    );
    const sufficient = createRepay(minimum);

    expect(
      await withChainTimestamp(now, () => sufficient.getRequirements()),
    ).toEqual([]);

    const insufficient = createRepay(minimum - 1n);
    const requirements = await withChainTimestamp(now, () =>
      insufficient.getRequirements(),
    );
    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { amount: maxUint256 },
    });
  });
});

describe("MorphoBlue missing contract code", () => {
  test("nested approval and authorization requirements share only an invocation-local preflight", async () => {
    const handle = createMockClient(mainnet);
    const defaultImpl = handle.request.getMockImplementation();
    handle.request.mockImplementation(async ({ method, params }) => {
      if (method === "eth_call") return `0x${"0".repeat(64)}`;
      return defaultImpl?.({ method, params });
    });
    const entity = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(marketParams, mainnet.id);
    const createOperation = () =>
      entity.supplyCollateralBorrow({
        userAddress,
        collateralAssets: 1n,
        borrowAssets: 1n,
        positionData: makePosition(marketParams, {
          borrowShares: 0n,
          lastUpdate: Time.timestamp(),
        }),
        deadline: maxUint256,
      });
    const operation = createOperation();
    const first = await operation.getRequirements();
    expect(first.map(({ action }) => action.type)).toEqual([
      "erc20Approval",
      "blueAuthorization",
    ]);
    const methods = () =>
      handle.request.mock.calls.map(([{ method }]) => method);
    expect(methods()).toEqual([
      "eth_getCode",
      "eth_getCode",
      "eth_chainId",
      "eth_call",
      "eth_call",
    ]);
    handle.request.mockClear();
    const second = await operation.getRequirements();
    expect(second.map(({ action }) => action)).toEqual(
      first.map(({ action }) => action),
    );
    expect(methods().filter((method) => method === "eth_chainId")).toHaveLength(
      1,
    );
    handle.request.mockClear();
    const concurrent = await Promise.all([
      createOperation().getRequirements(),
      createOperation().getRequirements(),
    ]);
    expect(
      concurrent.map((requirements) =>
        requirements.map(({ action }) => action),
      ),
    ).toEqual([
      first.map(({ action }) => action),
      first.map(({ action }) => action),
    ]);
    // Independent invocations have separate checks; viem may dedupe in-flight probes.
    const concurrentProbes = methods().filter(
      (method) => method === "eth_chainId",
    ).length;
    expect(concurrentProbes).toBeGreaterThanOrEqual(1);
    expect(concurrentProbes).toBeLessThanOrEqual(2);
    handle.request.mockClear();
    const afterSettlement = await operation.getRequirements();
    expect(afterSettlement.map(({ action }) => action)).toEqual(
      first.map(({ action }) => action),
    );
    expect(methods().filter((method) => method === "eth_chainId")).toHaveLength(
      1,
    );
    handle.request.mockClear();
    handle.request.mockImplementation(async ({ method, params }) => {
      if (method === "eth_chainId") return "0x2105";
      return defaultImpl?.({ method, params });
    });
    await expect(operation.getRequirements()).rejects.toBeInstanceOf(
      ChainIdMismatchError,
    );
    const probeIndex = methods().indexOf("eth_chainId");
    expect(probeIndex).toBeGreaterThanOrEqual(0);
    expect(methods().slice(probeIndex)).toEqual(["eth_chainId"]);
  });

  test("error: supply fails closed on a code-less target before any downstream read", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockImplementation(async ({ method }) => {
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_getCode") return "0x";
      throw new Error(`unhandled RPC ${method}`);
    });
    const entity = handle.client
      .extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);
    const promise = entity
      .supply({
        marketData: supplyMarketData,
        userAddress,
        assets: 1n,
        deadline: maxUint256,
      })
      .getRequirements();
    await expectFailClosed(promise, "config");
    await expect(promise).rejects.toBeInstanceOf(MissingContractCodeError);
    expect(
      handle.request.mock.calls.filter(([call]) => call.method === "eth_call"),
    ).toHaveLength(0);
  });

  test("error: a natively funded supply fails closed on a code-less target", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockImplementation(async ({ method }) => {
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_getCode") return "0x";
      throw new Error(`unhandled RPC ${method}`);
    });
    const nativeMarketParams = new MarketParams({
      loanToken: getChainAddress(mainnet.id, "wNative"),
      collateralToken: marketParams.collateralToken,
      oracle: marketParams.oracle,
      irm: marketParams.irm,
      lltv: marketParams.lltv,
    });
    const entity = handle.client
      .extend(morphoViemExtension())
      .morpho.blue(nativeMarketParams, mainnet.id);
    const promise = entity
      .supply({
        marketData: makePosition(nativeMarketParams).market,
        userAddress,
        assets: 1n,
        nativeAmount: 1n,
        deadline: maxUint256,
      })
      .getRequirements();
    await expectFailClosed(promise, "config");
    await expect(promise).rejects.toBeInstanceOf(MissingContractCodeError);
    await expect(promise).rejects.toMatchObject({
      role: "bundles.blueBundlesV1",
    });
    expect(
      handle.request.mock.calls.filter(([call]) => call.method === "eth_call"),
    ).toHaveLength(0);
  });

  test("error: a wrong-chain RPC surfaces ChainIdMismatchError, not missing code", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockImplementation(async ({ method }) => {
      if (method === "eth_chainId") return "0x2105";
      if (method === "eth_getCode") return "0x";
      throw new Error(`unhandled RPC ${method}`);
    });
    const entity = handle.client
      .extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);
    const promise = entity
      .supply({
        marketData: supplyMarketData,
        userAddress,
        assets: 1n,
        deadline: maxUint256,
      })
      .getRequirements();
    await expectFailClosed(promise, "chain");
    await expect(promise).rejects.toBeInstanceOf(ChainIdMismatchError);
    await expect(promise).rejects.not.toBeInstanceOf(MissingContractCodeError);
  });

  test.each([
    "withdraw",
    "repayWithdrawCollateral",
    "supplyCollateralBorrow",
    "refinance",
  ] as const)(
    "error: %s fails closed on a code-less target before any downstream read",
    async (method) => {
      const handle = createMockClient(mainnet);
      handle.request.mockImplementation(async ({ method: rpcMethod }) => {
        if (rpcMethod === "eth_chainId") return "0x1";
        if (rpcMethod === "eth_getCode") return "0x";
        throw new Error(`unhandled RPC ${rpcMethod}`);
      });
      const entity = handle.client
        .extend(morphoViemExtension())
        .morpho.blue(marketParams, mainnet.id);
      const call = getCommonWriteCalls(entity).find(
        ([name]) => name === method,
      )?.[1];
      if (call == null) throw new Error(`unknown flow ${method}`);
      const promise = call().getRequirements();
      await expectFailClosed(promise, "config");
      await expect(promise).rejects.toBeInstanceOf(MissingContractCodeError);
      await expect(promise).rejects.toMatchObject({
        role: "bundles.blueBundlesV1",
      });
      expect(
        handle.request.mock.calls.filter(
          ([rpcCall]) => rpcCall.method === "eth_call",
        ),
      ).toHaveLength(0);
    },
  );

  test("behavior: a code-less Permit2 is not checked without an ERC-20 funding leg", async () => {
    const handle = createMockClient(mainnet);
    const permit2 = getChainAddresses(mainnet.id).permit2;
    const defaultImpl = handle.request.getMockImplementation();
    handle.request.mockImplementation(async ({ method, params }) => {
      if (method === "eth_getCode")
        return params?.[0] === permit2 ? "0x" : "0x6000";
      if (method === "eth_call") return `0x${"0".repeat(64)}`;
      return defaultImpl?.({ method, params });
    });
    const entity = handle.client
      .extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);
    // Withdraw has no ERC-20 funding leg, so Permit2 is never a write target.
    await entity
      .withdraw({
        userAddress,
        positionData: makePosition(marketParams, {
          borrowShares: 0n,
          supplyShares: 10n,
        }),
        assets: 1n,
        deadline: maxUint256,
      })
      .getRequirements();
    expect(
      handle.request.mock.calls.filter(
        ([call]) =>
          call.method === "eth_getCode" && call.params?.[0] === permit2,
      ),
    ).toHaveLength(0);
  });

  test("behavior: a code-full supply sends exactly one eth_chainId", async () => {
    const handle = createMockClient(mainnet);
    const defaultImpl = handle.request.getMockImplementation();
    handle.request.mockImplementation(async ({ method, params }) => {
      // Zero-decode every contract read (allowance 0, authorization false, …).
      if (method === "eth_call") return `0x${"0".repeat(64)}`;
      return defaultImpl?.({ method, params });
    });
    const entity = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(marketParams, mainnet.id);
    await entity
      .supply({
        marketData: supplyMarketData,
        userAddress,
        assets: 1n,
        deadline: maxUint256,
      })
      .getRequirements();
    expect(
      handle.request.mock.calls.filter(
        ([call]) => call.method === "eth_chainId",
      ),
    ).toHaveLength(1);
  });
});

describe("MorphoBlue supply snapshot checks", () => {
  test("keeps snapshot-free supply compatible on the entity and public interface", () => {
    const { client, request } = createMockClient(mainnet);
    const entity = client
      .extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);
    const actions: BlueActions = entity;
    const params = { userAddress, assets: 1n, deadline: maxUint256 };
    const protectedTx = entity
      .supply({ ...params, marketData: supplyMarketData })
      .buildTx();

    expect(entity.supply(params).buildTx()).toEqual(protectedTx);
    expect(actions.supply(params).buildTx()).toEqual(protectedTx);
    expect(
      actions.supply({ ...params, marketData: supplyMarketData }).buildTx(),
    ).toEqual(protectedTx);
    expect(request).not.toHaveBeenCalled();
  });

  test("builds from a market snapshot with no dead supply shares", () => {
    const { client } = createMockClient(mainnet);
    const entity = client
      .extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);

    const tx = entity
      .supply({
        marketData: makePosition(marketParams, { deadSupplyShares: 0n }).market,
        userAddress,
        assets: 1n,
        deadline: maxUint256,
      })
      .buildTx();

    expect(tx).toBeDefined();
  });

  test.each([
    {
      name: "a snapshot of another market",
      marketData: makePosition(destinationMarketParams).market,
      error: MarketIdMismatchError,
    },
  ])("error: rejects $name before any RPC request", ({ marketData, error }) => {
    const { client, request } = createMockClient(mainnet);
    const entity = client
      .extend(morphoViemExtension())
      .morpho.blue(marketParams, mainnet.id);
    expect(() =>
      entity.supply({
        marketData,
        userAddress,
        assets: 1n,
        deadline: maxUint256,
      }),
    ).toThrow(error);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("Blue parse-once handles", () => {
  test("all write handles retain owned source, destination and reallocation market snapshots", () => {
    const now = 1_800_000_000n;
    withChainTimestamp(now, () => {
      const source = new MarketParams({ ...marketParams });
      const destination = new MarketParams({ ...destinationMarketParams });
      const reallocationSource = new MarketParams({
        ...marketParams,
        oracle: "0x0000000000000000000000000000000000000093",
      });
      const entity = createMockClient(mainnet)
        .client.extend(morphoViemExtension())
        .morpho.blue(source, mainnet.id);
      const common = { userAddress, deadline: now + 3_600n };
      const positionData = makePosition(source, {
        lastUpdate: now,
        supplyShares: 100n,
      });
      const destinationPosition = makePosition(destination, {
        lastUpdate: now,
        borrowShares: 0n,
        collateral: 0n,
      });
      const reallocations = [
        {
          vault: "0x0000000000000000000000000000000000000041",
          from: {
            type: "market",
            adapter: "0x0000000000000000000000000000000000000042",
            marketParams: reallocationSource,
          },
          to: { adapter: "0x0000000000000000000000000000000000000043" },
          assets: 1n,
          penalty: 0n,
        },
      ] as const satisfies readonly VaultV2BlueReallocation[];
      const handles = [
        entity.supply({ ...common, assets: 1n }),
        entity.withdraw({ ...common, positionData, assets: 1n, reallocations }),
        entity.supplyCollateral({ ...common, collateralAssets: 1n }),
        entity.borrow({
          ...common,
          positionData,
          borrowAssets: 1n,
          reallocations,
        }),
        entity.supplyCollateralBorrow({
          ...common,
          positionData,
          collateralAssets: 1n,
          borrowAssets: 1n,
          reallocations,
        }),
        entity.repay({ ...common, positionData, repayAssets: 1n }),
        entity.withdrawCollateral({
          ...common,
          positionData,
          collateralAssets: 1n,
        }),
        entity.repayWithdrawCollateral({
          ...common,
          positionData,
          repayAssets: 1n,
          collateralAssets: 1n,
        }),
        entity.refinance({
          ...common,
          positionData,
          destination: {
            marketParams: destination,
            positionData: destinationPosition,
          },
          reallocations,
        }),
      ];
      const callback = entity.withdrawBuyCallback({
        userAddress,
        callbackAddress: otherUserAddress,
        positionData: makePosition(source, {
          user: otherUserAddress,
          supplyShares: 1n,
          lastUpdate: now,
        }),
      });
      const expected = handles.map((handle) => handle.buildTx());
      const expectedCallback = callback.buildTx();
      for (const market of [source, destination, reallocationSource]) {
        expect(Object.isFrozen(market)).toBe(false);
        Object.assign(market, {
          oracle: "0x0000000000000000000000000000000000000099",
        });
      }
      for (const [index, handle] of handles.entries()) {
        const tx = handle.buildTx();
        expect(tx).toEqual(expected[index]);
        const decoded = decodeFunctionData({
          abi: blueBundlesV1Abi,
          data: tx.data,
        });
        const encodedSource = decoded.args?.[0] as InputMarketParams;
        expect(encodedSource.oracle).not.toBe(source.oracle);
        const sourceId = MarketUtils.getMarketId(encodedSource);
        if (tx.action.type === "blueRefinance") {
          expect(tx.action.args.sourceMarket).toBe(sourceId);
          expect(decoded.functionName).toBe(
            "blueBundlesV1MigrateBorrowPosition",
          );
          if (decoded.functionName === "blueBundlesV1MigrateBorrowPosition") {
            expect(tx.action.args.destinationMarket).toBe(
              MarketUtils.getMarketId(decoded.args[1]),
            );
            expect(decoded.args[1].oracle).not.toBe(destination.oracle);
          }
        } else expect(tx.action.args.market).toBe(sourceId);
        const allocations =
          decoded.functionName === "blueBundlesV1Withdraw" ||
          decoded.functionName === "blueBundlesV1MigrateBorrowPosition"
            ? decoded.args[4]
            : decoded.functionName === "blueBundlesV1SupplyCollateralAndBorrow"
              ? decoded.args[6]
              : [];
        for (const allocation of allocations) {
          expect(MarketUtils.getMarketId(allocation.marketParams)).toBe(
            tx.action.type === "blueRefinance"
              ? tx.action.args.destinationMarket
              : sourceId,
          );
          expect(MarketUtils.getMarketId(allocation.sourceMarketParams)).toBe(
            reallocationSource.id,
          );
          expect(allocation.sourceMarketParams.oracle).not.toBe(
            reallocationSource.oracle,
          );
        }
      }
      const callbackTx = callback.buildTx();
      expect(callbackTx).toEqual(expectedCallback);
      const decodedCallback = decodeFunctionData({
        abi: blueAbi,
        data: callbackTx.data,
      });
      expect(decodedCallback.functionName).toBe("withdraw");
      if (decodedCallback.functionName === "withdraw")
        expect(callbackTx.action.args.market).toBe(
          MarketUtils.getMarketId(decodedCallback.args[0]),
        );
      for (const market of [source, destination, reallocationSource])
        expect(Object.isFrozen(market)).toBe(false);
    });
  });

  test("token requirements retain the snapshotted asset after caller market mutation", async () => {
    const source = new MarketParams({ ...marketParams });
    const mock = createMockClient(mainnet);
    mockRead(mock, {
      address: source.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const entity = mock.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(source, mainnet.id);
    const handle = entity.supply({
      userAddress,
      assets: 1n,
      deadline: maxUint256,
    });
    const originalToken = source.loanToken;
    Object.assign(source, {
      loanToken: "0x0000000000000000000000000000000000000099",
    });
    const requirements = await handle.getRequirements();
    expect(requirements).toMatchObject([
      { to: originalToken, action: { type: "erc20Approval" } },
    ]);
  });

  test.each(["user", "market"] as const)(
    "callback %s mismatch precedes its zero-share error",
    (mismatch) => {
      const entity = makeEntity();
      const positionData = makePosition(
        mismatch === "market" ? destinationMarketParams : marketParams,
        {
          user: mismatch === "user" ? userAddress : otherUserAddress,
          supplyShares: 0n,
        },
      );
      expect(() =>
        entity.withdrawBuyCallback({
          userAddress,
          callbackAddress: otherUserAddress,
          positionData,
        }),
      ).toThrow(
        mismatch === "user"
          ? AccrualPositionUserMismatchError
          : MarketIdMismatchError,
      );
    },
  );

  test("callback snapshot validation precedes registry address lookups", () => {
    const chain = { ...mainnet, id: 999999 };
    const entity = createMockClient(chain)
      .client.extend(morphoViemExtension())
      .morpho.blue(marketParams, chain.id);
    expect(() =>
      entity.withdrawBuyCallback({
        userAddress,
        callbackAddress: otherUserAddress,
        positionData: makePosition(marketParams, {
          user: userAddress,
          supplyShares: 0n,
        }),
      }),
    ).toThrow(AccrualPositionUserMismatchError);
  });

  test("stale destination id precedes a missing refinance source snapshot", () => {
    const destination = new MarketParams({ ...destinationMarketParams });
    Object.assign(destination, {
      oracle: "0x0000000000000000000000000000000000000099",
    });
    expect(() =>
      makeEntity().refinance({
        userAddress,
        deadline: maxUint256,
        positionData: undefined as unknown as AccrualPosition,
        destination: {
          marketParams: destination,
          positionData: makePosition(destinationMarketParams),
        },
      }),
    ).toThrow(MarketIdMismatchError);
  });

  test("all Blue operations match their standalone builders", () => {
    const now = 1_800_000_000n;
    withChainTimestamp(now, () => {
      const deadline = now + 3_600n;
      const entity = makeEntity();
      const positionData = makePosition(marketParams, {
        lastUpdate: now,
        supplyShares: 100n,
      });
      const destinationPositionData = makePosition(destinationMarketParams, {
        lastUpdate: now,
        borrowShares: 0n,
        collateral: 0n,
      });
      const market = { chainId: mainnet.id, marketParams };
      const args = { userAddress, deadline };
      const maxLtv = marketParams.lltv - DEFAULT_LLTV_BUFFER;
      const pairs = [
        [
          entity.supply({ ...args, assets: 1n }).buildTx(),
          blueSupply({ market, args: { ...args, assets: 1n } }),
        ],
        [
          entity.withdraw({ ...args, positionData, assets: 1n }).buildTx(),
          blueWithdraw({
            market,
            args: { ...args, withdrawAssets: 1n, withdrawShares: 0n },
          }),
        ],
        [
          entity.supplyCollateral({ ...args, collateralAssets: 1n }).buildTx(),
          blueSupplyCollateral({
            market,
            args: { ...args, collateralAssets: 1n },
          }),
        ],
        [
          entity.borrow({ ...args, positionData, borrowAssets: 1n }).buildTx(),
          blueBorrow({ market, args: { ...args, borrowAssets: 1n, maxLtv } }),
        ],
        [
          entity
            .supplyCollateralBorrow({
              ...args,
              positionData,
              collateralAssets: 1n,
              borrowAssets: 1n,
            })
            .buildTx(),
          blueSupplyCollateralBorrow({
            market,
            args: { ...args, collateralAssets: 1n, borrowAssets: 1n, maxLtv },
          }),
        ],
        [
          entity.repay({ ...args, positionData, repayAssets: 1n }).buildTx(),
          blueRepay({
            market,
            args: {
              ...args,
              repayAssets: 1n,
              repayShares: 0n,
              maxRepayAssets: 1n,
            },
          }),
        ],
        [
          entity
            .withdrawCollateral({ ...args, positionData, collateralAssets: 1n })
            .buildTx(),
          blueWithdrawCollateral({
            market,
            args: { ...args, collateralAssets: 1n, maxLtv },
          }),
        ],
        [
          entity
            .repayWithdrawCollateral({
              ...args,
              positionData,
              repayAssets: 1n,
              collateralAssets: 1n,
            })
            .buildTx(),
          blueRepayWithdrawCollateral({
            market,
            args: {
              ...args,
              repayAssets: 1n,
              repayShares: 0n,
              maxRepayAssets: 1n,
              collateralAssets: 1n,
              maxLtv,
            },
          }),
        ],
        [
          entity
            .refinance({
              ...args,
              positionData,
              destination: {
                marketParams: destinationMarketParams,
                positionData: destinationPositionData,
              },
            })
            .buildTx(),
          blueRefinance({
            market: {
              chainId: mainnet.id,
              sourceMarketParams: marketParams,
              destinationMarketParams,
            },
            args: { ...args, maxLtv },
          }),
        ],
        [
          entity
            .withdrawBuyCallback({
              userAddress,
              callbackAddress: otherUserAddress,
              positionData: makePosition(marketParams, {
                user: otherUserAddress,
                supplyShares: 1n,
                lastUpdate: now,
              }),
            })
            .buildTx(),
          blueWithdrawBuyCallback({
            market,
            args: {
              userAddress,
              callbackAddress: otherUserAddress,
              shares: 1n,
            },
          }),
        ],
      ] as const;
      for (const [actual, expected] of pairs) {
        expect(actual).toEqual(expected);
        expect(Object.isFrozen(actual)).toBe(true);
        expect(Object.isFrozen(actual.action.args)).toBe(true);
      }
    });
  });

  test("common referral parsing precedes amount and snapshot errors as on main", () => {
    const entity = makeEntity();
    const common = { userAddress, deadline: maxUint256, referralFeePct: 1n };
    expect(() => entity.supply({ ...common, assets: 0n })).toThrow(
      ReferralFeeRecipientMissingError,
    );
    expect(() =>
      entity.supplyCollateral({ ...common, collateralAssets: -1n }),
    ).toThrow(ReferralFeeRecipientMissingError);
    expect(() =>
      entity.supplyCollateralBorrow({
        ...common,
        collateralAssets: -1n,
        borrowAssets: 0n,
      }),
    ).toThrow(ReferralFeeRecipientMissingError);
    expect(() =>
      entity.borrow({
        ...common,
        borrowAssets: -1n,
        positionData: undefined as unknown as AccrualPosition,
      }),
    ).toThrow(ReferralFeeRecipientMissingError);
    expect(() =>
      entity.withdraw({
        ...common,
        assets: -1n,
        positionData: undefined as unknown as AccrualPosition,
      }),
    ).toThrow(ReferralFeeRecipientMissingError);
    expect(() =>
      entity.repay({
        ...common,
        repayAssets: -1n,
        positionData: undefined as unknown as AccrualPosition,
      }),
    ).toThrow(ReferralFeeRecipientMissingError);
    expect(() =>
      entity.withdrawCollateral({
        ...common,
        collateralAssets: -1n,
        positionData: undefined as unknown as AccrualPosition,
      }),
    ).toThrow(ReferralFeeRecipientMissingError);
    expect(() =>
      entity.repayWithdrawCollateral({
        ...common,
        repayAssets: -1n,
        collateralAssets: 0n,
        positionData: undefined as unknown as AccrualPosition,
      }),
    ).toThrow(ReferralFeeRecipientMissingError);
  });

  test("refinance and callback snapshot errors precede deferred raw checks as on main", () => {
    expect(() =>
      makeEntity().refinance({
        userAddress,
        deadline: maxUint256,
        positionData: undefined as unknown as AccrualPosition,
        destination: {
          marketParams,
          positionData: undefined as unknown as AccrualPosition,
        },
      }),
    ).toThrow(MissingAccrualPositionError);
    expect(() =>
      makeEntity().withdrawBuyCallback({
        userAddress,
        callbackAddress: otherUserAddress,
        positionData: makePosition(marketParams, { supplyShares: -1n }),
      }),
    ).toThrow(AccrualPositionUserMismatchError);
  });

  test("withdraw preserves entity amount field names", () => {
    const positionData = makePosition(marketParams);
    for (const [amounts, ErrorClass, field] of [
      [{ assets: -1n }, NegativeInputError, "assets"],
      [{ shares: -1n }, NegativeInputError, "shares"],
      [{ assets: 0n }, NonPositiveInputError, "assets or shares"],
      [{ shares: 0n }, NonPositiveInputError, "assets or shares"],
    ] as const) {
      expect(() =>
        makeEntity().withdraw({
          userAddress,
          positionData,
          deadline: maxUint256,
          ...amounts,
        }),
      ).toThrow(expect.objectContaining({ constructor: ErrorClass, field }));
    }
  });

  test("ABI-bound supply errors now occur at handle construction", () => {
    const entity = makeEntity();
    const common = { userAddress, deadline: maxUint256 };
    expect(() => entity.supply({ ...common, assets: maxUint256 + 1n })).toThrow(
      InputExceedsMaxError,
    );
    expect(() =>
      entity.supplyCollateral({ ...common, collateralAssets: maxUint256 + 1n }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      entity.supplyCollateralBorrow({
        ...common,
        collateralAssets: maxUint256 + 1n,
        borrowAssets: 0n,
      }),
    ).toThrow(InputExceedsMaxError);
  });

  test("clock and negative amount checks retain entity precedence before eager ABI bounds", () => {
    expect(() =>
      makeEntity().supply({
        userAddress,
        assets: maxUint256 + 1n,
        deadline: 0n,
      }),
    ).toThrow(ExpiredDeadlineError);
    expect(() =>
      makeEntity().supplyCollateralBorrow({
        userAddress,
        collateralAssets: maxUint256 + 1n,
        borrowAssets: -1n,
        deadline: maxUint256,
      }),
    ).toThrow(NegativeInputError);
  });

  test("ABI-bound borrow, repay, and withdrawal errors now occur at handle construction", () => {
    const now = 1_800_000_000n;
    withChainTimestamp(now, () => {
      const entity = makeEntity();
      const common = { userAddress, deadline: now + 3_600n };
      const amount = maxUint256 + 1n;
      const positionData = makePosition(marketParams, {
        collateral: amount * 100n,
        borrowShares: amount * 2n,
        supplyShares: amount * 2n,
        lastUpdate: now,
      });
      expect(() =>
        entity.borrow({ ...common, positionData, borrowAssets: amount }),
      ).toThrow(InputExceedsMaxError);
      expect(() =>
        entity.repay({ ...common, positionData, repayAssets: amount }),
      ).toThrow(InputExceedsMaxError);
      expect(() =>
        entity.withdraw({ ...common, positionData, shares: amount }),
      ).toThrow(InputExceedsMaxError);
      const noDebtPosition = makePosition(marketParams, {
        collateral: amount * 2n,
        borrowShares: 0n,
        lastUpdate: now,
      });
      expect(() =>
        entity.withdrawCollateral({
          ...common,
          positionData: noDebtPosition,
          collateralAssets: amount,
        }),
      ).toThrow(InputExceedsMaxError);
      expect(() =>
        entity.repayWithdrawCollateral({
          ...common,
          positionData: noDebtPosition,
          repayAssets: 0n,
          collateralAssets: amount,
        }),
      ).toThrow(InputExceedsMaxError);
    });
  });

  test("eager ABI errors precede unused signatures first supplied in a later buildTx call", () => {
    const now = 1_800_000_000n;
    withChainTimestamp(now, () => {
      const entity = makeEntity();
      const common = { userAddress, deadline: now + 3_600n };
      const amount = maxUint256 + 1n;
      const positionData = makePosition(marketParams, {
        collateral: amount * 100n,
        borrowShares: amount * 2n,
        supplyShares: amount * 2n,
        lastUpdate: now,
      });
      const noDebtPosition = makePosition(marketParams, {
        collateral: amount * 2n,
        borrowShares: 0n,
        lastUpdate: now,
      });
      for (const [create, field, signatureKind] of [
        [
          () => entity.supply({ ...common, assets: amount }),
          "assets",
          "authorization",
        ],
        [
          () => entity.withdraw({ ...common, positionData, assets: amount }),
          "withdrawAssets",
          "permit",
        ],
        [
          () =>
            entity.supplyCollateral({ ...common, collateralAssets: amount }),
          "collateralAssets",
          "authorization",
        ],
        [
          () =>
            entity.borrow({ ...common, positionData, borrowAssets: amount }),
          "borrowAssets",
          "permit",
        ],
        [
          () => entity.repay({ ...common, positionData, repayAssets: amount }),
          "repayAssets",
          "authorization",
        ],
        [
          () =>
            entity.withdrawCollateral({
              ...common,
              positionData: noDebtPosition,
              collateralAssets: amount,
            }),
          "collateralAssets",
          "permit",
        ],
      ] as const) {
        const signatures = vi.fn(() => [
          {
            action: { type: signatureKind },
          } as unknown as RequirementSignature,
        ]);
        expect(() => create().buildTx(signatures())).toThrow(
          expect.objectContaining({ constructor: InputExceedsMaxError, field }),
        );
        expect(signatures).not.toHaveBeenCalled();
      }
    });
  });

  test("ABI-bound callback withdrawal errors now occur at handle construction", () => {
    const callbackAddress = "0x0000000000000000000000000000000000000042";
    const position = makePosition(marketParams);
    for (const shares of [-1n, maxUint256 + 1n]) {
      const positionData = new AccrualPosition(
        {
          user: callbackAddress,
          supplyShares: shares,
          borrowShares: 0n,
          collateral: 0n,
        },
        new Market({ ...position.market, totalSupplyShares: maxUint256 * 2n }),
      );
      expect(() =>
        makeEntity().withdrawBuyCallback({
          userAddress,
          callbackAddress,
          positionData,
        }),
      ).toThrow(shares < 0n ? NegativeInputError : InputExceedsMaxError);
    }
  });

  test("full repay with no debt fails in the shared funding stage at construction", () => {
    const now = 1_800_000_000n;
    withChainTimestamp(now, () => {
      expect(() =>
        makeEntity().repay({
          userAddress,
          positionData: makePosition(marketParams, {
            borrowShares: 0n,
            lastUpdate: now,
          }),
          repayShares: maxUint256,
          deadline: now + 3_600n,
        }),
      ).toThrow(NonPositiveInputError);
    });
  });
});
