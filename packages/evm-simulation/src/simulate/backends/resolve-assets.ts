import {
  type MarketId,
  type MarketParams,
  MarketUtils,
} from "@morpho-org/blue-sdk";
import { blueAbi, midnightAbi } from "@morpho-org/morpho-sdk/abis";
import { MarketUtils as MidnightMarketUtils } from "@morpho-org/morpho-sdk/midnight/utils";
import {
  type Address,
  BaseError,
  type Client,
  ContractFunctionRevertedError,
  ExecutionRevertedError,
  erc4626Abi,
  ethAddress,
  HttpRequestError,
  isAddressEqual,
  RpcError,
  RpcRequestError,
  TimeoutError,
  zeroAddress,
} from "viem";
import { readContract } from "viem/actions";
import {
  ApprovalCheckUnavailableError,
  RpcTransportError,
  SimulationValidationError,
  SlippageCheckUnavailableError,
} from "../../errors.js";
import {
  MIDNIGHT_MARKET_INPUT_OPERATION_TYPES,
  type MidnightMarketStruct,
} from "../../limits.js";
import { operationMeasurementPlan } from "../measurement-plan.js";
import type { ParsedOperationLimit } from "../request/parse-request.js";

/** Caller-selected operation with only the quoted wallet assets resolved. @internal */
export interface ResolvedSlippageOperation {
  readonly limit: ParsedOperationLimit;
  readonly assetsPaid?: Address;
  readonly assetsReceived?: Address;
  readonly marketParams?: Pick<
    MarketParams,
    "loanToken" | "collateralToken" | "oracle" | "irm" | "lltv"
  >;
  /** Midnight market struct passed to accrued-credit reads. */
  readonly midnightMarket?: MidnightMarket;
  /** BlueBuyCallback whose Blue position is measured for parking. */
  readonly blueBuyCallback?: Address;
  readonly midnightCollateralTokens?: readonly {
    readonly collateralIndex: bigint;
    readonly token: Address;
  }[];
}

/** Caller-selected operation with quoted assets and its subject approval token resolved. @internal */
export interface ResolvedApprovalOperation extends ResolvedSlippageOperation {
  readonly approvalToken?: Address;
  /** Midnight pay-in tokens read from the pinned market, never from quote overrides. */
  readonly midnightApprovalTokens?: readonly Address[];
}

const isTransportFailure = (cause: unknown): boolean => {
  const reverted =
    cause instanceof BaseError &&
    cause.walk(
      (error) =>
        error instanceof ContractFunctionRevertedError ||
        error instanceof ExecutionRevertedError,
    ) !== null;
  return (
    !reverted &&
    ((cause instanceof BaseError &&
      cause.walk(
        (error) =>
          error instanceof HttpRequestError ||
          error instanceof TimeoutError ||
          error instanceof RpcRequestError ||
          error instanceof RpcError ||
          (error instanceof Error && error.name === "AbortError"),
      ) !== null) ||
      (cause instanceof Error && cause.name === "AbortError"))
  );
};

/** Midnight market struct as returned by `toMarket`. @internal */
type MidnightMarket = MidnightMarketStruct;

/**
 * Resolve underlying tokens for typed inputs and quotes without explicit tokens,
 * and the subject token needed for approval checks at the pinned block. Quote
 * overrides do not replace the subject token.
 * Input overrides must match the subject token; native aliases require wNative
 * and are measured together with that token's net wallet change.
 * Share-only quotes need no RPC reads; vault versions and factories are not discovered.
 * Midnight collateral tokens come from `Midnight.toMarket(marketId)` at the
 * quoted `collateralIndex`, unless an operation limit supplies the matching
 * market struct. First takes and first collateral supplies into a market
 * created by the bundle need that struct; a first supply may instead use
 * explicit `assetPaid`. `midnightRedeem`, Midnight repay/withdraw, and sells
 * use a matching supplied struct when available because their credit reads
 * need it.
 * @param params - Caller operations, Morpho Blue and Midnight addresses, client, and pinned state block.
 * @returns Operations with quote tokens and any required subject approval token resolved,
 *   including the loan token for collateral withdrawals with a zero repay leg.
 * @throws {RpcTransportError} For transport failures during a required metadata read.
 * @throws {SimulationValidationError} For a typed-input asset override that is
 *   neither the canonical token nor its registered native alias, or supplied
 *   Midnight market inputs conflict with the deployment or collateral token.
 *   Also for a zero vault subject or Blue parking loanToken, an absent Midnight
 *   collateral index on a collateral supply, or missing assetPaid on a
 *   positively identified first-market supply.
 * @throws {SlippageCheckUnavailableError} For reverted, malformed, or empty
 *   metadata; an unconfigured Midnight collateral index outside a collateral
 *   supply; or Blue market params that do not hash to the requested market id.
 * @throws {ApprovalCheckUnavailableError} For unavailable approval-token metadata.
 * @internal
 */
