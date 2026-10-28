import { fc, test } from "@fast-check/vitest";
import {
  type AccrualVault,
  addressesRegistry,
  MathLib,
  Vault,
} from "@morpho-org/blue-sdk";
import { decodeFunctionData, maxUint256, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import {
  addressArbitrary as address,
  amountArbitrary as amount,
  propertyDeadline as deadline,
  emptySharesPermit,
  expectVaultBundlesShareRequirements,
  marketParamsArbitrary,
  pinPropertyClock,
  referralFeeArbitrary as referralFee,
  shareAllowanceStateArbitrary,
  UINT128_MAX,
} from "../../../test/fixtures/properties.js";
import { vaultBundlesV1Abi, vaultExitBundlesV1Abi } from "../../abis.js";
import {
  MAX_ABSOLUTE_SHARE_PRICE,
  MAX_SLIPPAGE_TOLERANCE,
} from "../../helpers/constant.js";
import {
  computeVaultMaxShareAllowance,
  computeVaultMaxSharePrice,
} from "../../helpers/slippage.js";
import { vaultV1Deposit } from "./deposit.js";
import { vaultV1InKindRedeem } from "./inKindRedeem.js";
import { vaultV1MigrateToV2 } from "./migrateToV2.js";
import { vaultV1Redeem } from "./redeem.js";
import { vaultV1Withdraw } from "./withdraw.js";

const chainId = mainnet.id;
const { usdc, bundles } = addressesRegistry[chainId];
const vaultBundlesV1 = bundles?.vaultBundlesV1;
if (vaultBundlesV1 == null) throw new Error("VaultBundlesV1 is not registered");
const vaultExitBundlesV1 = bundles?.vaultExitBundlesV1;
if (vaultExitBundlesV1 == null)
  throw new Error("VaultExitBundlesV1 is not registered");
const { mulDivDown, mulDivUp } = MathLib;

const vaultState = fc.record({
  totalAssets: fc.oneof(
    fc.constant(0n),
    fc.bigInt({ min: 0n, max: UINT128_MAX }),
  ),
  totalSupply: fc.oneof(
    fc.constant(0n),
    fc.bigInt({ min: 0n, max: UINT128_MAX }),
  ),
  // MetaMorpho DECIMALS_OFFSET = 18 - asset decimals.
  decimalsOffset: fc.bigInt({ min: 0n, max: 18n }),
});
type VaultState = typeof vaultState extends fc.Arbitrary<infer T> ? T : never;

// metamorpho MetaMorpho.sol _convertToSharesWithTotals:
// assets.mulDiv(totalSupply + 10 ** DECIMALS_OFFSET, newTotalAssets + 1, rounding).
const depositShares = (assets: bigint, vault: VaultState) =>
  mulDivDown(
    assets,
    vault.totalSupply + 10n ** vault.decimalsOffset,
    vault.totalAssets + 1n,
  );
// SDK MetaMorpho share math (Vault.toShares), checked against the reference formulas; the snapshot
// is taken as already accrued at the deadline, since accrual has its own property tests.
const snapshot = (vault: VaultState) => {
  const sdkVault = new Vault({
    address: zeroAddress,
    name: "Vault",
    symbol: "V",
    asset: zeroAddress,
    decimalsOffset: vault.decimalsOffset,
    curator: zeroAddress,
    owner: zeroAddress,
    guardian: zeroAddress,
    fee: 0n,
    feeRecipient: zeroAddress,
    skimRecipient: zeroAddress,
    pendingTimelock: { value: 0n, validAt: 0n },
    pendingGuardian: { value: zeroAddress, validAt: 0n },
    pendingOwner: zeroAddress,
    timelock: 0n,
    supplyQueue: [],
    withdrawQueue: [],
    totalSupply: vault.totalSupply,
    totalAssets: vault.totalAssets,
    lastTotalAssets: vault.totalAssets,
  });
  return Object.assign(sdkVault, {
    accrueInterest: () => sdkVault,
  }) as unknown as AccrualVault;
};

// bundles VaultBundlesV1.sol vaultBundlesV1Deposit: fee = assets.mulDivDown(pct, WAD),
// shares = vault.deposit(assets - fee), require(toDeposit.mulDivUp(1e27, shares) <= maxSharePriceE27).
pinPropertyClock();

describe("vaultV1Deposit", () => {
  test.prop(
    [
      fc.record({
        gross: amount,
        referralFeePct: referralFee,
        tolerance: fc.bigInt({ min: 0n, max: MAX_SLIPPAGE_TOLERANCE }),
        vault: vaultState,
        vaultAddress: address,
        user: address,
        feeRecipient: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args match inputs and the max share price is an upper bound within tolerance",
    ({
      gross,
      referralFeePct,
      tolerance,
      vault,
      vaultAddress,
      user,
      feeRecipient,
    }) => {
      const toDeposit = gross - mulDivDown(gross, referralFeePct, MathLib.WAD);
      const shares = depositShares(toDeposit, vault);
      fc.pre(toDeposit > 0n && shares > 0n);
      const maxSharePrice = computeVaultMaxSharePrice({
        vaultData: snapshot(vault),
        deadline,
        assets: toDeposit,
        slippageTolerance: tolerance,
      });
      const transaction = vaultV1Deposit({
        vault: { chainId, address: vaultAddress, asset: usdc },
        args: {
          amount: gross,
          maxSharePrice,
          userAddress: user,
          referralFeePct,
          referralFeeRecipient: feeRecipient,
          deadline,
        },
      });
      expect(transaction.to).toBe(vaultBundlesV1);
      expect(transaction.value).toBe(0n);
      expect(
        decodeFunctionData({ abi: vaultBundlesV1Abi, data: transaction.data }),
      ).toEqual({
        functionName: "vaultBundlesV1Deposit",
        args: [
          vaultAddress,
          gross,
          maxSharePrice,
          { kind: 0, data: "0x" },
          referralFeePct,
          feeRecipient,
          deadline,
        ],
      });
      const realizedPrice = mulDivUp(toDeposit, 10n ** 27n, shares);
      expect(maxSharePrice).toBeGreaterThan(0n);
      expect(maxSharePrice).toBeLessThan(maxUint256);
      expect(maxSharePrice).toBeLessThanOrEqual(MAX_ABSOLUTE_SHARE_PRICE);
      if (realizedPrice > MAX_ABSOLUTE_SHARE_PRICE) {
        // Above the absolute cap the SDK refuses the price, so the bundle reverts by design.
        expect(maxSharePrice).toBe(MAX_ABSOLUTE_SHARE_PRICE);
        return;
      }
      expect(maxSharePrice).toBeGreaterThanOrEqual(realizedPrice);
      expect(maxSharePrice).toBeLessThanOrEqual(
        mulDivUp(realizedPrice, MathLib.WAD + tolerance, MathLib.WAD),
      );
    },
  );
});

// bundles VaultBundlesV1.sol vaultBundlesV1Migrate: exactly one of assetsWithdrawn / sharesRedeemed
// is non-zero, then require(toDeposit.mulDivUp(1e27, sharesMinted) <= maxSharePriceE27) on the target.
describe("vaultV1MigrateToV2", () => {
  test.prop(
    [
      fc.record({
        byShares: fc.boolean(),
        value: amount,
        maxSharePrice: fc.oneof(
          fc.constantFrom(1n, MathLib.RAY, MAX_ABSOLUTE_SHARE_PRICE),
          fc.bigInt({ min: 1n, max: MAX_ABSOLUTE_SHARE_PRICE }),
        ),
        referralFeePct: referralFee,
        source: address,
        target: address,
        user: address,
        feeRecipient: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args carry exactly one source leg and the target max share price",
    ({
      byShares,
      value,
      maxSharePrice,
      referralFeePct,
      source,
      target,
      user,
      feeRecipient,
    }) => {
      const transaction = vaultV1MigrateToV2({
        vault: { chainId, address: source, asset: usdc },
        args: {
          ...(byShares ? { shares: value } : { assets: value }),
          targetVault: target,
          targetAsset: usdc,
          maxSharePriceVaultV2: maxSharePrice,
          userAddress: user,
          referralFeePct,
          referralFeeRecipient: feeRecipient,
          deadline,
        },
      });
      expect(transaction.to).toBe(vaultBundlesV1);
      expect(
        decodeFunctionData({ abi: vaultBundlesV1Abi, data: transaction.data }),
      ).toEqual({
        functionName: "vaultBundlesV1Migrate",
        args: [
          source,
          target,
          byShares ? 0n : value,
          byShares ? value : 0n,
          maxSharePrice,
          emptySharesPermit,
          referralFeePct,
          feeRecipient,
          deadline,
        ],
      });
    },
  );
});

// metamorpho MetaMorpho.sol previewWithdraw rounds the burn up:
// assets.mulDivUp(totalSupply + 10 ** DECIMALS_OFFSET, newTotalAssets + 1).
const withdrawShares = (assets: bigint, vault: VaultState) =>
  mulDivUp(
    assets,
    vault.totalSupply + 10n ** vault.decimalsOffset,
    vault.totalAssets + 1n,
  );

// bundles VaultBundlesV1.sol vaultBundlesV1Withdraw(vault, assets, 0, ...): MetaMorpho.withdraw burns
// previewWithdraw(assets) from the share allowance VaultBundlesV1 holds; fee = assets.mulDivDown(pct, WAD).
describe("vaultV1Withdraw", () => {
  test.prop(
    [
      fc.record({
        rawAssets: amount,
        referralFeePct: referralFee,
        tolerance: fc.bigInt({ min: 0n, max: MAX_SLIPPAGE_TOLERANCE }),
        vault: vaultState,
        vaultAddress: address,
        user: address,
        feeRecipient: address,
        shareState: shareAllowanceStateArbitrary,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args match inputs and the share approval covers the burn within tolerance",
    async ({
      rawAssets,
      referralFeePct,
      tolerance,
      vault,
      vaultAddress,
      user,
      feeRecipient,
      shareState,
    }) => {
      fc.pre(vault.totalAssets > 0n);
      const assets = 1n + ((rawAssets - 1n) % vault.totalAssets);
      const burn = withdrawShares(assets, vault);
      const cap = computeVaultMaxShareAllowance({
        vaultData: snapshot(vault),
        deadline,
        assets,
        slippageTolerance: tolerance,
      });
      expect(cap).toBeGreaterThanOrEqual(burn);
      expect(cap).toBeLessThanOrEqual(
        mulDivUp(burn, MathLib.WAD, MathLib.WAD - tolerance),
      );
      expect(cap).toBeLessThan(maxUint256);
      await expectVaultBundlesShareRequirements({
        vault: vaultAddress,
        version: "vaultV1",
        owner: user,
        cap,
        state: shareState,
      });

      const transaction = vaultV1Withdraw({
        vault: { chainId, address: vaultAddress },
        args: {
          amount: assets,
          userAddress: user,
          referralFeePct,
          referralFeeRecipient: feeRecipient,
          deadline,
        },
      });
      expect(transaction.to).toBe(vaultBundlesV1);
      expect(transaction.value).toBe(0n);
      expect(
        decodeFunctionData({ abi: vaultBundlesV1Abi, data: transaction.data }),
      ).toEqual({
        functionName: "vaultBundlesV1Withdraw",
        args: [
          vaultAddress,
          assets,
          0n,
          emptySharesPermit,
          referralFeePct,
          feeRecipient,
          deadline,
        ],
      });
    },
  );
});

// bundles VaultBundlesV1.sol vaultBundlesV1Withdraw: require((assets == 0) != (shares == 0)); a
// redeem encodes the exact share burn, while the separate approval requirement is unlimited.
describe("vaultV1Redeem", () => {
  test.prop(
    [
      fc.record({
        shares: amount,
        referralFeePct: referralFee,
        vaultAddress: address,
        user: address,
        feeRecipient: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args set the share leg only",
    ({ shares, referralFeePct, vaultAddress, user, feeRecipient }) => {
      const transaction = vaultV1Redeem({
        vault: { chainId, address: vaultAddress },
        args: {
          shares,
          userAddress: user,
          referralFeePct,
          referralFeeRecipient: feeRecipient,
          deadline,
        },
      });
      expect(transaction.to).toBe(vaultBundlesV1);
      expect(transaction.value).toBe(0n);
      expect(
        decodeFunctionData({ abi: vaultBundlesV1Abi, data: transaction.data }),
      ).toEqual({
        functionName: "vaultBundlesV1Withdraw",
        args: [
          vaultAddress,
          0n,
          shares,
          emptySharesPermit,
          referralFeePct,
          feeRecipient,
          deadline,
        ],
      });
    },
  );
});

// bundles VaultExitBundlesV1.sol vaultExitBundlesV1InKindRedemptionVaultV1: flash-loans exitAssets,
// supplies them on behalf of the sender across marketParamsList, then MetaMorpho.withdraw(exitAssets);
// no share-price check, the share allowance given to VaultExitBundlesV1 bounds the burn.
describe("vaultV1InKindRedeem", () => {
  test.prop(
    [
      fc.record({
        exitAssets: amount,
        marketParamsList: fc.array(marketParamsArbitrary, {
          minLength: 1,
          maxLength: 4,
        }),
        vaultAddress: address,
        user: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args carry the vault, every market and the exit amount",
    ({ exitAssets, marketParamsList, vaultAddress, user }) => {
      const transaction = vaultV1InKindRedeem({
        vault: { chainId, address: vaultAddress },
        args: {
          amount: exitAssets,
          marketParamsList,
          userAddress: user,
          deadline,
        },
      });
      expect(transaction.to).toBe(vaultExitBundlesV1);
      expect(transaction.value).toBe(0n);
      expect(
        decodeFunctionData({
          abi: vaultExitBundlesV1Abi,
          data: transaction.data,
        }),
      ).toEqual({
        functionName: "vaultExitBundlesV1InKindRedemptionVaultV1",
        args: [
          vaultAddress,
          marketParamsList,
          exitAssets,
          emptySharesPermit,
          deadline,
        ],
      });
    },
  );
});
