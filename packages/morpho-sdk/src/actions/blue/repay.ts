import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
import { type Action, BundlerAction } from "../../bundler/index.js";
import {
  addTransactionMetadata,
  resolveRepayAmounts,
  validateNativeAsset,
} from "../../helpers/index.js";
import type {
  BlueRepayAction,
  Metadata,
  RepayActionAmountArgs,
  RequirementSignature,
  Transaction,
} from "../../types/index.js";
import { getRequirementsAction } from "../requirements/getRequirementsAction.js";

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
    requirementSignature?: RequirementSignature;
  };
  metadata?: Metadata;
}

/**
 * Prepares a repay transaction for a Morpho Blue market.
 *
 * Routed through bundler3 via `GeneralAdapter1`. Supports two modes, plus optional native wrapping
 * (when `nativeAmount > 0`, native ETH is wrapped via `GeneralAdapter1.wrapNative()` before the
 * repay; the loan token must be the chain's wNative):
 *
 * - **By assets** (`{ amount, nativeAmount? }`): repays an exact asset amount. Additive, like
 *   `blueSupply` — the repaid assets are `amount + nativeAmount`, the ERC-20 pulled is `amount`,
 *   and `nativeAmount` is wrapped. No residual.
 * - **By shares** (`{ shares, transferAmount, nativeAmount? }`): repays exact shares (full repay).
 *   `transferAmount` is an upper-bound asset estimate; the ERC-20 pulled is
 *   `transferAmount − nativeAmount` and `nativeAmount` is wrapped. Residual loan tokens are skimmed
 *   back to `receiver` after the call.
 *
 * Provide either `amount`/`nativeAmount` (assets mode) or `shares` (shares mode), never both. Uses
 * `maxSharePrice` to protect against share price manipulation between construction and execution.
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
 * @throws {MutuallyExclusiveRepayAmountsError} when both `amount` and `shares` are provided.
 * @throws {NonPositiveRepayAmountError} when the resolved repay amount is non-positive (assets
 *   mode: `amount + nativeAmount <= 0n`; shares mode: `shares <= 0n`).
 * @throws {NonPositiveTransferAmountError} when in shares mode and `transferAmount <= 0n`.
 * @throws {NativeAmountExceedsTransferAmountError} when in shares mode and `nativeAmount > transferAmount`.
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
 * import { blueRepay } from "@morpho-org/morpho-sdk";
 *
 * // Repay 500 loan-asset units, 200 of them funded by wrapping native ETH.
 * const tx = blueRepay({
 *   market: { chainId: 1, marketParams }, // marketParams.loanToken === wNative
 *   args: {
 *     amount: 300_000_000_000_000_000n,
 *     nativeAmount: 200_000_000_000_000_000n,
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
  const { onBehalf, receiver, maxSharePrice, requirementSignature } = args;

  const {
    repayAssets,
    repayShares,
    erc20Amount,
    transferAmount,
    nativeAmount,
    isSharesMode,
  } = resolveRepayAmounts({ args, maxSharePrice, marketId: marketParams.id });

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
        transferAmount,
        onBehalf,
        receiver,
        maxSharePrice,
        nativeAmount: nativeAmount > 0n ? nativeAmount : undefined,
      },
    },
  });
};