export async function resolveAssets(params: {
  readonly client: Client;
  readonly morpho: Address;
  readonly midnight?: Address;
  readonly wNative?: Address;
  readonly operations: readonly ParsedOperationLimit[];
  readonly blockNumber: bigint;
  readonly signal?: AbortSignal;
}): Promise<readonly ResolvedApprovalOperation[]> {
  const { operations } = params;
  // Blue: [loan, collateral]; vault: [asset]; Midnight: [loan, ...collaterals].
  const tokens = new Map<string, readonly Address[]>();
  const markets = new Map<string, MidnightMarket>();
  const blueMarkets = new Map<
    string,
    NonNullable<ResolvedSlippageOperation["marketParams"]>
  >();
  const resolved: ResolvedApprovalOperation[] = [];
  const context: ResolutionContext = {
    ...params,
    tokens,
    markets,
    blueMarkets,
  };
  // Called only to validate supplied metadata and populate the pinned caches.
  seedOperations(context);
  for (const [index, limit] of operations.entries()) {
    resolved.push(await resolveOperation({ params: context, limit, index }));
  }
  return resolved;
}
/** Shared pinned metadata caches for sequential resolution. @internal */
type ResolutionContext = Parameters<typeof resolveAssets>[0] & {
  readonly tokens: Map<string, readonly Address[]>;
  readonly markets: Map<string, MidnightMarket>;
  readonly blueMarkets: Map<
    string,
    NonNullable<ResolvedSlippageOperation["marketParams"]>
  >;
};
/** Mutable operation assembled during asset resolution. @internal */
type ResolvedAssets = {
  limit: ParsedOperationLimit;
  assetsPaid?: Address;
  assetsReceived?: Address;
  marketParams?: ResolvedSlippageOperation["marketParams"];
  midnightMarket?: MidnightMarket;
  midnightCollateralTokens?: { collateralIndex: bigint; token: Address }[];
};
/** A quote-side token source. @internal */
type AssetSource = NonNullable<
  ReturnType<typeof operationMeasurementPlan>["assetsPaid"]
>;
/** Quoted fields requiring token or Midnight market evidence. @internal */
type AssetField =
  | "assetsPaid"
  | "assetsReceived"
  | "creditRedeemed"
  | "unitsSold"
  | "unitsBought";
/** Context for one quoted field. @internal */
type FieldContext = {
  readonly params: ResolutionContext;
  readonly limit: ParsedOperationLimit;
  readonly index: number;
  readonly field: AssetField;
  readonly result: ResolvedAssets;
  readonly plan: ReturnType<typeof operationMeasurementPlan>;
  readonly acceptsMarket: boolean;
};

/** Validate supplied subjects and seed Midnight metadata before any reads. @internal */
function seedOperations(params: ResolutionContext) {
  const { operations, midnight = zeroAddress, markets, tokens } = params;
  for (const [index, limit] of operations.entries()) {
    let vaultSubject: Address | undefined;
    if ("sourceVault" in limit) {
      vaultSubject = limit.sourceVault;
    } else if ("vault" in limit) {
      vaultSubject = limit.vault;
    }
    if (
      vaultSubject !== undefined &&
      isAddressEqual(vaultSubject, zeroAddress)
    ) {
      throw new SimulationValidationError(
        `Cannot resolve the token required by "${limit.type}": the subject token address is zero.`,
        [
          `limits.operations[${index}].${"sourceVault" in limit ? "sourceVault" : "vault"}: must not be the zero address`,
        ],
      );
    }
    const acceptsMarket = MIDNIGHT_MARKET_INPUT_OPERATION_TYPES.some(
      (acceptedType) => acceptedType === limit.type,
    );
    if (!acceptsMarket || !("market" in limit) || limit.market === undefined) {
      continue;
    }
    const suppliedMarket = MidnightMarketUtils.toStruct(limit.market);
    if (!isAddressEqual(suppliedMarket.midnight, midnight)) {
      throw new SimulationValidationError(
        `The supplied Midnight market struct for "${limit.type}" uses a different Midnight address. Pass this chain's Midnight market struct.`,
        [
          `limits.operations[${index}].market: must use this chain's Midnight address`,
        ],
      );
    }
    if (
      limit.type === "midnightSupplyCollateral" ||
      limit.type === "midnightSupplyCollateralMakeBorrow"
    ) {
      const collateralToken =
        suppliedMarket.collateralParams[Number(limit.collateralIndex)]?.token;
      if (
        limit.assetPaid !== undefined &&
        (collateralToken === undefined ||
          !isAddressEqual(limit.assetPaid, collateralToken))
      ) {
        throw new SimulationValidationError(
          "assetPaid must equal the supplied market's collateral token at collateralIndex; omit assetPaid when passing market.",
          [
            `limits.operations[${index}].assetPaid: must match the supplied market's collateral token at collateralIndex`,
          ],
        );
      }
    }
    const key = `midnight:${limit.marketId.toLowerCase()}`;
    markets.set(key, suppliedMarket);
    tokens.set(key, [
      suppliedMarket.loanToken,
      ...suppliedMarket.collateralParams.map((entry) => entry.token),
    ]);
  }
}

