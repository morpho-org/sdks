import type { MarketId } from "@morpho-org/blue-sdk";
import { blueAbi, midnightAbi } from "@morpho-org/morpho-sdk/abis";
import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  ethAddress,
  type Hex,
  isAddressEqual,
} from "viem";
import {
  InvalidSimulationResponseError,
  SimulationValidationError,
  SlippageCheckUnavailableError,
} from "../../errors.js";
import {
  type OperationInputs,
  type OperationType,
  QUOTE_FIELD_DIRECTION,
  type ScalarQuoteField,
} from "../../limits.js";
import type { ResolvedSlippageOperation } from "../backends/resolve-assets.js";
import {
  operationMeasurementPlan,
  positionBoundsMarketId,
} from "../measurement-plan.js";
import type { ParsedOperationLimit } from "../request/parse-request.js";
import type { StateRead } from "./contract.js";

type CounterSideGuard = {
  readonly field: "supplyShares" | "borrowShares" | "collateral";
  readonly direction: "increase" | "decrease";
};

const BLUE_INPUT_COUNTER_GUARDS: Readonly<
  Partial<Record<OperationType, readonly CounterSideGuard[]>>
> = {
  blueSupply: [
    { field: "borrowShares", direction: "increase" },
    { field: "collateral", direction: "decrease" },
  ],
  blueWithdraw: [
    { field: "borrowShares", direction: "increase" },
    { field: "collateral", direction: "decrease" },
  ],
  blueBorrow: [
    { field: "collateral", direction: "decrease" },
    { field: "supplyShares", direction: "decrease" },
  ],
  blueRepay: [
    { field: "collateral", direction: "decrease" },
    { field: "supplyShares", direction: "decrease" },
  ],
  blueSupplyCollateral: [
    { field: "borrowShares", direction: "increase" },
    { field: "supplyShares", direction: "decrease" },
  ],
  blueWithdrawCollateral: [
    { field: "borrowShares", direction: "increase" },
    { field: "supplyShares", direction: "decrease" },
  ],
  blueSupplyCollateralBorrow: [
    { field: "supplyShares", direction: "decrease" },
  ],
  blueRepayWithdrawCollateral: [
    { field: "supplyShares", direction: "decrease" },
  ],
} as const satisfies Record<
  Extract<keyof OperationInputs, `blue${string}`>,
  readonly CounterSideGuard[]
>;

/** One quoted amount's observation source. @internal */
type SlippageMeasurement = {
  readonly field: ScalarQuoteField | "positions";
} & (
  | {
      readonly type: "native";
      readonly account: Address;
      readonly readId?: string;
    }
  /** A scalar read: an ERC-20 balance or a Midnight collateral amount. */
  | {
      readonly type: "balance";
      readonly readId: string;
      readonly token?: Address;
      readonly account?: Address;
    }
  | {
      readonly type: "position";
      readonly readId: string;
      readonly marketId: MarketId;
      readonly shares: "supplyShares" | "borrowShares" | "collateral";
    }
  | {
      readonly type: "midnightNet";
      readonly creditReadId: string;
      readonly debtReadId: string;
    }
  | { readonly type: "midnightDebt"; readonly readId: string }
);

/** Caller quote paired with exactly the observations it needs. @internal */
export interface SlippageOperationReads {
  readonly limit: ParsedOperationLimit;
  readonly measurements: readonly SlippageMeasurement[];
  readonly netWalletAssets?: boolean;
  readonly counterSide?: {
    readonly readId: string;
    readonly guards: readonly CounterSideGuard[];
  };
  /** Read id of the `position` bound's after-value position read, when set. */
  readonly positionBoundsReadId?: string;
  /** Read id of reduce-only Midnight sell debt, when set. */
  readonly debtReadId?: string;
  readonly creditReadId?: string;
  readonly collateralReads?: readonly {
    readonly collateralIndex: bigint;
    readonly positionReadId: string;
    readonly receiverBalanceReadId?: string;
  }[];
  readonly collateralSupplyReads?: readonly {
    readonly collateralIndex: bigint;
    readonly readId: string;
  }[];
  readonly walletBounds?: readonly {
    readonly token: Address;
    readonly account: Address;
    readonly readId: string;
    readonly maxPulls: bigint;
    readonly minProceeds: bigint;
  }[];
}

/** Scalar balance or the supply shares, borrow shares and collateral returned by Morpho.position. @internal */
export type StateValue =
  | bigint
  | {
      readonly supplyShares: bigint;
      readonly borrowShares: bigint;
      readonly collateral: bigint;
    };

function planBalanceRead(params: {
  readonly reads: Map<string, StateRead>;
  readonly token: Address;
  readonly account: Address;
}): string {
  const { reads, token, account } = params;
  const id = `balance:${token}:${account}`.toLowerCase();
  reads.set(id, {
    kind: "erc20.balance",
    id,
    to: token,
    token,
    account,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    }),
  });
  return id;
}

function planPositionRead(params: {
  readonly reads: Map<string, StateRead>;
  readonly morpho: Address;
  readonly marketId: MarketId;
  readonly account: Address;
}): string {
  const { reads, morpho, marketId, account } = params;
  const id = `position:${marketId}:${account}`.toLowerCase();
  reads.set(id, {
    kind: "morpho.position",
    id,
    to: morpho,
    morpho,
    marketId,
    owner: account,
    data: encodeFunctionData({
      abi: blueAbi,
      functionName: "position",
      args: [marketId, account],
    }),
  });
  return id;
}

