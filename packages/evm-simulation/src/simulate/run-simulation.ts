import {
  ChainId,
  getChainAddresses,
  UnsupportedChainIdError,
} from "@morpho-org/blue-sdk";
import { getMidnightBlueBuyCallbackAddress } from "@morpho-org/morpho-sdk";
import { _try } from "@morpho-org/morpho-ts";
import { isAddressEqual, zeroAddress } from "viem";
import {
  InvalidSimulationResponseError,
  UnsupportedChainError,
} from "../errors.js";
import type {
  CheckedInputOperationLimit,
  CheckedOperationLimit,
} from "../limits.js";
import type { VerifiedSimulationInputResult } from "../result.js";
import type { SimulationConfig } from "../types.js";
import { groupAssetChanges } from "./asset-changes.js";
import { createSimulationClient } from "./backends/client.js";
import { assertTransactionTargetsHaveCode } from "./backends/contract-code.js";
import { executePlan } from "./backends/index.js";
import { resolveAssets } from "./backends/resolve-assets.js";
import { resolvePinnedBlock } from "./backends/resolve-pinned-block.js";
import { toServedChainError } from "./backends/served-chain.js";
import type { CheckContext } from "./context.js";
import {
  decodeDerivationState,
  planDerivationReads,
} from "./derivation-reads.js";
import { deriveQuote } from "./derive-quote.js";
import { parseTransfers } from "./parsing/index.js";
import { assertNoBundlesRetention } from "./pipeline/bundles-retention.js";
import { resolveChain } from "./pipeline/resolve-chain.js";
import { planExecution } from "./plan/plan-execution.js";
import { prepareAuthorizations } from "./prepare.js";
import type { ParsedRequest } from "./request/parse-request.js";
import { assembleResult } from "./result.js";
import { decodeStateRead, planStateReads } from "./state/read-state.js";
import { verifySlippage } from "./verify-slippage.js";

/** Total execution budget for a single `simulate()` call. */
const DEFAULT_TIMEOUT_MS = 5000;

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

/**
 * Run the verified simulation pipeline in a single `eth_simulateV1` call:
 * resolve quoted assets → plan quoted observations → execution →
 * slippage comparisons → bundle-retention assertion → result assembly.
 *
 * One `AbortSignal` (the request timeout) covers every RPC step.
 *
 * @internal
 * @param params - The simulation config and the parsed caller request.
 * @returns The deep-frozen {@link VerifiedSimulationResult}.
 */
