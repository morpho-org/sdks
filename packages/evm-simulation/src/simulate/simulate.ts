import {
  isSimulationPackageError,
  UnexpectedSimulationError,
} from "../errors.js";
import type { SimulateInputParams, SimulateParams } from "../params.js";
import type { SimulationInputReport, SimulationReport } from "../result.js";
import type { SimulationClient, SimulationOptions } from "../types.js";
import { toFailureReport } from "./failure-report.js";
import { parseRequest } from "./request/index.js";
import { runSimulation } from "./run-simulation.js";

/**
 * A copy of the caller's client with CCIP-Read off, so an `OffchainLookup`
 * revert never makes viem fetch a gateway URL. viem's `call` reads only
 * `client.ccipRead`. A public or wallet client's decorated actions (such as
 * `client.call`) stay bound to the caller's client and viem's actions prefer
 * them, so the copy drops them; every read then runs on the copy through
 * `viem/actions`. The caller's client is not changed.
 *
 * @internal
 */
function withCcipReadDisabled(client: SimulationClient): SimulationClient {
  const copy: SimulationClient = { ...client, ccipRead: false };
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value === "function" && key !== "request" && key !== "extend") {
      Reflect.deleteProperty(copy, key);
    }
  }
  return copy;
}

/**
 * Simulate a bundle of EVM transactions.
 *
 * Parses and normalizes the request → resolves a single pinned block (skipped
 * when `params.block` is supplied) → asserts every calldata target holds
 * contract code at the pinned block → resolves quoted- and input-asset
 * metadata → plans derivation reads, state reads and the execution →
 * executes once through `eth_simulateV1` on the caller's client
 * (in-block state reads and transaction assertions → response parsing) →
 * derives ERC20/WETH9 transfers and net asset changes from the user calls only
 * → decodes balances/positions and derivation state → derives typed-input
 * quote sides and validates the merged quote → runs slippage checks → asserts
 * no funds are retained by standalone `bundles` periphery contracts → returns
 * the result. The caller reads whichever fields they need:
 *
 * - `simulationTxs` → the caller's ordered `from`/`to`/`data`/`value` fields,
 *   normalized (checksummed addresses, `value` defaulted to `0n`). Internal
 *   reads and assertion declarations are never exposed.
 * - `calls[i]` → per-tx raw backend output (`logs`, `status`, `returnData`,
 *   `gasUsed`), aligned 1:1 with `simulationTxs[i]`. `gasUsed` is not a safe
 *   gas limit; consumers deriving one must add their own headroom.
 * - `transfers` → user-facing preview / server-side verification; each
 *   transfer's `txIdx` indexes into `simulationTxs`.
 * - `assetChanges` → net per-asset balance changes grouped by account (sender
 *   and counterparties) over the whole bundle.
 *
 * Services requiring simulation must return transactions only from an `ok`
 * report. Every failure blocks transaction return, including RPC failures.
 *
 * **Modes.** `mode` defaults to `"final"`, which executes the signed calldata
 * against actual permissions. Supplied ERC-2612, Blue, and EcrecoverAuthorizer
 * signature requests must have matching use events in the user transactions,
 * even with `limits: "none"`. The EcrecoverAuthorizer event must match the
 * signed `authorizer`, `authorized`, `isAuthorized`, and `nonce`.
 * `mode: "preview"` accepts typed authorization descriptors, which the pipeline
 * prepares as simulated approval calls. Pending permissions are checked before
 * execution and sender-granted permissions are checked in all preparation and
 * user-call logs.
 * Preparations emitting asset-transfer logs fail closed; simulate those
 * authorizations as transactions in final mode to check their asset flows.
 * `limits` is required: per-operation quotes, typed `inputs` or both, or the
 * explicit `"none"` opt-out, which skips limit and approval reads and checks
 * but not final-mode signed-request use checks. Typed inputs derive their
 * sides from pinned-block state in the simulated block and check them with no
 * percentage tolerance; only explicitly quoted sides use `slippageTolerance`.
 * Violations report `ConsumerLimitViolationError`.
 *
 * **Funding.** Without caller balance overrides, `value` transfers are funded
 * by the sender's real native balance, so under-funded bundles revert exactly as
 * they would on-chain. `validation: false` keeps gas from being charged,
 * separating gas from economic effects. Monad nodes reject `false`, so Monad
 * simulations send `true`; its simulated block charges no gas either way.
 *
 * **Failures.** SDK failures resolve, they do not reject: the report has
 * `ok: false` and lists every failure of the run in `failures`, flat, in
 * pipeline order. `result` exists only when `ok` is `true`, so a bundle with
 * any failure never yields transactions. A transaction revert is terminal:
 * `failures` holds the assertion failures evaluated before it, then the
 * revert, and later checks do not run. Pre-execution failures (invalid requests, unsupported
 * chains, RPC failures) end the run with that single failure. Reported
 * failures:
 *
 * - `SimulationValidationError`: for invalid input (mixed senders, bad
 *   addresses, empty transactions, malformed assertions or authorizations,
 *   missing or malformed limits, an empty
 *   `limits.operations`, a non-positive or unmeasurable quote field, a
 *   `slippageTolerance` at or above 1e18, a missing required quote side for an
 *   operation, unknown fields, a `"pending"` block tag,
 *   a malformed `block` or one combined with `blockNumber`, a
 *   `blockOverrides.gasLimit` or `callGasLimit` that is not a positive bigint,
 *   a `parentHashCheck` that is not a boolean, or share quotes for
 *   `blueSupplyCollateral` / `blueWithdrawCollateral`), or a transaction
 *   whose calldata target (or EIP-7702 delegate) holds no contract code in the
 *   caller overrides or at the state block. Also reported
 *   for malformed typed inputs, invalid declared fees or penalties, inputs on
 *   quote-only operations, missing required sides after derivation, or a
 *   `midnightSupplyCollateralTakeBorrow` limit whose wallet bounds overlap
 *   another operation's wallet balance reads or wallet bounds, or whose
 *   Midnight collateral, credit, or debt reads overlap another operation's
 *   Midnight position reads, overlapping cross-operation wallet measurements
 *   when either operation uses typed inputs, or a typed-input `assetPaid` /
 *   `assetReceived` override that is neither the subject's token nor, for
 *   `ethAddress`, this chain's registered wrapped native token. Also reported when
 *   a preview authorization preparation emits asset transfers; simulate that
 *   authorization as a transaction in final mode to check its asset flows.
 *   Also reported for an explicit `account` on sender-only operations, an
 *   `account` other than the sender on `midnightSupplyBlueMakeLend` or
 *   `midnightSupplyCollateralMakeBorrow`, native value without a measured
 *   native or wNative side, or owner native value above the quoted wNative
 *   pull cap on `midnightSupplyCollateralTakeBorrow` (including a `0n` cap).
 *   Repay-withdraw also reports this error when quoted loan-token collateral
 *   goes to the payer, or native value is sent with wNative collateral going
 *   to the sender; use a different receiver or separate the flows.
 *   Approval-token resolution also reports this error for a zero vault subject
 *   or midnightSupplyBlueMakeLend loanToken,
 *   a Midnight collateral supply whose collateralIndex is absent from the
 *   existing market, or missing assetPaid for a first-market collateral supply.
 * - `ConsumerLimitViolationError`: when a declared `limits` bound is
 *   violated by the observed effects, including when
 *   `midnightRepayWithdrawCollateral` or `midnightTakeRepayWithdrawCollateral`
 *   without a `debtRepaid` quote increases the sender's debt.
 * - `UnusedAuthorizationError`: when a final-mode ERC-2612 permit has no
 *   matching token Approval(owner, spender, value), a Blue signature has no
 *   matching Morpho IncrementNonce event for its authorizer and signed nonce,
 *   or an EcrecoverAuthorizer signature has no `SetIsAuthorized` event matching
 *   the signed `authorizer`, `authorized`, `isAuthorized`, and `nonce`.
 * - `UnexpectedTokenApprovalError`: when a sender-granted token, permit,
 *   Permit2, or NFT approval is outside the derived and explicit allowlist.
 * - `UnexpectedTokenTransferError`: with operation limits, undeclared sender
 *   token outflows (`UNEXPECTED_TOKEN_TRANSFER`), including
 *   transfers returned later. Explicit approvals do not authorize spending;
 *   `limits: "none"` does not check sender outflows.
 * - `UnexpectedMorphoAuthorizationError`: when a sender-granted Morpho
 *   authorization is outside the derived and explicit allowlist.
 * - `UnexpectedMidnightAuthorizationError`: when a sender-granted Midnight
 *   authorization is outside the derived and explicit allowlist, or a Midnight
 *   signature's `verifyingContract` is not the registered EcrecoverAuthorizer
 *   (`allowlistable: false`).
 * - `ApprovalCheckUnavailableError`: when a valid request's subject token or required
 *   approval-registry address cannot be resolved at the pinned block, when
 *   the RPC response omits logs for a preparation or user call, or when an
 *   approval-topic event cannot be decoded.
 * - `UnsupportedChainError`: when preview authorizations, final-mode Blue signatures
 *   (even with `limits: "none"`), or a limit require a Morpho Blue address
 *   absent from blue-sdk's `getChainAddresses`, a Midnight limit
 *   requires a Midnight address it lacks, a Midnight signature requires a
 *   Midnight or EcrecoverAuthorizer address it lacks, or Blue parking requires
 *   a `midnightBlueBuyCallbackFactory` address it lacks.
 * - `SimulationRevertedError`: when a preparation or user transaction
 *   reverts, or the node reports a bundle-level revert (code 3 or an
 *   `execution reverted` / `VM execution error` message, or insufficient funds).
 * - `SimulationAssertError`: when an assertion fails; the error reports
 *   its transaction, phase, assertion index, a copy of the caller's assertion
 *   (`to`, `data`, and `check`), and return data.
 *   A check exception is preserved as the error's cause.
 * - `SimulationLogAssertError`: when an `assertLogs` check fails; the error
 *   reports its transaction index, assertion index, a copy of the assertion,
 *   and the lowercase log values passed to the check. The check receives those
 *   values in a frozen copy with lowercase hex `address`, `topics`, and `data`.
 *   A check exception is preserved as the error's cause.
 * - `SlippageCheckUnavailableError`: when a planned state read fails
 *   or returns empty data, derivation state is missing or a derived amount is
 *   zero, native outgoing traces do not cover value sent, a
 *   required metadata read reverts or returns empty/invalid data, a quoted
 *   force exit has no vault `Withdraw` for the account, or a
 *   `ForceDeallocate` cannot be paired with a Blue `Withdraw` while
 *   `deallocations` is quoted (for example a non-Blue adapter), or when a
 *   `ForceDeallocate` charges a penalty to another account. Also reported when a native-funded Midnight measurement requires
 *   wNative but none is registered for the chain, or when no BlueBuyCallback
 *   address is resolved for `midnightSupplyBlueMakeLend`.
 * - `InvalidSimulationResponseError`: when the node response cannot be
 *   trusted (bad shape, call-count mismatch, block that is neither the pinned
 *   state block nor its immediate successor, a successor with a mismatched
 *   `parentHash` (unless `parentHashCheck` is off; off by default on Stable,
 *   chain 988), a block timestamp earlier than the pinned block's, a
 *   malformed per-call result, a transaction with `assertLogs` whose `logs`
 *   are omitted, or a quoted balance/position read whose non-empty return data
 *   cannot be decoded, a matching force-exit
 *   `ForceDeallocate`/`Withdraw` event log fails to decode, or a 2xx reply
 *   from the block lookup or `eth_getCode` whose body is not JSON or is the
 *   JSON value `null`, or an `eth_simulateV1` reply whose body is not JSON or
 *   not a JSON-RPC object.
 * - `BlacklistViolationError`: when the simulation leaves value retained
 *   beyond the dust threshold by a `bundles` periphery contract
 *   (VaultExitBundlesV1, VaultBundlesV1, BlueBundlesV1, MidnightBundlesV2).
 * - `RpcTransportError`: when the RPC is unavailable or times out under the
 *   client transport's settings, or answers with an HTTP error status or a
 *   JSON-RPC error, including a node that rejects `client.chain.id` because it
 *   serves another chain; the original error is `cause`. With viem's default
 *   `fetch`, an HTTP error reply labeled `application/json` whose body is not
 *   JSON loses its status and is reported as `InvalidSimulationResponseError`;
 *   it stays `RpcTransportError` only if the caller's transport keeps the status
 *   (see the README). A non-JSON 2xx body from the block lookup,
 *   `eth_getCode` or `eth_simulateV1`, a JSON `null` from the block lookup or
 *   `eth_getCode`, or a non-JSON-RPC JSON body from `eth_simulateV1` is reported
 *   as `InvalidSimulationResponseError`. Other JSON block responses without
 *   an RPC result remain missing-block `RpcTransportError`s; a code response
 *   without a result is treated as no code and fails calldata targets with
 *   `SimulationValidationError`. A looked-up state block without
 *   number/hash is reported as `InvalidSimulationResponseError`.
 *
 * @param client - A viem client the caller owns, with `chain` set; its
 *   transport must support `eth_simulateV1`. The simulated chain is
 *   `client.chain.id`, sent on every call inside `eth_simulateV1`, so nodes
 *   that check it reject a wrong-chain endpoint. The SDK sends no
 *   `eth_chainId` and sets no retry policy, and every request runs on a copy
 *   of the client with CCIP-Read off; the caller's client is not changed.
 *   Use one trusted RPC backend per simulation: the SDK cannot verify that
 *   reads routed to different nodes used the same fork.
 * @param params - Quote-only `SimulateParams` or additive `SimulateInputParams`.
 * @param params.transactions - The bundle's transactions, in execution order.
 *   All must share the same `from`. Each transaction may include caller-supplied
 *   `assertBefore` and `assertAfter` arrays. Each assertion is a caller-supplied
 *   view call (`to`/`data`) whose return data is passed to `check`.
 *   `assertLogs` accepts `{ check }` assertions that receive one shared,
 *   recursively frozen copy of that transaction's emitted logs after it
 *   succeeds and before `assertAfter`. Log addresses, topics, and data are
 *   lowercase hex.
 *   `erc20BalanceAssertion`, `nativeBalanceAssertion`, and `maxDepositAssertion`
 *   are optional helpers for common checks.
 * @param params.mode - `"final"` (default) or `"preview"`.
 * @param params.authorizations - Typed wallet requests. Preview prepares
 *   permissions; final requires use events for ERC-2612 and Blue signatures,
 *   and an EcrecoverAuthorizer `SetIsAuthorized` event matching the signed
 *   `authorizer`, `authorized`, `isAuthorized`, and `nonce`, without preparations.
 * @param params.limits - Required quotes or typed input-based limits, or `"none"`
 *   to skip limit and approval reads and checks, but not final signed-request
 *   use checks. Inputs use hidden
 *   before-bundle previews and accrued Blue state; direct amounts and
 *   deterministic subject shares are exact, converted sides have zero-tolerance
 *   adverse bounds. Only explicit quote sides use percentage tolerance. The
 *   simulator derives an approval allowlist from the operations and pinned
 *   subject-token reads, then unions it with `limits.approvals`. Pending
 *   preview authorizations and sender-granted approval events are checked
 *   against that allowlist.
 * @param params.blockNumber - Optional pinned block number or `BlockTag` other
 *   than `"pending"`.
 *   Defaults to `latest` (`finalized` on Monad, whose `latest` block is not
 *   final), resolved exactly once.
 * @param params.block - Optional caller-supplied state block (`number`,
 *   `hash`, `timestamp`). Skips the block lookup, so a simulation without
 *   asset metadata reads makes a single `eth_simulateV1` request plus one
 *   `eth_getCode` per distinct calldata target without a code override (and
 *   a delegate lookup for EIP-7702 targets without overridden delegate code). Cannot be combined with
 *   `blockNumber`.
 * @param params.stateOverrides - Optional caller-controlled JSON-RPC account
 *   state, applied once before all simulated calls, including checks. None is
 *   added automatically. Results describe hypothetical state, not broadcast
 *   guarantees; metadata reads outside `eth_simulateV1` still use onchain state.
 * @param options - Optional `logger`, `timeoutMs` (whole-simulation deadline,
 *   default 5000 ms; an expired deadline is reported as `RpcTransportError`),
 *   `blockOverrides.gasLimit`, `callGasLimit` and `parentHashCheck`; an invalid
 *   value is reported as `SimulationValidationError`.
 * @throws {UnexpectedSimulationError} For failures the SDK did not classify
 *   (a bug or a foreign error); the original value is `cause`. This is the
 *   only rejection.
 * @returns A frozen {@link SimulationReport}. When `ok`, `result` is the
 *   frozen {@link VerifiedSimulationResult} carrying the normalized
 *   `simulationTxs`, per-tx `calls` (aligned 1:1), parsed `transfers` (each
 *   stamped with `txIdx`), per-account net `assetChanges`, and per-operation
 *   verification outcomes and preparations. Each `verification.operations[i]`
 *   mirrors the `limits.operations[i]` entry it verified. Quoted and derived sides
 *   are checked; input-based `checkedLimits.fieldChecks` identifies their bound
 *   kinds. Measurements are scoped to the whole bundle. Quote-only callers get
 *   `SimulationReport`; input-based requests get `SimulationInputReport`.
 * @example
 * ```ts
 * import { simulate } from "@morpho-org/evm-simulation";
 * import {
 *   type Address,
 *   createPublicClient,
 *   encodeFunctionData,
 *   erc20Abi,
 *   getAddress,
 *   http,
 * } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({
 *   chain: mainnet,
 *   transport: http("https://rpc.example", { timeout: 5_000, retryCount: 0 }),
 * });
 * const user: Address = getAddress("0x1111111111111111111111111111111111111111");
 * const usdc: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
 * const recipient: Address = getAddress("0x2222222222222222222222222222222222222222");
 *
 * const report = await simulate(
 *   client,
 *   {
 *     transactions: [
 *       {
 *         from: user,
 *         to: usdc,
 *         data: encodeFunctionData({
 *           abi: erc20Abi,
 *           functionName: "transfer",
 *           args: [recipient, 1_000_000n],
 *         }),
 *       },
 *     ],
 *     limits: "none",
 *   },
 * );
 * if (!report.ok) {
 *   // Every failure blocks the bundle; log or map each one.
 *   for (const failure of report.failures) console.warn(failure.code, failure.message);
 * } else {
 *   console.log(report.result.transfers);
 * }
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: The approved 9.0 API is simulate(client, params, options?).
export function simulate(
  client: SimulationClient,
  params: SimulateParams,
  options?: SimulationOptions,
): Promise<SimulationReport>;
/**
 * Simulate a bundle with typed inputs or mixed input and quote limits.
 * See {@link simulate} for execution modes, funding, and normalized outputs.
 * @param client - A viem client the caller owns, with `chain` set.
 * @param params - Bundle and input-based or mixed limits.
 * @param options - Optional logger, deadline and simulated-block settings.
 * @returns A frozen {@link SimulationInputReport}; when `ok`, `result` is a
 *   {@link VerifiedSimulationInputResult} with checked input bounds. Besides
 *   the failures listed on the quote-only overload, the report carries:
 *   `SimulationValidationError` for malformed inputs, invalid fees or
 *   penalties, unsupported input operations, overlapping input-based wallet
 *   measurements, or an `assetPaid`/`assetReceived` override that is neither
 *   the subject's token nor, for `ethAddress`, this chain's registered wrapped
 *   native token. Also reported when a preview authorization preparation emits
 *   asset transfers; simulate that authorization as a transaction in final mode
 *   to check its asset flows. Also reported when native value is sent with typed
 *   inputs and no owner-side native or wNative side measures it;
 *   `ConsumerLimitViolationError` when observed effects violate a bound or
 *   an undeclared Blue counter-side or inactive leg moves adversely, including
 *   with quote overrides. Use combined operations or quote-only limits for
 *   multi-operation bundles with those intended movements; and
 *   `SlippageCheckUnavailableError` when subject or derivation evidence is
 *   missing.
 * @throws {UnexpectedSimulationError} For failures the SDK did not classify.
 * @example
 * ```ts
 * import { simulate } from "@morpho-org/evm-simulation";
 * import {
 *   createPublicClient,
 *   encodeFunctionData,
 *   erc4626Abi,
 *   getAddress,
 *   http,
 * } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({
 *   chain: mainnet,
 *   transport: http("https://rpc.example"),
 * });
 * const user = getAddress("0x1111111111111111111111111111111111111111");
 * const vault = getAddress("0x3333333333333333333333333333333333333333");
 * const assets = 1_000_000n;
 *
 * const report = await simulate(client, {
 *   transactions: [
 *     {
 *       from: user,
 *       to: vault,
 *       data: encodeFunctionData({
 *         abi: erc4626Abi,
 *         functionName: "deposit",
 *         args: [assets, user],
 *       }),
 *     },
 *   ],
 *   limits: {
 *     operations: [{ type: "vaultV2Deposit", vault, inputs: { assets } }],
 *   },
 * });
 * if (report.ok) console.log(report.result.verification.limits);
 * // report: SimulationInputReport
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: The approved 9.0 API is simulate(client, params, options?).
export function simulate(
  client: SimulationClient,
  params: SimulateInputParams,
  options?: SimulationOptions,
): Promise<SimulationInputReport>;
// biome-ignore lint/complexity/useMaxParams: The approved 9.0 API is simulate(client, params, options?).
export function simulate(
  client: SimulationClient,
  params: SimulateParams,
  options?: SimulationOptions,
): Promise<SimulationReport>;
// biome-ignore lint/complexity/useMaxParams: The approved 9.0 API is simulate(client, params, options?).
export async function simulate(
  client: SimulationClient,
  params: SimulateInputParams,
  options?: SimulationOptions,
): Promise<SimulationInputReport> {
  try {
    return await runSimulation({
      client: withCcipReadDisabled(client),
      options: options ?? {},
      request: parseRequest(params, client?.chain?.id),
    });
  } catch (cause) {
    // A failure that stops the run is reported alone; RPC calls already wrap theirs.
    if (isSimulationPackageError(cause)) {
      return toFailureReport([cause]);
    }
    throw new UnexpectedSimulationError("Simulation failed unexpectedly.", {
      cause,
    });
  }
}
