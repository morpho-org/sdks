import { midnightAbi, midnightBundlesV2Abi } from "@morpho-org/midnight-sdk";
import { deepFreeze, getChainAddress } from "@morpho-org/morpho-ts";
import { maxUint256, zeroAddress, zeroHash } from "viem";
import { encodeMidnightCalldata } from "../../helpers/encodeMidnightCalldata.js";
import { addTransactionMetadata } from "../../helpers/index.js";
import type {
  MidnightCancelAndMakeAction,
  MidnightRedeemAction,
  MidnightRepayWithdrawCollateralAction,
  MidnightSupplyCollateralAction,
  MidnightSupplyCollateralBatchAction,
  MidnightSupplyCollateralTakeBorrowAction,
  MidnightTakeBorrowAction,
  MidnightTakeLendAction,
  MidnightTakeRepayWithdrawCollateralAction,
  MidnightTakeWithdrawAction,
  MidnightWithdrawCollateralAction,
  MidnightWithdrawCollateralBatchAction,
  Transaction,
} from "../../types/index.js";
import type { ParsedMidnightCancelAndMake } from "./cancelAndMake.js";
import type {
  ParsedMidnightSupplyCollateralBatch,
  ParsedMidnightWithdrawCollateralBatch,
} from "./parseCollateralBatch.js";
import type { ParsedMidnightRedeem } from "./redeem.js";
import type { ParsedMidnightRepayWithdrawCollateral } from "./repayWithdrawCollateral.js";
import type { ParsedMidnightSupplyCollateral } from "./supplyCollateral.js";
import type { ParsedMidnightSupplyCollateralTakeBorrow } from "./supplyCollateralTakeBorrow.js";
import type { ParsedMidnightTakeBorrow } from "./takeBorrow.js";
import type { ParsedMidnightTakeLend } from "./takeLend.js";
import type { ParsedMidnightTakeRepayWithdrawCollateral } from "./takeRepayWithdrawCollateral.js";
import type { ParsedMidnightTakeWithdraw } from "./takeWithdraw.js";
import type { ParsedMidnightWithdrawCollateral } from "./withdrawCollateral.js";

/** Encodes an owned collateral supply batch without repeating static validation. @internal */
export const encodeMidnightSupplyCollateralBatch = (
  params: ParsedMidnightSupplyCollateralBatch,
): Readonly<Transaction<MidnightSupplyCollateralBatchAction>> => {
  let tx = {
    to: getChainAddress(params.chainId, "midnight"),
    value: 0n,
    data: encodeMidnightCalldata({
      abi: midnightAbi,
      functionName: "multicall",
      args: [params.calls],
    }),
  };
  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }
  return deepFreeze({
    ...tx,
    action: {
      type: "midnightSupplyCollateralBatch",
      args: {
        market: params.marketId,
        collateralSupplies: params.collateralSupplies,
        onBehalf: params.onBehalf,
      },
    },
  });
};

/** Encodes an owned collateral withdrawal batch without repeating static validation. @internal */
export const encodeMidnightWithdrawCollateralBatch = (
  params: ParsedMidnightWithdrawCollateralBatch,
): Readonly<Transaction<MidnightWithdrawCollateralBatchAction>> => {
  let tx = {
    to: getChainAddress(params.chainId, "midnight"),
    value: 0n,
    data: encodeMidnightCalldata({
      abi: midnightAbi,
      functionName: "multicall",
      args: [params.calls],
    }),
  };
  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }
  return deepFreeze({
    ...tx,
    action: {
      type: "midnightWithdrawCollateralBatch",
      args: {
        market: params.marketId,
        collateralWithdrawals: params.collateralWithdrawals,
        onBehalf: params.onBehalf,
        receiver: params.receiver,
      },
    },
  });
};

/** Encodes parsed supplyCollateral inputs without repeating static validation. @internal */
export const encodeMidnightSupplyCollateral = (
  params: ParsedMidnightSupplyCollateral,
): Readonly<Transaction<MidnightSupplyCollateralAction>> => {
  let tx = {
    to: getChainAddress(params.chainId, "midnight"),
    value: 0n,
    data: encodeMidnightCalldata({
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [
        params.market.struct,
        params.collateralIndex,
        params.assets,
        params.onBehalf,
      ],
    }),
  };

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightSupplyCollateral",
      args: {
        market: params.market.id,
        collateralIndex: params.collateralIndex,
        assets: params.assets,
        onBehalf: params.onBehalf,
      },
    },
  });
};