/** Resolve one operation fully before starting the next. @internal */
async function resolveOperation({
  params,
  limit,
  index,
}: {
  params: ResolutionContext;
  limit: ParsedOperationLimit;
  index: number;
}): Promise<ResolvedApprovalOperation> {
  const acceptsMarket = MIDNIGHT_MARKET_INPUT_OPERATION_TYPES.some(
    (acceptedType) => acceptedType === limit.type,
  );
  const plan = operationMeasurementPlan(limit);
  const result: ResolvedAssets = { limit };
  for (const field of [
    "assetsPaid",
    "assetsReceived",
    "creditRedeemed",
    "unitsSold",
    "unitsBought",
  ] as const) {
    await resolveQuotedField({
      params,
      limit,
      index,
      field,
      result,
      plan,
      acceptsMarket,
    });
  }
  const approvalToken = await resolveSubjectApproval(params, limit);
  const midnightApprovalTokens = await resolveMidnightApprovals({
    params,
    limit,
    index,
    result,
  });

  return {
    ...result,
    ...(approvalToken === undefined ? {} : { approvalToken }),
    ...(midnightApprovalTokens === undefined ? {} : { midnightApprovalTokens }),
  };
}

/** Resolve one quoted side in the declared measurement order. @internal */
async function resolveQuotedField(context: FieldContext) {
  const { limit, index, field, result, plan } = context;

  // This pass loads the Midnight market and collateral tokens without quoting creditRedeemed.
  // For repay-withdraw, this creditRedeemed iteration is the market load even though that field is never quoted.
  const needsMidnightMarket =
    (field === "creditRedeemed" &&
      (limit.type === "midnightSupplyCollateralBatch" ||
        limit.type === "midnightWithdrawCollateralBatch" ||
        limit.type === "midnightRepayWithdrawCollateral" ||
        limit.type === "midnightTakeRepayWithdrawCollateral")) ||
    (field === "creditRedeemed" &&
      (limit.type === "midnightRedeem" ||
        limit.type === "midnightTakeWithdraw")) ||
    (field === "unitsSold" &&
      (limit.type === "midnightTakeBorrow" ||
        limit.type === "midnightSupplyCollateralTakeBorrow")) ||
    (field === "unitsBought" && limit.type === "midnightTakeLend");
  if (limit.quote[field] === undefined && !needsMidnightMarket) {
    return;
  }
  let evidenceField:
    | AssetField
    | "collateralSupplies"
    | "collateralWithdrawals" = field;
  if (
    field === "creditRedeemed" &&
    (limit.type === "midnightSupplyCollateralBatch" ||
      limit.type === "midnightWithdrawCollateralBatch" ||
      limit.type === "midnightRepayWithdrawCollateral" ||
      limit.type === "midnightTakeRepayWithdrawCollateral")
  ) {
    evidenceField =
      limit.type === "midnightSupplyCollateralBatch"
        ? "collateralSupplies"
        : "collateralWithdrawals";
  }
  let explicit: Address | undefined;
  if (field === "assetsPaid") {
    explicit = limit.assetPaid;
  } else if (field === "assetsReceived") {
    explicit = limit.assetReceived;
  }
  if (
    explicit !== undefined &&
    limit.inputs === undefined &&
    field !== "creditRedeemed" &&
    field !== "unitsSold" &&
    field !== "unitsBought" &&
    limit.type !== "midnightSupplyCollateralTakeBorrow"
  ) {
    result[field] = explicit;
    return;
  }
  let source: ReturnType<typeof operationMeasurementPlan>["assetsReceived"];
  if (
    field === "creditRedeemed" &&
    (limit.type === "midnightSupplyCollateralBatch" ||
      limit.type === "midnightWithdrawCollateralBatch" ||
      limit.type === "midnightRepayWithdrawCollateral" ||
      limit.type === "midnightTakeRepayWithdrawCollateral")
  ) {
    source = { type: "midnightLoan", marketId: limit.marketId };
  } else if (field === "unitsBought" && limit.type === "midnightTakeLend") {
    source = { type: "midnightLoan", marketId: limit.marketId };
  } else {
    source =
      field === "creditRedeemed" ||
      field === "unitsSold" ||
      field === "unitsBought"
        ? plan.assetsReceived
        : plan[field];
  }
  if (source === undefined) {
    throw new SlippageCheckUnavailableError(
      `Cannot resolve the asset source for "${limit.type}" field "${field}".`,
      {
        operationIndex: index,
        operationType: limit.type,
        field,
        reason: "missingRead",
      },
    );
  }
  if (source.type === "token") {
    if (field === "assetsPaid" || field === "assetsReceived") {
      result[field] = source.token;
      return;
    }
    throw new SlippageCheckUnavailableError(
      `Cannot resolve the asset source for "${limit.type}" field "${field}".`,
      {
        operationIndex: index,
        operationType: limit.type,
        field,
        reason: "missingRead",
      },
    );
  }
  if (
    (field === "creditRedeemed" ||
      field === "unitsSold" ||
      field === "unitsBought") &&
    source.type !== "midnightLoan"
  ) {
    throw new SlippageCheckUnavailableError(
      `Cannot resolve the Midnight market for "${limit.type}" asset source.`,
      {
        operationIndex: index,
        operationType: limit.type,
        field,
        reason: "missingRead",
      },
    );
  }
  let key: string;
  if (source.type === "market") {
    key = `market:${source.marketId.toLowerCase()}`;
  } else if (source.type === "vault") {
    key = `vault:${source.vault.toLowerCase()}`;
  } else {
    key = `midnight:${source.marketId.toLowerCase()}`;
  }
  const pair = await resolveSourcePair({ context, source, key, evidenceField });

  // Validate the pinned token and write the evidence into the operation result.
  resolveFieldEvidence({ context, source, key, evidenceField, pair, explicit });
}

