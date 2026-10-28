import {
  isSimulationPackageError,
  UnexpectedSimulationError,
} from "../errors.js";
import type { SimulateInputParams, SimulateParams } from "../params.js";
import type {
  VerifiedSimulationInputResult,
  VerifiedSimulationResult,
} from "../result.js";
import type { SimulationConfig } from "../types.js";
import { parseRequest } from "./request/index.js";
import { runSimulation } from "./run-simulation.js";

/**
 * Simulate a bundle of EVM transactions.
 *
 * Parses and normalizes the request → resolves a single pinned block (skipped
 * when `params.block` is supplied) → asserts every calldata target holds
 * contract code at the pinned block → resolves quoted- and input-asset
 * metadata → plans derivation reads, state reads and the execution →
 * executes once through `eth_simulateV1` under the full timeout budget
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
 * Services requiring simulation must return transactions only after this promise
 * resolves. Every rejection blocks transaction return, including RPC failures.
 *
 * **Modes.** `mode` defaults to `"final"`, which executes the signed calldata
 * against actual permissions and accepts no `authorizations`. `mode:
 * "preview"` accepts typed authorization descriptors, which the pipeline
 * prepares as simulated approval calls. No authorization read-back checks run.
 * Preparations emitting asset-transfer logs fail closed; simulate those
 * authorizations as transactions in final mode to check their asset flows.
 * `limits` is required: per-operation quotes, typed `inputs` or both, or the
 * explicit `"none"` opt-out, which skips every limit read and check. Typed
 * inputs derive their sides from pinned-block state in the simulated block and
 * check them with no percentage tolerance; only explicitly quoted sides use
 * `slippageTolerance`. Violations throw `ConsumerLimitViolationError`.
 *
 * **Funding.** `value` transfers are funded by the sender's real native
 * balance — no balance inflation — so under-funded bundles revert exactly as
 * they would on-chain. `validation: false` keeps gas from being charged,
 * separating gas from economic effects. Monad nodes reject `false`, so Monad
 * simulations send `true`; its simulated block charges no gas either way.
 *
 * @param config - Required per-chain `eth_simulateV1` URL, optional per-chain
 *   `blockOverrides.gasLimit`, `callGasLimit` and `parentHashCheck`, optional
 *   logger, and the overall timeout budget.
 * @param params - Quote-only `SimulateParams` or additive `SimulateInputParams`.
 * @param params.chainId - Chain id the bundle targets. Sent on every call inside
 *   `eth_simulateV1`, so nodes that check it reject a wrong-chain endpoint. A
 *   successful simulation sends no `eth_chainId`; one probe follows an
 *   `RpcTransportError`, a `SlippageCheckUnavailableError` from
 *   quoted-asset resolution or a failed planned state read, or a code-less
 *   calldata target (`SimulationValidationError`).
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
 * @param params.authorizations - Preview-only typed authorization descriptors.
 * @param params.limits - Required quotes or typed input-based limits, or `"none"`
 *   to skip every limit read and check. Inputs use hidden before-bundle previews
 *   and accrued Blue state; direct amounts and deterministic subject shares are
 *   exact, converted sides have zero-tolerance adverse bounds. Only explicit
 *   quote sides use percentage tolerance.
 * @param params.blockNumber - Optional pinned block number or `BlockTag` other
 *   than `"pending"`.
 *   Defaults to `latest` (`finalized` on Monad, whose `latest` block is not
 *   final), resolved exactly once.
 * @param params.block - Optional caller-supplied state block (`number`,
 *   `hash`, `timestamp`). Skips the block lookup, so a simulation without
 *   asset metadata reads makes a single `eth_simulateV1` request plus one
 *   `eth_getCode` per distinct calldata target. Cannot be combined with
 *   `blockNumber`.
 * @throws {SimulationValidationError} for invalid input (mixed senders, bad
 *   addresses, empty transactions, malformed assertions or authorizations,
 *   final-mode authorizations, missing or malformed limits, an empty
 *   `limits.operations`, a non-positive or unmeasurable quote field, a
 *   `slippageTolerance` at or above 1e18, a missing required quote side for an
 *   operation, unknown fields, a `"pending"` block tag,
 *   a malformed `block` or one combined with `blockNumber`, a
 *   `blockOverrides.gasLimit` or `callGasLimit` that is not a positive bigint,
 *   a `parentHashCheck` that is not a boolean, or share quotes for
 *   `blueSupplyCollateral` / `blueWithdrawCollateral`), or a transaction
 *   whose calldata target holds no contract code at the state block. Also thrown
 *   for malformed typed inputs, invalid declared fees or penalties, inputs on
 *   quote-only operations, missing required sides after derivation, or a
 *   `midnightSupplyCollateralTakeBorrow` limit whose wallet bounds overlap
 *   another operation's wallet balance reads or wallet bounds, or whose
 *   Midnight collateral, credit, or debt reads overlap another operation's
 *   Midnight position reads, overlapping cross-operation wallet measurements
 *   when either operation uses typed inputs, or a typed-input `assetPaid` /
 *   `assetReceived` override that is neither the subject's token nor, for
 *   `ethAddress`, this chain's registered wrapped native token. Also thrown when
 *   a preview authorization preparation emits asset transfers; simulate that
 *   authorization as a transaction in final mode to check its asset flows.
 * @throws {ConsumerLimitViolationError} when a declared `limits` bound is
 *   violated by the observed effects, including when
 *   `midnightRepayWithdrawCollateral` or `midnightTakeRepayWithdrawCollateral`
 *   without a `debtRepaid` quote increases the sender's debt.
 * @throws {UnsupportedChainError} when the chain has no `eth_simulateV1`
 *   endpoint configured, preview authorizations or a limit require a Morpho
 *   Blue address absent from blue-sdk's `getChainAddresses`, a Midnight limit
 *   requires a Midnight address it lacks, or Blue parking requires a
 *   `midnightBlueBuyCallbackFactory` address it lacks.
 * @throws {SimulationRevertedError} when a preparation or user transaction
 *   reverts, or the node reports a bundle-level revert (code 3 or an
 *   `execution reverted` / `VM execution error` message, or insufficient funds).
 * @throws {SimulationAssertError} when an assertion fails; the error reports
 *   its transaction, phase, assertion index, a copy of the caller's assertion
 *   (`to`, `data`, and `check`), and return data.
 *   A check exception is preserved as the error's cause.
 * @throws {SimulationLogAssertError} when an `assertLogs` check fails; the error
 *   reports its transaction index, assertion index, a copy of the assertion,
 *   and the lowercase log values passed to the check. The check receives those
 *   values in a frozen copy with lowercase hex `address`, `topics`, and `data`.
 *   A check exception is preserved as the error's cause.
 * @throws {SlippageCheckUnavailableError} when a planned state read fails
 *   or returns empty data, derivation state is missing or a derived amount is
 *   zero, native outgoing traces do not cover value sent, a
 *   required metadata read reverts or returns empty/invalid data, a quoted
 *   force exit has no vault `Withdraw` for the account, or a
 *   `ForceDeallocate` cannot be paired with a Blue `Withdraw` while
 *   `deallocations` is quoted (for example a non-Blue adapter), or when a
 *   `ForceDeallocate` charges a penalty to another account. Missing
 *   evidence from quoted-asset resolution or a failed planned state read
 *   detected by `executePlan`'s response parsing triggers an `eth_chainId`
 *   probe; this error remains when that probe fails or reports the requested
 *   chain. Repay-withdraw also fails closed when quoted loan-token collateral
 *   goes to the payer, when native value is sent with wNative collateral going
 *   to the sender, or when native value is sent on a chain without registered
 *   wNative. `midnightSupplyBlueMakeLend` fails closed under the same
 *   no-registered-wNative condition. `midnightSupplyCollateralTakeBorrow`
 *   fails closed when the owner's total native value exceeds its wNative pull
 *   cap (the quoted wNative collateral; `0n` when the owner receives wNative
 *   loan proceeds without quoted wNative collateral), or when native value is
 *   sent on a chain without registered wNative. Native value is not checked
 *   when the operation has no owner wNative wallet bound.
 *   `midnightSupplyBlueMakeLend` also fails closed when its limit's `account`
 *   is not the bundle sender (MidnightBundlesV2 creates the BlueBuyCallback
 *   for `msg.sender`) or no BlueBuyCallback address is resolved for it.
 * @throws {InvalidSimulationResponseError} when the node response cannot be
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
 * @throws {InvalidChainIdError} when the node rejects the request `chainId`
 *   because the endpoint serves another chain, or when an RPC failure, missing
 *   evidence from quoted-asset resolution or a failed planned state read, or a
 *   code-less calldata target (`SimulationValidationError`) is followed by an
 *   `eth_chainId` answer for another chain (a subclass of
 *   `InvalidSimulationResponseError` sharing its `name`/`code`;
 *   `instanceof InvalidChainIdError` tells them apart).
 * @throws {BlacklistViolationError} when the simulation leaves value retained
 *   beyond the dust threshold by a `bundles` periphery contract
 *   (VaultExitBundlesV1, VaultBundlesV1, BlueBundlesV1, MidnightBundlesV2).
 * @throws {RpcTransportError} when the RPC is unavailable within the
 *   timeout budget, answers with an HTTP error status or a JSON-RPC error,
 *   and the endpoint does not report another chain; the original error is
 *   `cause`. A non-JSON 2xx body from the block lookup,
 *   `eth_getCode` or `eth_simulateV1`, a JSON `null` from the block lookup or
 *   `eth_getCode`, or a non-JSON-RPC JSON body from `eth_simulateV1` is reported
 *   as `InvalidSimulationResponseError`. Other JSON block responses without
 *   an RPC result remain missing-block `RpcTransportError`s; a code response
 *   without a result is treated as no code and fails calldata targets with
 *   `SimulationValidationError`. A looked-up state block without
 *   number/hash is reported as `InvalidSimulationResponseError`.
 * @throws {UnexpectedSimulationError} For unexpected failures; the original value is `cause`.
 * @returns A frozen {@link VerifiedSimulationResult} carrying the normalized
 *   `simulationTxs`, per-tx `calls` (aligned 1:1), parsed `transfers` (each
 *   stamped with `txIdx`), per-account net `assetChanges`, and per-operation
 *   verification outcomes and preparations. Each `verification.operations[i]`
 *   mirrors the `limits.operations[i]` entry it verified. Quoted and derived sides
 *   are checked; input-based `checkedLimits.fieldChecks` identifies their bound
 *   kinds. Measurements are scoped to the whole bundle. Quote-only callers retain
 *   `VerifiedSimulationResult`; input-based requests return `VerifiedSimulationInputResult`.
 * @example
 * ```ts
 * import { simulate } from "@morpho-org/evm-simulation";
 * import { type Address, encodeFunctionData, erc20Abi, getAddress } from "viem";
 *
 * const rpcUrl = "https://rpc.example";
 * const user: Address = getAddress("0x1111111111111111111111111111111111111111");
 * const usdc: Address = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
 * const recipient: Address = getAddress("0x2222222222222222222222222222222222222222");
 *
 * const result = await simulate(
 *   { chains: new Map([[1, { simulateV1Url: rpcUrl }]]) },
 *   {
 *     chainId: 1,
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
 * ```
 */
