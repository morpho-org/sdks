import {
  type AccrualPosition,
  type Market,
  MarketUtils,
  midnightAbi,
} from "@morpho-org/midnight-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import {
  type Address,
  type Hex,
  isAddressEqual,
  maxUint256,
  zeroAddress,
} from "viem";
import {
  encodeMidnightCalldata,
  encodeMidnightMarketId,
} from "../../helpers/encodeMidnightCalldata.js";
import { parseNonnegative } from "../../helpers/parse.js";
import {
  parseMidnightAccount,
  validateMidnightPositionBinding,
} from "../../helpers/parseMidnight.js";
import { validateMidnightAddress } from "../../helpers/validateMidnightAccount.js";
import { validateMidnightUint128Field } from "../../helpers/validateMidnightBounds.js";
import { validateMidnightCollateralBatch } from "../../helpers/validateMidnightCollateralBatch.js";
import { validateMidnightMarket } from "../../helpers/validateMidnightMarket.js";
import { validateMidnightReceiver } from "../../helpers/validateMidnightReceiver.js";
import {
  EmptyMidnightCollateralSuppliesError,
  EmptyMidnightCollateralWithdrawalsError,
  MidnightCalldataEncodingError,
  type MidnightCollateralTransfer,
  MidnightZeroOnBehalfError,
  NonPositiveInputError,
} from "../../types/index.js";
import { snapshotMidnightMetadata } from "./parse.js";
import type { MidnightSupplyCollateralBatchParams } from "./supplyCollateralBatch.js";
import type { MidnightWithdrawCollateralBatchParams } from "./withdrawCollateralBatch.js";

const parsedSupplyCollateralBatch = Symbol();
const parsedWithdrawCollateralBatch = Symbol();

/** Complete owned direct batch, including ABI-bounded ordered calls. @internal */
export interface ParsedMidnightSupplyCollateralBatch
  extends Omit<MidnightSupplyCollateralBatchParams, "market"> {
  readonly marketId: Hex;
  readonly calls: readonly Hex[];
  readonly [parsedSupplyCollateralBatch]: true;
}

/** Complete owned direct withdrawal batch and its ABI-bounded ordered calls. @internal */
export interface ParsedMidnightWithdrawCollateralBatch
  extends Omit<MidnightWithdrawCollateralBatchParams, "market"> {
  readonly marketId: Hex;
  readonly calls: readonly Hex[];
  readonly [parsedWithdrawCollateralBatch]: true;
}