/** Resolve the subject approval independently of quoted asset overrides. @internal */
async function resolveSubjectApproval(
  params: ResolutionContext,
  limit: ParsedOperationLimit,
) {
  const { client, blockNumber, signal } = params;
  let approvalToken: Address | undefined;
  switch (limit.type) {
    case "vaultV1Deposit":
    case "vaultV2Deposit": {
      const [asset = zeroAddress] = await readApprovalPair({
        params,
        limit,
        key: `vault:${limit.vault.toLowerCase()}`,
        read: async () => {
          signal?.throwIfAborted();
          const token = await readContract(client, {
            address: limit.vault,
            abi: erc4626Abi,
            functionName: "asset",
            blockNumber,
          });
          return [token];
        },
      });
      if (isAddressEqual(asset, zeroAddress)) {
        throw new ApprovalCheckUnavailableError(
          `Cannot resolve the token required by "${limit.type}": the vault asset address is zero.`,
        );
      }
      approvalToken = asset;
      break;
    }
    case "vaultV1Withdraw":
    case "vaultV1Redeem":
    case "vaultV1InKindRedeem":
    case "vaultV2Withdraw":
    case "vaultV2Redeem":
    case "vaultV2InKindRedeem":
    case "vaultV2ForceWithdraw":
    case "vaultV1MigrateToV2": {
      const subject =
        limit.type === "vaultV1MigrateToV2" ? limit.sourceVault : limit.vault;
      approvalToken = subject;
      break;
    }
    case "vaultV2ForceRedeem":
      break;
    case "blueSupply":
    case "blueRepay":
    case "blueRepayWithdrawCollateral":
    case "blueWithdrawCollateral":
      approvalToken = await readMarketToken({
        params,
        limit,
        marketId: limit.marketId,
        asset: "loan",
      });
      break;
    case "blueSupplyCollateral":
    case "blueSupplyCollateralBorrow":
    case "blueBorrow":
      approvalToken = await readMarketToken({
        params,
        limit,
        marketId: limit.marketId,
        asset: "collateral",
      });
      break;
    case "blueWithdraw":
    case "blueRefinance":
    case "midnightSupplyCollateral":
    case "midnightSupplyCollateralMakeBorrow":
    case "midnightRedeem":
    case "midnightTakeLend":
    case "midnightTakeBorrow":
    case "midnightWithdrawCollateralBatch":
    case "midnightTakeWithdraw":
    case "midnightRepayWithdrawCollateral":
    case "midnightTakeRepayWithdrawCollateral":
    case "midnightSupplyCollateralBatch":
    case "midnightSupplyCollateralTakeBorrow":
    case "midnightSupplyBlueMakeLend":
      break;
    default: {
      const _exhaustive: never = limit;
      void _exhaustive;
      throw new ApprovalCheckUnavailableError(
        `Unsupported operation limit "${(limit as { type: string }).type}"; approval checks cannot run.`,
      );
    }
  }

  return approvalToken;
}

