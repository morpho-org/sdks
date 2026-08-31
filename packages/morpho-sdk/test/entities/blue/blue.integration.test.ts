import {
  AccrualPosition,
  Market,
  MarketParams,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, maxUint256, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { morphoViemExtension } from "../../../src/client/index.js";
import {
  isRequirementApproval,
  isRequirementBlueAuthorization,
} from "../../../src/types/index.js";
import { CbbtcUsdcBlue, WstethWethBlue } from "../../fixtures/blue.js";
import { test } from "../../setup.js";

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

describe("MorphoBlue validation", () => {
  test("withdraw getRequirements includes Blue authorization when missing", async ({
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
        deadline: maxUint256,
      })
      .getRequirements();

    expect(requirements).toHaveLength(1);
    const authorization = requirements.find(isRequirementBlueAuthorization);
    expect(authorization?.action.args.authorized).toBe(
      getChainAddress(mainnet.id, "bundles.blueBundlesV1"),
    );
  });

  test("repayWithdrawCollateral getRequirements includes Blue authorization when missing", async ({
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

  test("repayWithdrawCollateral native: shares mode funded entirely by native emits no ERC-20 requirement", async ({
    client,
  }) => {
    const market = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.blue(WstethWethBlue, mainnet.id);
    const positionData = makeWethPosition();

    // Native covers the full borrow assets (rate-less fixture ⇒ accrual no-op),
    // so no ERC-20 is pulled; the bundle wraps the native and skims the residual.
    const borrowAssets = positionData.market.toBorrowAssets(
      positionData.borrowShares,
      "Up",
    );
    const nativeAmount = borrowAssets + parseUnits("1", 18);

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
    // ERC-20 pulled is 0 ⇒ the total routed to the adapter is the wrapped native only.
    expect(tx.action.args.transferAmount).toBe(nativeAmount);

    // No ERC-20 pulled ⇒ only the Morpho authorization requirement remains.
    expect(await action.getRequirements()).toHaveLength(1);
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
});
