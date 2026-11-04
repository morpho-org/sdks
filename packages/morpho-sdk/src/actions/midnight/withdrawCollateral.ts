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
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateMidnightReceiver } from "../../helpers/validateMidnightReceiver.js";
import {
  type Metadata,
  type MidnightWithdrawCollateralAction,
  MidnightZeroOnBehalfError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";

/** Parameters for encoding a direct Midnight collateral withdrawal. */
export interface MidnightWithdrawCollateralParams {
  readonly chainId: number;
  readonly market: MarketInput;
  readonly collateralIndex?: bigint;
  readonly assets: bigint;
  readonly onBehalf: Address;
  readonly receiver: Address;
  readonly metadata?: Metadata;
}

/**
 * Encodes a direct Midnight collateral withdrawal.
 *
 * This builder reads no position state. Prefer the entity method for balance and health checks.
 *
 * @param params.chainId - Chain id used to resolve `Midnight`.
 * @param params.market - Midnight market from which collateral is withdrawn.
 * @param params.collateralIndex - Optional collateral index; defaults to `0n`.
 * @param params.assets - Collateral assets to withdraw.
 * @param params.onBehalf - Collateral owner; the sender must be this account or its authorized operator.
 * @param params.receiver - Account receiving withdrawn collateral.
 * @param params.metadata - Optional analytics metadata appended to calldata.
 * @returns A deep-frozen `Transaction<MidnightWithdrawCollateralAction>` targeting `Midnight`.
 * @throws {MidnightZeroReceiverError} when receiver is zero.
 * @throws {MidnightContractReceiverError} when receiver cannot safely receive collateral.
 * @throws {NonPositiveInputError} when `assets <= 0n`.
 * @throws {InputExceedsMaxError} when `assets` exceeds `uint128`.
 * @throws {MidnightZeroOnBehalfError} when `onBehalf` is the zero address.
 * @throws {ChainIdMismatchError} when the market targets another chain.
 * @throws {MidnightMarketAddressMismatchError} when the market targets another Midnight deployment.
 * @throws {UnknownCollateralIndexError} when `collateralIndex` is not configured on the market.
 * @throws {MidnightCalldataEncodingError} when an input cannot be ABI-encoded, such as a malformed `bytes32`, an out-of-range integer or a malformed address.
 * @example
 * ```ts
 * import { midnightWithdrawCollateral } from "@morpho-org/morpho-sdk";
 *
 * const tx = midnightWithdrawCollateral({
 *   chainId: 8453,
 *   market: marketData.params,
 *   collateralIndex: 0n,
 *   assets: 2_000_000n,
 *   onBehalf: user,
 *   receiver: user,
 * });
 * ```
 */
export const midnightWithdrawCollateral = (
  params: MidnightWithdrawCollateralParams,
): Readonly<Transaction<MidnightWithdrawCollateralAction>> => {
  // Reject a malformed account before comparing it with the zero address.
  validateMidnightAddress("onBehalf", params.onBehalf);
  if (params.assets <= 0n) {
    throw new NonPositiveInputError("assets", params.assets);
  }
  validateMidnightUint128Field("assets", params.assets);
  if (isAddressEqual(params.onBehalf, zeroAddress)) {
    throw new MidnightZeroOnBehalfError("onBehalf");
  }

  // Reject markets from another chain deployment before encoding the call.
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  const marketId = encodeMidnightMarketId(params.market);
  const midnight = getChainAddress(params.chainId, "midnight");
  const collateralIndex = params.collateralIndex ?? 0n;
  // Validate that the supplied collateral index is configured before encoding.
  MarketUtils.getCollateralByIndex(params.market, collateralIndex);

  validateMidnightReceiver({
    chainId: params.chainId,
    market: params.market,
    field: "receiver",
    receiver: params.receiver,
  });

  let tx = {
    to: midnight,
    value: 0n,
    data: encodeMidnightCalldata({
      abi: midnightAbi,
      functionName: "withdrawCollateral",
      args: [
        MarketUtils.toStruct(params.market),
        collateralIndex,
        params.assets,
        params.onBehalf,
        params.receiver,
      ],
    }),
  };

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightWithdrawCollateral",
      args: {
        market: marketId,
        collateralIndex,
        assets: params.assets,
        onBehalf: params.onBehalf,
        receiver: params.receiver,
      },
    },
  });
};
