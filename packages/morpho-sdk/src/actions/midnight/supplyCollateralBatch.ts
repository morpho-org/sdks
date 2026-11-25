import type { MarketInput } from "@morpho-org/midnight-sdk";
import type { Address } from "viem";
import type {
  Metadata,
  MidnightCollateralTransfer,
  MidnightSupplyCollateralBatchAction,
  Transaction,
} from "../../types/index.js";
import { encodeMidnightSupplyCollateralBatch } from "./encode.js";
import { parseMidnightSupplyCollateralBatch } from "./parseCollateralBatch.js";

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
): Readonly<Transaction<MidnightSupplyCollateralBatchAction>> =>
  encodeMidnightSupplyCollateralBatch(
    parseMidnightSupplyCollateralBatch(params),
  );
