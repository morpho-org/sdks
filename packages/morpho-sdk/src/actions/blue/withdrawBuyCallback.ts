import type { MarketParams } from "@morpho-org/blue-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, encodeFunctionData } from "viem";
import { blueAbi } from "../../abis.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import {
  validateMarketParamsId,
  validateUint256Field,
} from "../../helpers/validate.js";
import {
  type BlueWithdrawBuyCallbackAction,
  type Metadata,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";

/** Parameters for {@link blueWithdrawBuyCallback}. */
export interface BlueWithdrawBuyCallbackParams {
  /** Chain and scoped Morpho Blue market. */
  readonly market: {
    readonly chainId: number;
    readonly marketParams: MarketParams;
  };
  /** Direct Morpho Blue withdrawal arguments. */
  readonly args: {
    /** BlueBuyCallback whose supply position is withdrawn. */
    readonly callbackAddress: Address;
    /** Callback owner, who sends the transaction and receives the loan assets. */
    readonly userAddress: Address;
    /** Supply shares burned. */
    readonly shares: bigint;
  };
  /** Optional transaction metadata suffix. */
  readonly metadata?: Metadata;
}

/**
 * Encodes a direct Morpho Blue `withdraw` of a BlueBuyCallback's supply shares to its owner.
 *
 * The call is `withdraw(marketParams, 0, shares, callbackAddress, userAddress)` on Morpho Blue, not
 * BlueBundlesV1: the callback authorizes its owner on Blue, so the owner withdraws on its behalf
 * directly. Use `client.morpho.blue(...).withdrawBuyCallback(...)` to check the callback, its owner,
 * the Blue authorization and the market liquidity first.
 *
 * @param params - Withdrawal encoding parameters.
 * @param params.market.chainId - Chain containing Morpho Blue.
 * @param params.market.marketParams - Scoped Morpho Blue market parameters.
 * @param params.args.callbackAddress - BlueBuyCallback whose supply position is withdrawn.
 * @param params.args.userAddress - Callback owner, sender and receiver of the loan assets.
 * @param params.args.shares - Supply shares burned.
 * @param params.metadata - Optional transaction metadata.
 * @returns A deep-frozen `Readonly<Transaction<BlueWithdrawBuyCallbackAction>>` whose `to` address
 *   is Morpho Blue.
 * @throws {MarketIdMismatchError} when `marketParams.id` does not hash from its tuple fields.
 * @throws {NegativeInputError} when `shares` is negative.
 * @throws {NonPositiveInputError} when `shares` is zero.
 * @throws {InputExceedsMaxError} when `shares` exceeds `uint256`.
 * @throws {UnsupportedChainIdError} when the chain is absent from the registry.
 * @throws {UnknownAddressError} when Morpho Blue is not registered.
 * @example
 * ```ts
 * import { markets } from "@morpho-org/morpho-test";
 * import { blueWithdrawBuyCallback } from "@morpho-org/morpho-sdk";
 * import { zeroAddress } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const tx = blueWithdrawBuyCallback({
 *   market: { chainId: mainnet.id, marketParams: markets[mainnet.id].usdc_wbtc },
 *   args: { callbackAddress: zeroAddress, userAddress: zeroAddress, shares: 1_000_000n },
 * });
 * // tx satisfies Readonly<Transaction<BlueWithdrawBuyCallbackAction>>
 * ```
 */
export const blueWithdrawBuyCallback = (
  params: BlueWithdrawBuyCallbackParams,
): Readonly<Transaction<BlueWithdrawBuyCallbackAction>> => {
  const { chainId, marketParams } = params.market;
  const { callbackAddress, userAddress, shares } = params.args;
  validateMarketParamsId(marketParams);
  validateUint256Field("shares", shares);
  if (shares === 0n) throw new NonPositiveInputError("shares", shares);

  let tx = {
    to: getChainAddress(chainId, "blue"),
    value: 0n,
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: "withdraw",
      args: [marketParams, 0n, shares, callbackAddress, userAddress],
    }),
  };
  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "blueWithdrawBuyCallback",
      args: {
        market: marketParams.id,
        shares,
        onBehalf: callbackAddress,
        receiver: userAddress,
      },
    },
  });
};
