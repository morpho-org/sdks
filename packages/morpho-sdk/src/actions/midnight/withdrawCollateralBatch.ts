import {
  type MarketInput,
  MarketUtils,
  midnightAbi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual, zeroAddress } from "viem";
import {
  encodeMidnightCalldata,
  encodeMidnightMarketId,
} from "../../helpers/encodeMidnightCalldata.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import { validateMidnightAddress } from "../../helpers/validateMidnightAccount.js";
import { validateMidnightUint128Field } from "../../helpers/validateMidnightBounds.js";
import { validateMidnightCollateralBatch } from "../../helpers/validateMidnightCollateralBatch.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateMidnightReceiver } from "../../helpers/validateMidnightReceiver.js";
import {
  EmptyMidnightCollateralWithdrawalsError,
  type Metadata,
  type MidnightCollateralTransfer,
  type MidnightWithdrawCollateralBatchAction,
  MidnightZeroOnBehalfError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";

/** Parameters for an atomic direct Midnight collateral withdrawal batch. */
export interface MidnightWithdrawCollateralBatchParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly collateralWithdrawals: readonly MidnightCollateralTransfer[];
  readonly onBehalf: Address;
  readonly receiver: Address;
  readonly metadata?: Metadata;
}

/**
 * Encodes ordered collateral withdrawals in one Midnight multicall, even for one entry.
 * Duplicates are rejected: pass one entry per index, unlike bundle flows which sum them.
 *
 * @param params - Market, ordered withdrawals, owner, shared receiver and optional metadata.
 * @param params.chainId - Chain containing Midnight.
 * @param params.market - Market holding collateral.
 * @param params.collateralWithdrawals - Nonempty ordered withdrawals, with unique collateral indexes.
 * @param params.onBehalf - Collateral owner; this account or an authorized operator must send the transaction.
 * @param params.receiver - Shared recipient of all withdrawn collateral.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen transaction targeting Midnight.
 * @throws {EmptyMidnightCollateralWithdrawalsError} when the list is empty.
 * @throws {DuplicateMidnightCollateralIndexError} when an index repeats.
 * @throws {MidnightZeroReceiverError} when receiver is zero.
 * @throws {MidnightContractReceiverError} when receiver cannot safely receive collateral.
 * @throws {NonPositiveInputError} when assets are not positive.
 * @throws {InputExceedsMaxError} when assets exceed uint128.
 * @throws {MidnightZeroOnBehalfError} when onBehalf is zero.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the deployment differs.
 * @throws {UnknownCollateralIndexError} when an index is not configured.
 * @throws {MidnightCalldataEncodingError} when an address or ABI input is malformed.
 * @example
 * ```ts
 * const tx = midnightWithdrawCollateralBatch({
 *   chainId: 8453, market: marketData.params, onBehalf: user, receiver: user,
 *   collateralWithdrawals: [{ collateralIndex: 0n, assets: 100n }],
 * });
 * ```
 */
export const midnightWithdrawCollateralBatch = (
  params: MidnightWithdrawCollateralBatchParams,
): Readonly<Transaction<MidnightWithdrawCollateralBatchAction>> => {
  // Reject malformed addresses before comparing with zero.
  validateMidnightAddress("onBehalf", params.onBehalf);
  if (isAddressEqual(params.onBehalf, zeroAddress)) {
    throw new MidnightZeroOnBehalfError("onBehalf");
  }
  // Reject markets from another deployment before encoding.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  validateMidnightReceiver({
    chainId: params.chainId,
    market: params.market,
    field: "receiver",
    receiver: params.receiver,
  });
  // Direct batches require one entry per index rather than summing duplicates.
  validateMidnightCollateralBatch(
    params.collateralWithdrawals,
    new EmptyMidnightCollateralWithdrawalsError(),
  );
  const calls = params.collateralWithdrawals.map(
    ({ collateralIndex, assets }) => {
      if (assets <= 0n) throw new NonPositiveInputError("assets", assets);
      validateMidnightUint128Field("assets", assets);
      // Reject indexes not configured on the market.
      MarketUtils.getCollateralByIndex(params.market, collateralIndex);
      return encodeMidnightCalldata({
        abi: midnightAbi,
        functionName: "withdrawCollateral",
        args: [
          MarketUtils.toStruct(params.market),
          collateralIndex,
          assets,
          params.onBehalf,
          params.receiver,
        ],
      });
    },
  );
  let tx = {
    to: getChainAddress(params.chainId, "midnight"),
    value: 0n,
    data: encodeMidnightCalldata({
      abi: midnightAbi,
      functionName: "multicall",
      args: [calls],
    }),
  };
  if (params.metadata) tx = addTransactionMetadata(tx, params.metadata);
  return deepFreeze({
    ...tx,
    action: {
      type: "midnightWithdrawCollateralBatch",
      args: {
        market: encodeMidnightMarketId(params.market),
        collateralWithdrawals: params.collateralWithdrawals.map(
          ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
        ),
        onBehalf: params.onBehalf,
        receiver: params.receiver,
      },
    },
  });
};