/** Encodes parsed withdrawCollateral inputs without repeating static validation. @internal */
export const encodeMidnightWithdrawCollateral = (
  params: ParsedMidnightWithdrawCollateral,
): Readonly<Transaction<MidnightWithdrawCollateralAction>> => {
  let tx = {
    to: getChainAddress(params.chainId, "midnight"),
    value: 0n,
    data: encodeMidnightCalldata({
      abi: midnightAbi,
      functionName: "withdrawCollateral",
      args: [
        params.market.struct,
        params.collateralIndex,
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
        market: params.market.id,
        collateralIndex: params.collateralIndex,
        assets: params.assets,
        onBehalf: params.onBehalf,
        receiver: params.receiver,
      },
    },
  });
};

/** Encodes parsed redeem inputs without repeating static validation. @internal */
export const encodeMidnightRedeem = (
  params: ParsedMidnightRedeem,
): Readonly<Transaction<MidnightRedeemAction>> => {
  let tx = {
    to: getChainAddress(params.chainId, "midnight"),
    value: 0n,
    data: encodeMidnightCalldata({
      abi: midnightAbi,
      functionName: "withdraw",
      args: [
        params.market.struct,
        params.units,
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
      type: "midnightRedeem",
      args: {
        market: params.market.id,
        units: params.units,
        onBehalf: params.onBehalf,
        receiver: params.receiver,
      },
    },
  });
};

/** Encodes parsed repayWithdrawCollateral inputs without repeating static validation. @internal */
export const encodeMidnightRepayWithdrawCollateral = (
  params: ParsedMidnightRepayWithdrawCollateral,
): Readonly<Transaction<MidnightRepayWithdrawCollateralAction>> => {
  const { repay, nativeFunding } = params;
  const market = params.market.struct;
  const args = [
    true, // reduceOnly
    true, // repayEnabled
    [], // offerFills
    params.collateralWithdrawals.map(({ collateralIndex, assets }) => ({
      collateralIndex,
      assets,
    })), // collateralWithdrawals
    params.collateralReceiver, // collateralReceiver
    0n, // referralFeePct
    zeroAddress, // referralFeeRecipient
    // MidnightBundlesV2 checks maxContinuousFee only per offer fill; there are none here.
    0n, // maxContinuousFee
    params.deadline, // deadline
    nativeFunding.wrappedNative, // wrappedNative
  ] as const;

  let tx = {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: nativeFunding.value,
    data:
      repay.type === "assets"
        ? encodeMidnightCalldata({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
            args: [market, repay.assets, repay.assets, ...args],
          })
        : encodeMidnightCalldata({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral",
            args: [market, maxUint256, repay.maxBuyerAssets, ...args],
          }),
  };

  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightRepayWithdrawCollateral",
      args: {
        market: params.market.id,
        repay: { ...repay },
        collateralWithdrawals: params.collateralWithdrawals.map(
          ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
        ),
        collateralReceiver: params.collateralReceiver,
        deadline: params.deadline,
      },
    },
  });
};

/** Encodes parsed TakeLend inputs and an owned feasibility-selected offer subset. @internal */
export const encodeMidnightTakeLend = (
  params: ParsedMidnightTakeLend,
  offerIndexes?: readonly number[],
): Readonly<Transaction<MidnightTakeLendAction>> => {
  const takeableOffers = params.takeableOffers.filter(
    (_, index) => offerIndexes === undefined || offerIndexes.includes(index),
  );
  const {
    target,
    marketId,
    referralFeePct,
    referralFeeRecipient,
    nativeFunding,
  } = params;
  const market = params.market;
  const args = [
    false, // reduceOnly
    false, // repayEnabled
    takeableOffers, // offerFills
    [], // collateralWithdrawals
    zeroAddress, // collateralReceiver
    referralFeePct, // referralFeePct
    referralFeeRecipient, // referralFeeRecipient
    params.maxContinuousFee, // maxContinuousFee
    params.deadline, // deadline
    nativeFunding.wrappedNative, // wrappedNative
  ] as const;

  let tx = {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: nativeFunding.value,
    data:
      target.type === "assets"
        ? encodeMidnightCalldata({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
            args: [market, target.assets, target.minUnits, ...args],
          })
        : encodeMidnightCalldata({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral",
            args: [market, target.units, target.maxBuyerAssets, ...args],
          }),
  };
  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightTakeLend",
      args: {
        market: marketId,
        target: { ...params.target },
        takeableOffers: takeableOffers.length,
        maxContinuousFee: params.maxContinuousFee,
        deadline: params.deadline,
        referralFeePct,
        referralFeeRecipient,
      },
    },
  });
};

