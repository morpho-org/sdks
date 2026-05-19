import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import { type Action, BundlerAction } from "@morpho-org/bundler-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
import {
  addTransactionMetadata,
  validateRepayParams,
} from "../../helpers/index.js";
import type {
  MarketV1RepayAction,
  Metadata,
  RequirementSignature,
  Transaction,
} from "../../types/index.js";
import { getRequirementsAction } from "../requirements/getRequirementsAction.js";

/** Parameters for {@link marketV1Repay}. */
export interface MarketV1RepayParams {
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  args: {
    /** Repay assets amount (0n when repaying by shares). */
    assets: bigint;
    /** Repay shares amount (0n when repaying by assets). */
    shares: bigint;
    /**
     * ERC-20 amount to pull into `GeneralAdapter1`. In assets mode, must equal `assets`
     * exactly (`TransferAmountNotEqualToAssetsError` fires otherwise). In shares mode, an
     * upper-bound estimate to absorb share-price drift; residual is skimmed back to `receiver`.
     */
    transferAmount: bigint;
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
 * Routed through bundler3 via `GeneralAdapter1`. Supports two modes:
 *
 * - **By assets** (`assets > 0, shares = 0`): repays an exact asset amount.
 * - **By shares** (`assets = 0, shares > 0`): repays exact shares (full repay), with
 *   `transferAmount` set to an upper-bound asset estimate; residual loan tokens are skimmed back
 *   to `receiver` after the call.
 *
 * Exactly one of `assets` / `shares` must be non-zero. Uses `maxSharePrice` to protect against
 * share price manipulation between transaction construction and execution.
 *
 * @param params.market.chainId - The chain the market lives on.
 * @param params.market.marketParams - Market params (loanToken, collateralToken, oracle, irm, lltv).
 * @param params.args.assets - Repay amount in loan-token assets. Set to `0n` when repaying by shares.
 * @param params.args.shares - Repay amount in borrow shares. Set to `0n` when repaying by assets.
 * @param params.args.transferAmount - ERC-20 amount to pull into `GeneralAdapter1`. In assets
 *   mode, must equal `assets` exactly (`TransferAmountNotEqualToAssetsError` fires otherwise).
 *   In shares mode, this is an upper-bound estimate to absorb share-price drift; residual loan
 *   tokens are skimmed back to `receiver`.
 * @param params.args.onBehalf - Address whose Morpho debt is being repaid.
 * @param params.args.receiver - Address that receives residual loan tokens in shares mode.
 * @param params.args.maxSharePrice - Maximum acceptable repay share price (in ray). Slippage
 *   protection.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval for the
 *   loan-token transfer.
 * @param params.metadata - Optional analytics metadata attached to the bundle.
 * @returns A deep-frozen `Transaction<MarketV1RepayAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveRepayMaxSharePriceError} when `maxSharePrice <= 0n`.
 * @throws {NonPositiveRepayAmountError} when either `assets` or `shares` is negative, or when
 *   both are zero.
 * @throws {MutuallyExclusiveRepayAmountsError} when both `assets` and `shares` are non-zero.
 * @throws {NonPositiveTransferAmountError} when `transferAmount <= 0n`.
 * @throws {TransferAmountNotEqualToAssetsError} when in assets mode and `transferAmount !== assets`.
 * @throws {DepositAssetMismatchError} from `getRequirementsAction` when `requirementSignature`
 *   is provided and the signed asset differs from `marketParams.loanToken`.
 * @throws {DepositAmountMismatchError} from `getRequirementsAction` when `requirementSignature`
 *   is provided and the signed amount differs from `args.transferAmount`.
 * @example
 * ```ts
 * import { marketV1Repay } from "@morpho-org/morpho-sdk";
 *
 * const tx = marketV1Repay({
 *   market: { chainId: 1, marketParams },
 *   args: {
 *     assets: 500_000_000n,
 *     shares: 0n,
 *     transferAmount: 500_000_000n,
 *     onBehalf: borrower,
 *     receiver: borrower,
 *     maxSharePrice: 1_010_000_000_000_000_000_000_000_000n, // RAY-scaled, 1.01x
 *   },
 * });
 * // tx satisfies Readonly<Transaction<MarketV1RepayAction>>
 * ```
 */
export const marketV1Repay = ({
  market: { chainId, marketParams },
  args: {
    assets,
    shares,
    transferAmount,
    onBehalf,
    receiver,
    maxSharePrice,
    requirementSignature,
  },
  metadata,
}: MarketV1RepayParams): Readonly<Transaction<MarketV1RepayAction>> => {
  validateRepayParams({
    assets,
    shares,
    transferAmount,
    maxSharePrice,
    marketId: marketParams.id,
  });

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const actions: Action[] = [];

  if (requirementSignature) {
    actions.push(
      ...getRequirementsAction({
        asset: marketParams.loanToken,
        amount: transferAmount,
        recipient: generalAdapter1,
        requirementSignature,
      }),
    );
  } else {
    actions.push({
      type: "erc20TransferFrom",
      args: [marketParams.loanToken, transferAmount, generalAdapter1, false],
    });
  }

  actions.push({
    type: "morphoRepay",
    args: [marketParams, assets, shares, maxSharePrice, onBehalf, [], false],
  });

  // Skim residual loan tokens back to the payer when repaying by shares.
  // In shares mode, transferAmount is an upper-bound estimate; morphoRepay
  // consumes only the exact amount needed, leaving a residual in the adapter.
  if (shares > 0n) {
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
    value: 0n,
  };

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "marketV1Repay",
      args: {
        market: marketParams.id,
        assets,
        shares,
        transferAmount,
        onBehalf,
        receiver,
        maxSharePrice,
      },
    },
  });
};