function planMidnightCollateralRead(params: {
  readonly reads: Map<string, StateRead>;
  readonly midnight: Address;
  readonly marketId: Hex;
  readonly collateralIndex: bigint;
  readonly account: Address;
  readonly midnightCollateralTokens?: readonly {
    readonly collateralIndex: bigint;
    readonly token: Address;
  }[];
}): {
  readonly readId: string;
  readonly token: Address | undefined;
} {
  const token = params.midnightCollateralTokens?.find(
    (entry) => entry.collateralIndex === params.collateralIndex,
  )?.token;
  const readId =
    `midnight-collateral:${params.marketId}:${params.collateralIndex}:${params.account}`.toLowerCase();
  params.reads.set(readId, {
    kind: "midnight.collateral",
    id: readId,
    to: params.midnight,
    midnight: params.midnight,
    marketId: params.marketId,
    collateralIndex: params.collateralIndex,
    owner: params.account,
    data: encodeFunctionData({
      abi: midnightAbi,
      functionName: "collateral",
      args: [params.marketId, params.account, params.collateralIndex],
    }),
  });
  return { readId, token };
}

type StateReadParams = Parameters<typeof planStateReads>[0];

/** One operation's read planning: its resolved operation, measured account and the shared deduplicated read map. */
interface OperationReadContext {
  readonly params: StateReadParams;
  readonly reads: Map<string, StateRead>;
  readonly index: number;
  readonly limit: ResolvedSlippageOperation["limit"];
  readonly assetsPaid: ResolvedSlippageOperation["assetsPaid"];
  readonly assetsReceived: ResolvedSlippageOperation["assetsReceived"];
  readonly midnightMarket: ResolvedSlippageOperation["midnightMarket"];
  readonly midnightCollateralTokens: ResolvedSlippageOperation["midnightCollateralTokens"];
  readonly account: Address;
  readonly label: string;
}

/** Operation read planning once its measurement sources and Midnight position reads are known. */
interface QuoteMeasurementContext extends OperationReadContext {
  readonly plan: ReturnType<typeof operationMeasurementPlan>;
  readonly positionAccount: Address;
  readonly creditReadId: string | undefined;
  readonly debtReadId: string | undefined;
  readonly netWalletAssets: boolean;
  readonly paidIsNative: boolean;
  readonly receivedIsNative: boolean;
}

/** Midnight operations that always measure the bundle sender reject another account. */
function assertSenderMeasured(
  params: StateReadParams,
  {
    limit,
    index,
  }: {
    readonly limit: ResolvedSlippageOperation["limit"];
    readonly index: number;
  },
): void {
  if (
    (limit.type === "midnightTakeBorrow" ||
      limit.type === "midnightTakeWithdraw" ||
      limit.type === "midnightRepayWithdrawCollateral" ||
      limit.type === "midnightTakeRepayWithdrawCollateral") &&
    "account" in limit
  ) {
    throw new SimulationValidationError(
      `"${limit.type}" always measures the bundle sender "${params.owner}"; omit account.`,
      [
        `limits.operations[${index}].account: must measure the bundle sender; omit account or use the sender where supported`,
      ],
    );
  }
  if (
    limit.type === "midnightSupplyBlueMakeLend" &&
    limit.account !== undefined &&
    !isAddressEqual(limit.account, params.owner)
  ) {
    throw new SimulationValidationError(
      `Blue parking is measured on the bundle sender "${params.owner}" because MidnightBundlesV2 creates the BlueBuyCallback for msg.sender; account must equal the sender or be omitted.`,
      [
        `limits.operations[${index}].account: must measure the bundle sender; omit account or use the sender where supported`,
      ],
    );
  }
  if (
    limit.type === "midnightSupplyCollateralMakeBorrow" &&
    limit.account !== undefined &&
    !isAddressEqual(limit.account, params.owner)
  ) {
    throw new SimulationValidationError(
      `Maker collateral is measured on the bundle sender "${params.owner}" because MidnightBundlesV2 cancelAndMake supplies collateral for msg.sender; account must equal the sender or be omitted.`,
      [
        `limits.operations[${index}].account: must measure the bundle sender; omit account or use the sender where supported`,
      ],
    );
  }
}

/** Native-funded Midnight pay-ins need a registered wNative to be measured. */
function assertNativeFundingMeasurable(ctx: OperationReadContext): void {
  const { params, index, limit, label } = ctx;
  if (
    (limit.type === "midnightSupplyBlueMakeLend" ||
      limit.type === "midnightTakeLend" ||
      limit.type === "midnightSupplyCollateral" ||
      limit.type === "midnightSupplyCollateralMakeBorrow") &&
    params.nativeValueSent &&
    params.wNative === undefined
  ) {
    let operation = "native-funded collateral supply";
    if (limit.type === "midnightSupplyBlueMakeLend") {
      operation = "native-funded Blue parking";
    } else if (limit.type === "midnightTakeLend") {
      operation = "a native-funded take";
    }
    throw new SlippageCheckUnavailableError(
      `${label}: native value is sent but no wNative is registered for this chain, so ${operation} cannot be measured. Send no native value.`,
      {
        operationIndex: index,
        operationType: limit.type,
        field: "assetsPaid",
        reason: "noRegisteredWrappedNative",
      },
    );
  }
}

