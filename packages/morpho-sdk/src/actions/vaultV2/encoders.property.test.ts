import { fc, test } from "@fast-check/vitest";
import {
  addressesRegistry,
  MarketParams,
  MathLib,
  marketParamsAbi,
} from "@morpho-org/blue-sdk";
import { vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import { decodeFunctionData, encodeAbiParameters, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { inKindVaultV2Data } from "../../../test/fixtures/inKindRedeem.js";
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
  computeMinForceWithdrawSharePrice,
  computeVaultMaxShareAllowance,
  computeVaultMaxSharePrice,
} from "../../helpers/slippage.js";
import { vaultV2Deposit } from "./deposit.js";
import { vaultV2ForceRedeem } from "./forceRedeem.js";
import { vaultV2ForceWithdraw } from "./forceWithdraw.js";
import { vaultV2InKindRedeem } from "./inKindRedeem.js";
import { vaultV2Redeem } from "./redeem.js";
import { vaultV2Withdraw } from "./withdraw.js";

const chainId = mainnet.id;
const { usdc, bundles } = addressesRegistry[chainId];
const vaultBundlesV1 = bundles?.vaultBundlesV1;
if (vaultBundlesV1 == null) throw new Error("VaultBundlesV1 is not registered");

const slippageTolerance = fc.oneof(
  fc.constantFrom(0n, MAX_SLIPPAGE_TOLERANCE),
  fc.bigInt({ min: 0n, max: MAX_SLIPPAGE_TOLERANCE }),
);
const vaultState = fc.record({
  totalAssets: fc.oneof(
    fc.constant(0n),
    fc.bigInt({ min: 0n, max: UINT128_MAX }),
  ),
  totalSupply: fc.oneof(
    fc.constant(0n),
    fc.bigInt({ min: 0n, max: UINT128_MAX }),
  ),
  // Vault V2 virtual shares: 10 ** max(0, 18 - asset decimals).
  decimalsOffset: fc.bigInt({ min: 0n, max: 18n }),
  // vault-v2 ConstantsLib.sol MAX_MANAGEMENT_FEE = 0.05e18 / 365 days.
  managementFee: fc.oneof(
    fc.constant(0n),
    fc.bigInt({ min: 0n, max: 50_000_000_000_000_000n / 31_536_000n }),
  ),
});
type VaultState = typeof vaultState extends fc.Arbitrary<infer T> ? T : never;

const { mulDivDown, mulDivUp } = MathLib;

// VaultV2.sol previewDeposit / previewWithdraw at an already-accrued state:
// assets.mulDiv{Down,Up}(totalSupply + virtualShares, newTotalAssets + 1).
const previewDepositShares = (assets: bigint, vault: VaultState) =>
  mulDivDown(
    assets,
    vault.totalSupply + 10n ** vault.decimalsOffset,
    vault.totalAssets + 1n,
  );
const previewWithdrawShares = (assets: bigint, vault: VaultState) =>
  mulDivUp(
    assets,
    vault.totalSupply + 10n ** vault.decimalsOffset,
    vault.totalAssets + 1n,
  );

// A real AccrualVaultV2 (so the helpers take their Vault V2 branch) holding only idle assets: with
// a management fee, accruing to the deadline mints fee shares at unchanged assets, so the accrued
// endpoint previews more shares per asset than the current one.
const snapshot = (vault: VaultState) =>
  inKindVaultV2Data({
    adapters: "empty",
    totalAssets: vault.totalAssets,
    totalSupply: vault.totalSupply,
    virtualShares: 10n ** vault.decimalsOffset,
    assetBalance: vault.totalAssets,
    managementFee: vault.managementFee,
  });
const accrued = (snap: ReturnType<typeof snapshot>) =>
  snap.accrueInterest(MathLib.max(deadline, snap.lastUpdate)).vault;

// bundles VaultBundlesV1.sol vaultBundlesV1Deposit: fee = assets.mulDivDown(pct, WAD),
// shares = vault.deposit(assets - fee), require(toDeposit.mulDivUp(1e27, shares) <= maxSharePriceE27).
pinPropertyClock();

describe("vaultV2Deposit", () => {
  test.prop(
    [
      fc.record({
        amount,
        referralFeePct: referralFee,
        tolerance: slippageTolerance,
        vault: vaultState,
        vaultAddress: address,
        recipient: address,
        feeRecipient: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args match inputs and the snapshot-derived max share price admits the snapshot price below the absolute cap",
    ({
      amount: gross,
      referralFeePct,
      tolerance,
      vault,
      vaultAddress,
      recipient,
      feeRecipient,
    }) => {
      const toDeposit = gross - mulDivDown(gross, referralFeePct, MathLib.WAD);
      const shares = previewDepositShares(toDeposit, vault);
      fc.pre(toDeposit > 0n && shares > 0n);
      const snap = snapshot(vault);
      const maxSharePrice = computeVaultMaxSharePrice({
        vaultData: snap,
        deadline,
        assets: toDeposit,
        slippageTolerance: tolerance,
      });
      const transaction = vaultV2Deposit({
        vault: { chainId, address: vaultAddress, asset: usdc },
        args: {
          amount: gross,
          maxSharePrice,
          userAddress: recipient,
          referralFeePct,
          referralFeeRecipient: feeRecipient,
          deadline,
        },
      });

      expect(transaction.to).toBe(vaultBundlesV1);
      expect(transaction.value).toBe(0n);
      expect(transaction.action.args.netAssets).toBe(toDeposit);
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
      // The accrued endpoint prices no higher, so the bound covers the whole [now, deadline] window.
      expect(accrued(snap).toShares(toDeposit, "Down")).toBeGreaterThanOrEqual(
        shares,
      );
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

// VaultV2.sol withdraw burns previewWithdraw(assets) shares from the allowance VaultBundlesV1 holds.
describe("vaultV2Withdraw", () => {
  test.prop(
    [
      fc.record({
        amount,
        referralFeePct: referralFee,
        tolerance: slippageTolerance,
        vault: vaultState,
        vaultAddress: address,
        recipient: address,
        feeRecipient: address,
        shareState: shareAllowanceStateArbitrary,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: the unlimited share approval covers the burn and targets VaultBundlesV1",
    async ({
      amount: rawAssets,
      referralFeePct,
      tolerance,
      vault,
      vaultAddress,
      recipient,
      feeRecipient,
      shareState,
    }) => {
      // Draw assets in [1, totalAssets]: a withdrawal cannot exceed the vault's assets.
      const assets =
        1n + (rawAssets % (vault.totalAssets === 0n ? 1n : vault.totalAssets));
      fc.pre(assets <= vault.totalAssets);
      const burn = previewWithdrawShares(assets, vault);
      const snap = snapshot(vault);
      const cap = computeVaultMaxShareAllowance({
        vaultData: snap,
        deadline,
        assets,
        slippageTolerance: tolerance,
      });
      const accruedBurn = accrued(snap).toShares(assets, "Up");
      expect(accruedBurn).toBeGreaterThanOrEqual(burn);
      expect(cap).toBeGreaterThanOrEqual(accruedBurn);
      expect(cap).toBeLessThanOrEqual(
        mulDivUp(accruedBurn, MathLib.WAD, MathLib.WAD - tolerance),
      );
      expect(cap).toBeLessThan(maxUint256);

      await expectVaultBundlesShareRequirements({
        vault: vaultAddress,
        version: "vaultV2",
        owner: recipient,
        cap,
        state: shareState,
      });

      const transaction = vaultV2Withdraw({
        vault: { chainId, address: vaultAddress },
        args: {
          amount: assets,
          userAddress: recipient,
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

// VaultBundlesV1.sol vaultBundlesV1Withdraw: require((assets == 0) != (shares == 0)).
describe("vaultV2Redeem", () => {
  test.prop(
    [
      fc.record({
        amount,
        referralFeePct: referralFee,
        vaultAddress: address,
        recipient: address,
        feeRecipient: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args redeem exactly the input shares with a zero asset leg",
    ({
      amount: shares,
      referralFeePct,
      vaultAddress,
      recipient,
      feeRecipient,
    }) => {
      const transaction = vaultV2Redeem({
        vault: { chainId, address: vaultAddress },
        args: {
          shares,
          userAddress: recipient,
          referralFeePct,
          referralFeeRecipient: feeRecipient,
          deadline,
        },
      });
      expect(transaction.to).toBe(vaultBundlesV1);
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

const RAY = 10n ** 27n;
const vaultExitBundlesV1 = bundles?.vaultExitBundlesV1;
if (vaultExitBundlesV1 == null)
  throw new Error("VaultExitBundlesV1 is not registered");

// bundles VaultExitBundlesV1.sol vaultExitBundlesV1ForceWithdrawVaultV2: require(totalSharesBurnt == 0
// || withdrawn.mulDivDown(1e27, totalSharesBurnt) >= minSharePriceE27), a lower bound on the price.
describe("vaultV2ForceWithdraw", () => {
  test.prop(
    [
      fc.record({
        withdrawn: amount,
        sharesBurnt: amount,
        burnRaw: amount,
        tolerance: slippageTolerance,
        referralFeePct: referralFee,
        vaultAddress: address,
        adapter: address,
        user: address,
        feeRecipient: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: the min share price sits below the price at the bounded burn and the calldata carries it",
    ({
      withdrawn,
      sharesBurnt,
      burnRaw,
      tolerance,
      referralFeePct,
      vaultAddress,
      adapter,
      user,
      feeRecipient,
    }) => {
      const reference = mulDivDown(
        withdrawn,
        (MathLib.WAD - tolerance) * 10n ** 9n,
        sharesBurnt,
      );
      fc.pre(reference > 0n);
      const minSharePriceE27 = computeMinForceWithdrawSharePrice({
        withdrawnAssets: withdrawn,
        sharesBurnt,
        slippageTolerance: tolerance,
      });
      expect(minSharePriceE27).toBe(reference);
      expect(minSharePriceE27).toBeGreaterThan(0n);
      expect(minSharePriceE27).toBeLessThan(maxUint256);
      // Any actual burn up to the planned one passes the contract check
      // withdrawn.mulDivDown(1e27, burnt) >= minSharePriceE27.
      const actualBurn = (burnRaw % sharesBurnt) + 1n;
      expect(mulDivDown(withdrawn, RAY, actualBurn)).toBeGreaterThanOrEqual(
        minSharePriceE27,
      );

      const transaction = vaultV2ForceWithdraw({
        vault: { chainId, address: vaultAddress },
        args: {
          adapter,
          exitAssets: withdrawn,
          minSharePriceE27,
          userAddress: user,
          referralFeePct,
          referralFeeRecipient: feeRecipient,
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
        functionName: "vaultExitBundlesV1ForceWithdrawVaultV2",
        args: [
          vaultAddress,
          adapter,
          withdrawn,
          minSharePriceE27,
          emptySharesPermit,
          referralFeePct,
          feeRecipient,
          deadline,
        ],
      });
    },
  );
});

// bundles VaultExitBundlesV1.sol vaultExitBundlesV1InKindRedemptionVaultV2: withdraws idle first, then
// supplies floor((exit - idle) * WAD / (WAD + penalty)) on behalf of the sender across marketParamsList;
// no share-price check, the share allowance given to VaultExitBundlesV1 bounds the burn.
describe("vaultV2InKindRedeem", () => {
  test.prop(
    [
      fc.record({
        exitAssets: amount,
        marketParamsList: fc.array(marketParamsArbitrary, {
          minLength: 1,
          maxLength: 4,
        }),
        vaultAddress: address,
        adapter: address,
        user: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decoded args carry the vault, adapter, every market and the exit amount",
    ({ exitAssets, marketParamsList, vaultAddress, adapter, user }) => {
      const transaction = vaultV2InKindRedeem({
        vault: { chainId, address: vaultAddress },
        args: {
          adapter,
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
        functionName: "vaultExitBundlesV1InKindRedemptionVaultV2",
        args: [
          vaultAddress,
          adapter,
          marketParamsList,
          exitAssets,
          emptySharesPermit,
          deadline,
        ],
      });
    },
  );
});

// vault-v2 VaultV2.sol multicall(bytes[]) of forceDeallocate(adapter, data, assets, onBehalf), which
// burns penalty assets.mulDivUp(penalty, WAD) from onBehalf, then redeem(shares, receiver, onBehalf).
describe("vaultV2ForceRedeem", () => {
  test.prop(
    [
      fc.record({
        deallocations: fc.array(
          fc.record({
            adapter: address,
            amount,
            marketParams: fc.option(marketParamsArbitrary, { nil: undefined }),
          }),
          { minLength: 1, maxLength: 3 },
        ),
        shares: amount,
        vaultAddress: address,
        recipient: address,
        onBehalf: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: nested calls decode to each deallocation then a redeem of the exact shares",
    ({ deallocations, shares, vaultAddress, recipient, onBehalf }) => {
      const transaction = vaultV2ForceRedeem({
        vault: { address: vaultAddress },
        args: {
          deallocations: deallocations.map((deallocation) => ({
            ...deallocation,
            marketParams:
              deallocation.marketParams &&
              new MarketParams(deallocation.marketParams),
          })),
          redeem: { shares, recipient },
          onBehalf,
        },
      });
      expect(transaction.to).toBe(vaultAddress);
      expect(transaction.value).toBe(0n);
      const outer = decodeFunctionData({
        abi: vaultV2Abi,
        data: transaction.data,
      });
      if (outer.functionName !== "multicall") {
        throw new TypeError("Expected a VaultV2 multicall");
      }
      const [calls] = outer.args;
      expect(calls).toHaveLength(deallocations.length + 1);
      deallocations.forEach(({ adapter, amount: assets, marketParams }, i) => {
        expect(
          decodeFunctionData({ abi: vaultV2Abi, data: calls[i] ?? "0x" }),
        ).toEqual({
          functionName: "forceDeallocate",
          args: [
            adapter,
            marketParams
              ? encodeAbiParameters([marketParamsAbi], [marketParams])
              : "0x",
            assets,
            onBehalf,
          ],
        });
      });
      expect(
        decodeFunctionData({ abi: vaultV2Abi, data: calls.at(-1) ?? "0x" }),
      ).toEqual({
        functionName: "redeem",
        args: [shares, recipient, onBehalf],
      });
    },
  );
});