/** Resolve Midnight approval tokens from pinned market metadata. @internal */
async function resolveMidnightApprovals({
  params,
  limit,
  index,
  result,
}: {
  params: ResolutionContext;
  limit: ParsedOperationLimit;
  index: number;
  result: ResolvedAssets;
}) {
  const { midnightPair, midnightMarketCreated } =
    await readMidnightApprovalMarket(params, limit);
  const midnightApprovalTokenError = `Cannot resolve the token approval required by "${limit.type}" at the pinned block. If this bundle creates the market, pass the market struct via "market".`;
  const resolveMidnightApprovalToken = (
    token: Address | undefined,
  ): Address => {
    if (token === undefined || isAddressEqual(token, zeroAddress)) {
      throw new ApprovalCheckUnavailableError(midnightApprovalTokenError);
    }
    return token;
  };
  let midnightApprovalTokens: readonly Address[] | undefined;
  switch (limit.type) {
    case "vaultV1Deposit":
    case "vaultV2Deposit":
    case "vaultV1Withdraw":
    case "vaultV1Redeem":
    case "vaultV1InKindRedeem":
    case "vaultV2Withdraw":
    case "vaultV2Redeem":
    case "vaultV2InKindRedeem":
    case "vaultV2ForceWithdraw":
    case "vaultV1MigrateToV2":
    case "vaultV2ForceRedeem":
    case "blueSupply":
    case "blueRepay":
    case "blueRepayWithdrawCollateral":
    case "blueSupplyCollateral":
    case "blueSupplyCollateralBorrow":
    case "blueWithdraw":
    case "blueBorrow":
    case "blueWithdrawCollateral":
    case "blueRefinance":
    case "midnightRedeem":
    case "midnightTakeBorrow":
    case "midnightWithdrawCollateralBatch":
    case "midnightTakeWithdraw":
      break;
    case "midnightSupplyBlueMakeLend":
      if (isAddressEqual(limit.loanToken, zeroAddress)) {
        throw new SimulationValidationError(midnightApprovalTokenError, [
          `limits.operations[${index}].loanToken: must not be the zero address`,
        ]);
      }
      midnightApprovalTokens = [resolveMidnightApprovalToken(limit.loanToken)];
      break;
    case "midnightSupplyCollateralBatch":
    case "midnightSupplyCollateralTakeBorrow": {
      const collateralTokens = result.midnightCollateralTokens?.map(
        ({ token }) => resolveMidnightApprovalToken(token),
      );
      if (collateralTokens === undefined || collateralTokens.length === 0) {
        throw new ApprovalCheckUnavailableError(midnightApprovalTokenError);
      }
      midnightApprovalTokens = collateralTokens;
      break;
    }
    case "midnightSupplyCollateral":
    case "midnightSupplyCollateralMakeBorrow": {
      // Only a market the bundle creates has no pinned token; use the caller's assetPaid.
      const token = midnightMarketCreated
        ? midnightPair?.[1 + Number(limit.collateralIndex)]
        : limit.assetPaid;
      if (
        token === undefined ||
        (!midnightMarketCreated && isAddressEqual(token, zeroAddress))
      ) {
        throw new SimulationValidationError(midnightApprovalTokenError, [
          midnightMarketCreated
            ? `limits.operations[${index}].collateralIndex: the market has no collateral at this index`
            : `limits.operations[${index}].assetPaid: required for a market the bundle creates`,
        ]);
      }
      midnightApprovalTokens = [resolveMidnightApprovalToken(token)];
      break;
    }
    case "midnightTakeLend":
    case "midnightRepayWithdrawCollateral":
    case "midnightTakeRepayWithdrawCollateral": {
      const token = midnightPair?.[0];
      midnightApprovalTokens = [resolveMidnightApprovalToken(token)];
      break;
    }
    default: {
      const _exhaustive: never = limit;
      void _exhaustive;
      throw new ApprovalCheckUnavailableError(
        `Unsupported operation limit "${(limit as { type: string }).type}"; approval checks cannot run.`,
      );
    }
  }
  return midnightApprovalTokens;
}

