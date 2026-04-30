import { type MarketParams, getChainAddresses } from "@morpho-org/blue-sdk";
import { blueAbi } from "@morpho-org/blue-sdk-viem";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  type MarketV1WithdrawCollateralAction,
  type Metadata,
  NonPositiveWithdrawCollateralAmountError,
  type Transaction,
} from "../../types/index.js";

/** Parameters for {@link marketV1WithdrawCollateral}. */
export interface MarketV1WithdrawCollateralParams {
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
 * Direct call to `morpho.withdrawCollateral`. No bundler needed — collateral
 * flows out of Morpho, so there is no attack surface requiring the bundler.
 *
 * The caller (`msg.sender`) must be `onBehalf` or be authorized by them.
 *
 * @param params - Withdraw collateral parameters.
 * @returns Deep-frozen transaction.
 */
export const marketV1WithdrawCollateral = ({
  market: { chainId, marketParams },
  args: { amount, onBehalf, receiver },
  metadata,
}: MarketV1WithdrawCollateralParams): Readonly<
  Transaction<MarketV1WithdrawCollateralAction>
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
      type: "marketV1WithdrawCollateral",
      args: {
        market: marketParams.id,
        amount,
        onBehalf,
        receiver,
      },
    },
  });
};