/** Plan the accrued Midnight credit read shared by redeem bounds and sell measurements. */
function planCreditRead(ctx: OperationReadContext): string | undefined {
  const { params, reads, index, limit, midnightMarket, account } = ctx;
  // Redeem bounds and sell measurements share one accrued credit read.
  if (
    limit.type === "midnightRedeem" ||
    limit.type === "midnightTakeLend" ||
    limit.type === "midnightTakeBorrow" ||
    limit.type === "midnightTakeWithdraw" ||
    limit.type === "midnightSupplyCollateralTakeBorrow" ||
    limit.type === "midnightRepayWithdrawCollateral" ||
    limit.type === "midnightTakeRepayWithdrawCollateral"
  ) {
    if (midnightMarket === undefined) {
      throw new SlippageCheckUnavailableError(
        `Cannot observe credit for "${limit.type}": no Midnight market is resolved for this market id.`,
        {
          operationIndex: index,
          operationType: limit.type,
          field: "credit",
          reason: "missingRead",
        },
      );
    }
    const creditReadId =
      `midnight-credit:${limit.marketId}:${account}`.toLowerCase();
    reads.set(creditReadId, {
      kind: "midnight.credit",
      id: creditReadId,
      to: params.midnight,
      midnight: params.midnight,
      marketId: limit.marketId,
      owner: account,
      data: encodeFunctionData({
        abi: midnightAbi,
        functionName: "updatePositionView",
        args: [midnightMarket, limit.marketId, account],
      }),
    });
    return creditReadId;
  }
  return undefined;
}

/** Plan the Midnight debt read of take and repayment operations. */
function planDebtRead(ctx: OperationReadContext): string | undefined {
  const { params, reads, limit, account } = ctx;
  if (
    limit.type === "midnightTakeLend" ||
    limit.type === "midnightTakeBorrow" ||
    limit.type === "midnightTakeWithdraw" ||
    limit.type === "midnightSupplyCollateralTakeBorrow" ||
    limit.type === "midnightRepayWithdrawCollateral" ||
    limit.type === "midnightTakeRepayWithdrawCollateral"
  ) {
    const debtReadId =
      `midnight-debt:${limit.marketId}:${account}`.toLowerCase();
    reads.set(debtReadId, {
      kind: "midnight.debt",
      id: debtReadId,
      to: params.midnight,
      midnight: params.midnight,
      marketId: limit.marketId,
      owner: account,
      data: encodeFunctionData({
        abi: midnightAbi,
        functionName: "debt",
        args: [limit.marketId, account],
      }),
    });
    return debtReadId;
  }
  return undefined;
}

/** Plan per-index Midnight collateral and receiver balance reads for quoted withdrawals. */
function planCollateralWithdrawalReads(
  ctx: OperationReadContext,
): SlippageOperationReads["collateralReads"] {
  const {
    params,
    reads,
    index,
    limit,
    midnightMarket,
    midnightCollateralTokens,
    account,
    label,
  } = ctx;
  if (
    limit.type === "midnightWithdrawCollateralBatch" ||
    limit.type === "midnightRepayWithdrawCollateral" ||
    limit.type === "midnightTakeRepayWithdrawCollateral"
  ) {
    if (params.nativeValueSent && params.wNative === undefined) {
      throw new SlippageCheckUnavailableError(
        `${label}: native value is sent but no wNative is registered for this chain, so native-funded repayment cannot be measured. Send no native value.`,
        {
          operationIndex: index,
          operationType: limit.type,
          field:
            limit.type === "midnightWithdrawCollateralBatch"
              ? "collateralWithdrawals"
              : "assetsPaid",
          reason: "noRegisteredWrappedNative",
        },
      );
    }
    if (midnightMarket === undefined) {
      throw new SlippageCheckUnavailableError(
        `Cannot observe collateral for "${limit.type}": no Midnight market is resolved for this market id.`,
        {
          operationIndex: index,
          operationType: limit.type,
          field: "collateralWithdrawals",
          reason: "missingRead",
        },
      );
    }
    const quoted = limit.quote.collateralWithdrawals ?? [];
    const receiver = limit.receiver ?? params.owner;
    if (
      limit.quote.assetsPaid !== undefined &&
      isAddressEqual(receiver, params.owner)
    ) {
      const sameTokenWithdrawal = quoted.find(({ collateralIndex }) => {
        const token = midnightCollateralTokens?.find(
          (entry) => entry.collateralIndex === collateralIndex,
        )?.token;
        return (
          token !== undefined && isAddressEqual(token, midnightMarket.loanToken)
        );
      });
      if (sameTokenWithdrawal !== undefined) {
        throw new SimulationValidationError(
          `${label}: collateral index "${sameTokenWithdrawal.collateralIndex}" uses the loan token and is delivered to the payer, so repayment and delivery cannot be measured separately. Send the withdrawal to a different receiver or split repay and withdraw into separate bundles.`,
          [
            `limits.operations[${index}].quote.collateralWithdrawals: cannot measure repayment and delivery separately; change the receiver or funding`,
          ],
        );
      }
    }
    const wNative = params.wNative;
    if (
      params.nativeValueSent &&
      wNative !== undefined &&
      isAddressEqual(receiver, params.owner)
    ) {
      const wNativeWithdrawal = quoted.find(({ collateralIndex }) => {
        const token = midnightCollateralTokens?.find(
          (entry) => entry.collateralIndex === collateralIndex,
        )?.token;
        return token !== undefined && isAddressEqual(token, wNative);
      });
      if (wNativeWithdrawal !== undefined) {
        throw new SimulationValidationError(
          `${label}: collateral index "${wNativeWithdrawal.collateralIndex}" uses wNative while native ETH is sent, so wrapped ETH and collateral delivery cannot be measured separately. Send the withdrawal to a different receiver or send no ETH.`,
          [
            `limits.operations[${index}].quote.collateralWithdrawals: cannot measure repayment and delivery separately; change the receiver or funding`,
          ],
        );
      }
    }
    const midnight = params.midnight;
    const indexes = new Set(
      quoted.map(({ collateralIndex }) => collateralIndex),
    );
    if (indexes.size > 0) {
      return [...indexes].map((collateralIndex) => {
        const { readId: positionReadId, token } = planMidnightCollateralRead({
          reads,
          midnight,
          marketId: limit.marketId,
          collateralIndex,
          account,
          midnightCollateralTokens,
        });
        if (token === undefined) {
          throw new SlippageCheckUnavailableError(
            `Cannot resolve collateral token for index "${collateralIndex}" in "${limit.type}".`,
            {
              operationIndex: index,
              operationType: limit.type,
              field: "collateralWithdrawals",
              reason: "missingRead",
            },
          );
        }
        return {
          collateralIndex,
          positionReadId,
          receiverBalanceReadId: planBalanceRead({
            reads,
            token,
            account: receiver,
          }),
        };
      });
    }
  }
  return undefined;
}

