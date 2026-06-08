import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type BlueWithdrawCollateralAction,
  type Metadata,
  NonPositiveWithdrawCollateralAmountError,
  type Transaction,
} from "../../types/index.js";

/** Parameters for {@link blueWithdrawCollateral}. */
export interface BlueWithdrawCollateralParams {
  market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  args: {
    amount: bigint;
    onBehalf: Address;
    receiver: Address;
  };
  metadata?: Metadata;
}

/**
 * Prepares a withdraw-collateral transaction for a Morpho Blue market.
 *
 * Direct call to `Morpho.withdrawCollateral` — no bundler needed. Collateral flows out of Morpho,
 * so there is no inflation-attack surface requiring the bundler.
 *
 * The caller (`msg.sender`) must be `onBehalf` or be authorized by them on Morpho.
 *
 * @param params.market.chainId - The chain the market lives on.
 * @param params.market.marketParams - Market params (loanToken, collateralToken, oracle, irm, lltv).
 * @param params.args.amount - Amount of collateral to withdraw.
 * @param params.args.onBehalf - Address whose Morpho position the collateral is withdrawn from.
 * @param params.args.receiver - Address that receives the withdrawn collateral.
 * @param params.metadata - Optional analytics metadata attached to the transaction.
 * @returns A deep-frozen `Transaction<BlueWithdrawCollateralAction>` with `to`, `value`,
 *   `data`, and the typed `action` discriminator the simulation layer consumes.
 * @throws {NonPositiveWithdrawCollateralAmountError} when `amount <= 0n`.
 * @example
 * ```ts
 * import { blueWithdrawCollateral } from "@morpho-org/morpho-sdk";
 *
 * const tx = blueWithdrawCollateral({
 *   market: { chainId: 1, marketParams },
 *   args: {
 *     amount: 1_000_000_000_000_000_000n,
 *     onBehalf: borrower,
 *     receiver: borrower,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<BlueWithdrawCollateralAction>>
 * ```
 */
export const blueWithdrawCollateral = ({
  market: { chainId, marketParams },
  args: { amount, onBehalf, receiver },
  metadata,
}: BlueWithdrawCollateralParams): Readonly<
  Transaction<BlueWithdrawCollateralAction>
> => {
  if (amount <= 0n) {
    throw new NonPositiveWithdrawCollateralAmountError(marketParams.id);
  }

  const { morpho } = getChainAddresses(chainId);

  let tx = {
    to: morpho,
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: "withdrawCollateral",
      args: [marketParams, amount, onBehalf, receiver],
    }),
    value: 0n,
  };

  if (metadata) {
    tx = addTransactionMetadata(tx, metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "blueWithdrawCollateral",
      args: {
        market: marketParams.id,
        amount,
        onBehalf,
        receiver,
      },
    },
  });
};
