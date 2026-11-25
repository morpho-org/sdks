import {
  parseBlueMarket,
  parseNativeFunding,
  parseUint256,
} from "../../helpers/parse.js";
import {
  type BlueSupplyCollateralBorrowAction,
  InputExceedsMaxError,
  NonPositiveInputError,
  ReallocationsRequireBorrowError,
  type Transaction,
  type VaultV2BlueReallocation,
} from "../../types/index.js";
import type { BlueAllocations, BlueOperationInput } from "./common.js";
import { parseBlueAllocations, parseBlueBundlesV1Common } from "./common.js";
import { encodeBlueSupplyCollateralBorrow } from "./encode.js";
import {
  bindBlueSupplyCollateralBorrowSignatures,
  validateBlueSupplyCollateralBorrowSignatureLegs,
} from "./signatures.js";
import type { BlueSupplyCollateralBorrowParams } from "./supplyCollateralBorrow.js";

declare const blueSupplyCollateralBorrowBrand: unique symbol;
/** Validated collateral supply and borrow inputs. @internal */
export interface BlueSupplyCollateralBorrowInput extends BlueOperationInput {
  readonly collateralAssets: bigint;
  readonly borrowAssets: bigint;
  readonly maxLtv: bigint;
  readonly value: bigint;
  readonly publicAllocations: BlueAllocations["publicAllocations"];
  readonly reallocationPenaltyAssets: bigint;
  readonly [blueSupplyCollateralBorrowBrand]: true;
}

/** Constructs the complete standalone operation from raw params in established error order. @internal */
export const parseBlueSupplyCollateralBorrow = (
  params: BlueSupplyCollateralBorrowParams,
) => {
  const marketParams = parseBlueMarket(params.market.marketParams);
  const amounts = {
    collateralAssets: parseUint256(
      "collateralAssets",
      params.args.collateralAssets,
    ),
    borrowAssets: parseUint256("borrowAssets", params.args.borrowAssets),
    maxLtv: parseUint256("maxLtv", params.args.maxLtv),
  };
  if (amounts.collateralAssets === 0n && amounts.borrowAssets === 0n) {
    throw new NonPositiveInputError("collateralAssets or borrowAssets", 0n);
  }
  const mode = parseBlueSupplyCollateralBorrowMode({
    ...amounts,
    reallocations: [...(params.args.reallocations ?? [])],
  });
  // Reject signatures for inactive legs before continuing.
  validateBlueSupplyCollateralBorrowSignatureLegs(amounts, params.args);
  const common = {
    chainId: params.market.chainId,
    userAddress: params.args.userAddress,
    deadline: params.args.deadline,
    referralFeePct: params.args.referralFeePct,
    referralFeeRecipient: params.args.referralFeeRecipient,
    metadata: params.metadata,
  };
  const normalized = parseBlueBundlesV1Common(common);
  const value = parseNativeFunding({
    chainId: common.chainId,
    token: marketParams.collateralToken,
    fundedAmount: amounts.collateralAssets,
    nativeAmount: params.args.nativeAmount,
  });
  const bound = bindBlueSupplyCollateralBorrowSignatures(
    {
      ...common,
      marketParams,
      collateralAssets: amounts.collateralAssets,
      value,
    },
    params.args,
  );
  const allocations = parseBlueSupplyCollateralBorrowAllocations(
    marketParams,
    mode,
  );
  const fields: Omit<BlueSupplyCollateralBorrowInput, symbol> = {
    ...normalized,
    chainId: common.chainId,
    userAddress: common.userAddress,
    marketParams,
    metadata: common.metadata,
    ...amounts,
    value,
    publicAllocations: allocations.publicAllocations,
    reallocationPenaltyAssets: allocations.penaltyAssets,
  };
  const input = fields as BlueSupplyCollateralBorrowInput;
  return { ...input, bound };
};

/** Checks reallocation compatibility after the constructor's nonzero-leg guard. @internal */
export const parseBlueSupplyCollateralBorrowMode = (params: {
  readonly collateralAssets: bigint;
  readonly borrowAssets: bigint;
  readonly reallocations: readonly VaultV2BlueReallocation[];
}) => {
  const { borrowAssets, reallocations } = params;
  if (borrowAssets === 0n && reallocations.length > 0) {
    throw new ReallocationsRequireBorrowError();
  }
  return params;
};

/** Parses allocations and their input-only borrow penalty bound. @internal */
export const parseBlueSupplyCollateralBorrowAllocations = (
  marketParams: ReturnType<typeof parseBlueMarket>,
  mode: ReturnType<typeof parseBlueSupplyCollateralBorrowMode>,
) => {
  const allocations = parseBlueAllocations(
    [...mode.reallocations],
    marketParams,
  );
  if (allocations.penaltyAssets > mode.borrowAssets) {
    throw new InputExceedsMaxError({
      field: "reallocationPenaltyAssets",
      value: allocations.penaltyAssets,
      max: mode.borrowAssets,
    });
  }
  return allocations;
};

/** Independently validates fresh buildTx signatures before encoding. @internal */
export const buildBlueSupplyCollateralBorrow = (
  parsed: BlueSupplyCollateralBorrowInput,
  signatures: Pick<
    BlueSupplyCollateralBorrowParams["args"],
    "requirementSignature" | "authorizationSignature"
  > = {},
): Readonly<Transaction<BlueSupplyCollateralBorrowAction>> => {
  // Reject signatures for inactive legs before continuing.
  validateBlueSupplyCollateralBorrowSignatureLegs(parsed, signatures);
  return encodeBlueSupplyCollateralBorrow({
    ...parsed,
    bound: bindBlueSupplyCollateralBorrowSignatures(parsed, signatures),
  });
};
