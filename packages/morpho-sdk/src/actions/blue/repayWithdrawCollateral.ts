import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import {
  addTransactionMetadata,
  validateNativeAsset,
} from "../../helpers/index.js";
import {
  type BlueRepayWithdrawCollateralAction,
  type Metadata,
  MutuallyExclusiveRepayAmountsError,
  NegativeNativeAmountError,
  NonPositiveRepayAmountError,
  NonPositiveRepayMaxSharePriceError,
  NonPositiveWithdrawCollateralAmountError,
  type RepayActionAmountArgs,
  type RequirementSignature,
  type Transaction,
} from "../../types/index.js";
import { getRequirementsAction } from "../requirements/getRequirementsAction.js";

/** Parameters for {@link blueRepayWithdrawCollateral}. */
export interface BlueRepayWithdrawCollateralParams {
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  args: RepayActionAmountArgs & {
    /** Amount of collateral to withdraw. */
    withdrawAmount: bigint;
    /** Address whose debt is being repaid. */
    onBehalf: Address;
    /** Receives withdrawn collateral and residual loan tokens in shares mode. */
    receiver: Address;
    /** Maximum repay share price (in ray). Protects against share price manipulation. */
    maxSharePrice: bigint;
    requirementSignature?: RequirementSignature;
  };
  metadata?: Metadata;
}

/**
 * Prepares an atomic repay-and-withdraw-collateral transaction for a Morpho Blue market.
 *
 * Routed through bundler3. The bundle order is critical:
 *
 * 1. ERC-20 transfer of the loan token to `GeneralAdapter1`.
 * 2. `morphoRepay` — reduces debt **first**.
 * 3. `morphoWithdrawCollateral` — then withdraws collateral.
 *
 * If the order were reversed, Morpho would revert because the position would be insolvent at the
 * time of the withdraw. All amount arithmetic is done upstream (see
 * `MorphoBlue.repayWithdrawCollateral`); this builder just assembles the bundle from the
 * pre-resolved {@link RepayActionAmountArgs}. The mode is discriminated on `shares`, plus optional
 * native wrapping (when `nativeAmount > 0`, native ETH is wrapped via `GeneralAdapter1.wrapNative()`
 * before the repay; the loan token must be the chain's wNative):
 *
 * - **assets mode** (`shares` unset/`0n`): repays `transferAmount` assets (`= amount + nativeAmount`,
 *   additive like `blueSupply`), pulling `amount` ERC-20.
 * - **shares mode** (`shares > 0n`): repays exact shares (full repay), pulling `transferAmount`
 *   ERC-20 (already net of native); residual loan tokens are skimmed back to `receiver`.
 *
 * Prerequisites: ERC-20 approval for the loan token to `GeneralAdapter1` (for the repay) **and**
 * `GeneralAdapter1` must be authorized on Morpho (for the withdraw).
 *
 * @param params.market.chainId - The chain the market lives on.
 * @param params.market.marketParams - Market params (loanToken, collateralToken, oracle, irm, lltv).
 * @param params.args.amount - (assets mode) ERC-20 loan tokens pulled from the payer. Defaults to `0n`.
 * @param params.args.shares - (shares mode) Repay amount in borrow shares. Discriminates the mode.
 * @param params.args.transferAmount - Loan tokens routed into `GeneralAdapter1`: assets mode = the
 *   total repaid (`amount + nativeAmount`); shares mode = the ERC-20 pulled (net of native).
 * @param params.args.nativeAmount - Optional native token to wrap into wNative to fund the repay.
 *   Requires the loan token to be the chain's wNative.
 * @param params.args.withdrawAmount - Amount of collateral to withdraw after the repay leg
 *   completes.
 * @param params.args.onBehalf - Address whose Morpho debt is being repaid.
 * @param params.args.receiver - Address that receives the withdrawn collateral and any residual
 *   loan tokens in shares mode.
 * @param params.args.maxSharePrice - Maximum acceptable repay share price (in ray). Slippage
 *   protection.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval for the
 *   loan-token transfer.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<BlueRepayWithdrawCollateralAction>` with `to`,
 *   `value` (= `nativeAmount`), `data`, and the typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveRepayMaxSharePriceError} when `maxSharePrice <= 0n`.
 * @throws {NegativeNativeAmountError} when `nativeAmount < 0n`.
 * @throws {MutuallyExclusiveRepayAmountsError} when both `amount` and `shares` are `> 0n`.
 * @throws {NonPositiveRepayAmountError} when in assets mode and `transferAmount <= 0n`.
 * @throws {NonPositiveWithdrawCollateralAmountError} when `withdrawAmount <= 0n`.
 * @throws {ChainWNativeMissingError} when `nativeAmount > 0n` but the chain has no configured wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but the loan token is not
 *   the chain's wNative.
 * @throws {DepositAssetMismatchError} from `getRequirementsAction` when `requirementSignature`
 *   is provided and the signed asset differs from `marketParams.loanToken`.
 * @throws {DepositAmountMismatchError} from `getRequirementsAction` when `requirementSignature`
 *   is provided and the signed amount differs from the ERC-20 amount pulled.
 * @throws {Permit2ExpirationMissingError} from `getRequirementsAction` when a Permit2 requirement
 *   signature is missing its expiration.
 * @example
 * ```ts
 * import { blueRepayWithdrawCollateral } from "@morpho-org/morpho-sdk";
 *
 * const tx = blueRepayWithdrawCollateral({
 *   market: { chainId: 1, marketParams }, // marketParams.loanToken === wNative
 *   args: {
 *     shares: 500_000_000_000_000_000_000_000n,
 *     transferAmount: 310_000_000_000_000_000n, // ERC-20 pulled (net of native)
 *     nativeAmount: 200_000_000_000_000_000n, // 0.2 funded by wrapping native ETH
 *     withdrawAmount: 1_000_000_000_000_000_000n,
 *     onBehalf: borrower,
 *     receiver: borrower,
 *     maxSharePrice: 1_010_000_000_000_000_000_000_000_000n, // RAY-scaled, 1.01x
 *   },
 * });
 * // tx.value === 200_000_000_000_000_000n
 * ```
 */