export async function runSimulation(params: {
  readonly config: SimulationConfig;
  readonly request: ParsedRequest;
}): Promise<VerifiedSimulationInputResult> {
  const { config, request } = params;
  const chain = resolveChain(config, request.chainId);
  const signal = AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const client = createSimulationClient(chain.simulateV1Url, signal);

  // An honest endpoint on another chain can fail as an RPC or missing-data error; one
  // `eth_chainId` probe after such a failure turns it into InvalidChainIdError.
  const onServedChain = <T>(call: Promise<T>): Promise<T> =>
    call.catch(async (error: unknown) => {
      throw await toServedChainError({
        client,
        chainId: request.chainId,
        error,
      });
    });

  const limits = {
    operations: request.limits === "none" ? [] : request.limits.operations,
  };
  const preview = request.mode === "preview";
  const owner = request.transactions[0]!.from;
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
    (preview && request.authorizations.length > 0);
  if (requiresMorpho && addresses?.blue == null)
    throw new UnsupportedChainError(request.chainId);
  const morpho = addresses?.blue ?? zeroAddress;
  const requiresBlueBuyCallback = limits.operations.some(
    (operation) => operation.type === "midnightSupplyBlueMakeLend",
  );
  const requiresMidnight = limits.operations.some(
    (operation) =>
      operation.type === "midnightSupplyCollateral" ||
      operation.type === "midnightRedeem" ||
      operation.type === "midnightTakeLend" ||
      operation.type === "midnightTakeBorrow" ||
      operation.type === "midnightTakeWithdraw" ||
      operation.type === "midnightRepayWithdrawCollateral" ||
      operation.type === "midnightSupplyCollateralTakeBorrow" ||
      operation.type === "midnightSupplyBlueMakeLend" ||
      operation.type === "midnightTakeRepayWithdrawCollateral",
  );
  if (requiresMidnight && addresses?.midnight == null)
    throw new UnsupportedChainError(request.chainId);
  if (
    requiresBlueBuyCallback &&
    addresses?.midnightBlueBuyCallbackFactory == null
  )
    throw new UnsupportedChainError(request.chainId);
  const midnight = addresses?.midnight ?? zeroAddress;

  // Monad nodes reject `validation: false` and charge no gas in the simulated
  // block either way. Its `latest` block is not final: simulating at its number
  // runs on another parent, so default to `finalized`.
  const monad = request.chainId === ChainId.MonadMainnet;
  const pinnedBlock =
    request.block ??
    (await onServedChain(
      resolvePinnedBlock({
        client,
        blockNumber: request.blockNumber ?? (monad ? "finalized" : undefined),
        signal,
      }),
    ));

  // A code-less `to` with calldata would simulate as a silent success; reject it
  // before `eth_simulateV1` is sent. A wrong-chain endpoint also
  // reports no code at every target, so a validation failure probes `eth_chainId`
  // once — a served chain mismatch outranks MissingCode.
  await onServedChain(
    assertTransactionTargetsHaveCode({
      client,
      transactions: request.transactions,
      chainId: request.chainId,
      blockNumber: pinnedBlock.number,
    }),
  );

  // With no calldata decoding, the caller's declared `limits.operations`
  // entries are the operations: subjects for state reads and per-operation
  // checks come straight from the limit list.
  const resolved = await onServedChain(
    resolveAssets({
      client,
      morpho,
      midnight,
      wNative,
      operations: limits.operations,
      blockNumber: pinnedBlock.number,
    }),
  );
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
      })
    : [];

  const plan = planExecution({
    request,
    owner,
    preparations,
    reads: observations.reads,
    derivationReads: planDerivationReads(resolved, { morpho, owner }),
  });

  // Execute against the block resolved once above.
  const execution = await onServedChain(
    executePlan({
      client,
      plan,
      stateBlock: pinnedBlock,
      validation: monad,
      blockGasLimit: chain.blockOverrides?.gasLimit,
      callGasLimit: chain.callGasLimit,
      parentHashCheck:
        chain.parentHashCheck ?? request.chainId !== ChainId.StableMainnet,
    }),
  );

  const userCalls = execution.calls
    .filter((call) => call.planned.type === "transaction")
    .map((call) => call.result);
  if (userCalls.length !== request.transactions.length)
    throw new InvalidSimulationResponseError(
      `Execution returned ${userCalls.length} user call result(s) for ${request.transactions.length} transaction(s)`,
    );

  const decodePhase = (phase: "before" | "after") =>
    new Map(
      execution.stateReads
        .filter(
          (read) => read.phase === phase && read.read.kind !== "derivation",
        )
        .map(
          (read) =>
            [
              read.read.id,
              decodeStateRead(read.read, read.returnData),
            ] as const,
        ),
    );
  const transfers = parseTransfers(userCalls, {
    wNative: addresses === undefined ? undefined : (addresses.wNative ?? null),
    logger: config.logger,
  });

  const assetChanges = groupAssetChanges(
    transfers.flatMap(({ token, from, to, amount }) => [
      { account: to, token, diff: amount },
      { account: from, token, diff: -amount },
    ]),
  );

  const derivationData = new Map(
    execution.stateReads
      .filter(
        (read) => read.phase === "before" && read.read.kind === "derivation",
      )
      .map((read) => [read.read.id, read.returnData]),
  );
  const derivedOperations = observations.operations.map((operation, index) => ({
    ...operation,
    limit: deriveQuote(operation.limit, {
      ...decodeDerivationState(index, derivationData),
      operationIndex: index,
      netWalletAssets: operation.netWalletAssets,
    }),
  }));

  const ctx: CheckContext = {
    chainId: request.chainId,
    mode: request.mode,
    block: execution.block,
    owner,
    limits: { operations: derivedOperations.map(({ limit }) => limit) },
  };

  const authorizations = request.authorizations.map(
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

  const checked = verifySlippage({
    ctx,
    operations: derivedOperations,
    before: decodePhase("before"),
    after: decodePhase("after"),
    transfers,
    logs: userCalls.map((call) => call.logs),
    morpho,
    requestTransactions: request.transactions,
  });

  assertNoBundlesRetention({
    chainId: request.chainId,
    transfers,
    assetChanges,
    logger: config.logger,
  });

  return assembleResult({
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
              if (!Object.hasOwn(PUBLIC_OPERATION_FIELDS, field))
                Reflect.deleteProperty(publicLimit, field);
            }
            const { quote, slippageTolerance, fieldChecks } =
              checked[index]!.checkedLimits;
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
}
