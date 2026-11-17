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
import {
  EmptyMidnightCollateralSuppliesError,
  type Metadata,
  type MidnightCollateralTransfer,
  type MidnightSupplyCollateralBatchAction,
  MidnightZeroOnBehalfError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";

/** Parameters for an atomic direct Midnight collateral supply batch. */
export interface MidnightSupplyCollateralBatchParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly collateralSupplies: readonly MidnightCollateralTransfer[];
  readonly onBehalf: Address;
  readonly metadata?: Metadata;
}

/**
 * Encodes ordered collateral supplies in one Midnight multicall, even for one entry.
 * Duplicates are rejected: pass one entry per index, unlike bundle flows which sum them.
 *
 * @param params.chainId - Chain containing Midnight.
 * @param params.market - Market receiving collateral.
 * @param params.collateralSupplies - Nonempty ordered supplies, with unique collateral indexes.
 * @param params.onBehalf - Account receiving collateral; this account or an authorized operator must send the transaction.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen transaction targeting Midnight.
 * @throws {EmptyMidnightCollateralSuppliesError} when the list is empty.
 * @throws {DuplicateMidnightCollateralIndexError} when an index repeats.
 * @throws {NonPositiveInputError} when assets are not positive.
 * @throws {InputExceedsMaxError} when assets exceed uint128.
 * @throws {MidnightZeroOnBehalfError} when onBehalf is zero.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the deployment differs.
 * @throws {UnknownCollateralIndexError} when an index is not configured.
 * @throws {MidnightCalldataEncodingError} when an address or ABI input is malformed.
 * @example
 * ```ts
 * const tx = midnightSupplyCollateralBatch({
 *   chainId: 8453, market: marketData.params, onBehalf: user,
 *   collateralSupplies: [{ collateralIndex: 0n, assets: 100n }],
 * });
 * ```
 */
export const midnightSupplyCollateralBatch = (
  params: MidnightSupplyCollateralBatchParams,
): Readonly<Transaction<MidnightSupplyCollateralBatchAction>> => {
  // Reject malformed addresses before comparing with zero.
  validateMidnightAddress("onBehalf", params.onBehalf);
  if (isAddressEqual(params.onBehalf, zeroAddress)) {
    throw new MidnightZeroOnBehalfError("onBehalf");
  }
  // Reject markets from another deployment before encoding.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  // Direct batches require one entry per index rather than summing duplicates.
  validateMidnightCollateralBatch(
    params.collateralSupplies,
    new EmptyMidnightCollateralSuppliesError(),
  );
  const calls = params.collateralSupplies.map(({ collateralIndex, assets }) => {
    if (assets <= 0n) throw new NonPositiveInputError("assets", assets);
    validateMidnightUint128Field("assets", assets);
    // Reject indexes not configured on the market.
    MarketUtils.getCollateralByIndex(params.market, collateralIndex);
    return encodeMidnightCalldata({
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [
        MarketUtils.toStruct(params.market),
        collateralIndex,
        assets,
        params.onBehalf,
      ],
    });
  });
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
      type: "midnightSupplyCollateralBatch",
      args: {
        market: encodeMidnightMarketId(params.market),
        collateralSupplies: params.collateralSupplies.map(
          ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
        ),
        onBehalf: params.onBehalf,
      },
    },
  });
};