export function simulate(
  config: SimulationConfig,
  params: SimulateParams,
): Promise<VerifiedSimulationResult>;
/**
 * Simulate a bundle with typed inputs or mixed input and quote limits.
 * See {@link simulate} for execution modes, funding, and normalized outputs.
 * @param config - Chain endpoints and the overall timeout budget.
 * @param params - Bundle and input-based or mixed limits.
 * @returns A frozen {@link VerifiedSimulationInputResult} with checked input bounds.
 * @throws {SimulationValidationError} For malformed inputs, invalid fees or
 *   penalties, unsupported input operations, overlapping input-based wallet
 *   measurements, or an `assetPaid`/`assetReceived` override that is neither
 *   the subject's token nor, for `ethAddress`, this chain's registered wrapped
 *   native token. Also thrown when a preview authorization preparation emits
 *   asset transfers; simulate that authorization as a transaction in final mode
 *   to check its asset flows.
 * @throws {ConsumerLimitViolationError} When observed effects violate a bound or
 *   an undeclared Blue counter-side or inactive leg moves adversely, including
 *   with quote overrides. Use combined operations or quote-only limits for
 *   multi-operation bundles with those intended movements.
 * @throws {SlippageCheckUnavailableError} When subject or derivation evidence
 *   is missing, or when native value is sent with typed inputs and no
 *   owner-side native or wNative side measures it.
 * @example
 * ```ts
 * import { simulate } from "@morpho-org/evm-simulation";
 * import { encodeFunctionData, erc4626Abi, getAddress } from "viem";
 *
 * const rpcUrl = "https://rpc.example";
 * const user = getAddress("0x1111111111111111111111111111111111111111");
 * const vault = getAddress("0x3333333333333333333333333333333333333333");
 * const assets = 1_000_000n;
 * const config = {
 *   chains: new Map([[1, { simulateV1Url: rpcUrl }]]),
 * };
 *
 * const result = await simulate(config, {
 *   chainId: 1,
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
 * // result: VerifiedSimulationInputResult
 * ```
 */
export function simulate(
  config: SimulationConfig,
  params: SimulateInputParams,
): Promise<VerifiedSimulationInputResult>;
export function simulate(
  config: SimulationConfig,
  params: SimulateParams,
): Promise<VerifiedSimulationResult>;
export async function simulate(
  config: SimulationConfig,
  params: SimulateInputParams,
): Promise<VerifiedSimulationInputResult> {
  try {
    return await runSimulation({ config, request: parseRequest(params) });
  } catch (cause) {
    // RPC calls already wrap their failures; anything else here is local.
    if (isSimulationPackageError(cause)) throw cause;
    throw new UnexpectedSimulationError("Simulation failed unexpectedly.", {
      cause,
    });
  }
}