export const blueRepayWithdrawCollateral = ({
  market: { chainId, marketParams },
  args,
  metadata,
}: BlueRepayWithdrawCollateralParams): Readonly<
  Transaction<BlueRepayWithdrawCollateralAction>
> => {
  const {
    amount = 0n,
    shares = 0n,
    nativeAmount = 0n,
    transferAmount,
    withdrawAmount,
    onBehalf,
    receiver,
    maxSharePrice,
    requirementSignature,
  } = args;

  if (maxSharePrice <= 0n) {
    throw new NonPositiveRepayMaxSharePriceError(marketParams.id);
  }
  if (nativeAmount < 0n) {
    throw new NegativeNativeAmountError(nativeAmount);
  }
  if (amount < 0n || shares < 0n) {
    throw new NonPositiveRepayAmountError(marketParams.id);
  }
  if (amount > 0n && shares > 0n) {
    throw new MutuallyExclusiveRepayAmountsError(marketParams.id);
  }
  if (withdrawAmount <= 0n) {
    throw new NonPositiveWithdrawCollateralAmountError(marketParams.id);
  }

  // Shares mode repays an exact share count and pulls `transferAmount` ERC-20
  // (already net of native), skimming the residual. Assets mode repays
  // `transferAmount` (= amount + native, additive) and pulls `amount`.
  const isSharesMode = shares > 0n;
  const repayAssets = isSharesMode ? 0n : transferAmount;
  const repayShares = shares;
  const erc20Amount = isSharesMode ? transferAmount : amount;

  if (!isSharesMode && repayAssets <= 0n) {
    throw new NonPositiveRepayAmountError(marketParams.id);
  }

  const {
    bundler3: { generalAdapter1, bundler3 },
  } = getChainAddresses(chainId);

  const actions: Action[] = [];

  // Wrap native into wNative before pulling the ERC-20 remainder.
  if (nativeAmount > 0n) {
    validateNativeAsset(chainId, marketParams.loanToken);

    actions.push(
      {
        type: "nativeTransfer",
        args: [bundler3, generalAdapter1, nativeAmount, false],
      },
      {
        type: "wrapNative",
        args: [nativeAmount, generalAdapter1, false],
      },
    );
  }

  // Pull the ERC-20 portion (0 on a fully native repay).
  if (erc20Amount > 0n) {
    if (requirementSignature) {
      actions.push(
        ...getRequirementsAction({
          asset: marketParams.loanToken,
          amount: erc20Amount,
          recipient: generalAdapter1,
          requirementSignature,
        }),
      );
    } else {
      actions.push({
        type: "erc20TransferFrom",
        args: [marketParams.loanToken, erc20Amount, generalAdapter1, false],
      });
    }
  }

  // REPAY FIRST — reduces debt before withdrawing collateral
  actions.push({
    type: "morphoRepay",
    args: [
      marketParams,
      repayAssets,
      repayShares,
      maxSharePrice,
      onBehalf,
      [],
      false,
    ],
  });

  // Skim residual loan tokens back to the payer when repaying by shares.
  // In shares mode, transferAmount is an upper-bound estimate; morphoRepay
  // consumes only the exact amount needed, leaving a residual in the adapter.
  if (isSharesMode) {
    actions.push({
      type: "erc20Transfer",
      args: [
        marketParams.loanToken,
        receiver,
        maxUint256,
        generalAdapter1,
        false,
      ],
    });
  }

  actions.push({
    type: "morphoWithdrawCollateral",
    args: [marketParams, withdrawAmount, receiver, false],
  });

  let tx = {
    ...BundlerAction.encodeBundle(chainId, actions),
    value: nativeAmount,
  };

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "blueRepayWithdrawCollateral",
      args: {
        market: marketParams.id,
        repayAssets,
        repayShares,
        // Total loan tokens routed to the adapter: ERC-20 pulled + native wrapped.
        transferAmount: erc20Amount + nativeAmount,
        withdrawAmount,
        maxSharePrice,
        onBehalf,
        receiver,
        nativeAmount: nativeAmount > 0n ? nativeAmount : undefined,
      },
    },
  });
};