/** Encodes parsed TakeBorrow inputs and an owned feasibility-selected offer subset. @internal */
export const encodeMidnightTakeBorrow = (
  params: ParsedMidnightTakeBorrow,
  offerIndexes?: readonly number[],
): Readonly<Transaction<MidnightTakeBorrowAction>> => {
  const takeableOffers = params.takeableOffers.filter(
    (_, index) => offerIndexes === undefined || offerIndexes.includes(index),
  );
  const { target, marketId, referralFeePct, referralFeeRecipient } = params;
  const market = params.market;
  const args = [
    false, // reduceOnly
    params.receiver, // receiver
    [], // collateralSupplies
    takeableOffers, // offerFills
    referralFeePct, // referralFeePct
    referralFeeRecipient, // referralFeeRecipient
    params.deadline, // deadline
    zeroAddress, // wrappedNative
  ] as const;

  let tx = {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: 0n,
    data:
      target.type === "assets"
        ? encodeMidnightCalldata({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
            args: [market, target.assets, target.maxUnits, ...args],
          })
        : encodeMidnightCalldata({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget",
            args: [market, target.units, target.minSellerAssets, ...args],
          }),
  };
  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightTakeBorrow",
      args: {
        market: marketId,
        target: { ...params.target },
        receiver: params.receiver,
        takeableOffers: takeableOffers.length,
        deadline: params.deadline,
        referralFeePct,
        referralFeeRecipient,
      },
    },
  });
};

/** Encodes parsed TakeWithdraw inputs and an owned feasibility-selected offer subset. @internal */
export const encodeMidnightTakeWithdraw = (
  params: ParsedMidnightTakeWithdraw,
  offerIndexes?: readonly number[],
): Readonly<Transaction<MidnightTakeWithdrawAction>> => {
  const takeableOffers = params.takeableOffers.filter(
    (_, index) => offerIndexes === undefined || offerIndexes.includes(index),
  );
  const { target, marketId, referralFeePct, referralFeeRecipient } = params;
  const market = params.market;
  const args = [
    true, // reduceOnly
    params.receiver, // receiver
    [], // collateralSupplies
    takeableOffers, // offerFills
    referralFeePct, // referralFeePct
    referralFeeRecipient, // referralFeeRecipient
    params.deadline, // deadline
    zeroAddress, // wrappedNative
  ] as const;

  let tx = {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: 0n,
    data:
      target.type === "assets"
        ? encodeMidnightCalldata({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
            args: [market, target.assets, target.maxUnits, ...args],
          })
        : encodeMidnightCalldata({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget",
            args: [market, target.units, target.minSellerAssets, ...args],
          }),
  };
  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightTakeWithdraw",
      args: {
        market: marketId,
        target: { ...params.target },
        receiver: params.receiver,
        takeableOffers: takeableOffers.length,
        deadline: params.deadline,
        referralFeePct,
        referralFeeRecipient,
      },
    },
  });
};

/** Encodes parsed SupplyCollateralTakeBorrow inputs and an owned feasibility-selected offer subset. @internal */
export const encodeMidnightSupplyCollateralTakeBorrow = (
  params: ParsedMidnightSupplyCollateralTakeBorrow,
  offerIndexes?: readonly number[],
): Readonly<Transaction<MidnightSupplyCollateralTakeBorrowAction>> => {
  const takeableOffers = params.takeableOffers.filter(
    (_, index) => offerIndexes === undefined || offerIndexes.includes(index),
  );
  const {
    target,
    marketId,
    referralFeePct,
    referralFeeRecipient,
    nativeFunding,
  } = params;
  const market = params.market;
  const args = [
    false, // reduceOnly
    params.receiver, // receiver
    params.collateralSupplies.map(({ collateralIndex, assets }) => ({
      collateralIndex,
      assets,
    })), // collateralSupplies
    takeableOffers, // offerFills
    referralFeePct, // referralFeePct
    referralFeeRecipient, // referralFeeRecipient
    params.deadline, // deadline
    nativeFunding.wrappedNative, // wrappedNative
  ] as const;

  let tx = {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: nativeFunding.value,
    data:
      target.type === "assets"
        ? encodeMidnightCalldata({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget",
            args: [market, target.assets, target.maxUnits, ...args],
          })
        : encodeMidnightCalldata({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget",
            args: [market, target.units, target.minSellerAssets, ...args],
          }),
  };
  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightSupplyCollateralTakeBorrow",
      args: {
        market: marketId,
        target: { ...params.target },
        receiver: params.receiver,
        collateralSupplies: params.collateralSupplies.map(
          ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
        ),
        takeableOffers: takeableOffers.length,
        deadline: params.deadline,
        referralFeePct,
        referralFeeRecipient,
      },
    },
  });
};

