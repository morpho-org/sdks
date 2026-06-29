import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import {
  addTransactionMetadata,
  validateNativeAsset,
} from "../../helpers/index.js";
import {
  type BlueRepayAction,
  type DepositAmountArgs,
  type Metadata,
  NegativeNativeAmountError,
  NonPositiveAssetAmountError,
  NonPositiveRepayAmountError,
  NonPositiveRepayMaxSharePriceError,
  NonPositiveTransferAmountError,
  type RequirementSignature,
  type Transaction,
} from "../../types/index.js";
import { getRequirementsAction } from "../requirements/getRequirementsAction.js";

/** Parameters for {@link blueRepay}. */
export interface BlueRepayParams {
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  args: DepositAmountArgs & {
    /**
     * Repay exact borrow shares (full repay, immune to interest accrual). Omit (or `0n`)
     * for an exact-asset repay. When set, `amount + nativeAmount` is the upper-bound
     * transfer estimate; residual loan tokens are skimmed back to `receiver`.
     */
    shares?: bigint;
    /** Address whose debt is being repaid. */
    onBehalf: Address;
    /** Receives residual loan tokens in shares mode. */
    receiver: Address;
    /** Maximum repay share price (in ray). Protects against share price manipulation. */
    maxSharePrice: bigint;
    requirementSignature?: RequirementSignature;
  };
  metadata?: Metadata;
}

/**
 * Prepares a repay transaction for a Morpho Blue market.
 *
 * Routed through bundler3 via `GeneralAdapter1`. Funding mirrors the supply paths: the amount
 * pulled into `GeneralAdapter1` is `transferAmount = amount + nativeAmount`, where `amount` is
 * pulled as ERC-20 and `nativeAmount` is wrapped from native ETH via
 * `GeneralAdapter1.wrapNative()` (the loan token must be the chain's wNative for that portion).
 * Provide either or both.
 *
 * Supports two modes:
 *
 * - **By assets** (default, `shares` omitted): repays exactly `transferAmount`.
 * - **By shares** (`shares > 0`): repays exact shares (full repay), with `transferAmount` acting
 *   as an upper-bound estimate; residual loan tokens are skimmed back to `receiver` after the
 *   call (returned as wNative when the residual came from a native-wrapped portion).
 *
 * Uses `maxSharePrice` to protect against share price manipulation between transaction
 * construction and execution.
 *
 * @param params.market.chainId - The chain the market lives on.
 * @param params.market.marketParams - Market params (loanToken, collateralToken, oracle, irm, lltv).
 * @param params.args.amount - ERC-20 loan-token amount to pull into `GeneralAdapter1`. At least
 *   one of `amount` / `nativeAmount` must be positive. Defaults to `0n`.
 * @param params.args.nativeAmount - Native amount to wrap into wNative and add to the transfer.
 *   Requires the loan token to be the chain's wNative. Defaults to `0n`.
 * @param params.args.shares - Borrow shares to repay (full repay). Omit / `0n` to repay by assets.
 * @param params.args.onBehalf - Address whose Morpho debt is being repaid.
 * @param params.args.receiver - Address that receives residual loan tokens in shares mode.
 * @param params.args.maxSharePrice - Maximum acceptable repay share price (in ray). Slippage
 *   protection.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval for the
 *   ERC-20 portion (`amount`) of the loan-token transfer.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<BlueRepayAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveAssetAmountError} when `amount < 0n`.
 * @throws {NegativeNativeAmountError} when `nativeAmount < 0n`.
 * @throws {NonPositiveRepayAmountError} when `shares < 0n`.
 * @throws {NonPositiveRepayMaxSharePriceError} when `maxSharePrice <= 0n`.
 * @throws {NonPositiveTransferAmountError} when `amount + nativeAmount <= 0n`.
 * @throws {ChainWNativeMissingError} when `nativeAmount > 0n` but the chain has no configured wNative.
 * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but the loan token is not
 *   the chain's wNative.
 * @throws {DepositAssetMismatchError} from `getRequirementsAction` when `requirementSignature`
 *   is provided and the signed asset differs from `marketParams.loanToken`.
 * @throws {DepositAmountMismatchError} from `getRequirementsAction` when `requirementSignature`
 *   is provided and the signed amount differs from the ERC-20 portion `amount`.
 * @throws {Permit2ExpirationMissingError} from `getRequirementsAction` when a Permit2 requirement
 *   signature is missing its expiration.
 * @example
 * ```ts
 * import { blueRepay } from "@morpho-org/morpho-sdk";
 *
 * const tx = blueRepay({
 *   market: { chainId: 1, marketParams },
 *   args: {
 *     amount: 500_000_000n,
 *     onBehalf: borrower,
 *     receiver: borrower,
 *     maxSharePrice: 1_010_000_000_000_000_000_000_000_000n, // RAY-scaled, 1.01x
 *   },
 * });
 * // tx satisfies Readonly<Transaction<BlueRepayAction>>
 * ```
 */