/** Plan per-index Midnight collateral reads and net wallet bounds for quoted supplies. */
function planCollateralSupplyReads(ctx: OperationReadContext): {
  readonly collateralSupplyReads?: SlippageOperationReads["collateralSupplyReads"];
  readonly walletBounds?: SlippageOperationReads["walletBounds"];
} {
  const {
    params,
    reads,
    index,
    limit,
    assetsReceived,
    midnightCollateralTokens,
    account,
    label,
  } = ctx;
  if (
    limit.type === "midnightSupplyCollateralTakeBorrow" ||
    limit.type === "midnightSupplyCollateralBatch"
  ) {
    if (params.nativeValueSent && params.wNative === undefined) {
      throw new SlippageCheckUnavailableError(
        `${label}: native value is sent but no wNative is registered for this chain, so native-funded collateral supplies cannot be measured. Send no native value.`,
        {
          operationIndex: index,
          operationType: limit.type,
          field: "collateralSupplies",
          reason: "noRegisteredWrappedNative",
        },
      );
    }
    const quoted = limit.quote.collateralSupplies ?? [];
    const receiver = limit.receiver ?? params.owner;
    const grouped = new Map<
      string,
      {
        token: Address;
        account: Address;
        maxPulls: bigint;
        minProceeds: bigint;
      }
    >();
    const collateralSupplyReads = quoted.map(({ collateralIndex, assets }) => {
      const { readId, token } = planMidnightCollateralRead({
        reads,
        midnight: params.midnight,
        marketId: limit.marketId,
        collateralIndex,
        account,
        midnightCollateralTokens,
      });
      if (token === undefined) {
        throw new SlippageCheckUnavailableError(
          `Cannot resolve collateral token for index "${collateralIndex}" in "${limit.type}".`,
          {
            operationIndex: index,
            operationType: limit.type,
            field: "collateralSupplies",
            reason: "missingRead",
          },
        );
      }
      const key = `${token.toLowerCase()}:${params.owner.toLowerCase()}`;
      const bound = grouped.get(key) ?? {
        token,
        account: params.owner,
        maxPulls: 0n,
        minProceeds: 0n,
      };
      bound.maxPulls += assets;
      grouped.set(key, bound);
      return { collateralIndex, readId };
    });
    if (limit.type === "midnightSupplyCollateralTakeBorrow") {
      if (
        assetsReceived === undefined ||
        limit.quote.assetsReceived === undefined
      ) {
        throw new SlippageCheckUnavailableError(
          `${label}: cannot resolve the loan token or proceeds quote.`,
          {
            operationIndex: index,
            operationType: limit.type,
            field: "assetsReceived",
            reason: "missingRead",
          },
        );
      }
      const proceedsKey = `${assetsReceived.toLowerCase()}:${receiver.toLowerCase()}`;
      const proceedsBound = grouped.get(proceedsKey) ?? {
        token: assetsReceived,
        account: receiver,
        maxPulls: 0n,
        minProceeds: 0n,
      };
      proceedsBound.minProceeds += limit.quote.assetsReceived;
      grouped.set(proceedsKey, proceedsBound);
    }
    const walletBounds = [...grouped.values()].map((bound) => {
      const nativeValue =
        params.wNative !== undefined &&
        isAddressEqual(bound.token, params.wNative) &&
        isAddressEqual(bound.account, params.owner)
          ? (params.nativeValue ?? 0n)
          : 0n;
      if (nativeValue > bound.maxPulls) {
        throw new SimulationValidationError(
          `${label}: native value sent by the owner (${nativeValue}) exceeds this operation's quoted wNative collateral supply (${bound.maxPulls}), so wNative pulls cannot be attributed. Send at most the quoted wNative collateral supply (${bound.maxPulls}) as native value.`,
          [
            `limits.operations[${index}].quote.collateralSupplies: must cover the owner's native value (${nativeValue})`,
          ],
        );
      }
      return {
        ...bound,
        maxPulls: bound.maxPulls - nativeValue,
        readId: planBalanceRead({
          reads,
          token: bound.token,
          account: bound.account,
        }),
      };
    });
    return { collateralSupplyReads, walletBounds };
  }
  return {};
}

