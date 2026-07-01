import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import {
  addTransactionMetadata,
  resolveRepayAmounts,
  validateNativeAsset,
} from "../../helpers/index.js";
import {
  type BlueRepayWithdrawCollateralAction,
  type Metadata,
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
 * time of the withdraw. Supports two repay modes, plus optional native wrapping (when
 * `nativeAmount > 0`, native ETH is wrapped via `GeneralAdapter1.wrapNative()` before the repay;
 * the loan token must be the chain's wNative):
 *
 * - **By assets** (`{ amount, nativeAmount? }`): repays an exact asset amount. Additive, like
 *   `blueSupply` — the repaid assets are `amount + nativeAmount`, the ERC-20 pulled is `amount`.
 * - **By shares** (`{ shares, transferAmount, nativeAmount? }`): repays exact shares (full repay).
 *   The ERC-20 pulled is `transferAmount − nativeAmount`; residual loan tokens are skimmed back to
 *   `receiver`.
 *
 * Prerequisites: ERC-20 approval for the loan token to `GeneralAdapter1` (for the repay) **and**
 * `GeneralAdapter1` must be authorized on Morpho (for the withdraw).
 *
 * @param params.market.chainId - The chain the market lives on.
 * @param params.market.marketParams - Market params (loanToken, collateralToken, oracle, irm, lltv).
 * @param params.args.amount - (assets mode) ERC-20 loan-asset amount to repay. Combined with
 *   `nativeAmount` for the total repaid assets. Defaults to `0n`.
 * @param params.args.shares - (shares mode) Repay amount in borrow shares.
 * @param params.args.transferAmount - (shares mode) Upper-bound loan-asset funding to pull into
 *   `GeneralAdapter1`; the ERC-20 transfer is `transferAmount − nativeAmount`. Residual is skimmed
 *   back to `receiver`.
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
 * @throws {MutuallyExclusiveRepayAmountsError} when both `amount` and `shares` are provided.
 * @throws {NonPositiveRepayAmountError} when the resolved repay amount is non-positive (assets
 *   mode: `amount + nativeAmount <= 0n`; shares mode: `shares <= 0n`).
 * @throws {NonPositiveTransferAmountError} when in shares mode and `transferAmount <= 0n`.
 * @throws {NativeAmountExceedsTransferAmountError} when in shares mode and `nativeAmount > transferAmount`.
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
 *     transferAmount: 510_000_000_000_000_000n, // upper-bound loan-asset funding
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
    withdrawAmount,
    onBehalf,
    receiver,
    maxSharePrice,
    requirementSignature,
  } = args;

  const {
    repayAssets,
    repayShares,
    erc20Amount,
    transferAmount,
    nativeAmount,
    isSharesMode,
  } = resolveRepayAmounts({ args, maxSharePrice, marketId: marketParams.id });

  if (withdrawAmount <= 0n) {
    throw new NonPositiveWithdrawCollateralAmountError(marketParams.id);
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
        transferAmount,
        withdrawAmount,
        maxSharePrice,
        onBehalf,
        receiver,
        nativeAmount: nativeAmount > 0n ? nativeAmount : undefined,
      },
    },
  });
};
