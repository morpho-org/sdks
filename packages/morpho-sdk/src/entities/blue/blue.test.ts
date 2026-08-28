import {
  AccrualPosition,
  DEFAULT_SLIPPAGE_TOLERANCE,
  getChainAddresses,
  Market,
  MarketParams,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  type Address,
  createPublicClient,
  erc20Abi,
  http,
  maxUint256,
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { CbbtcUsdcBlue, WstethWethBlue } from "../../../test/fixtures/blue.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { test as unitTest } from "../../../test/unit.js";
import { morphoViemExtension } from "../../client/index.js";
import { computeMaxRepaySharePrice } from "../../helpers/index.js";
import {
  ExpiredDeadlineError,
  MutuallyExclusiveRepayAmountsError,
  NativeAmountOnNonWNativeAssetError,
  NegativeInputError,
  NonPositiveInputError,
  WithdrawExceedsCollateralError,
} from "../../types/index.js";
import { VaultV1ReallocationData } from "../vaultV1ReallocationData.js";

const MARKET_PARAMS = new MarketParams(CbbtcUsdcBlue);
const USER: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const RATE_AT_TARGET = 3_170_979_198n;
const NOW_SEC = 1_800_000_000n;

function makeStalePosition(supplyShares = 0n) {
  const market = new Market({
    params: MARKET_PARAMS,
    totalSupplyAssets: 10n ** 24n,
    totalBorrowAssets: 10n ** 24n / 2n,
    totalSupplyShares: 10n ** 24n,
    totalBorrowShares: 10n ** 24n / 2n,
    lastUpdate: NOW_SEC - 5n * 24n * 3_600n,
    fee: 0n,
    price: ORACLE_PRICE_SCALE,
    rateAtTarget: RATE_AT_TARGET,
  });

  return new AccrualPosition(
    {
      user: USER,
      supplyShares,
      borrowShares: 10n ** 18n,
      collateral: 10n ** 24n,
    },
    market,
  );
}

function makePosition(
  overrides: {
    collateral?: bigint;
    borrowShares?: bigint;
    supplyShares?: bigint;
  } = {},
) {
  const market = new Market({
    params: MARKET_PARAMS,
    totalSupplyAssets: 10n ** 24n,
    totalBorrowAssets: 10n ** 24n / 2n,
    totalSupplyShares: 10n ** 24n,
    totalBorrowShares: 10n ** 24n / 2n,
    lastUpdate: 1_700_000_000n,
    fee: 0n,
    price: ORACLE_PRICE_SCALE,
  });

  return new AccrualPosition(
    {
      user: USER,
      supplyShares: overrides.supplyShares ?? 0n,
      borrowShares: overrides.borrowShares ?? 10n ** 18n,
      collateral: overrides.collateral ?? 10n ** 24n,
    },
    market,
  );
}

function makeWethPosition(
  overrides: { collateral?: bigint; borrowShares?: bigint } = {},
) {
  const market = new Market({
    params: new MarketParams(WstethWethBlue),
    totalSupplyAssets: 10n ** 24n,
    totalBorrowAssets: 10n ** 24n / 2n,
    totalSupplyShares: 10n ** 24n,
    totalBorrowShares: 10n ** 24n / 2n,
    lastUpdate: 1_700_000_000n,
    fee: 0n,
    price: ORACLE_PRICE_SCALE,
  });

  return new AccrualPosition(
    {
      user: USER,
      supplyShares: 0n,
      borrowShares: overrides.borrowShares ?? 10n ** 18n,
      collateral: overrides.collateral ?? 10n ** 24n,
    },
    market,
  );
}

const noRpcClient = createPublicClient({ chain: mainnet, transport: http() });

// Regression: the SDK no longer enforces builder = signer on MorphoBlue
// transaction builders. A divergent userAddress and a client with no connected
// account must still produce a valid tx.
describe("MorphoBlue builder = signer freedom", () => {
  const OTHER_USER: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  unitTest(
    "supplyCollateral: builds tx with userAddress different from client.account",
    async ({ client }) => {
      const morphoClient = client.extend(morphoViemExtension()).morpho;
      const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);

      const supplyCollateral = market.supplyCollateral({
        userAddress: OTHER_USER,
        amount: parseUnits("1", 18),
      });

      const tx = supplyCollateral.buildTx();
      expect(tx.action.args.onBehalf).toBe(OTHER_USER);
    },
  );

  test("supplyCollateral: builds tx with public client (no account)", () => {
    const morphoClient = noRpcClient.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);

    const supplyCollateral = market.supplyCollateral({
      userAddress: OTHER_USER,
      amount: parseUnits("1", 18),
    });

    const tx = supplyCollateral.buildTx();
    expect(tx.action.args.onBehalf).toBe(OTHER_USER);
  });
});