/** Plan the position, credit, debt or balance measurement of one quoted non-asset side. */
function planSideMeasurement(
  ctx: QuoteMeasurementContext,
  field: Exclude<ScalarQuoteField, "assetsPaid" | "assetsReceived">,
): SlippageMeasurement | undefined {
  const {
    params,
    reads,
    index,
    limit,
    midnightCollateralTokens,
    account,
    plan,
    positionAccount,
    creditReadId,
    debtReadId,
  } = ctx;
  const source = plan[field];
  if (source === undefined) {
    return undefined;
  }
  if (source.type === "position") {
    return {
      field,
      type: "position",
      marketId: source.marketId,
      readId: planPositionRead({
        reads,
        morpho: params.morpho,
        marketId: source.marketId,
        account: positionAccount,
      }),
      shares: source.shares,
    };
  }
  if (source.type === "midnightCredit") {
    if (creditReadId === undefined) {
      throw new SlippageCheckUnavailableError(
        `Cannot observe "${field}" for "${limit.type}": no credit read is planned.`,
        {
          operationIndex: index,
          operationType: limit.type,
          field: field,
          reason: "missingRead",
        },
      );
    }
    return { field, type: "balance", readId: creditReadId };
  }
  if (source.type === "midnightDebt") {
    if (debtReadId === undefined) {
      throw new SlippageCheckUnavailableError(
        `Cannot observe "${field}" for "${limit.type}": no debt read is planned.`,
        {
          operationIndex: index,
          operationType: limit.type,
          field: field,
          reason: "missingRead",
        },
      );
    }
    return {
      field,
      type: "midnightDebt",
      readId: debtReadId,
    };
  }
  if (source.type === "midnightNet") {
    if (creditReadId === undefined || debtReadId === undefined) {
      throw new SlippageCheckUnavailableError(
        `Cannot observe "${field}" for "${limit.type}": no credit or debt read is planned.`,
        {
          operationIndex: index,
          operationType: limit.type,
          field: field,
          reason: "missingRead",
        },
      );
    }
    return {
      field,
      type: "midnightNet",
      creditReadId,
      debtReadId,
    };
  }
  if (source.type === "midnightCollateral") {
    const { readId } = planMidnightCollateralRead({
      reads,
      midnight: params.midnight,
      marketId: source.marketId,
      collateralIndex: source.collateralIndex,
      account,
      midnightCollateralTokens,
    });
    return { field, type: "balance", readId };
  }
  return {
    field,
    type: "balance",
    token: source.token,
    account,
    readId: planBalanceRead({
      reads,
      token: source.token,
      account,
    }),
  };
}

/** Plan the native or token balance measurement of one quoted asset side. */
function planAssetMeasurement(
  ctx: QuoteMeasurementContext,
  field: "assetsPaid" | "assetsReceived",
): SlippageMeasurement | undefined {
  const {
    params,
    reads,
    limit,
    assetsPaid,
    assetsReceived,
    netWalletAssets,
    paidIsNative,
    receivedIsNative,
  } = ctx;
  const token = field === "assetsReceived" ? assetsReceived : assetsPaid;
  const holder =
    field === "assetsReceived"
      ? (limit.receiver ?? params.owner)
      : params.owner;
  if (token === undefined) {
    return undefined;
  }
  const fieldIsNative =
    field === "assetsPaid" ? paidIsNative : receivedIsNative;
  const nativeAlias = netWalletAssets
    ? paidIsNative || receivedIsNative
    : fieldIsNative;
  const implicitNativeFunding =
    params.nativeValueSent === true && isAddressEqual(holder, params.owner);
  const typedNativeMeasurement =
    limit.inputs !== undefined && (nativeAlias || implicitNativeFunding);
  const midnightNativePayment =
    field === "assetsPaid" &&
    (limit.type === "midnightRepayWithdrawCollateral" ||
      limit.type === "midnightTakeRepayWithdrawCollateral" ||
      limit.type === "midnightTakeLend" ||
      limit.type === "midnightSupplyBlueMakeLend" ||
      ((limit.type === "midnightSupplyCollateral" ||
        limit.type === "midnightSupplyCollateralMakeBorrow") &&
        params.nativeValueSent === true));
  const nativeAndWrapped =
    params.wNative !== undefined &&
    isAddressEqual(token, params.wNative) &&
    (typedNativeMeasurement || midnightNativePayment);
  if (isAddressEqual(token, ethAddress) || nativeAndWrapped) {
    return {
      field,
      type: "native",
      account: holder,
      ...(nativeAndWrapped
        ? {
            readId: planBalanceRead({
              reads,
              token,
              account: holder,
            }),
          }
        : {}),
    };
  }
  return {
    field,
    type: "balance",
    readId: planBalanceRead({ reads, token, account: holder }),
  };
}

/** Plan measurements for every quoted scalar side, in direction-table order. */
function planQuoteMeasurements(
  ctx: QuoteMeasurementContext,
): SlippageMeasurement[] {
  const { limit } = ctx;
  const measurements: SlippageMeasurement[] = [];
  for (const field of Object.keys(
    QUOTE_FIELD_DIRECTION,
  ) as ScalarQuoteField[]) {
    if (limit.quote[field] === undefined) {
      continue;
    }
    if (
      limit.type === "midnightSupplyCollateralTakeBorrow" &&
      field === "assetsReceived"
    ) {
      continue;
    }
    const assetField = field === "assetsReceived" || field === "assetsPaid";
    const measurement = assetField
      ? planAssetMeasurement(ctx, field)
      : planSideMeasurement(ctx, field);
    if (measurement !== undefined) {
      measurements.push(measurement);
    }
  }
  return measurements;
}

