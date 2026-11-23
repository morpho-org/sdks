import {
  ChainId,
  getChainAddresses,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
import { getMidnightBlueBuyCallbackAddress } from "@morpho-org/morpho-sdk";
import { _try } from "@morpho-org/morpho-ts";
import { type Address, isAddressEqual, zeroAddress } from "viem";
import {
  ApprovalCheckUnavailableError,
  InvalidSimulationResponseError,
  RpcTransportError,
  SimulationPackageError,
  SimulationValidationError,
  SlippageCheckUnavailableError,
  UnsupportedChainError,
} from "../errors.js";
import type {
  CheckedInputOperationLimit,
  CheckedOperationLimit,
} from "../limits.js";
import type {
  SimulationInputReport,
  SimulationReportVerification,
} from "../result.js";
import type { SimulationClient, SimulationOptions } from "../types.js";
import { freezeWarning, type SimulationWarning } from "../warnings.js";
import { resolveApprovalLimits } from "./approval-limits.js";
import {
  assertPendingApprovals,
  findApprovalEventFailures,
} from "./approvals.js";
import { groupAssetChanges } from "./asset-changes.js";
import { assertTransactionTargetsHaveCode } from "./backends/contract-code.js";
import { executePlan } from "./backends/index.js";
import { resolveAssets } from "./backends/resolve-assets.js";
import { resolvePinnedBlock } from "./backends/resolve-pinned-block.js";
import type { CheckContext } from "./context.js";
import {
  decodeDerivationState,
  planDerivationReads,
} from "./derivation-reads.js";
import { deriveQuote } from "./derive-quote.js";
import { toFailureReport } from "./failure-report.js";
import { parseTransfers } from "./parsing/index.js";
import { checkBundlesRetention } from "./pipeline/bundles-retention.js";
import { validateOptions } from "./pipeline/validate-options.js";
import { planExecution } from "./plan/plan-execution.js";
import {
  findPreparationTransferFailures,
  prepareAuthorizations,
} from "./prepare.js";
import type { ParsedRequest } from "./request/parse-request.js";
import { assembleResult } from "./result.js";
import {
  findUnexpectedSenderTransfers,
  resolveSenderSpendTokens,
} from "./sender-transfers.js";
import { findSignedAuthorizationUseFailures } from "./signed-authorizations.js";
import { decodeStateRead, planStateReads } from "./state/read-state.js";
import { findOperationSlippageFailures } from "./verify-slippage.js";

/**
 * Registered wrapped-native wrappers whose recent on-chain
 * `Deposit`/`Withdrawal` receipts showed no mirror `Transfer`.
 *
 * The map is keyed by chain ID and stores each measured wrapper address. If the
 * registered wNative no longer matches, that chain falls back to one-to-one
 * deduplication. If a listed wrapper starts mirroring, wraps/unwraps are
 * double-counted, which can also hide wrapped-native assets held by a bundles
 * contract in retention.
 * See `packages/evm-simulation/AGENTS.md` for maintenance instructions.
 *
 * @internal
 */
export const NO_WNATIVE_MIRROR_WRAPPERS: ReadonlyMap<number, Address> = new Map<
  number,
  Address
>([
  [ChainId.EthMainnet, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"],
  [ChainId.BaseMainnet, "0x4200000000000000000000000000000000000006"],
  [ChainId.OptimismMainnet, "0x4200000000000000000000000000000000000006"],
  [ChainId.PolygonMainnet, "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"],
  [ChainId.BscMainnet, "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"],
  [ChainId.Unichain, "0x4200000000000000000000000000000000000006"],
  [ChainId.SoneiumMainnet, "0x4200000000000000000000000000000000000006"],
  [ChainId.MonadMainnet, "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A"],
  [ChainId.PharosMainnet, "0x52C48d4213107b20bC583832b0d951FB9CA8F0B0"],
  [ChainId.HyperliquidMainnet, "0x5555555555555555555555555555555555555555"],
  [ChainId.HemiMainnet, "0x4200000000000000000000000000000000000006"],
  [ChainId.WorldChainMainnet, "0x4200000000000000000000000000000000000006"],
  [ChainId.LineaMainnet, "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f"],
  [ChainId.MegaEthMainnet, "0x4200000000000000000000000000000000000006"],
  [ChainId.CronosMainnet, "0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23"],
  [ChainId.XdcMainnet, "0x951857744785E80e2De051c32EE7b25f9c458C42"],
  [ChainId.LiskMainnet, "0x4200000000000000000000000000000000000006"],
  [ChainId.KaiaMainnet, "0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432"],
  [ChainId.InkMainnet, "0x4200000000000000000000000000000000000006"],
  [ChainId.ZeroGMainnet, "0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c"],
  [ChainId.BitlayerMainnet, "0xfF204e2681A6fA0e2C3FaDe68a1B28fb90E4Fc5F"],
  [ChainId.ModeMainnet, "0x4200000000000000000000000000000000000006"],
  [ChainId.SeiMainnet, "0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7"],
  [ChainId.AbstractMainnet, "0x3439153EB7AF838Ad19d56E1571FBD09333C2809"],
]);

type PublicOperationField<T> = T extends unknown ? keyof T : never;

const PUBLIC_OPERATION_FIELDS = {
  type: true,
  inputs: true,
  referralFee: true,
  reallocationPenalty: true,
  account: true,
  assetPaid: true,
  assetReceived: true,
  receiver: true,
  quote: true,
  slippageTolerance: true,
  sharePrice: true,
  position: true,
  fieldChecks: true,
  marketId: true,
  sourceMarketId: true,
  targetMarketId: true,
  vault: true,
  sourceVault: true,
  targetVault: true,
  market: true,
  collateralIndex: true,
  loanToken: true,
  callbackSalt: true,
} satisfies Record<
  PublicOperationField<CheckedInputOperationLimit | CheckedOperationLimit>,
  true
>;

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Run the verified simulation pipeline in a single `eth_simulateV1` call:
 * resolve quoted assets → plan quoted observations → execution →
 * slippage comparisons → bundle-retention assertion → result assembly.
 *
 * Every RPC step runs on the caller's client. `options.timeoutMs` is one deadline
 * for the whole pipeline: no read starts after it, and a step still pending
 * fails with `RpcTransportError`; the caller's transport keeps owning retries and
 * per-request timeouts.
 *
 * @internal
 * @param params - The caller's client and options, and the parsed caller request.
 * @returns A report holding the deep-frozen {@link VerifiedSimulationInputResult},
 *   or every post-execution failure in pipeline order.
 * @throws {SimulationPackageError} For a failure before or during execution, which stops the run.
 */
export async function runSimulation(params: {
  readonly client: SimulationClient;
  readonly options: SimulationOptions;
  readonly request: ParsedRequest;
}): Promise<SimulationInputReport> {
  const { options, request } = params;
  // Reject invalid options before any RPC call.
  validateOptions(options);
  const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const withinDeadline = deadlineRunner(signal);

  const environment = resolveEnvironment(request);

  const prepared = await resolveAndExecute({
    ...params,
    signal,
    withinDeadline,
    environment,
  });
  return verifyExecution({
    ...params,
    environment,
    ...prepared,
  });
}

/** Race each pending stage against the single whole-simulation deadline. @internal */
function deadlineRunner(signal: AbortSignal) {
  const withinDeadline = async <T>(call: Promise<T>): Promise<T> => {
    const timeoutError = () =>
      new RpcTransportError(
        "Simulation timed out. Increase timeoutMs or check the caller's transport.",
        { cause: signal.reason },
      );
    let onAbort: (() => void) | undefined;
    try {
      return await Promise.race([
        call.catch((error: unknown) => {
          if (signal.aborted) {
            throw timeoutError();
          }
          throw error;
        }),
        new Promise<never>((_, reject) => {
          onAbort = () => reject(timeoutError());
          if (signal.aborted) {
            onAbort();
          } else {
            signal.addEventListener("abort", onAbort, { once: true });
          }
        }),
      ]);
    } finally {
      if (onAbort) {
        signal.removeEventListener("abort", onAbort);
      }
    }
  };

  return withinDeadline;
}

/** Resolve required chain deployments before any RPC call. @internal */
function resolveEnvironment(request: ParsedRequest) {
  const limits = {
    operations: request.limits === "none" ? [] : request.limits.operations,
  };
  const preview = request.mode === "preview";
  const [firstTransaction] = request.transactions;
  if (firstTransaction === undefined) {
    throw new SimulationValidationError("Supply at least one transaction.");
  }
  const owner = firstTransaction.from;
  const addresses = _try(
    () => getChainAddresses(request.chainId),
    UnsupportedChainIdError,
  );
  const wNative = addresses?.wNative;
  const nativeValue = request.transactions.reduce(
    (total, transaction) =>
      isAddressEqual(transaction.from, owner)
        ? total + (transaction.value ?? 0n)
        : total,
    0n,
  );
  const nativeValueSent = nativeValue > 0n;
  const requiresMorpho =
    limits.operations.length > 0 ||
    request.authorizations.some(
      (authorization) => authorization.type === "blueAuthorizationSignature",
    ) ||
    (preview && request.authorizations.length > 0);
  if (requiresMorpho && addresses?.blue == null) {
    throw new UnsupportedChainError(request.chainId);
  }
  const morpho = addresses?.blue ?? zeroAddress;
  const requiresBlueBuyCallback = limits.operations.some(
    (operation) => operation.type === "midnightSupplyBlueMakeLend",
  );
  const requiresMidnight =
    limits.operations.some(
      (operation) =>
        operation.type === "midnightSupplyCollateralBatch" ||
        operation.type === "midnightWithdrawCollateralBatch" ||
        operation.type === "midnightSupplyCollateral" ||
        operation.type === "midnightSupplyCollateralMakeBorrow" ||
        operation.type === "midnightRedeem" ||
        operation.type === "midnightTakeLend" ||
        operation.type === "midnightTakeBorrow" ||
        operation.type === "midnightTakeWithdraw" ||
        operation.type === "midnightRepayWithdrawCollateral" ||
        operation.type === "midnightSupplyCollateralTakeBorrow" ||
        operation.type === "midnightSupplyBlueMakeLend" ||
        operation.type === "midnightTakeRepayWithdrawCollateral",
    ) ||
    request.authorizations.some(
      (authorization) =>
        authorization.type === "midnightAuthorizationSignature",
    );
  if (requiresMidnight && addresses?.midnight == null) {
    throw new UnsupportedChainError(request.chainId);
  }
  const requiresEcrecoverAuthorizer = request.authorizations.some(
    (authorization) => authorization.type === "midnightAuthorizationSignature",
  );
  if (requiresEcrecoverAuthorizer && addresses?.ecrecoverAuthorizer == null) {
    throw new UnsupportedChainError(request.chainId);
  }
  if (
    requiresBlueBuyCallback &&
    addresses?.midnightBlueBuyCallbackFactory == null
  ) {
    throw new UnsupportedChainError(request.chainId);
  }
  const midnight = addresses?.midnight ?? zeroAddress;
  const ecrecoverAuthorizer = addresses?.ecrecoverAuthorizer ?? zeroAddress;

  return {
    limits,
    preview,
    owner,
    addresses,
    wNative,
    nativeValue,
    nativeValueSent,
    morpho,
    midnight,
    ecrecoverAuthorizer,
  };
}

/** Pin state, resolve subjects, validate pending approvals, plan and execute. @internal */
async function resolveAndExecute(context: PipelineContext) {
  const { client, options, request, signal, withinDeadline, environment } =
    context;
  const { limits, wNative, morpho, midnight } = environment;
  // Monad nodes reject `validation: false` and charge no gas in the simulated
  // block either way. Its `latest` block is not final: simulating at its number
  // runs on another parent, so default to `finalized`.
  const monad = request.chainId === ChainId.MonadMainnet;
  const pinnedBlock =
    request.block ??
    (await withinDeadline(
      resolvePinnedBlock({
        client,
        blockNumber: request.blockNumber ?? (monad ? "finalized" : undefined),
      }),
    ));

  // A code-less `to` with calldata would simulate as a silent success; reject it
  // before `eth_simulateV1` is sent.
  await withinDeadline(
    assertTransactionTargetsHaveCode({
      client,
      signal,
      transactions: request.transactions,
      chainId: request.chainId,
      blockNumber: pinnedBlock.number,
      ...(request.stateOverrides !== undefined && {
        stateOverrides: request.stateOverrides,
      }),
    }),
  );

  // With no calldata decoding, the caller's declared `limits.operations`
  // entries are the operations: subjects for state reads and per-operation
  // checks come straight from the limit list.
  const resolved = await withinDeadline(
    resolveAssets({
      client,
      signal,
      morpho,
      midnight,
      wNative,
      operations: limits.operations,
      blockNumber: pinnedBlock.number,
    }),
  );
  const { approvalLimits, observations, plan } = planResolvedExecution(
    context,
    resolved,
  );
  const senderSpendTokens =
    request.limits === "none"
      ? undefined
      : resolveSenderSpendTokens({
          chainId: request.chainId,
          owner: environment.owner,
          operations: resolved,
          wNative,
          nativeSpendMeasured: new Set(
            observations.operations.flatMap(({ measurements }, index) =>
              measurements.some(
                (measurement) =>
                  measurement.type === "native" &&
                  measurement.field === "assetsPaid" &&
                  isAddressEqual(measurement.account, environment.owner),
              )
                ? [index]
                : [],
            ),
          ),
        });
  const senderNativeValueBudget =
    wNative !== undefined &&
    observations.operations.some(({ walletBounds }) =>
      walletBounds?.some(
        (bound) =>
          isAddressEqual(bound.token, wNative) &&
          isAddressEqual(bound.account, environment.owner),
      ),
    )
      ? request.transactions.reduce(
          (value, transaction) =>
            isAddressEqual(transaction.from, environment.owner) &&
            !isAddressEqual(transaction.to, environment.owner)
              ? value + (transaction.value ?? 0n)
              : value,
          0n,
        )
      : undefined;

  // Execute against the block resolved once above.
  const execution = await withinDeadline(
    executePlan({
      client,
      plan,
      stateBlock: pinnedBlock,
      validation: monad,
      blockGasLimit: options.blockOverrides?.gasLimit,
      callGasLimit: options.callGasLimit,
      parentHashCheck:
        options.parentHashCheck ?? request.chainId !== ChainId.StableMainnet,
    }),
  );

  return {
    execution,
    observations,
    approvalLimits,
    senderSpendTokens,
    senderNativeValueBudget,
  };
}

/** Collect post-execution failures in pipeline order and assemble success. @internal */
function verifyExecution(context: VerificationContext): SimulationInputReport {
  const { request, environment, execution } = context;
  const warnings: SimulationWarning[] = [];
  const { preview, owner, morpho } = environment;
  // A revert is terminal: nothing after it is checked.
  if (execution.reverted) {
    return toFailureReport(execution.failures, { warnings });
  }
  const userCalls = execution.calls
    .filter((call) => call.planned.type === "transaction")
    .map((call) => call.result);
  if (userCalls.length !== request.transactions.length) {
    throw new InvalidSimulationResponseError(
      `Execution returned ${userCalls.length} user call result(s) for ${request.transactions.length} transaction(s)`,
    );
  }

  const failures: SimulationPackageError[] = [...execution.failures];
  const reportedMissingReadIds = new Set(
    failures.flatMap((failure) =>
      failure instanceof SlippageCheckUnavailableError &&
      failure.field !== undefined
        ? [failure.field]
        : [],
    ),
  );
  const collect = <T>(check: () => T): T | undefined => {
    try {
      return check();
    } catch (error) {
      if (!(error instanceof SimulationPackageError)) {
        throw error;
      }
      failures.push(error);
      return undefined;
    }
  };
  const skipTransferChecks = checkEventEvidence({
    context,
    userCalls,
    failures,
  });

  const {
    transfers,
    assetChanges,
    before,
    after,
    derivedOperations,
    skippedOperationIndices,
  } = resolveMeasurements({
    context,
    warnings,
    userCalls,
    skipTransferChecks,
    failures,
    reportedMissingReadIds,
    collect,
  });

  const ctx: CheckContext = {
    chainId: request.chainId,
    mode: request.mode,
    block: execution.block,
    owner,
    limits: { operations: derivedOperations.map(({ limit }) => limit) },
  };

  const authorizations = (preview ? request.authorizations : []).map(
    (authorization, authorizationIndex) => ({
      authorizationIndex,
      authorization,
      calls: execution.calls.flatMap(({ planned, result }) =>
        planned.type === "preparation" &&
        planned.authorizationIndex === authorizationIndex
          ? [{ transaction: planned.transaction, result }]
          : [],
      ),
    }),
  );

  if (skipTransferChecks) {
    return toFailureReport(failures, { warnings });
  }
  const slippage = collect(() =>
    findOperationSlippageFailures({
      ctx,
      operations: derivedOperations,
      before,
      after,
      reportedMissingReadIds,
      skippedOperationIndices,
      transfers,
      logs: userCalls.map((call) => call.logs),
      morpho,
      requestTransactions: request.transactions,
    }),
  );
  if (slippage !== undefined) {
    failures.push(...slippage.failures);
  }

  // Retention reads only user-transaction transfers.
  const retention = checkBundlesRetention({
    chainId: request.chainId,
    transfers,
    assetChanges,
  });
  failures.push(...retention.failures);
  warnings.push(...retention.warnings);
  const verification =
    execution.calls.some(
      (call) => call.planned.type === "transaction" && call.logsMissing,
    ) || warnings.some((warning) => warning.code === "MALFORMED_TRANSFER_LOG")
      ? undefined
      : Object.freeze({ retention: retention.status });
  if (failures.length > 0) {
    return toFailureReport(failures, { warnings, verification });
  }
  const checked = slippage?.checked ?? [];

  return assembleSuccess({
    request,
    warnings,
    verification,
    ctx,
    derivedOperations,
    checked,
    authorizations,
    userCalls,
    transfers,
    assetChanges,
  });
}

/** Inputs shared by pinned execution stages. @internal */
type PipelineContext = Parameters<typeof runSimulation>[0] & {
  readonly signal: AbortSignal;
  readonly withinDeadline: ReturnType<typeof deadlineRunner>;
  readonly environment: ReturnType<typeof resolveEnvironment>;
};
/** Inputs shared by ordered post-execution checks. @internal */
type VerificationContext = Parameters<typeof runSimulation>[0] & {
  readonly environment: ReturnType<typeof resolveEnvironment>;
} & Awaited<ReturnType<typeof resolveAndExecute>>;

/** Check pending approvals and plan ordered state, preparation and transaction calls. @internal */
function planResolvedExecution(
  context: PipelineContext,
  resolved: Awaited<ReturnType<typeof resolveAssets>>,
) {
  const { request } = context;
  const {
    preview,
    owner,
    morpho,
    midnight,
    wNative,
    nativeValue,
    nativeValueSent,
  } = context.environment;
  const approvalLimits =
    request.limits === "none"
      ? undefined
      : resolveApprovalLimits({
          chainId: request.chainId,
          owner,
          operations: resolved,
          explicit: request.limits.approvals,
        });
  if (preview && approvalLimits !== undefined) {
    assertPendingApprovals({
      authorizations: request.authorizations,
      allowed: approvalLimits.approvals,
      addresses: approvalLimits.eventAddresses,
    });
  }
  const operations = resolved.map((operation) =>
    operation.limit.type === "midnightSupplyBlueMakeLend"
      ? {
          ...operation,
          blueBuyCallback: getMidnightBlueBuyCallbackAddress({
            chainId: request.chainId,
            owner,
            salt: operation.limit.callbackSalt,
          }),
        }
      : operation,
  );
  const observations = planStateReads({
    operations,
    owner,
    morpho,
    midnight,
    wNative,
    nativeValueSent,
    nativeValue,
  });

  const preparations = preview
    ? prepareAuthorizations({
        authorizations: request.authorizations,
        owner,
        morpho,
        midnight,
      })
    : [];

  const plan = planExecution({
    request,
    owner,
    preparations,
    reads: observations.reads,
    derivationReads: planDerivationReads(resolved, { morpho, owner }),
  });

  return { approvalLimits, observations, plan };
}

/** Check approval events, preparation transfers and signature use before transfer derivation. @internal */
function checkEventEvidence({
  context,
  userCalls,
  failures,
}: {
  context: VerificationContext;
  userCalls: Parameters<typeof assembleResult>[0]["userCalls"];
  failures: SimulationPackageError[];
}) {
  const { execution, request, approvalLimits } = context;
  const { owner, preview, morpho, ecrecoverAuthorizer } = context.environment;
  let approvalLogsMissing = false;
  if (approvalLimits !== undefined) {
    const missingLogs = execution.calls.find(
      (call) =>
        (call.planned.type === "preparation" ||
          call.planned.type === "transaction") &&
        call.logsMissing,
    )?.planned;
    if (
      missingLogs?.type === "preparation" ||
      missingLogs?.type === "transaction"
    ) {
      approvalLogsMissing = true;
      failures.push(
        new ApprovalCheckUnavailableError(
          `Simulation response omitted logs for ${missingLogs.type === "preparation" ? `authorization ${missingLogs.authorizationIndex}` : `transaction ${missingLogs.transactionIndex}`}; approval checks cannot run. Retry with an RPC that returns eth_simulateV1 logs.`,
        ),
      );
    } else {
      failures.push(
        ...findApprovalEventFailures({
          logs: execution.calls.flatMap(({ result }) => result.logs),
          owner,
          allowed: approvalLimits.approvals,
          addresses: approvalLimits.eventAddresses,
        }),
      );
    }
  }

  failures.push(...findPreparationTransferFailures(execution.calls));

  // Transfers parsed from partial logs would report slippage that never happened.
  const transactionLogsMissing = execution.calls.some(
    (call) => call.planned.type === "transaction" && call.logsMissing,
  );
  // An `assertLogs` check already reported the missing logs in `evaluateCalls`.
  let missingLogsReported =
    approvalLogsMissing ||
    (execution.failures.some(
      (failure) => failure instanceof InvalidSimulationResponseError,
    ) &&
      execution.calls.some(
        (call) =>
          call.planned.type === "transaction" &&
          call.logsMissing &&
          (request.transactions[call.planned.transactionIndex]?.assertLogs
            ?.length ?? 0) > 0,
      ));

  // Require final signature-use evidence independently of operation limits;
  // missing logs are already reported once by the approval check.
  if (!preview && !approvalLogsMissing) {
    const signedUseFailures = findSignedAuthorizationUseFailures({
      authorizations: request.authorizations,
      logs: transactionLogsMissing
        ? undefined
        : userCalls.flatMap((call) => call.logs),
      morpho,
      ecrecoverAuthorizer,
    });
    if (
      signedUseFailures.some(
        (failure) => failure instanceof ApprovalCheckUnavailableError,
      )
    ) {
      missingLogsReported = true;
    }
    failures.push(...signedUseFailures);
  }
  // Once missing logs are reported, checks on partial transfers add only noise.
  const skipTransferChecks = transactionLogsMissing && missingLogsReported;

  return skipTransferChecks;
}

/** Derive transfers, decode both state phases and derive operation expectations. @internal */
function resolveMeasurements({
  context,
  warnings,
  userCalls,
  skipTransferChecks,
  failures,
  reportedMissingReadIds,
  collect,
}: {
  context: VerificationContext;
  warnings: SimulationWarning[];
  userCalls: Parameters<typeof assembleResult>[0]["userCalls"];
  skipTransferChecks: boolean;
  failures: SimulationPackageError[];
  reportedMissingReadIds: Set<string>;
  collect: <T>(check: () => T) => T | undefined;
}) {
  const { request, execution, observations } = context;
  const { addresses } = context.environment;
  const decodePhase = (phase: "before" | "after") => {
    const values = new Map<string, ReturnType<typeof decodeStateRead>>();
    for (const read of execution.stateReads) {
      if (read.phase !== phase || read.read.kind === "derivation") {
        continue;
      }
      try {
        values.set(read.read.id, decodeStateRead(read.read, read.returnData));
      } catch (error) {
        if (!(error instanceof SimulationPackageError)) {
          throw error;
        }
        // A read already reported unavailable in the other phase is one cause.
        if (!reportedMissingReadIds.has(read.read.id)) {
          failures.push(error);
        }
        reportedMissingReadIds.add(read.read.id);
      }
    }
    return values;
  };
  const verified = NO_WNATIVE_MIRROR_WRAPPERS.get(request.chainId);
  const parsed = parseTransfers(userCalls, {
    chainId: request.chainId,
    wNative: addresses === undefined ? undefined : (addresses.wNative ?? null),
    wNativeEmitsTransfer: !(
      verified !== undefined &&
      addresses?.wNative != null &&
      isAddressEqual(addresses.wNative, verified)
    ),
  });
  const { transfers } = parsed;
  warnings.push(...parsed.warnings);

  const assetChanges = groupAssetChanges(
    transfers.flatMap(({ token, from, to, amount }) => [
      { account: to, token, diff: amount },
      { account: from, token, diff: -amount },
    ]),
  );

  if (!skipTransferChecks && context.senderSpendTokens !== undefined) {
    for (const finding of findUnexpectedSenderTransfers({
      chainId: request.chainId,
      owner: context.environment.owner,
      transfers,
      allowed: context.senderSpendTokens,
      nativeValueBudget: context.senderNativeValueBudget,
    })) {
      warnings.push(
        freezeWarning({
          code: finding.code,
          severity: "warn",
          message:
            "Undeclared sender token outflow detected; simulation continues without blocking.",
          token: finding.token,
          sender: finding.sender,
          recipients: finding.recipients,
          chainId: request.chainId,
        }),
      );
    }
  }

  const before = decodePhase("before");
  const after = decodePhase("after");
  const derivationData = new Map(
    execution.stateReads
      .filter(
        (read) => read.phase === "before" && read.read.kind === "derivation",
      )
      .map((read) => [read.read.id, read.returnData]),
  );
  const skippedOperationIndices = new Set<number>();
  const derivedOperations = observations.operations.map((operation, index) => {
    const missingDerivation = execution.plan.calls.some(
      (call) =>
        call.type === "stateRead" &&
        call.read.kind === "derivation" &&
        call.read.operationIndex === index &&
        reportedMissingReadIds.has(call.read.id),
    );
    const limit = missingDerivation
      ? undefined
      : collect(() =>
          deriveQuote(operation.limit, {
            ...decodeDerivationState(
              { index, operationType: operation.limit.type },
              derivationData,
            ),
            operationIndex: index,
            netWalletAssets: operation.netWalletAssets,
          }),
        );
    if (limit === undefined) {
      skippedOperationIndices.add(index);
    }
    return { ...operation, limit: limit ?? operation.limit };
  });

  return {
    transfers,
    assetChanges,
    before,
    after,
    derivedOperations,
    skippedOperationIndices,
  };
}

/** Strip internal limit fields when assembling the frozen success report. @internal */
function assembleSuccess({
  request,
  warnings,
  verification,
  ctx,
  derivedOperations,
  checked,
  authorizations,
  userCalls,
  transfers,
  assetChanges,
}: {
  request: ParsedRequest;
  warnings: readonly SimulationWarning[];
  verification?: SimulationReportVerification;
  ctx: CheckContext;
  derivedOperations: ReturnType<
    typeof resolveMeasurements
  >["derivedOperations"];
  checked: ReturnType<typeof findOperationSlippageFailures>["checked"];
  authorizations: Parameters<typeof assembleResult>[0]["authorizations"];
  userCalls: Parameters<typeof assembleResult>[0]["userCalls"];
  transfers: ReturnType<typeof parseTransfers>["transfers"];
  assetChanges: ReturnType<typeof groupAssetChanges>;
}): SimulationInputReport {
  const assembled = assembleResult({
    ctx: {
      ...ctx,
      limits: {
        operations: derivedOperations.map(
          (
            { limit },
            index,
          ): CheckedInputOperationLimit | CheckedOperationLimit => {
            const publicLimit = { ...limit };
            for (const field of Object.keys(publicLimit)) {
              if (!Object.hasOwn(PUBLIC_OPERATION_FIELDS, field)) {
                Reflect.deleteProperty(publicLimit, field);
              }
            }
            const checkedOperation = checked[index];
            if (checkedOperation === undefined) {
              throw new SimulationValidationError(
                "Missing checked operation limits.",
              );
            }
            const { quote, slippageTolerance, fieldChecks } =
              checkedOperation.checkedLimits;
            return {
              ...publicLimit,
              quote,
              slippageTolerance,
              ...(fieldChecks === undefined ? {} : { fieldChecks }),
            };
          },
        ),
      },
    },
    request,
    operations: checked,
    authorizations,
    userCalls,
    transfers,
    assetChanges,
  });
  return Object.freeze({
    ok: true,
    result: assembled,
    warnings: Object.freeze([...warnings]),
    ...(verification === undefined ? {} : { verification }),
  });
}
