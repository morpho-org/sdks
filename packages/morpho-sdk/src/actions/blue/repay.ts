import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import type {
  BlueRepayAction,
  Metadata,
  PermitRequirementSignature,
  RepayActionAmountArgs,
  Transaction,
} from "../../types/index.js";
import { buildRepayFundingActions } from "./buildRepayFundingActions.js";
import { resolveRepayFunding } from "./resolveRepayFunding.js";

/** Parameters for {@link blueRepay}. */
export interface BlueRepayParams {
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  args: RepayActionAmountArgs & {
    /** Address whose debt is being repaid. */
    onBehalf: Address;
    /** Receives residual loan tokens in shares mode. */
    receiver: Address;
    /** Maximum repay share price (in ray). Protects against share price manipulation. */
    maxSharePrice: bigint;
    /** Optional pre-signed permit/permit2 approval for the loan-token transfer. */
    requirementSignature?: PermitRequirementSignature;
  };
  metadata?: Metadata;
}

/**
 * Prepares a repay transaction for a Morpho Blue market.
 *
 * Routed through bundler3 via `GeneralAdapter1`. All amount arithmetic is done upstream (see
 * `MorphoBlue.repay`); this builder just assembles the bundle from the pre-resolved
 * {@link RepayActionAmountArgs}. The mode is discriminated on `shares`, plus optional native wrapping
 * (when `nativeAmount > 0`, native ETH is wrapped via `GeneralAdapter1.wrapNative()` before the
 * repay; the loan token must be the chain's wNative):
 *
 * - **assets mode** (`shares` unset/`0n`): repays `transferAmount` assets (`= amount + nativeAmount`,
 *   additive like `blueSupply`), pulling `amount` ERC-20 and wrapping `nativeAmount`. No residual.
 * - **shares mode** (`shares > 0n`): repays exact shares (full repay), pulling `transferAmount`
 *   ERC-20 (already net of native) and wrapping `nativeAmount`. Residual loan tokens are skimmed
 *   back to `receiver` after the call.
 *
 * Uses `maxSharePrice` to protect against share price manipulation between construction and execution.
 *
 * @param params.market.chainId - The chain the market lives on.
 * @param params.market.marketParams - Market params (loanToken, collateralToken, oracle, irm, lltv).
 * @param params.args.amount - (assets mode) ERC-20 loan tokens pulled from the payer. Defaults to `0n`.
 * @param params.args.shares - (shares mode) Repay amount in borrow shares. Discriminates the mode.
 * @param params.args.transferAmount - Loan tokens routed into `GeneralAdapter1`: assets mode = the
 *   total repaid (`amount + nativeAmount`); shares mode = the ERC-20 pulled (net of native).
 * @param params.args.nativeAmount - Optional native token to wrap into wNative to fund the repay.
 *   Requires the loan token to be the chain's wNative.
 * @param params.args.onBehalf - Address whose Morpho debt is being repaid.
 * @param params.args.receiver - Address that receives residual loan tokens in shares mode.
 * @param params.args.maxSharePrice - Maximum acceptable repay share price (in ray). Slippage
 *   protection.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval for the
 *   loan-token transfer.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<BlueRepayAction>` with `to`, `value` (= `nativeAmount`),
 *   `data`, and the typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveRepayMaxSharePriceError} when `maxSharePrice <= 0n`.
 * @throws {NegativeNativeAmountError} when `nativeAmount < 0n`.
 * @throws {MutuallyExclusiveRepayAmountsError} when both `amount` and `shares` are `> 0n`.
 * @throws {TransferAmountNotEqualToAssetsError} when in assets mode and
 *   `transferAmount !== amount + nativeAmount`.
 * @throws {NonPositiveRepayAmountError} when `amount` or `shares` is negative, when in assets mode
 *   and `transferAmount <= 0n`, or when in shares mode and `transferAmount` is negative or the total
 *   funding (`transferAmount + nativeAmount`) is `<= 0n`.
 * @throws {ChainWNativeMissingError} when `nativeAmount > 0n` but the chain has no configured wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but the loan token is not
 *   the chain's wNative.
 * @throws {DepositAssetMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed asset differs from `marketParams.loanToken`.
 * @throws {DepositAmountMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed amount differs from the ERC-20 amount pulled.
 * @throws {Permit2ExpirationMissingError} from `getTokenRequirementActions` when a Permit2 requirement
 *   signature is missing its expiration.
 * @example
 * ```ts
 * import { blueRepay } from "@morpho-org/morpho-sdk";
 *
 * // Repay 0.5 loan-asset units, 0.2 of them funded by wrapping native ETH.
 * const tx = blueRepay({
 *   market: { chainId: 1, marketParams }, // marketParams.loanToken === wNative
 *   args: {
 *     amount: 300_000_000_000_000_000n, // ERC-20 part
 *     nativeAmount: 200_000_000_000_000_000n, // wrapped ETH part
 *     transferAmount: 500_000_000_000_000_000n, // total repaid = amount + nativeAmount
 *     onBehalf: borrower,
 *     receiver: borrower,
 *     maxSharePrice: 1_010_000_000_000_000_000_000_000_000n, // RAY-scaled, 1.01x
 *   },
 * });
 * // tx.value === 200_000_000_000_000_000n
 * ```
 */
export const blueRepay = ({
  market: { chainId, marketParams },
  args,
  metadata,
}: BlueRepayParams): Readonly<Transaction<BlueRepayAction>> => {
  const {
    amount = 0n,
    shares = 0n,
    nativeAmount = 0n,
    transferAmount,
    onBehalf,
    receiver,
    maxSharePrice,
    requirementSignature,
  } = args;

  const { isSharesMode, repayAssets, repayShares, erc20Amount } =
    resolveRepayFunding(
      { amount, shares, nativeAmount, transferAmount, maxSharePrice },
      marketParams.id,
    );

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const actions: Action[] = buildRepayFundingActions({
    chainId,
    marketParams,
    erc20Amount,
    nativeAmount,
    requirementSignature,
  });

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
      type: "blueRepay",
      args: {
        market: marketParams.id,
        assets: repayAssets,
        shares: repayShares,
        // Total loan tokens routed to the adapter: ERC-20 pulled + native wrapped.
        transferAmount: erc20Amount + nativeAmount,
        onBehalf,
        receiver,
        maxSharePrice,
        nativeAmount: nativeAmount > 0n ? nativeAmount : undefined,
      },
    },
  });
};