/** Plan receiver supply-share measurements for in-kind redemption positions. */
function planInKindPositionMeasurements(
  ctx: OperationReadContext,
): SlippageMeasurement[] {
  const { params, reads, limit } = ctx;
  // In-kind redemption deliveries land on the asset receiver (the
  // transaction sender by default), not on the share `account`.
  return (limit.quote.positions ?? []).map((quoted) => ({
    field: "positions",
    type: "position",
    marketId: quoted.marketId,
    readId: planPositionRead({
      reads,
      morpho: params.morpho,
      marketId: quoted.marketId,
      account: limit.receiver ?? params.owner,
    }),
    shares: "supplyShares",
  }));
}

/** Plan the position-bound and counter-side reads and assemble the operation's reads. */
function finishOperationReads(
  ctx: QuoteMeasurementContext,
  {
    measurements,
    collateralReads,
    collateralSupplyReads,
    walletBounds,
  }: Pick<
    SlippageOperationReads,
    | "measurements"
    | "collateralReads"
    | "collateralSupplyReads"
    | "walletBounds"
  >,
): SlippageOperationReads {
  const {
    params,
    reads,
    limit,
    account,
    positionAccount,
    creditReadId,
    debtReadId,
    netWalletAssets,
  } = ctx;
  // `position` bounds read the subject's absolute after-state in the
  // operation's Blue market (the refinance target, where the debt lands).
  const boundsMarketId =
    limit.position === undefined ? undefined : positionBoundsMarketId(limit);
  let positionBoundsReadId: string | undefined;
  if (limit.position !== undefined && limit.type === "midnightRedeem") {
    positionBoundsReadId = creditReadId;
  } else if (boundsMarketId !== undefined) {
    positionBoundsReadId = planPositionRead({
      reads,
      morpho: params.morpho,
      marketId: boundsMarketId,
      account,
    });
  }
  const counterGuards = BLUE_INPUT_COUNTER_GUARDS[limit.type];
  const counterSide =
    limit.inputs === undefined ||
    counterGuards === undefined ||
    !("marketId" in limit)
      ? undefined
      : { marketId: limit.marketId, guards: counterGuards };
  return {
    limit,
    measurements,
    positionBoundsReadId,
    ...(counterSide === undefined
      ? {}
      : {
          counterSide: {
            ...counterSide,
            readId: planPositionRead({
              reads,
              morpho: params.morpho,
              marketId: counterSide.marketId,
              account: positionAccount,
            }),
          },
        }),
    netWalletAssets,
    ...(debtReadId === undefined ? {} : { debtReadId }),
    ...(creditReadId === undefined ? {} : { creditReadId }),
    ...(collateralReads === undefined ? {} : { collateralReads }),
    ...(collateralSupplyReads === undefined ? {} : { collateralSupplyReads }),
    ...(walletBounds === undefined ? {} : { walletBounds }),
  };
}

/** Plan one operation's measurements and reads into the shared read map. */
function planOperationReads(
  params: StateReadParams,
  {
    reads,
    operation,
    index,
  }: {
    readonly reads: Map<string, StateRead>;
    readonly operation: ResolvedSlippageOperation;
    readonly index: number;
  },
): SlippageOperationReads {
  const {
    limit,
    assetsPaid,
    assetsReceived,
    midnightMarket,
    midnightCollateralTokens,
    blueBuyCallback,
  } = operation;
  // Throws when the operation names an account its protocol cannot measure.
  assertSenderMeasured(params, { limit, index });
  const paidIsNative =
    limit.assetPaid !== undefined &&
    isAddressEqual(limit.assetPaid, ethAddress);
  const receivedIsNative =
    limit.assetReceived !== undefined &&
    isAddressEqual(limit.assetReceived, ethAddress);
  const netWalletAssets =
    assetsPaid !== undefined &&
    assetsReceived !== undefined &&
    isAddressEqual(assetsPaid, assetsReceived) &&
    isAddressEqual(params.owner, limit.receiver ?? params.owner);
  const account =
    limit.type === "midnightSupplyCollateralTakeBorrow"
      ? params.owner
      : (limit.account ?? params.owner);
  const label = `Limit operation ${index} (${limit.type})`;
  const ctx: OperationReadContext = {
    params,
    reads,
    index,
    limit,
    assetsPaid,
    assetsReceived,
    midnightMarket,
    midnightCollateralTokens,
    account,
    label,
  };
  let positionAccount = account;
  if (limit.type === "midnightSupplyBlueMakeLend") {
    if (blueBuyCallback === undefined) {
      throw new SlippageCheckUnavailableError(
        `${label}: no BlueBuyCallback address is resolved for this limit.`,
        {
          operationIndex: index,
          operationType: limit.type,
          field: "position",
          reason: "missingRead",
        },
      );
    }
    positionAccount = blueBuyCallback;
  }
  // Throws when native value funds a pay-in no registered wNative can measure.
  assertNativeFundingMeasurable(ctx);
  const plan = operationMeasurementPlan(limit);
  const creditReadId = planCreditRead(ctx);
  const debtReadId = planDebtRead(ctx);
  const collateralReads = planCollateralWithdrawalReads(ctx);
  const { collateralSupplyReads, walletBounds } =
    planCollateralSupplyReads(ctx);
  const measurementCtx: QuoteMeasurementContext = {
    ...ctx,
    plan,
    positionAccount,
    creditReadId,
    debtReadId,
    netWalletAssets,
    paidIsNative,
    receivedIsNative,
  };
  const measurements = [
    ...planQuoteMeasurements(measurementCtx),
    ...planInKindPositionMeasurements(ctx),
  ];
  return finishOperationReads(measurementCtx, {
    measurements,
    collateralReads,
    collateralSupplyReads,
    walletBounds,
  });
}