/** Encodes parsed TakeRepayWithdrawCollateral inputs and an owned feasibility-selected offer subset. @internal */
export const encodeMidnightTakeRepayWithdrawCollateral = (
  params: ParsedMidnightTakeRepayWithdrawCollateral,
  offerIndexes?: readonly number[],
): Readonly<Transaction<MidnightTakeRepayWithdrawCollateralAction>> => {
  const takeableOffers = params.takeableOffers.filter(
    (_, index) => offerIndexes === undefined || offerIndexes.includes(index),
  );
  const {
    target,
    marketId,
    referralFeePct,
    referralFeeRecipient,
    nativeFunding,
  } = params;
  const market = params.market;
  const args = [
    true, // reduceOnly
    params.repayEnabled, // repayEnabled
    takeableOffers, // offerFills
    params.collateralWithdrawals.map(({ collateralIndex, assets }) => ({
      collateralIndex,
      assets,
    })), // collateralWithdrawals
    params.collateralReceiver, // collateralReceiver
    referralFeePct, // referralFeePct
    referralFeeRecipient, // referralFeeRecipient
    params.maxContinuousFee, // maxContinuousFee
    params.deadline, // deadline
    nativeFunding.wrappedNative, // wrappedNative
  ] as const;

  let tx = {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: nativeFunding.value,
    data:
      target.type === "assets"
        ? encodeMidnightCalldata({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
            args: [market, target.assets, target.minUnits, ...args],
          })
        : encodeMidnightCalldata({
            abi: midnightBundlesV2Abi,
            functionName:
              "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral",
            args: [market, target.units, target.maxBuyerAssets, ...args],
          }),
  };
  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightTakeRepayWithdrawCollateral",
      args: {
        market: marketId,
        target: { ...params.target },
        repayEnabled: params.repayEnabled,
        collateralWithdrawals: params.collateralWithdrawals.map(
          ({ collateralIndex, assets }) => ({ collateralIndex, assets }),
        ),
        collateralReceiver: params.collateralReceiver,
        takeableOffers: takeableOffers.length,
        maxContinuousFee: params.maxContinuousFee,
        deadline: params.deadline,
        referralFeePct,
        referralFeeRecipient,
      },
    },
  });
};

/** Midnight market argument for `MidnightBundlesV2` calls that supply no collateral. */
const emptyMidnightMarket = {
  chainId: 0n,
  midnight: zeroAddress,
  loanToken: zeroAddress,
  collateralParams: [],
  maturity: 0n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
} as const;

/** Encodes parsed maker publications and cancellations without static revalidation. @internal */
export const encodeMidnightCancelAndMake = (
  params: ParsedMidnightCancelAndMake,
): Readonly<Transaction<MidnightCancelAndMakeAction>> => {
  const { publication, nativeFunding } = params;
  const cancellations = params.cancellations.map(({ group, maxConsumed }) => ({
    group,
    maxConsumed,
  }));
  const normalized = params.publicationData;
  const { supplies, blueSupply, signature } = normalized;

  let tx = {
    to: getChainAddress(params.chainId, "midnightBundlesV2"),
    value: nativeFunding.value,
    data: encodeMidnightCalldata({
      abi: midnightBundlesV2Abi,
      functionName: "midnightBundlesV2CancelAndMake",
      args: [
        normalized.blueMarket, // blueMarket
        normalized.assetsToPark, // assetsToPark
        normalized.callbackSalt, // callbackSalt
        publication?.collateral == null
          ? emptyMidnightMarket
          : publication.collateral.market, // market
        supplies, // collateralSupplies
        normalized.ratifier, // ratifier
        normalized.root, // newRoot
        signature.height, // signatureHeight
        signature.nonce, // signatureNonce
        signature.deadline, // signatureDeadline
        signature.v, // v
        signature.r, // r
        signature.s, // s
        cancellations, // groupsToCancel
        normalized.payload, // payload
        params.deadline, // deadline
        nativeFunding.wrappedNative, // wrappedNative
      ],
    }),
  };
  if (params.metadata) {
    tx = addTransactionMetadata(tx, params.metadata);
  }

  return deepFreeze({
    ...tx,
    action: {
      type: "midnightCancelAndMake",
      args: {
        market: publication?.collateral == null ? zeroHash : params.marketId,
        ratifier: normalized.ratifier,
        root: normalized.root,
        groups: normalized.groups,
        cancellations,
        collateralSupplies: supplies,
        ...(blueSupply && { blueSupply }),
        ...(nativeFunding.value > 0n
          ? { nativeAmount: nativeFunding.value }
          : {}),
        deadline: params.deadline,
      },
    },
  });
};
