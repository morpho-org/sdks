import { type MarketParams, getChainAddresses } from "@morpho-org/blue-sdk";
import { type Action, BundlerAction } from "@morpho-org/bundler-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, maxUint256 } from "viem";
import {
  addTransactionMetadata,
  validateRepayParams,
} from "../../helpers/index.js";
import {
  type MarketV1RepayWithdrawCollateralAction,
  type Metadata,
  NonPositiveWithdrawCollateralAmountError,
  type RequirementSignature,
  type Transaction,
} from "../../types/index.js";
import { getRequirementsAction } from "../requirements/getRequirementsAction.js";

/** Parameters for {@link marketV1RepayWithdrawCollateral}. */
export interface MarketV1RepayWithdrawCollateralParams {
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  args: {
    /** Repay assets amount (0n when repaying by shares). */
    assets: bigint;
    /** Repay shares amount (0n when repaying by assets). */
    shares: bigint;
    /** ERC20 amount to transfer to GeneralAdapter1 (computed by entity). */
    transferAmount: bigint;
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
 * 1. ERC20 transfer (loan token to GeneralAdapter1)
 * 2. `morphoRepay` — reduces debt FIRST
 * 3. `morphoWithdrawCollateral` — then withdraws collateral
 *
 * If the order were reversed, Morpho would revert because the position would be
 * insolvent at the time of the withdraw.
 *
 * Supports two repay modes:
 * - **By assets** (`assets > 0, shares = 0`): repays an exact asset amount.
 * - **By shares** (`assets = 0, shares > 0`): repays exact shares (full repay).
 *
 * **Prerequisites:**
 * - ERC20 approval for loan token to GeneralAdapter1 (for the repay).
 * - GeneralAdapter1 must be authorized on Morpho (for the withdraw).
 *
 * @param params - Combined repay and withdraw collateral parameters.
 * @returns Deep-frozen transaction.
 */
export const marketV1RepayWithdrawCollateral = ({
  market: { chainId, marketParams },
  args: {
    assets,
    shares,
    transferAmount,
    withdrawAmount,
    onBehalf,
    receiver,
    maxSharePrice,
    requirementSignature,
  },
  metadata,
}: MarketV1RepayWithdrawCollateralParams): Readonly<
  Transaction<MarketV1RepayWithdrawCollateralAction>
> => {
  validateRepayParams({
    assets,
    shares,
    transferAmount,
    maxSharePrice,
    marketId: marketParams.id,
  });

  if (withdrawAmount <= 0n) {
    throw new NonPositiveWithdrawCollateralAmountError(marketParams.id);
  }

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const actions: Action[] = [];

  if (requirementSignature) {
    actions.push(
      ...getRequirementsAction({
        chainId,
        asset: marketParams.loanToken,
        amount: transferAmount,
        requirementSignature,
      }),
    );
  } else {
    actions.push({
      type: "erc20TransferFrom",
      args: [marketParams.loanToken, transferAmount, generalAdapter1, false],
    });
  }

  // REPAY FIRST — reduces debt before withdrawing collateral
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

  actions.push({
    type: "morphoWithdrawCollateral",
    args: [marketParams, withdrawAmount, receiver, false],
  });

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
      type: "marketV1RepayWithdrawCollateral",
      args: {
        market: marketParams.id,
        repayAssets: assets,
        repayShares: shares,
        transferAmount,
        withdrawAmount,
        maxSharePrice,
        onBehalf,
        receiver,
      },
    },
  });
};