/** Native value sent must be covered by a measured native side. */
function assertNativeValueMeasured(
  params: StateReadParams,
  operations: readonly SlippageOperationReads[],
): void {
  if (
    params.nativeValueSent === true &&
    operations.some(
      ({ limit }) =>
        limit.inputs !== undefined ||
        limit.type === "midnightSupplyCollateral" ||
        limit.type === "midnightSupplyCollateralMakeBorrow",
    ) &&
    !operations.some(({ measurements }) =>
      measurements.some(
        (measurement) =>
          measurement.type === "native" &&
          isAddressEqual(measurement.account, params.owner),
      ),
    )
  ) {
    throw new SimulationValidationError(
      "Native value sent by the request is not covered by any measured native side. Remove the transaction value, or declare the native or wNative asset on the operation it funds.",
      ["transactions: native value must be covered by a measured native side"],
    );
  }
}

/** A Midnight combined operation's position reads must not overlap another operation's reads. */
function assertNoMidnightPositionOverlap(
  operations: readonly SlippageOperationReads[],
): void {
  for (const [index, operation] of operations.entries()) {
    if (
      operation.limit.type !== "midnightSupplyCollateralTakeBorrow" &&
      operation.limit.type !== "midnightSupplyCollateralBatch"
    ) {
      continue;
    }
    const positionReadIds = [
      ...(operation.collateralSupplyReads ?? []).map(({ readId }) => readId),
      ...(operation.creditReadId === undefined ? [] : [operation.creditReadId]),
      ...(operation.debtReadId === undefined ? [] : [operation.debtReadId]),
    ];
    for (const [otherIndex, other] of operations.entries()) {
      if (index === otherIndex) {
        continue;
      }
      const otherReadIds = [
        ...other.measurements.flatMap((measurement) =>
          "readId" in measurement && measurement.readId !== undefined
            ? [measurement.readId]
            : [],
        ),
        ...(other.collateralReads ?? []).map(
          ({ positionReadId }) => positionReadId,
        ),
        ...(other.collateralSupplyReads ?? []).map(
          ({ readId: otherReadId }) => otherReadId,
        ),
        ...(other.creditReadId === undefined ? [] : [other.creditReadId]),
        ...(other.debtReadId === undefined ? [] : [other.debtReadId]),
        ...(other.positionBoundsReadId === undefined
          ? []
          : [other.positionBoundsReadId]),
      ];
      const overlappingReadId = positionReadIds.find((id) =>
        otherReadIds.includes(id),
      );
      if (overlappingReadId !== undefined) {
        throw new SimulationValidationError(
          `Limit operation ${index} cannot share Midnight position read "${overlappingReadId}" with limit operation ${otherIndex}; whole-bundle position deltas would overlap. ` +
            `Simulate these operations in separate requests or drop one of the overlapping limit operations.`,
        );
      }
    }
  }
}

/** Input-based wallet measurements must not overlap another operation's. */
function assertNoWalletMeasurementOverlap(
  operations: readonly SlippageOperationReads[],
  reads: ReadonlyMap<string, StateRead>,
): void {
  const walletMeasurements = new Map<
    string,
    { index: number; input: boolean }
  >();
  for (const [index, operation] of operations.entries()) {
    const input = operation.limit.inputs !== undefined;
    const keys = new Set<string>();
    for (const measurement of operation.measurements) {
      if (measurement.type === "native") {
        keys.add(`native:${measurement.account.toLowerCase()}`);
      }
      if (
        "readId" in measurement &&
        measurement.readId !== undefined &&
        reads.get(measurement.readId)?.kind === "erc20.balance"
      ) {
        keys.add(measurement.readId);
      }
    }
    for (const collateral of operation.collateralReads ?? []) {
      if (collateral.receiverBalanceReadId !== undefined) {
        keys.add(collateral.receiverBalanceReadId);
      }
    }
    for (const bound of operation.walletBounds ?? []) {
      keys.add(bound.readId);
    }
    for (const key of keys) {
      const previous = walletMeasurements.get(key);
      if (
        previous !== undefined &&
        previous.index !== index &&
        (input || previous.input)
      ) {
        throw new SimulationValidationError(
          "Overlapping input-based wallet measurements. Split the bundle or use quote-only limits for all overlapping operations.",
          [
            `limits.operations[${index}]: wallet measurement "${key}" overlaps limits.operations[${previous.index}]`,
          ],
        );
      }
      walletMeasurements.set(key, { index, input });
    }
  }
}

/** Composed wallet bounds must not share a token and account with another operation's balance reads. */
function assertNoWalletBoundOverlap(
  operations: readonly SlippageOperationReads[],
  reads: ReadonlyMap<string, StateRead>,
): void {
  const walletEntries = operations.flatMap((operation, index) =>
    (operation.walletBounds ?? []).map((bound) => ({
      index,
      token: bound.token,
      account: bound.account,
    })),
  );
  const balanceEntries = operations.flatMap((operation, index) => {
    const readIds = new Set([
      ...operation.measurements.flatMap((measurement) =>
        "readId" in measurement && measurement.readId !== undefined
          ? [measurement.readId]
          : [],
      ),
      ...(operation.collateralReads ?? []).flatMap(
        ({ receiverBalanceReadId }) =>
          receiverBalanceReadId === undefined ? [] : [receiverBalanceReadId],
      ),
      ...(operation.walletBounds ?? []).map(({ readId }) => readId),
    ]);
    return [...readIds].flatMap((readId) => {
      const read = reads.get(readId);
      return read?.kind === "erc20.balance"
        ? [{ index, token: read.token, account: read.account }]
        : [];
    });
  });
  for (const bound of walletEntries) {
    for (const other of balanceEntries) {
      if (
        bound.index !== other.index &&
        isAddressEqual(bound.token, other.token) &&
        isAddressEqual(bound.account, other.account)
      ) {
        throw new SimulationValidationError(
          `Limit operation ${bound.index} cannot share wallet token "${bound.token}" and account "${bound.account}" with limit operation ${other.index}; whole-bundle balance deltas would overlap. ` +
            `Simulate these operations in separate requests or drop one of the overlapping limit operations.`,
        );
      }
    }
  }
}