/** Resolve and cache pinned tokens for one non-token asset source. @internal */
async function resolveSourcePair({
  context,
  source,
  key,
  evidenceField,
}: {
  context: FieldContext;
  source: Exclude<AssetSource, { type: "token" }>;
  key: string;
  evidenceField: string;
}) {
  const { params, limit, index, field, acceptsMarket } = context;
  const {
    client,
    morpho,
    midnight = zeroAddress,
    blockNumber,
    signal,
    tokens,
    markets,
    blueMarkets,
  } = params;
  let pair = tokens.get(key);
  if (pair === undefined) {
    try {
      if (source.type === "market") {
        signal?.throwIfAborted();
        const values = await readContract(client, {
          address: morpho,
          abi: blueAbi,
          functionName: "idToMarketParams",
          args: [source.marketId],
          blockNumber,
        });
        const marketParams = {
          loanToken: values[0],
          collateralToken: values[1],
          oracle: values[2],
          irm: values[3],
          lltv: values[4],
        };
        const receivedMarketId = MarketUtils.getMarketId(marketParams);
        const isUncreatedMarket =
          isAddressEqual(values[0], zeroAddress) &&
          isAddressEqual(values[1], zeroAddress) &&
          isAddressEqual(values[2], zeroAddress) &&
          isAddressEqual(values[3], zeroAddress) &&
          values[4] === 0n;
        if (
          !isUncreatedMarket &&
          receivedMarketId.toLowerCase() !== source.marketId.toLowerCase()
        ) {
          throw new SlippageCheckUnavailableError(
            `Cannot resolve the token for "${limit.type}": idToMarketParams("${source.marketId.toLowerCase()}") returned params for market "${receivedMarketId}". Check the RPC endpoint.`,
            {
              operationIndex: index,
              operationType: limit.type,
              field,
              reason: "missingRead",
            },
          );
        }
        pair = [values[0], values[1]];
        blueMarkets.set(key, marketParams);
      } else if (
        source.type === "midnightCollateral" ||
        source.type === "midnightLoan"
      ) {
        signal?.throwIfAborted();
        const market = await readContract(client, {
          address: midnight,
          abi: midnightAbi,
          functionName: "toMarket",
          args: [source.marketId],
          blockNumber,
        });
        markets.set(key, market);
        pair = [
          market.loanToken,
          ...market.collateralParams.map((entry) => entry.token),
        ];
      } else {
        signal?.throwIfAborted();
        const asset = await readContract(client, {
          address: source.vault,
          abi: erc4626Abi,
          functionName: "asset",
          blockNumber,
        });
        pair = [asset, asset];
      }
    } catch (cause) {
      if (cause instanceof SlippageCheckUnavailableError) {
        throw cause;
      }
      if (isTransportFailure(cause)) {
        throw new RpcTransportError(
          "RPC request failed. Check the endpoint and try again.",
          { cause },
        );
      }
      const message =
        `Cannot resolve the token for "${limit.type}" asset source "${key}".` +
        (acceptsMarket &&
        (source.type === "midnightCollateral" || source.type === "midnightLoan")
          ? ' If this bundle creates the market, pass the market struct via "market".'
          : "") +
        (source.type === "midnightCollateral"
          ? " If the market does not exist yet at the state block, set assetPaid to exactly collateralParams[collateralIndex].token; it is not checked."
          : "");
      if (
        source.type === "midnightCollateral" &&
        (limit.type === "midnightSupplyCollateral" ||
          limit.type === "midnightSupplyCollateralMakeBorrow") &&
        limit.assetPaid === undefined &&
        cause instanceof BaseError &&
        cause.walk(
          (error) =>
            error instanceof ContractFunctionRevertedError &&
            error.data?.errorName === "MarketNotCreated",
        ) !== null
      ) {
        throw new SimulationValidationError(
          message,
          [
            `limits.operations[${index}].assetPaid: required for a market the bundle creates`,
          ],
          { cause },
        );
      }
      throw new SlippageCheckUnavailableError(message, {
        operationIndex: index,
        operationType: limit.type,
        field: evidenceField,
        reason: "missingRead",
        cause,
      });
    }
    tokens.set(key, pair);
  }
  return pair;
}

