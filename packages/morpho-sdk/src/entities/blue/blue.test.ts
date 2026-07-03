import {
  AccrualPosition,
  getChainAddresses,
  Market,
  MarketParams,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { type Address, createPublicClient, http, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { CbbtcUsdcBlue, WstethWethBlue } from "../../../test/fixtures/blue.js";
import { test } from "../../../test/setup.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  isRequirementApproval,
  MutuallyExclusiveRepayAmountsError,
  NativeAmountExceedsTransferAmountError,
  NativeAmountOnNonWNativeAssetError,
  NegativeNativeAmountError,
  NonPositiveAssetAmountError,
  NonPositiveBorrowAmountError,
  NonPositiveRepayAmountError,
  WithdrawExceedsCollateralError,
  ZeroCollateralAmountError,
} from "../../types/index.js";
import { ReallocationData } from "../reallocationData.js";

const MARKET_PARAMS = new MarketParams(CbbtcUsdcBlue);
const USER: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

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

// Position on a market whose loan token is wNative (WETH), for native-wrap repays.
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

// Regression: the SDK no longer enforces builder = signer on MorphoBlue
// transaction builders. A divergent userAddress and a client with no connected
// account must still produce a valid tx.
describe("MorphoBlue builder = signer freedom", () => {
  const OTHER_USER: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  test("supplyCollateral: builds tx with userAddress different from client.account", async ({
    client,
  }) => {
    const morphoClient = client.extend(morphoViemExtension()).morpho;
    const market = morphoClient.blue(CbbtcUsdcBlue, mainnet.id);

    const supplyCollateral = market.supplyCollateral({
      userAddress: OTHER_USER,
      amount: parseUnits("1", 18),
    });

    const tx = supplyCollateral.buildTx();
    expect(tx.action.args.onBehalf).toBe(OTHER_USER);
  });

  test("supplyCollateral: builds tx with public client (no account)", async ({
    client,
  }) => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http(client.transport.url),
    });
    const morphoClient = publicClient.extend(morphoViemExtension()).morpho;
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
  test("supplyCollateral rejects invalid amounts", async ({ client }) => {
    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.supplyCollateral({ userAddress: USER, amount: -1n }),
    ).toThrow(NonPositiveAssetAmountError);
    expect(() =>
      market.supplyCollateral({
        userAddress: USER,
        amount: 0n,
        nativeAmount: -1n,
      }),
    ).toThrow(NegativeNativeAmountError);
    expect(() =>
      market.supplyCollateral({ userAddress: USER, amount: 0n }),
    ).toThrow(ZeroCollateralAmountError);
  });

  test("borrow rejects non-positive amounts", async ({ client }) => {
    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.borrow({
        amount: 0n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveBorrowAmountError);
  });

  test("withdraw getRequirements includes Morpho authorization when missing", async ({
    client,
  }) => {
    const market = client
      .extend(
        morphoViemExtension({
          supportSignature: false,
        }),
      )
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    const requirements = await market
      .withdraw({
        assets: 1n,
        userAddress: USER,
        positionData: makePosition({ supplyShares: 10n ** 18n }),
      })
      .getRequirements();

    expect(requirements).toHaveLength(1);
  });

  test("withdraw getRequirements returns no authorization when already authorized", async () => {
    const handle = createMockClient(mainnet);
    const { morpho } = getChainAddresses(mainnet.id);
    mockRead(handle, {
      address: morpho,
      abi: blueAbi,
      functionName: "isAuthorized",
      result: true,
    });
    const market = handle.client
      .extend(
        morphoViemExtension({
          supportSignature: false,
        }),
      )
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    const requirements = await market
      .withdraw({
        assets: 1n,
        userAddress: USER,
        positionData: makePosition({ supplyShares: 10n ** 18n }),
      })
      .getRequirements();

    expect(requirements).toEqual([]);
  });

  test("repay rejects conflicting and non-positive repay amounts", async ({
    client,
  }) => {
    const market = client
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
        shares: 0n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveRepayAmountError);
    // Assets mode: a negative amount must not be masked by nativeAmount.
    expect(() =>
      market.repay({
        amount: -1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveRepayAmountError);
  });

  test("repayWithdrawCollateral rejects conflicting repay modes and excessive collateral withdrawal", async ({
    client,
  }) => {
    const market = client
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
        shares: 0n,
        withdrawAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveRepayAmountError);
    // Assets mode: a negative amount must not be masked by nativeAmount.
    expect(() =>
      market.repayWithdrawCollateral({
        amount: -1n,
        withdrawAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveRepayAmountError);
    expect(() =>
      market.repayWithdrawCollateral({
        amount: 1n,
        withdrawAmount: 2n,
        userAddress: USER,
        positionData: makePosition({ collateral: 1n }),
      }),
    ).toThrow(WithdrawExceedsCollateralError);
  });

  test("repayWithdrawCollateral getRequirements includes Morpho authorization when missing", async ({
    client,
  }) => {
    const market = client
      .extend(
        morphoViemExtension({
          supportSignature: false,
        }),
      )
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    const requirements = await market
      .repayWithdrawCollateral({
        amount: 1n,
        withdrawAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      })
      .getRequirements();

    expect(requirements).toHaveLength(2);
  });

  test("repay native: rejects nativeAmount when the loan token is not wNative", async ({
    client,
  }) => {
    const market = client
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

  test("repay native: assets mode wraps native and repays amount + nativeAmount", async ({
    client,
  }) => {
    const market = client
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

  test("repay native: a fully native repay emits no ERC-20 requirement", async ({
    client,
  }) => {
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

  test("repay native: shares mode rejects nativeAmount exceeding the computed transfer", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(WstethWethBlue, mainnet.id);

    expect(() =>
      market.repay({
        shares: 10n ** 12n,
        nativeAmount: parseUnits("1000000", 18),
        userAddress: USER,
        positionData: makeWethPosition(),
      }),
    ).toThrow(NativeAmountExceedsTransferAmountError);
  });

  test("repay native: shares mode pulls transferAmount net of native (happy path)", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(WstethWethBlue, mainnet.id);
    const positionData = makeWethPosition();
    const nativeAmount = parseUnits("0.1", 18);

    // The entity carves native out of the shares repay: it converts shares to
    // assets (2h forward-accrued) and pulls only `borrowAssets - nativeAmount` as
    // ERC-20. This fixture has no rateAtTarget, so accrual is a no-op and
    // borrowAssets is exactly toBorrowAssets(shares, "Up") on the snapshot.
    const borrowAssets = positionData.market.toBorrowAssets(
      positionData.borrowShares,
      "Up",
    );
    const expectedErc20 = borrowAssets - nativeAmount;

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
    // Action transferAmount is the total routed = ERC-20 (net of native) + wrapped
    // native = borrowAssets; the carved ERC-20 is transferAmount - nativeAmount.
    expect(tx.action.args.transferAmount).toBe(borrowAssets);
    expect(tx.action.args.transferAmount - nativeAmount).toBe(expectedErc20);

    // getRequirements approves exactly the carved ERC-20 remainder, not the debt.
    const requirements = await repay.getRequirements();
    const approval = requirements.find(isRequirementApproval);
    if (!approval) {
      throw new Error("Approval requirement not found");
    }
    expect(approval.action.args.amount).toBe(expectedErc20);
  });

  test("repayWithdrawCollateral native: rejects nativeAmount when the loan token is not wNative", async ({
    client,
  }) => {
    const market = client
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

  test("repayWithdrawCollateral native: assets mode wraps native and repays amount + nativeAmount", async ({
    client,
  }) => {
    const market = client
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

  test("repayWithdrawCollateral native: a fully native repay emits no ERC-20 requirement", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(WstethWethBlue, mainnet.id);
    const nativeAmount = parseUnits("0.5", 18);

    const requirements = await market
      .repayWithdrawCollateral({
        nativeAmount,
        withdrawAmount: parseUnits("1", 18),
        userAddress: USER,
        positionData: makeWethPosition(),
      })
      .getRequirements();

    // Fully-native repay pulls no ERC-20 → only the Morpho authorization remains.
    expect(requirements).toHaveLength(1);
  });

  test("repayWithdrawCollateral native: shares mode rejects nativeAmount exceeding the computed transfer", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(WstethWethBlue, mainnet.id);

    expect(() =>
      market.repayWithdrawCollateral({
        shares: 10n ** 12n,
        nativeAmount: parseUnits("1000000", 18),
        withdrawAmount: parseUnits("1", 18),
        userAddress: USER,
        positionData: makeWethPosition(),
      }),
    ).toThrow(NativeAmountExceedsTransferAmountError);
  });

  test("repayWithdrawCollateral native: shares mode pulls transferAmount net of native (happy path)", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(WstethWethBlue, mainnet.id);
    const positionData = makeWethPosition();
    const nativeAmount = parseUnits("0.1", 18);

    // Same carve-out as repay: ERC-20 pulled = borrowAssets - nativeAmount, and
    // accrual is a no-op on this rate-less fixture so borrowAssets is exact.
    const borrowAssets = positionData.market.toBorrowAssets(
      positionData.borrowShares,
      "Up",
    );
    const expectedErc20 = borrowAssets - nativeAmount;

    const action = market.repayWithdrawCollateral({
      shares: positionData.borrowShares,
      nativeAmount,
      withdrawAmount: positionData.collateral,
      userAddress: USER,
      positionData,
    });

    const tx = action.buildTx();
    expect(tx.action.args.repayShares).toBe(positionData.borrowShares);
    expect(tx.action.args.nativeAmount).toBe(nativeAmount);
    expect(tx.value).toBe(nativeAmount);
    // Action transferAmount is the total routed = ERC-20 (net of native) + wrapped
    // native = borrowAssets; the carved ERC-20 is transferAmount - nativeAmount.
    expect(tx.action.args.transferAmount).toBe(borrowAssets);
    expect(tx.action.args.transferAmount - nativeAmount).toBe(expectedErc20);

    // getRequirements approves exactly the carved ERC-20 remainder (alongside the
    // Morpho authorization the withdraw leg needs).
    const requirements = await action.getRequirements();
    const approval = requirements.find(isRequirementApproval);
    if (!approval) {
      throw new Error("Approval requirement not found");
    }
    expect(approval.action.args.amount).toBe(expectedErc20);
  });

  test("supplyCollateralBorrow rejects invalid collateral and borrow amounts", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    expect(() =>
      market.supplyCollateralBorrow({
        amount: -1n,
        borrowAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveAssetAmountError);
    expect(() =>
      market.supplyCollateralBorrow({
        amount: 0n,
        nativeAmount: -1n,
        borrowAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NegativeNativeAmountError);
    expect(() =>
      market.supplyCollateralBorrow({
        amount: 1n,
        borrowAmount: 0n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(NonPositiveBorrowAmountError);
    expect(() =>
      market.supplyCollateralBorrow({
        amount: 0n,
        borrowAmount: 1n,
        userAddress: USER,
        positionData: makePosition(),
      }),
    ).toThrow(ZeroCollateralAmountError);
  });

  test("getReallocations accepts the operation/amount parameter shape", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension())
      .morpho.blue(CbbtcUsdcBlue, mainnet.id);

    expect(
      market.getReallocations({
        reallocationData: new ReallocationData({ chainId: mainnet.id }),
        operation: "borrow",
        amount: 1n,
        options: { enabled: false },
      }),
    ).toEqual([]);
  });
});