/**
 * Plan only quoted balance and position reads, deduplicating contract calls.
 * Native deltas use transfer traces; `assetsPaid` quotes on wNative loan
 * tokens for Midnight takeLend, repayment, and Blue parking also read the
 * sender's wNative balance.
 * @param params - Resolved caller operations, the transaction sender, and the
 *   Morpho Blue and Midnight addresses.
 * @returns Read calls and their mapping to each quoted amount; empty without limits.
 * @throws {SimulationValidationError} When operations share a wallet measurement
 *   and either uses typed inputs, or a Midnight combined operation's wallet or
 *   position reads overlap another operation, an account cannot be measured, or
 *   repayment and collateral delivery cannot be measured separately, or native
 *   value is not covered by the declared measurements or collateral pull cap.
 * @throws {SlippageCheckUnavailableError} When a Midnight market or Blue
 *   parking callback is not resolved for a measurement, or a
 *   native-funded Blue parking or takeLend has no registered wNative token.
 *   Native value sent with `midnightSupplyCollateral`
 *   or `midnightSupplyCollateralMakeBorrow` requires a registered wNative and
 *   an owner-side wNative collateral measurement.
 *   `midnightSupplyCollateralTakeBorrow` also throws if native value is sent
 *   without a registered wNative, or a collateral token or loan-token/proceeds
 *   quote cannot be resolved.
 * @internal
 */
export function planStateReads(params: {
  readonly operations: readonly ResolvedSlippageOperation[];
  readonly owner: Address;
  readonly morpho: Address;
  /** Registered wrapped-native token for the chain, when configured. */
  readonly wNative?: Address;
  /** Whether any request transaction from the owner sends native ETH. */
  readonly nativeValueSent?: boolean;
  /**
   * Total native value sent by the owner across all request transactions.
   * This conservatively lowers a combined operation's wNative pull cap even
   * for unrelated owner transactions and may reject an otherwise valid run.
   */
  readonly nativeValue?: bigint;
  /** Midnight address required by collateral, redeem, buy, sell, and repayment quotes. */
  readonly midnight: Address;
}): {
  readonly reads: readonly StateRead[];
  readonly operations: readonly SlippageOperationReads[];
} {
  const reads = new Map<string, StateRead>();
  const operations = params.operations.map((operation, index) =>
    planOperationReads(params, { reads, operation, index }),
  );
  // Each check throws a SimulationValidationError on an unmeasurable bundle.
  assertNativeValueMeasured(params, operations);
  assertNoMidnightPositionOverlap(operations);
  assertNoWalletMeasurementOverlap(operations, reads);
  assertNoWalletBoundOverlap(operations, reads);
  return { reads: [...reads.values()], operations };
}

/**
 * Decode one requested balance, Midnight collateral/debt or Blue position without
 * reconstructing protocol entities.
 * @param read - Planned view call.
 * @param data - Return data from its simulated execution.
 * @returns Raw balance, Midnight collateral or accrued Midnight credit, or the Blue position's supply
 *   shares, borrow shares and collateral.
 * @throws {SlippageCheckUnavailableError} When the selected subject returned no data.
 * @throws {InvalidSimulationResponseError} When non-empty return data cannot be decoded.
 * @internal
 */
export function decodeStateRead(read: StateRead, data: Hex): StateValue {
  if (read.kind === "derivation") {
    throw new InvalidSimulationResponseError(
      `Derivation read "${read.id}" requires its dedicated decoder.`,
    );
  }
  if (data === "0x") {
    throw new SlippageCheckUnavailableError(
      `Cannot observe slippage read "${read.id}": the selected subject returned no data (likely not a contract).`,
      { field: read.id, reason: "emptyData" },
    );
  }
  try {
    if (read.kind === "erc20.balance") {
      return decodeFunctionResult({
        abi: erc20Abi,
        functionName: "balanceOf",
        data,
      });
    }
    if (read.kind === "midnight.collateral") {
      return decodeFunctionResult({
        abi: midnightAbi,
        functionName: "collateral",
        data,
      });
    }
    if (read.kind === "midnight.credit") {
      return decodeFunctionResult({
        abi: midnightAbi,
        functionName: "updatePositionView",
        data,
      })[0];
    }
    if (read.kind === "midnight.debt") {
      return decodeFunctionResult({
        abi: midnightAbi,
        functionName: "debt",
        data,
      });
    }
    const [supplyShares, borrowShares, collateral] = decodeFunctionResult({
      abi: blueAbi,
      functionName: "position",
      data,
    });
    return { supplyShares, borrowShares, collateral };
  } catch (cause) {
    throw new InvalidSimulationResponseError(
      `Cannot decode slippage observation "${read.id}". Check the selected contract and RPC response.`,
      { cause },
    );
  }
}