describe("MorphoBlue validation", () => {
  test("supplyCollateral rejects invalid amounts", () => {
    const market = noRpcClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.supplyCollateral({ userAddress: USER, amount: -1n }),
    ).toThrow(NegativeInputError);
    expect(() =>
      market.supplyCollateral({
        userAddress: USER,
        amount: 0n,
        nativeAmount: -1n,
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      market.supplyCollateral({ userAddress: USER, amount: 0n }),
    ).toThrow(NonPositiveInputError);
  });

  test("borrow rejects non-positive amounts", () => {
    const market = noRpcClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.borrow({
        amount: 0n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("repay rejects conflicting and non-positive repay amounts", () => {
    const market = noRpcClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.repay({
        amount: 1n,
        shares: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(MutuallyExclusiveRepayAmountsError);
    expect(() =>
      market.repay({
        amount: -1n,
        shares: 1n,
        userAddress: USER,
        positionData: makePosition(),
      } as never),
    ).toThrow(NegativeInputError);
    expect(() =>
      market.repay({
        shares: 0n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      market.repay({
        shares: -1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NegativeInputError);
    // Assets mode: a negative amount must not be masked by nativeAmount.
    expect(() =>
      market.repay({
        amount: -1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NegativeInputError);
  });

  test("repayWithdrawCollateral rejects conflicting repay modes and excessive collateral withdrawal", () => {
    const market = noRpcClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.repayWithdrawCollateral({
        amount: 1n,
        shares: 1n,
        withdrawAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(MutuallyExclusiveRepayAmountsError);
    expect(() =>
      market.repayWithdrawCollateral({
        amount: -1n,
        shares: 1n,
        withdrawAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      } as never),
    ).toThrow(NegativeInputError);
    expect(() =>
      market.repayWithdrawCollateral({
        shares: 0n,
        withdrawAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      market.repayWithdrawCollateral({
        shares: -1n,
        withdrawAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NegativeInputError);
    // Assets mode: a negative amount must not be masked by nativeAmount.
    expect(() =>
      market.repayWithdrawCollateral({
        amount: -1n,
        withdrawAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      market.repayWithdrawCollateral({
        amount: 1n,
        withdrawAmount: 2n,
        userAddress: USER,
        positionData: makePosition({ collateral: 1n }),
      }),
    ).toThrow(WithdrawExceedsCollateralError);
  });

  test("repay native: rejects nativeAmount when the loan token is not wNative", () => {
    const market = noRpcClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id); // loan token = USDC

    expect(() =>
      market.repay({
        amount: 1n,
        nativeAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NativeAmountOnNonWNativeAssetError);
  });

  test("repay native: assets mode wraps native and repays amount + nativeAmount", () => {
    const market = noRpcClient
      .extend(morphoViemExtension())
      .morpho.blue(WstethWethBlue, mainnet.id);
    const amount = parseUnits("0.3", 18);
    const nativeAmount = parseUnits("0.2", 18);

    const tx = market
      .repay({
        amount,
        nativeAmount,
        userAddress: USER,
        positionData: makeWethPosition(),
      })
      .buildTx();

    expect(tx.action.args.assets).toBe(amount + nativeAmount);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
  });

  test("repay native: a fully native repay emits no ERC-20 requirement", async () => {
    const { client } = createMockClient(mainnet);
    const market = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(WstethWethBlue, mainnet.id);
    const nativeAmount = parseUnits("0.5", 18);

    const requirements = await market
      .repay({
        nativeAmount,
        userAddress: USER,
        positionData: makeWethPosition(),
      })
      .getRequirements();

    expect(requirements).toEqual([]);
  });

  test("repay native: shares mode funded entirely by native emits no ERC-20 requirement", async () => {
    const { client } = createMockClient(mainnet);
    const market = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(WstethWethBlue, mainnet.id);
    const positionData = makeWethPosition();

    // Native covers the full (rate-less fixture ⇒ accrual is a no-op) borrow
    // assets and then some: no ERC-20 is pulled and the bundle wraps the native,
    // skimming the residual wNative back to the receiver.
    const borrowAssets = positionData.market.toBorrowAssets(
      positionData.borrowShares,
      "Up",
    );
    const nativeAmount = borrowAssets + parseUnits("1", 18);

    const repay = market.repay({
      shares: positionData.borrowShares,
      nativeAmount,
      userAddress: USER,
      positionData,
    });

    const tx = repay.buildTx();
    expect(tx.action.args.shares).toBe(positionData.borrowShares);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
    // ERC-20 pulled is 0 ⇒ the total routed to the adapter is the wrapped native only.
    expect(tx.action.args.transferAmount).toBe(nativeAmount);

    // Fully-native repay pulls no ERC-20 ⇒ no approval/permit requirement.
    expect(await repay.getRequirements()).toEqual([]);
  });

  test("repayWithdrawCollateral native: rejects nativeAmount when the loan token is not wNative", () => {
    const market = noRpcClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id); // loan token = USDC

    expect(() =>
      market.repayWithdrawCollateral({
        amount: 1n,
        nativeAmount: 1n,
        withdrawAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NativeAmountOnNonWNativeAssetError);
  });

  test("repayWithdrawCollateral native: assets mode wraps native and repays amount + nativeAmount", () => {
    const market = noRpcClient
      .extend(morphoViemExtension())
      .morpho.blue(WstethWethBlue, mainnet.id);
    const amount = parseUnits("0.3", 18);
    const nativeAmount = parseUnits("0.2", 18);

    const tx = market
      .repayWithdrawCollateral({
        amount,
        nativeAmount,
        withdrawAmount: parseUnits("1", 18),
        userAddress: USER,
        positionData: makeWethPosition(),
      })
      .buildTx();

    expect(tx.action.args.repayAssets).toBe(amount + nativeAmount);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
  });

  test("supplyCollateralBorrow rejects invalid collateral and borrow amounts", () => {
    const market = noRpcClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.supplyCollateralBorrow({
        amount: -1n,
        borrowAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      market.supplyCollateralBorrow({
        amount: 0n,
        nativeAmount: -1n,
        borrowAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NegativeInputError);
    expect(() =>
      market.supplyCollateralBorrow({
        amount: 1n,
        borrowAmount: 0n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveInputError);
    expect(() =>
      market.supplyCollateralBorrow({
        amount: 0n,
        borrowAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("getVaultV1Reallocations accepts the operation/amount parameter shape", () => {
    const market = noRpcClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    expect(
      market.getVaultV1Reallocations({
        reallocationData: new VaultV1ReallocationData({ chainId: mainnet.id }),
        operation: "borrow",
        amount: 1n,
        options: { enabled: false },
      }),
    ).toEqual([]);
  });
});

describe("MorphoBlue repay maxSharePrice forward-accrual (VAU-1206)", () => {
  const TWO_HOURS = 7_200n;

  const localClient = createPublicClient({ chain: mainnet, transport: http() });

  test("repay assets mode derives maxSharePrice from the forward-accrued market", () => {
    const positionData = makeStalePosition();
    const market = localClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const amount = parseUnits("1000", 6);

    const tx = withChainTimestamp(NOW_SEC, () =>
      market.repay({ amount, userAddress: USER, positionData }).buildTx(),
    );

    const accruedMarket = positionData.market.accrueInterest(
      NOW_SEC + TWO_HOURS,
    );
    const expected = computeMaxRepaySharePrice({
      repayAssets: amount,
      repayShares: 0n,
      market: accruedMarket,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });
    const stale = computeMaxRepaySharePrice({
      repayAssets: amount,
      repayShares: 0n,
      market: positionData.market,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });

    expect(tx.action.args.maxSharePrice).toBe(expected);
    expect(tx.action.args.maxSharePrice).toBeGreaterThan(stale);
  });

  test("repayWithdrawCollateral assets mode derives maxSharePrice from the forward-accrued market", () => {
    const positionData = makeStalePosition();
    const market = localClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const amount = parseUnits("1000", 6);

    const tx = withChainTimestamp(NOW_SEC, () =>
      market
        .repayWithdrawCollateral({
          amount,
          withdrawAmount: 1n,
          userAddress: USER,
          positionData,
        })
        .buildTx(),
    );

    const accruedMarket = positionData.market.accrueInterest(
      NOW_SEC + TWO_HOURS,
    );
    const expected = computeMaxRepaySharePrice({
      repayAssets: amount,
      repayShares: 0n,
      market: accruedMarket,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });
    const stale = computeMaxRepaySharePrice({
      repayAssets: amount,
      repayShares: 0n,
      market: positionData.market,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });

    expect(tx.action.args.maxSharePrice).toBe(expected);
    expect(tx.action.args.maxSharePrice).toBeGreaterThan(stale);
  });
});

describe("MorphoBlue requirements", () => {
  test("supply and withdraw target BlueBundlesV1 requirements", async () => {
    const handle = createMockClient(mainnet);
    const { morpho } = getChainAddresses(mainnet.id);
    const blueBundlesV1 = getChainAddress(mainnet.id, "bundles.blueBundlesV1");
    mockRead(handle, {
      address: MARKET_PARAMS.loanToken,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    mockRead(handle, {
      address: morpho,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: false,
    });
    const market = handle.client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    const supplyRequirements = await market
      .supply({
        assets: 1n,
        userAddress: USER,
        deadline: maxUint256,
      })
      .getRequirements();
    const withdrawRequirements = await market
      .withdraw({
        assets: 1n,
        userAddress: USER,
        positionData: makeStalePosition(10n ** 18n),
        deadline: maxUint256,
      })
      .getRequirements();

    expect(supplyRequirements).toMatchObject([
      {
        action: {
          type: "erc20Approval",
          args: { spender: blueBundlesV1 },
        },
      },
    ]);
    expect(withdrawRequirements).toMatchObject([
      {
        action: {
          type: "blueAuthorization",
          args: { authorized: blueBundlesV1, isAuthorized: true },
        },
      },
    ]);
  });

  test("supply and withdraw reject expired deadlines", () => {
    const market = noRpcClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.supply({
        assets: 1n,
        userAddress: USER,
        deadline: 1n,
      }),
    ).toThrow(ExpiredDeadlineError);
    expect(() =>
      market.withdraw({
        assets: 1n,
        userAddress: USER,
        positionData: makeStalePosition(10n ** 18n),
        deadline: 1n,
      }),
    ).toThrow(ExpiredDeadlineError);
  });

  test("supply revalidates its deadline before resolving requirements", () => {
    const market = noRpcClient
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);
    const action = withChainTimestamp(NOW_SEC, () =>
      market.supply({
        assets: 1n,
        userAddress: USER,
        deadline: NOW_SEC + 1n,
      }),
    );

    expect(() =>
      withChainTimestamp(NOW_SEC + 1n, () => action.getRequirements()),
    ).toThrow(ExpiredDeadlineError);
  });
});