/** Owns standalone batch constraints in address/deployment/list/entry/ABI order. @internal */
export const parseMidnightSupplyCollateralBatch = (
  params: MidnightSupplyCollateralBatchParams,
): ParsedMidnightSupplyCollateralBatch => {
  validateMidnightAddress("onBehalf", params.onBehalf);
  if (isAddressEqual(params.onBehalf, zeroAddress)) {
    throw new MidnightZeroOnBehalfError("onBehalf");
  }
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  validateMidnightCollateralBatch(
    params.collateralSupplies,
    new EmptyMidnightCollateralSuppliesError(),
  );
  const calls = params.collateralSupplies.map(({ collateralIndex, assets }) => {
    if (assets <= 0n) {
      throw new NonPositiveInputError("assets", assets);
    }
    validateMidnightUint128Field("assets", assets);
    // ABI checks remain interleaved with entries: a malformed market precedes a later bad amount.
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
  return deepFreeze({
    chainId: params.chainId,
    marketId: encodeMidnightMarketId(params.market),
    collateralSupplies: params.collateralSupplies.map(
      ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
    ),
    onBehalf: params.onBehalf,
    calls,
    metadata: snapshotMidnightMetadata(params.metadata),
    [parsedSupplyCollateralBatch]: true as const,
  });
};

/** Complete entity supply input; reserves affect approvals, not calldata. @internal */
export interface MidnightSupplyCollateralBatchPreparationParams
  extends Omit<
    MidnightSupplyCollateralBatchParams,
    "onBehalf" | "collateralSupplies"
  > {
  readonly accountAddress: Address;
  readonly collateralSupplies: readonly (MidnightCollateralTransfer & {
    readonly reservedCollateralAssets?: bigint;
  })[];
}

/** Complete supply preparation, keeping zero-owner and ABI errors lazy without incomplete actions. @internal */
export type ParsedMidnightSupplyCollateralBatchPreparation =
  | { readonly error: MidnightZeroOnBehalfError }
  | {
      readonly onBehalf: Address;
      readonly approvals: readonly {
        readonly token: Address;
        readonly amount: bigint;
      }[];
      readonly action:
        | ParsedMidnightSupplyCollateralBatch
        | { readonly error: MidnightCalldataEncodingError };
    };

/** Owns entity order and records only ABI/zero-owner failures for lazy construction. @internal */
export const parseMidnightSupplyCollateralBatchPreparation = (
  params: MidnightSupplyCollateralBatchPreparationParams,
): ParsedMidnightSupplyCollateralBatchPreparation => {
  validateMidnightAddress("accountAddress", params.accountAddress);
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  validateMidnightCollateralBatch(
    params.collateralSupplies,
    new EmptyMidnightCollateralSuppliesError(),
  );
  const supplies = params.collateralSupplies.map(
    ({ collateralIndex, assets, reservedCollateralAssets }) => {
      if (assets <= 0n) {
        throw new NonPositiveInputError("assets", assets);
      }
      validateMidnightUint128Field("assets", assets);
      const reserved = parseNonnegative(
        "reservedCollateralAssets",
        reservedCollateralAssets ?? 0n,
      );
      const token = MarketUtils.getCollateralByIndex(
        params.market,
        collateralIndex,
      ).token;
      return { collateralIndex, assets, reserved, token };
    },
  );
  if (isAddressEqual(params.accountAddress, zeroAddress)) {
    return Object.freeze({ error: new MidnightZeroOnBehalfError("onBehalf") });
  }
  const onBehalf = params.accountAddress;
  const amounts = new Map<Address, bigint>();
  for (const { token, assets, reserved } of supplies) {
    amounts.set(token, (amounts.get(token) ?? 0n) + assets + reserved);
  }
  const approvals = deepFreeze(
    [...amounts].map(([token, amount]) => ({ token, amount })),
  );
  // Supply historically defers ABI errors until buildTx; approvals must remain usable.
  let action:
    | ParsedMidnightSupplyCollateralBatch
    | { readonly error: MidnightCalldataEncodingError };
  try {
    const market = MarketUtils.toStruct(params.market);
    const calls = supplies.map(({ collateralIndex, assets }) =>
      encodeMidnightCalldata({
        abi: midnightAbi,
        functionName: "supplyCollateral",
        args: [market, collateralIndex, assets, onBehalf],
      }),
    );
    action = deepFreeze({
      chainId: params.chainId,
      marketId: encodeMidnightMarketId(market),
      collateralSupplies: supplies.map(({ collateralIndex, assets }) => ({
        collateralIndex,
        assets,
      })),
      onBehalf,
      calls,
      metadata: snapshotMidnightMetadata(params.metadata),
      [parsedSupplyCollateralBatch]: true as const,
    });
  } catch (error) {
    if (!(error instanceof MidnightCalldataEncodingError)) {
      throw error;
    }
    action = Object.freeze({ error });
  }
  return Object.freeze({ onBehalf, approvals, action });
};

/** Complete raw withdrawal preparation; domain snapshots remain entity-owned. @internal */
export interface MidnightWithdrawCollateralBatchPreparationParams
  extends Omit<
    MidnightWithdrawCollateralBatchParams,
    "market" | "onBehalf" | "receiver"
  > {
  readonly accountAddress: Address;
  readonly marketData: Market;
  readonly positionData: AccrualPosition;
  readonly collateralPrices: readonly bigint[];
  readonly receiver?: Address;
}

/** Complete action contract with the context needed for dynamic entity checks. @internal */
export type ParsedMidnightWithdrawCollateralBatchPreparation =
  ParsedMidnightWithdrawCollateralBatch &
    Pick<
      MidnightWithdrawCollateralBatchPreparationParams,
      "accountAddress" | "marketData" | "positionData" | "collateralPrices"
    >;

/** Owns entity binding, all-index resolution, then receiver and per-entry amount/ABI checks once. @internal */
export const parseMidnightWithdrawCollateralBatchPreparation = (
  params: MidnightWithdrawCollateralBatchPreparationParams,
): ParsedMidnightWithdrawCollateralBatchPreparation => {
  const onBehalf = parseMidnightAccount(
    "accountAddress",
    params.accountAddress,
  );
  validateMidnightMarket({
    market: params.marketData,
    chainId: params.chainId,
  });
  // Bind the supplied snapshot before interpreting its collateral balances.
  validateMidnightPositionBinding(params);
  validateMidnightCollateralBatch(
    params.collateralWithdrawals,
    new EmptyMidnightCollateralWithdrawalsError(),
  );
  const collateralWithdrawals = params.collateralWithdrawals.map(
    ({ collateralIndex, assets }) => {
      // Every index must precede receiver, amount and ABI errors, including max resolution.
      MarketUtils.getCollateralByIndex(
        params.marketData.params,
        collateralIndex,
      );
      return {
        collateralIndex,
        assets:
          assets === maxUint256
            ? (params.positionData.collateral[Number(collateralIndex)] ?? 0n)
            : assets,
      };
    },
  );
  const receiver = params.receiver ?? onBehalf;
  validateMidnightReceiver({
    chainId: params.chainId,
    market: params.marketData.params,
    field: "receiver",
    receiver,
  });
  const calls = collateralWithdrawals.map(({ collateralIndex, assets }) => {
    if (assets <= 0n) {
      throw new NonPositiveInputError("assets", assets);
    }
    validateMidnightUint128Field("assets", assets);
    // ABI checks stay interleaved with amounts, not ahead of the first or after the last.
    return encodeMidnightCalldata({
      abi: midnightAbi,
      functionName: "withdrawCollateral",
      args: [
        MarketUtils.toStruct(params.marketData.params),
        collateralIndex,
        assets,
        onBehalf,
        receiver,
      ],
    });
  });
  // Freeze only owned descriptors, never the domain classes retained for dynamic checks.
  return Object.freeze({
    chainId: params.chainId,
    marketId: encodeMidnightMarketId(params.marketData.params),
    collateralWithdrawals: deepFreeze(collateralWithdrawals),
    onBehalf,
    receiver,
    calls: deepFreeze(calls),
    metadata: deepFreeze(snapshotMidnightMetadata(params.metadata)),
    accountAddress: onBehalf,
    marketData: params.marketData,
    positionData: params.positionData,
    collateralPrices: params.collateralPrices,
    [parsedWithdrawCollateralBatch]: true as const,
  });
};

/** Owns standalone withdrawal constraints, retaining per-entry ABI error precedence. @internal */
export const parseMidnightWithdrawCollateralBatch = (
  params: MidnightWithdrawCollateralBatchParams,
): ParsedMidnightWithdrawCollateralBatch => {
  validateMidnightAddress("onBehalf", params.onBehalf);
  if (isAddressEqual(params.onBehalf, zeroAddress)) {
    throw new MidnightZeroOnBehalfError("onBehalf");
  }
  validateMidnightMarket({ market: params.market, chainId: params.chainId });
  validateMidnightReceiver({
    chainId: params.chainId,
    market: params.market,
    field: "receiver",
    receiver: params.receiver,
  });
  validateMidnightCollateralBatch(
    params.collateralWithdrawals,
    new EmptyMidnightCollateralWithdrawalsError(),
  );
  const calls = params.collateralWithdrawals.map(
    ({ collateralIndex, assets }) => {
      if (assets <= 0n) {
        throw new NonPositiveInputError("assets", assets);
      }
      validateMidnightUint128Field("assets", assets);
      // Preserve index then ABI checks for each entry, not all indexes before all ABI checks.
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
  return deepFreeze({
    chainId: params.chainId,
    marketId: encodeMidnightMarketId(params.market),
    collateralWithdrawals: params.collateralWithdrawals.map(
      ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
    ),
    onBehalf: params.onBehalf,
    receiver: params.receiver,
    calls,
    metadata: snapshotMidnightMetadata(params.metadata),
    [parsedWithdrawCollateralBatch]: true as const,
  });
};
