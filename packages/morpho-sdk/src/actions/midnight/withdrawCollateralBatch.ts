import type { MarketInput } from "@morpho-org/midnight-sdk";
import type { Address } from "viem";
import type {
  Metadata,
  MidnightCollateralTransfer,
  MidnightWithdrawCollateralBatchAction,
  Transaction,
} from "../../types/index.js";
import { encodeMidnightWithdrawCollateralBatch } from "./encode.js";
import { parseMidnightWithdrawCollateralBatch } from "./parseCollateralBatch.js";

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
): Readonly<Transaction<MidnightWithdrawCollateralBatchAction>> =>
  encodeMidnightWithdrawCollateralBatch(
    parseMidnightWithdrawCollateralBatch(params),
  );