/** Validate and assign token or Midnight-position evidence for a measured side. @internal */
function resolveFieldEvidence({
  context,
  source,
  key,
  evidenceField,
  pair,
  explicit,
}: {
  context: FieldContext;
  source: Exclude<AssetSource, { type: "token" }>;
  key: string;
  evidenceField: string;
  pair: readonly Address[];
  explicit: Address | undefined;
}) {
  const { params, limit, index, field, result, acceptsMarket } = context;
  const { markets, blueMarkets } = params;
  if (
    field === "creditRedeemed" ||
    field === "unitsSold" ||
    field === "unitsBought"
  ) {
    const market = markets.get(key);
    if (market === undefined || isAddressEqual(market.loanToken, zeroAddress)) {
      throw new SlippageCheckUnavailableError(
        `Cannot resolve the Midnight market for "${limit.type}" asset source "${key}": the market does not exist at the state block.${acceptsMarket ? ' If this bundle creates the market, pass the market struct via "market".' : ""}`,
        {
          operationIndex: index,
          operationType: limit.type,
          field: evidenceField,
          reason: "emptyData",
        },
      );
    }
    result.midnightMarket = market;
    if (
      limit.type === "midnightSupplyCollateralBatch" ||
      limit.type === "midnightWithdrawCollateralBatch" ||
      limit.type === "midnightRepayWithdrawCollateral" ||
      limit.type === "midnightTakeRepayWithdrawCollateral" ||
      limit.type === "midnightSupplyCollateralTakeBorrow"
    ) {
      const collateralField =
        limit.type === "midnightSupplyCollateralTakeBorrow" ||
        limit.type === "midnightSupplyCollateralBatch"
          ? "collateralSupplies"
          : "collateralWithdrawals";
      const quoted = limit.quote[collateralField] ?? [];
      if (quoted.length > 0) {
        result.midnightCollateralTokens = quoted.map(({ collateralIndex }) => {
          const token = market.collateralParams[Number(collateralIndex)]?.token;
          if (token === undefined) {
            throw new SlippageCheckUnavailableError(
              `Cannot resolve collateral index "${collateralIndex}" for "${limit.type}": the Midnight market has no collateral at that index.`,
              {
                operationIndex: index,
                operationType: limit.type,
                field: collateralField,
                reason: "emptyData",
              },
            );
          }
          return { collateralIndex, token };
        });
      }
    }
    return;
  }
  let token: Address | undefined;
  if (source.type === "market") {
    token = pair[source.asset === "loan" ? 0 : 1];
  } else if (source.type === "vault" || source.type === "midnightLoan") {
    token = pair[0];
  } else {
    token = pair[1 + Number(source.collateralIndex)];
  }
  if (token === undefined) {
    const message =
      `Cannot resolve the token for "${limit.type}" asset source "${key}": the market has no collateral at the quoted index. ` +
      "Check collateralIndex. If the market does not exist yet at the state block, " +
      "set assetPaid to exactly collateralParams[collateralIndex].token; it is not checked.";
    if (
      source.type === "midnightCollateral" &&
      !isAddressEqual(pair[0] ?? zeroAddress, zeroAddress) &&
      (limit.type === "midnightSupplyCollateral" ||
        limit.type === "midnightSupplyCollateralMakeBorrow")
    ) {
      throw new SimulationValidationError(message, [
        `limits.operations[${index}].collateralIndex: the market has no collateral at this index`,
      ]);
    }
    throw new SlippageCheckUnavailableError(message, {
      operationIndex: index,
      operationType: limit.type,
      field,
      reason: "emptyData",
    });
  }
  if (isAddressEqual(token, zeroAddress)) {
    throw new SlippageCheckUnavailableError(
      `Cannot resolve the token for "${limit.type}" asset source "${key}": the resolved token address is zero.`,
      {
        operationIndex: index,
        operationType: limit.type,
        field,
        reason: "emptyData",
      },
    );
  }
  if (
    limit.inputs !== undefined &&
    explicit !== undefined &&
    !isAddressEqual(explicit, token) &&
    !(
      isAddressEqual(explicit, ethAddress) &&
      params.wNative !== undefined &&
      isAddressEqual(token, params.wNative)
    )
  ) {
    const path = field === "assetsPaid" ? "assetPaid" : "assetReceived";
    throw new SimulationValidationError(
      "Input-based asset overrides must match the subject token.",
      [
        `limits.operations[${index}].${path}: expected "${token}", got "${explicit}". Omit the override or use the canonical token; native aliases require this chain's wrapped native token.`,
      ],
    );
  }
  const asset = limit.inputs === undefined ? (explicit ?? token) : token;
  if (field === "assetsPaid") {
    result.assetsPaid = asset;
  } else if (field === "assetsReceived") {
    result.assetsReceived = asset;
  }
  if (source.type === "market") {
    result.marketParams = blueMarkets.get(key);
  }
}

