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
  | { readonly type: "balance"; readonly readId: string }
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
 *   position reads overlap another operation.
 * @throws {SlippageCheckUnavailableError} When a Midnight market or Blue
 *   parking callback is not resolved for a measurement, or a
 *   native-funded Blue parking or takeLend has no registered wNative token.
 *   Native value sent alongside typed inputs also requires a planned native
 *   measurement for the owner.
 *   `midnightSupplyCollateralTakeBorrow` also throws if native value is sent
 *   without a registered wNative, the owner's native value exceeds the quoted
 *   wNative collateral pull cap, or a collateral token or loan-token/proceeds
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
  const operations = params.operations.map(
    (
      {
        limit,
        assetsPaid,
        assetsReceived,
        midnightMarket,
        midnightCollateralTokens,
        blueBuyCallback,
      },
      index,
    ) => {
      if (
        (limit.type === "midnightTakeBorrow" ||
          limit.type === "midnightTakeWithdraw" ||
          limit.type === "midnightRepayWithdrawCollateral" ||
          limit.type === "midnightTakeRepayWithdrawCollateral") &&
        "account" in limit
      )
        throw new SlippageCheckUnavailableError(
          `"${limit.type}" always measures the bundle sender "${params.owner}"; omit account.`,
        );
      if (
        limit.type === "midnightSupplyBlueMakeLend" &&
        limit.account !== undefined &&
        !isAddressEqual(limit.account, params.owner)
      )
        throw new SlippageCheckUnavailableError(
          `Blue parking is measured on the bundle sender "${params.owner}" because MidnightBundlesV2 creates the BlueBuyCallback for msg.sender; account must equal the sender or be omitted.`,
        );
      const measurements: SlippageMeasurement[] = [];
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
      let positionAccount = account;
      if (limit.type === "midnightSupplyBlueMakeLend") {
        if (blueBuyCallback === undefined)
          throw new SlippageCheckUnavailableError(
            `${label}: no BlueBuyCallback address is resolved for this limit.`,
          );
        positionAccount = blueBuyCallback;
      }
      if (
        (limit.type === "midnightSupplyBlueMakeLend" ||
          limit.type === "midnightTakeLend") &&
        params.nativeValueSent &&
        params.wNative === undefined
      ) {
        const operation =
          limit.type === "midnightSupplyBlueMakeLend"
            ? "native-funded Blue parking"
            : "a native-funded take";
        throw new SlippageCheckUnavailableError(
          `${label}: native value is sent but no wNative is registered for this chain, so ${operation} cannot be measured. Send no native value.`,
        );
      }
      const plan = operationMeasurementPlan(limit);
      // Redeem bounds and sell measurements share one accrued credit read.
      let creditReadId: string | undefined;
      if (
        limit.type === "midnightRedeem" ||
        limit.type === "midnightTakeLend" ||
        limit.type === "midnightTakeBorrow" ||
        limit.type === "midnightTakeWithdraw" ||
        limit.type === "midnightSupplyCollateralTakeBorrow" ||
        limit.type === "midnightRepayWithdrawCollateral" ||
        limit.type === "midnightTakeRepayWithdrawCollateral"
      ) {
        if (midnightMarket === undefined)
          throw new SlippageCheckUnavailableError(
            `Cannot observe credit for "${limit.type}": no Midnight market is resolved for this market id.`,
          );
        creditReadId =
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
      }
      let debtReadId: string | undefined;
      if (
        limit.type === "midnightTakeLend" ||
        limit.type === "midnightTakeBorrow" ||
        limit.type === "midnightTakeWithdraw" ||
        limit.type === "midnightSupplyCollateralTakeBorrow" ||
        limit.type === "midnightRepayWithdrawCollateral" ||
        limit.type === "midnightTakeRepayWithdrawCollateral"
      ) {
        debtReadId = `midnight-debt:${limit.marketId}:${account}`.toLowerCase();
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
      }
      let collateralReads: SlippageOperationReads["collateralReads"];
      let collateralSupplyReads: SlippageOperationReads["collateralSupplyReads"];
      let walletBounds: SlippageOperationReads["walletBounds"];
      if (
        limit.type === "midnightRepayWithdrawCollateral" ||
        limit.type === "midnightTakeRepayWithdrawCollateral"
      ) {
        if (params.nativeValueSent && params.wNative === undefined)
          throw new SlippageCheckUnavailableError(
            `${label}: native value is sent but no wNative is registered for this chain, so native-funded repayment cannot be measured. Send no native value.`,
          );
        if (midnightMarket === undefined)
          throw new SlippageCheckUnavailableError(
            `Cannot observe collateral for "${limit.type}": no Midnight market is resolved for this market id.`,
          );
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
              token !== undefined &&
              isAddressEqual(token, midnightMarket.loanToken)
            );
          });
          if (sameTokenWithdrawal !== undefined)
            throw new SlippageCheckUnavailableError(
              `${label}: collateral index "${sameTokenWithdrawal.collateralIndex}" uses the loan token and is delivered to the payer, so repayment and delivery cannot be measured separately. Send the withdrawal to a different receiver or split repay and withdraw into separate bundles.`,
            );
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
          if (wNativeWithdrawal !== undefined)
            throw new SlippageCheckUnavailableError(
              `${label}: collateral index "${wNativeWithdrawal.collateralIndex}" uses wNative while native ETH is sent, so wrapped ETH and collateral delivery cannot be measured separately. Send the withdrawal to a different receiver or send no ETH.`,
            );
        }
        const midnight = params.midnight;
        const indexes = new Set(
          quoted.map(({ collateralIndex }) => collateralIndex),
        );
        if (indexes.size > 0)
          collateralReads = [...indexes].map((collateralIndex) => {
            const { readId: positionReadId, token } =
              planMidnightCollateralRead({
                reads,
                midnight,
                marketId: limit.marketId,
                collateralIndex,
                account,
                midnightCollateralTokens,
              });
            if (token === undefined)
              throw new SlippageCheckUnavailableError(
                `Cannot resolve collateral token for index "${collateralIndex}" in "${limit.type}".`,
              );
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
      if (limit.type === "midnightSupplyCollateralTakeBorrow") {
        if (params.nativeValueSent && params.wNative === undefined)
          throw new SlippageCheckUnavailableError(
            `${label}: native value is sent but no wNative is registered for this chain, so native-funded collateral supplies cannot be measured. Send no native value.`,
          );
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
        collateralSupplyReads = quoted.map(({ collateralIndex, assets }) => {
          const { readId, token } = planMidnightCollateralRead({
            reads,
            midnight: params.midnight,
            marketId: limit.marketId,
            collateralIndex,
            account,
            midnightCollateralTokens,
          });
          if (token === undefined)
            throw new SlippageCheckUnavailableError(
              `Cannot resolve collateral token for index "${collateralIndex}" in "${limit.type}".`,
            );
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
        if (
          assetsReceived === undefined ||
          limit.quote.assetsReceived === undefined
        )
          throw new SlippageCheckUnavailableError(
            `${label}: cannot resolve the loan token or proceeds quote.`,
          );
        const proceedsKey = `${assetsReceived.toLowerCase()}:${receiver.toLowerCase()}`;
        const proceedsBound = grouped.get(proceedsKey) ?? {
          token: assetsReceived,
          account: receiver,
          maxPulls: 0n,
          minProceeds: 0n,
        };
        proceedsBound.minProceeds += limit.quote.assetsReceived;
        grouped.set(proceedsKey, proceedsBound);
        walletBounds = [...grouped.values()].map((bound) => {
          const nativeValue =
            params.wNative !== undefined &&
            isAddressEqual(bound.token, params.wNative) &&
            isAddressEqual(bound.account, params.owner)
              ? (params.nativeValue ?? 0n)
              : 0n;
          if (nativeValue > bound.maxPulls)
            throw new SlippageCheckUnavailableError(
              `${label}: native value sent by the owner (${nativeValue}) exceeds this operation's quoted wNative collateral supply (${bound.maxPulls}), so wNative pulls cannot be attributed. Send at most the quoted wNative collateral supply (${bound.maxPulls}) as native value.`,
            );
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
      }
      for (const field of Object.keys(
        QUOTE_FIELD_DIRECTION,
      ) as ScalarQuoteField[]) {
        if (limit.quote[field] === undefined) continue;
        if (
          limit.type === "midnightSupplyCollateralTakeBorrow" &&
          field === "assetsReceived"
        )
          continue;
        const assetField = field === "assetsReceived" || field === "assetsPaid";
        if (!assetField) {
          const source = plan[field];
          if (source === undefined) continue;
          if (source.type === "position") {
            measurements.push({
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
            });
            continue;
          }
          if (source.type === "midnightCredit") {
            if (creditReadId === undefined)
              throw new SlippageCheckUnavailableError(
                `Cannot observe "${field}" for "${limit.type}": no credit read is planned.`,
              );
            measurements.push({ field, type: "balance", readId: creditReadId });
            continue;
          }
          if (source.type === "midnightDebt") {
            if (debtReadId === undefined)
              throw new SlippageCheckUnavailableError(
                `Cannot observe "${field}" for "${limit.type}": no debt read is planned.`,
              );
            measurements.push({
              field,
              type: "midnightDebt",
              readId: debtReadId,
            });
            continue;
          }
          if (source.type === "midnightNet") {
            if (creditReadId === undefined || debtReadId === undefined)
              throw new SlippageCheckUnavailableError(
                `Cannot observe "${field}" for "${limit.type}": no credit or debt read is planned.`,
              );
            measurements.push({
              field,
              type: "midnightNet",
              creditReadId,
              debtReadId,
            });
            continue;
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
            measurements.push({ field, type: "balance", readId });
            continue;
          }
          measurements.push({
            field,
            type: "balance",
            readId: planBalanceRead({
              reads,
              token: source.token,
              account,
            }),
          });
          continue;
        }
        const token = field === "assetsReceived" ? assetsReceived : assetsPaid;
        const holder =
          field === "assetsReceived"
            ? (limit.receiver ?? params.owner)
            : params.owner;
        if (token === undefined) {
          continue;
        }
        const nativeAlias = netWalletAssets
          ? paidIsNative || receivedIsNative
          : field === "assetsPaid"
            ? paidIsNative
            : receivedIsNative;
        const implicitNativeFunding =
          params.nativeValueSent === true &&
          isAddressEqual(holder, params.owner);
        const typedNativeMeasurement =
          limit.inputs !== undefined && (nativeAlias || implicitNativeFunding);
        const midnightNativePayment =
          field === "assetsPaid" &&
          (limit.type === "midnightRepayWithdrawCollateral" ||
            limit.type === "midnightTakeRepayWithdrawCollateral" ||
            limit.type === "midnightTakeLend" ||
            limit.type === "midnightSupplyBlueMakeLend");
        const nativeAndWrapped =
          params.wNative !== undefined &&
          isAddressEqual(token, params.wNative) &&
          (typedNativeMeasurement || midnightNativePayment);
        if (isAddressEqual(token, ethAddress) || nativeAndWrapped) {
          measurements.push({
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
          });
          continue;
        }
        measurements.push({
          field,
          type: "balance",
          readId: planBalanceRead({ reads, token, account: holder }),
        });
      }
      // In-kind redemption deliveries land on the asset receiver (the
      // transaction sender by default), not on the share `account`.
      for (const quoted of limit.quote.positions ?? []) {
        measurements.push({
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
        });
      }
      // `position` bounds read the subject's absolute after-state in the
      // operation's Blue market (the refinance target, where the debt lands).
      const boundsMarketId =
        limit.position === undefined
          ? undefined
          : positionBoundsMarketId(limit);
      const positionBoundsReadId =
        limit.position !== undefined && limit.type === "midnightRedeem"
          ? creditReadId
          : boundsMarketId === undefined
            ? undefined
            : planPositionRead({
                reads,
                morpho: params.morpho,
                marketId: boundsMarketId,
                account,
              });
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
        ...(collateralSupplyReads === undefined
          ? {}
          : { collateralSupplyReads }),
        ...(walletBounds === undefined ? {} : { walletBounds }),
      };
    },
  );
  if (
    params.nativeValueSent === true &&
    operations.some(({ limit }) => limit.inputs !== undefined) &&
    !operations.some(({ measurements }) =>
      measurements.some(
        (measurement) =>
          measurement.type === "native" &&
          isAddressEqual(measurement.account, params.owner),
      ),
    )
  )
    throw new SlippageCheckUnavailableError(
      "Native value sent by the request is not covered by any measured native side. Remove the transaction value, or declare the native or wNative asset on the operation it funds.",
    );
  for (const [index, operation] of operations.entries()) {
    if (operation.limit.type !== "midnightSupplyCollateralTakeBorrow") continue;
    const positionReadIds = [
      ...(operation.collateralSupplyReads ?? []).map(({ readId }) => readId),
      ...(operation.creditReadId === undefined ? [] : [operation.creditReadId]),
      ...(operation.debtReadId === undefined ? [] : [operation.debtReadId]),
    ];
    for (const [otherIndex, other] of operations.entries()) {
      if (index === otherIndex) continue;
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
      if (overlappingReadId !== undefined)
        throw new SimulationValidationError(
          `Limit operation ${index} cannot share Midnight position read "${overlappingReadId}" with limit operation ${otherIndex}; whole-bundle position deltas would overlap. ` +
            `Simulate these operations in separate requests or drop one of the overlapping limit operations.`,
        );
    }
  }
  const walletMeasurements = new Map<
    string,
    { index: number; input: boolean }
  >();
  for (const [index, operation] of operations.entries()) {
    const input = operation.limit.inputs !== undefined;
    const keys = new Set<string>();
    for (const measurement of operation.measurements) {
      if (measurement.type === "native")
        keys.add(`native:${measurement.account.toLowerCase()}`);
      if (
        "readId" in measurement &&
        measurement.readId !== undefined &&
        reads.get(measurement.readId)?.kind === "erc20.balance"
      )
        keys.add(measurement.readId);
    }
    for (const collateral of operation.collateralReads ?? []) {
      if (collateral.receiverBalanceReadId !== undefined)
        keys.add(collateral.receiverBalanceReadId);
    }
    for (const bound of operation.walletBounds ?? []) keys.add(bound.readId);
    for (const key of keys) {
      const previous = walletMeasurements.get(key);
      if (
        previous !== undefined &&
        previous.index !== index &&
        (input || previous.input)
      )
        throw new SimulationValidationError(
          "Overlapping input-based wallet measurements. Split the bundle or use quote-only limits for all overlapping operations.",
          [
            `limits.operations[${index}]: wallet measurement "${key}" overlaps limits.operations[${previous.index}]`,
          ],
        );
      walletMeasurements.set(key, { index, input });
    }
  }
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
      )
        throw new SimulationValidationError(
          `Limit operation ${bound.index} cannot share wallet token "${bound.token}" and account "${bound.account}" with limit operation ${other.index}; whole-bundle balance deltas would overlap. ` +
            `Simulate these operations in separate requests or drop one of the overlapping limit operations.`,
        );
    }
  }
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
  if (read.kind === "derivation")
    throw new InvalidSimulationResponseError(
      `Derivation read "${read.id}" requires its dedicated decoder.`,
    );
  if (data === "0x") {
    throw new SlippageCheckUnavailableError(
      `Cannot observe slippage read "${read.id}": the selected subject returned no data (likely not a contract).`,
    );
  }
  try {
    if (read.kind === "erc20.balance")
      return decodeFunctionResult({
        abi: erc20Abi,
        functionName: "balanceOf",
        data,
      });
    if (read.kind === "midnight.collateral")
      return decodeFunctionResult({
        abi: midnightAbi,
        functionName: "collateral",
        data,
      });
    if (read.kind === "midnight.credit")
      return decodeFunctionResult({
        abi: midnightAbi,
        functionName: "updatePositionView",
        data,
      })[0];
    if (read.kind === "midnight.debt")
      return decodeFunctionResult({
        abi: midnightAbi,
        functionName: "debt",
        data,
      });
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