export const blueRepay = ({
  market: { chainId, marketParams },
  args: {
    amount = 0n,
    nativeAmount,
    shares = 0n,
    onBehalf,
    receiver,
    maxSharePrice,
    requirementSignature,
  },
  metadata,
}: BlueRepayParams): Readonly<Transaction<BlueRepayAction>> => {
  if (amount < 0n) {
    throw new NonPositiveAssetAmountError(marketParams.loanToken);
  }

  if (nativeAmount !== undefined && nativeAmount < 0n) {
    throw new NegativeNativeAmountError(nativeAmount);
  }

  if (shares < 0n) {
    throw new NonPositiveRepayAmountError(marketParams.id);
  }

  if (maxSharePrice <= 0n) {
    throw new NonPositiveRepayMaxSharePriceError(marketParams.id);
  }

  const nativeFunding = nativeAmount ?? 0n;
  // The amount pulled into GeneralAdapter1, split across the ERC-20 (`amount`)
  // and native-wrapped (`nativeFunding`) portions — same model as the supply paths.
  const transferAmount = amount + nativeFunding;

  if (transferAmount <= 0n) {
    throw new NonPositiveTransferAmountError(marketParams.id);
  }

  // Shares mode repays an exact share count; assets mode repays exactly the transfer.
  const isSharesMode = shares > 0n;
  const assets = isSharesMode ? 0n : transferAmount;

  const {
    bundler3: { generalAdapter1, bundler3 },
  } = getChainAddresses(chainId);

  const actions: Action[] = [];

  // Wrap the native portion into wNative inside GeneralAdapter1.
  if (nativeFunding > 0n) {
    validateNativeAsset(chainId, marketParams.loanToken);

    actions.push(
      {
        type: "nativeTransfer",
        args: [bundler3, generalAdapter1, nativeFunding, false],
      },
      {
        type: "wrapNative",
        args: [nativeFunding, generalAdapter1, false],
      },
    );
  }

  // Pull the ERC-20 portion of the transfer.
  if (amount > 0n) {
    if (requirementSignature) {
      actions.push(
        ...getRequirementsAction({
          asset: marketParams.loanToken,
          amount,
          recipient: generalAdapter1,
          requirementSignature,
        }),
      );
    } else {
      actions.push({
        type: "erc20TransferFrom",
        args: [marketParams.loanToken, amount, generalAdapter1, false],
      });
    }
  }

  actions.push({
    type: "morphoRepay",
    args: [marketParams, assets, shares, maxSharePrice, onBehalf, [], false],
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

  let tx = BundlerAction.encodeBundle(chainId, actions);

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "blueRepay",
      args: {
        market: marketParams.id,
        assets,
        shares,
        transferAmount,
        onBehalf,
        receiver,
        maxSharePrice,
        nativeAmount,
      },
    },
  });
};