/** Cache approval metadata reads and preserve their failure classification. @internal */
async function readApprovalPair({
  params,
  limit,
  key,
  read,
}: {
  params: ResolutionContext;
  limit: ParsedOperationLimit;
  key: string;
  read: () => Promise<readonly Address[]>;
}): Promise<readonly Address[]> {
  const { tokens } = params;

  const cached = tokens.get(key);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const pair = await read();
    tokens.set(key, pair);
    return pair;
  } catch (cause) {
    if (cause instanceof ApprovalCheckUnavailableError) {
      throw cause;
    }
    if (isTransportFailure(cause)) {
      throw new RpcTransportError(
        "RPC request failed. Check the endpoint and try again.",
        { cause },
      );
    }
    throw new ApprovalCheckUnavailableError(
      `Cannot resolve the token required by "${limit.type}" at the pinned block.`,
      { cause },
    );
  }
}

/** Read the canonical Blue token required for subject approvals. @internal */
async function readMarketToken({
  params,
  limit,
  marketId,
  asset,
}: {
  params: ResolutionContext;
  limit: ParsedOperationLimit;
  marketId: MarketId;
  asset: "loan" | "collateral";
}): Promise<Address> {
  const { client, morpho, blockNumber, signal, blueMarkets } = params;

  const pair = await readApprovalPair({
    params,
    limit,
    key: `market:${marketId.toLowerCase()}`,
    read: async () => {
      signal?.throwIfAborted();
      const values = await readContract(client, {
        address: morpho,
        abi: blueAbi,
        functionName: "idToMarketParams",
        args: [marketId],
        blockNumber,
      });
      const marketParams = {
        loanToken: values[0],
        collateralToken: values[1],
        oracle: values[2],
        irm: values[3],
        lltv: values[4],
      };
      const receivedMarketId = MarketUtils.getMarketId(marketParams);
      // An uncreated market reads as all zeros and falls through to the zero-token error.
      const isUncreatedMarket =
        isAddressEqual(values[0], zeroAddress) &&
        isAddressEqual(values[1], zeroAddress) &&
        isAddressEqual(values[2], zeroAddress) &&
        isAddressEqual(values[3], zeroAddress) &&
        values[4] === 0n;
      if (
        !isUncreatedMarket &&
        receivedMarketId.toLowerCase() !== marketId.toLowerCase()
      ) {
        throw new ApprovalCheckUnavailableError(
          `idToMarketParams("${marketId.toLowerCase()}") returned params for market "${receivedMarketId}". Check the RPC endpoint.`,
        );
      }
      // Later quote reads of this market reuse the cached pair and need its params.
      blueMarkets.set(`market:${marketId.toLowerCase()}`, marketParams);
      return [values[0], values[1]];
    },
  });
  const token = pair[asset === "loan" ? 0 : 1] ?? zeroAddress;
  if (isAddressEqual(token, zeroAddress)) {
    throw new ApprovalCheckUnavailableError(
      `Cannot resolve the token required by "${limit.type}": the market token address is zero.`,
    );
  }
  return token;
}

/** Read Midnight metadata when an explicit asset skipped the quote read. @internal */
async function readMidnightApprovalMarket(
  params: ResolutionContext,
  limit: ParsedOperationLimit,
) {
  const {
    client,
    midnight = zeroAddress,
    blockNumber,
    signal,
    tokens,
    markets,
  } = params;
  const midnightKey =
    "marketId" in limit
      ? `midnight:${limit.marketId.toLowerCase()}`
      : undefined;
  let midnightPair =
    midnightKey === undefined ? undefined : tokens.get(midnightKey);
  let midnightMarketCreated = true;
  // An explicit assetPaid skips the quote read, so read the market for its approval token.
  if (
    midnightPair === undefined &&
    midnightKey !== undefined &&
    (limit.type === "midnightSupplyCollateral" ||
      limit.type === "midnightSupplyCollateralMakeBorrow")
  ) {
    try {
      signal?.throwIfAborted();
      const market = await readContract(client, {
        address: midnight,
        abi: midnightAbi,
        functionName: "toMarket",
        args: [limit.marketId],
        blockNumber,
      });
      markets.set(midnightKey, market);
      midnightPair = [
        market.loanToken,
        ...market.collateralParams.map((entry) => entry.token),
      ];
      tokens.set(midnightKey, midnightPair);
    } catch (cause) {
      if (isTransportFailure(cause)) {
        throw new RpcTransportError(
          "RPC request failed. Check the endpoint and try again.",
          { cause },
        );
      }
      if (
        !(cause instanceof BaseError) ||
        cause.walk(
          (error) =>
            error instanceof ContractFunctionRevertedError &&
            error.data?.errorName === "MarketNotCreated",
        ) === null
      ) {
        throw new ApprovalCheckUnavailableError(
          `Cannot read Midnight market "${limit.marketId}" at the pinned block. Pass the market struct via "market".`,
          { cause },
        );
      }
      midnightMarketCreated = false;
    }
  }

  return { midnightPair, midnightMarketCreated };
}
