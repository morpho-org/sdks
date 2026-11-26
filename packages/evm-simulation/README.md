# @morpho-org/evm-simulation

## Overview

EVM transaction simulation engine for Morpho — bundle execution preview,
transfer parsing, and net per-account balance changes.

## Installation

```bash
npm install @morpho-org/evm-simulation
```

## Usage

```ts
import {
  simulate,
  SimulationRevertedError
} from "@morpho-org/evm-simulation";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

// You own the client: its transport must support eth_simulateV1, and
// `chain` must be set; the simulated chain is `client.chain.id`.
// The SDK turns CCIP-Read off on its own copy of the client.
const client = createPublicClient({
  chain: mainnet,
  transport: http("https://<your-mainnet-rpc>", { timeout: 5_000, retryCount: 0 }),
});

const report = await simulate(
  client,
  {
    // mode: "final" (default) executes the signed calldata against actual
    // permissions and checks supplied signed authorization descriptors.
    // mode: "preview" prepares the descriptors as simulated permissions.
    transactions: [{ from: user, to: vault, data: encodedDeposit }],
    // limits is required: quote the deposit's pay-in cap and minimum
    // minted shares. ("none" is reserved for transactions no operation
    // type covers.)
    limits: {
      operations: [
        {
          type: "vaultV1Deposit",
          vault,
          quote: { assetsPaid: depositAssets, sharesMinted: quotedShares },
        },
      ],
    },
  },
);
if (!report.ok) {
  // Every failure of the run, in pipeline order; any failure blocks the bundle.
  for (const failure of report.failures) {
    if (failure instanceof SimulationRevertedError) {
      // Display failure.message; decode failure.revertData with your ABI when needed.
    }
  }
} else {
  const { simulationTxs, calls, transfers, assetChanges } = report.result;
}
```

`simulate` resolves to a report instead of throwing SDK failures: `{ ok: true, result }`
or `{ ok: false, failures }`. It rejects only with `UnexpectedSimulationError`, for a
failure the SDK did not classify (a bug or a foreign error).

Every call inside `eth_simulateV1`, including preparation calls, state reads and assertions, carries `client.chain.id` as a hex quantity, so nodes that check it (geth, Anvil, Monad and Stable do) reject an endpoint on another chain; that rejection is reported as `RpcTransportError`. The SDK sends no `eth_chainId`: pointing the client at the right chain is your obligation.

The client's transport must reach a JSON-RPC endpoint that supports `eth_simulateV1`. Requests send `validation: false` so gas is not charged. Monad (chain 143) is handled internally: its nodes reject `false`, so it sends `true` (its simulated block charges no gas either way), and it pins to the `finalized` block by default because its `latest` block is not final — supply a finalized block when passing `block`. On Monad, `gasUsed` reports the call's gas limit, not the gas consumed. Set `blockOverrides.gasLimit` in `options` to send that gas limit as the simulated block's `blockOverrides.gasLimit`; without it, no block override is sent. Set `callGasLimit` in `options` to send it as `gas` on every simulated call, including state reads and assertions. Without it, user transactions, preparations and assertions carry no `gas`, while the read-only balance and position reads the SDK inserts carry at most 1,000,000 gas each and, split equally, 15,000,000 or half the pinned block's gas limit together, whichever is less; a node whose block response omits `gasLimit` gets the 15,000,000 budget (none when `blockOverrides.gasLimit` is set, or when the reads would get under 100,000 each, as with more than 150 reads in a 30M block or more than 15 in HyperEVM's 3M small blocks, which leaves them at the node default as before). Three cases can still fail the request or a call, never pass a bad bundle: on reth-style nodes, which split the leftover block gas among calls without `gas`, the reads' explicit gas (up to half the block) leaves less for user transactions, preparations and assertions than before, and the added retention reads shrink each call's share in plans whose reads carry no SDK gas; on geth-style nodes, explicit read gas above the gas left after near-block-filling transactions gets the request rejected. Split such bundles or set `callGasLimit` or `blockOverrides.gasLimit`. Nodes such as Monad, which reserve 150M gas per call without `gas`, keep room for user transactions, and reth-style nodes, which reject a block whose explicit call gas exceeds its gas limit, keep half of a 30M block for them. `callGasLimit` applies to every call, including the retention reads, so size it to fit the node's total: on Monad, calls × `callGasLimit` must stay under its 1.6B simulation cap. A call that needs more gas than `callGasLimit` runs out of gas and fails as a revert or a read/assertion failure, so set it above the heaviest expected call. On geth-style nodes, it must also fit in the gas left in the simulated block. Set `parentHashCheck` in `options` to turn on or off the check that the simulated block's `parentHash` is the pinned block hash. It defaults to off on Stable (chain 988), whose nodes report a `parentHash` that never matches the pinned block, and on for every other chain. The block number and timestamp checks always apply. `options.timeoutMs` (default 5000) is one deadline for the whole simulation: after it passes, no further read starts and the report fails with `RpcTransportError`. It cannot abort a request your transport has already sent, so set the transport's `timeout` (viem's default is 10 s) to at most `timeoutMs`. viem reports an HTTP error reply whose body is not JSON but is labeled `application/json` as a status-less parse failure, which the SDK reports as `InvalidSimulationResponseError`; to keep such replies an `RpcTransportError`, pass a `fetchFn` that drops `content-type` from non-2xx responses. RPC failures, timeouts and reverts are reported as typed failures. Parsing and retention diagnostics are returned in `report.warnings`; the SDK performs no logging.

Use one trusted RPC backend on the configured chain for the entire simulation.
The endpoint must accept `{ blockHash, requireCanonical: true }` on
`eth_simulateV1`, on `eth_getCode` for target and delegate code, and on
`eth_call` for metadata. Verify each method on the endpoint you deploy;
support for one does not imply support for the others.
A `fallback([...])` transport or a load-balanced URL can route the block
lookup, code and metadata reads, and `eth_simulateV1` to different nodes.
Matching block numbers and timestamps do not establish that those nodes read
the same fork. Code and metadata reads and the simulation all select the same
pinned hash with `requireCanonical: true`. The independent parent-hash check
only applies to successor-block responses.

### Pinned block hash selection

`eth_simulateV1` receives the EIP-1898 selector
`{ blockHash: block.hash, requireCanonical: true }`
including on Stable (988), where `parentHashCheck` defaults to off,
and on Anvil, which reports same-height simulated blocks. There is still exactly
one simulation request, with no chain-ID lookup. Caller-supplied `block` pins
are verified with one `eth_getBlockByHash` before code or asset reads; mismatched
number, hash or timestamp fails as `InvalidSimulationResponseError`, and a missing
block fails as `RpcTransportError`. SDK-resolved pins need no extra lookup. A hash-selector
rejection (including invalid params or header not found) is a typed
`RpcTransportError`, with the provider error preserved as its cause; it never
silently falls back to a number selector. The existing block-number, timestamp
and parent-hash checks are unchanged.

`requireCanonical: true` requests rejection even when the node retains the
selected block on a non-canonical fork, mitigating execution on retained orphaned
state. Probes on 2026-11-19 accepted the flag on all 22 live chains marked Yes
below through dev eRPC, and on local Anvil 1.9.0. The live probes used finalized
hashes and succeeded both normally and with `X-ERPC-Skip-Cache-Read: true`;
unknown hashes were rejected. Anvil also rejected a replaced pin, but had
discarded the orphan: hash-only selection rejected it too. Enforcement against
a retained non-canonical block was not demonstrated. The seven chains whose
available endpoints lack `eth_simulateV1` remain unverified.

Raw curl probes against recent blocks on Morpho **dev** eRPC
(`https://rpc.dev.morpho.dev/cache/evm/{chainId}`; authentication omitted here)
produced the results below. These are endpoint observations, not guarantees for
every provider on a chain. Monad used `finalized` and `validation: true`.
Unsupported-method results failed with number selectors too, so they do not
establish hash-only incompatibility. Endpoints without hash-selector support
fail closed.

On 2026-11-23, separate read probes sent that selector to both `eth_getCode`
and `eth_call` at a finalized hash per chain through the same dev eRPC endpoint,
bypassing cache reads. Each live read probe returned non-empty contract code
and a 32-byte result from a read-only call: wrapped-native token `decimals()`,
Multicall3 `getChainId()`, or Morpho Blue `owner()` on Arc. Anvil 1.9.0 used
WETH on a local Ethereum fork at its latest hash. The read probes show
acceptance for canonical hashes, not rejection of retained non-canonical blocks.

| Chain | ID | `eth_simulateV1` | `eth_getCode` | `eth_call` | Simulation limit |
| --- | ---: | --- | --- | --- | --- |
| Ethereum | 1 | Yes | Yes | Yes | Also accepted on `https://eth.drpc.org` |
| Base | 8453 | Yes | Yes | Yes | |
| Arbitrum | 42161 | Yes | Yes | Yes | |
| Optimism | 10 | Yes | Yes | Yes | |
| Polygon | 137 | Yes | Yes | Yes | |
| Unichain | 130 | Yes | Yes | Yes | |
| Katana | 747474 | Yes | Yes | Yes | |
| Monad | 143 | Yes | Yes | Yes | Public `https://rpc.monad.xyz` returned -32601 for both selectors |
| HyperEVM | 999 | Yes | Yes | Yes | |
| Stable | 988 | Yes | Yes | Yes | Parent-hash response check remains off by default |
| BNB Smart Chain | 56 | Yes | Yes | Yes | |
| Arc | 5042 | Yes | Yes | Yes | |
| Cronos | 25 | Yes | Yes | Yes | |
| Hemi | 43111 | Yes | Yes | Yes | |
| Ink | 57073 | Yes | Yes | Yes | |
| Linea | 59144 | Yes | Yes | Yes | |
| Lisk | 1135 | Yes | Yes | Yes | |
| MegaETH | 4326 | Yes | Yes | Yes | |
| Mode | 34443 | Yes | Yes | Yes | |
| Soneium | 1868 | Yes | Yes | Yes | |
| World Chain | 480 | Yes | Yes | Yes | |
| 0G | 16661 | Yes | Yes | Yes | |
| Abstract | 2741 | Unverified | Not probed | Not probed | -32600 method unavailable, with either selector |
| Bitlayer | 200901 | Unverified | Not probed | Not probed | -32601 method unavailable, with either selector |
| Kaia | 8217 | Unverified | Not probed | Not probed | -32600 method unavailable, with either selector |
| Pharos | 1672 | Unverified | Not probed | Not probed | -32600 method unavailable, with either selector |
| Scroll | 534352 | Unverified | Not probed | Not probed | -32600 method unavailable, with either selector |
| Sei | 1329 | Unverified | Not probed | Not probed | -32600 method unavailable, with either selector |
| XDC | 50 | Unverified | Not probed | Not probed | -32601 method unavailable, with either selector |
| Anvil mainnet fork | 1 | Yes | Yes | Yes | Same-height response |

The SDK does not enforce endpoint consistency or set a retry policy. If you
need failover, use a separate single-backend client for each provider and start
a fresh simulation on the next provider after a transport failure. Use
`http(..., { retryCount: 0 })` to avoid per-request retries.

CCIP-Read is always off. viem enables it by default, so an `OffchainLookup` revert would make it fetch whatever gateway URL the contract names. `simulate` runs every request on its own copy of your client with `ccipRead: false` (viem >=2.9.2), whatever your client's setting; your client is not changed, and there is no option to turn CCIP-Read on.

Native-ETH movements are observed through `traceTransfers` logs on the simulated calls. No state overrides or helper contracts are added automatically.

### Caller-provided state overrides

`simulate()` accepts an optional `stateOverrides` account-address map in JSON-RPC
format (`SimulationStateOverrides`). Each account can override `code`, `balance`,
`nonce`, and either `state` (replace all storage) or `stateDiff` (patch storage).
Balances and nonces are hex quantities; storage keys and values are 32-byte hex.
The SDK forwards override contents unchanged, without runtime validation or
normalization. Consumers are responsible for supplying valid overrides.
Overrides apply once before **all** calls in the simulated block, including state
reads, authorization preparations, transactions and assertions. Calldata-target
code checks use an explicit code override when supplied and reject code-less
EIP-7702 delegates. Metadata lookups outside
`eth_simulateV1` still read the pinned onchain state.

For example, a caller can model a contract sender through an EIP-7702 delegation
on Monad, whose `validation: true` otherwise rejects contract senders:

```ts
await simulate(client, {
  transactions,
  limits,
  stateOverrides: {
    [sender]: { code: `0xef0100${scratchAddress.slice(2)}` },
    [scratchAddress]: { code: senderBytecode },
  },
});
```

The caller chooses an unused scratch address and reads `senderBytecode` at the
same state block used for simulation (supply `block` or `blockNumber` to pin it).
Delegation executes that code with the sender's storage; code introspection sees
the delegation instead, and gas usage may differ. The SDK does not construct or
verify this workaround. Any caller override, especially a balance or storage
override, makes the result describe hypothetical state; it is not proof the
unmodified transaction will succeed at broadcast. Omitting `stateOverrides`
keeps real-balance funding and adds no implicit overrides. Calldata targets with
EIP-7702 delegation now also need code at their delegate, including existing
onchain delegations without overrides. This adds a pinned `eth_getCode` read
under the same timeout and rejects code-less delegates with
`SimulationValidationError`.

With overrides, signed-request use and approval allowlist checks describe only
the overridden execution. Overriding token, Morpho, Midnight or EcrecoverAuthorizer
code or storage can fake use events or hide approval grants. Integrators must
control the overrides; a passing result with untrusted overrides does not prove
signatures were used or that the broadcast transaction grants only allowed permissions.

Upgrading from v8? Read [Migrating to 9.0](#migrating-to-90). Older guides, to apply in order:
[v4 → v5](../../docs/migrations/evm-simulation-v4-to-v5.md), [v5 → v6](../../docs/migrations/evm-simulation-v5-to-v6.md),
[v6 → v7](../../docs/migrations/evm-simulation-v6-to-v7.md), [v7 → v8](../../docs/migrations/evm-simulation-v7-to-v8.md).

### API surface

For deprecated, ignored logging callbacks and the new signing gate, see the
[structured warnings migration guide](https://github.com/morpho-org/sdks/blob/main/docs/migrations/evm-simulation-structured-warnings.md).

All symbols below are re-exported from the package root.

- `simulate(client, params, options?)` — run a bundle through the simulation pipeline.
- Client, option and diagnostic types: `SimulationClient`, `SimulationOptions`, `SimulationWarning`, `SimulationReportVerification`; deprecated `SimulationLogger` remains exported.
- Input types: `SimulateParams` (`mode`, `SimulationAuthorization` requests, `SimulationLimits`), `SimulationMode`, `SimulationTransaction`, `Assertion`, `LogAssertion`, `AssertionBounds`, `StateBlock` (the optional `SimulateParams.block`: `{ number, hash, timestamp }`), `SimulationStateOverrides` (the optional `SimulateParams.stateOverrides` account map), and `SimulationAccountOverride` (per-account `code`, `balance`, `nonce`, `state` and `stateDiff`).
- Assertion helpers: `erc20BalanceAssertion` (token balance), `nativeBalanceAssertion` (native balance), and `maxDepositAssertion` (vault deposit cap); all use inclusive `min`/`max` bounds.
- `toSimulationAuthorizations({ owner, requirements })` — map morpho-sdk `ActionRequirement[]` onto `SimulationAuthorization[]` straight from `action.args` — nothing is decoded or validated; validation happens in `simulate()`'s request parser.
- Authorizations and limits: `SimulationAuthorization` and its members (`Erc20ApprovalAuthorization`, `Erc2612PermitAuthorization`, `Permit2TransferAuthorization`, `BlueAuthorization`, `BlueAuthorizationSignature`, `MidnightAuthorizationSignature`) with their EIP-712 payloads (`Eip712Domain`, `Eip712Field`, `Erc2612PermitTypedData`, `Permit2TransferTypedData`, `BlueAuthorizationTypedData`); `SimulationLimits`, `ApprovalLimit`, `OperationLimit`, and the shared `SlippageLimits`, `CheckedSlippageLimits` (the checked result carrying the applied `slippageTolerance`), `CheckedOperationLimit` and `CheckedSimulationLimits` (the type of `verification.limits` on a checked run), `SlippageQuote`, `SharePriceLimit`, `InKindPositionQuote`, `ForceExitDeallocationQuote`, `BluePositionBounds`, `MidnightPositionBounds`, `MidnightDebtPositionBounds`, `MidnightMarketStruct`, and `MidnightCollateralAmount`.
- `toSimulationLimits(action, { owner, onBehalf?, receiver?, slippageTolerance?, market?, expected? })` — build the `SimulationLimits` of a morpho-sdk action transaction (`tx.action`), deriving quote sides the encoded args fix and merging the caller's `expected` quote over them.
  `market` is forwarded for `midnightSupplyCollateral`, `midnightTakeLend`,
  `midnightTakeBorrow`, and `midnightSupplyCollateralTakeBorrow`; it is also
  forwarded for `midnightCancelAndMake` with collateral supplies and no
  `blueSupply`, whose non-zero roots emit `midnightSupplyCollateralMakeBorrow`
  limits. The Midnight `MarketUtils.toId(market)` must equal the action's
  market id. `receiver` applies to `vaultV2ForceRedeem`,
  Midnight redeem/sell actions, `midnightSupplyCollateralTakeBorrow`,
  `midnightTakeBorrow`, `midnightTakeWithdraw`, and repayment-withdraw actions
  with collateral withdrawals; for the latter, it must match
  `collateralReceiver`. For Midnight sells, pass the action's encoded receiver
  when it differs from `owner`; `takeLend` acts for `msg.sender` and does not
  allow an external receiver. A non-owner `onBehalf` is supported only for
  `blueWithdrawBuyCallback`, direct ERC-20 `midnightSupplyCollateral`, and
  `midnightRedeem`. `midnightSupplyCollateralWithNative` credits the sender
  and emits the same `midnightSupplyCollateral` operation. Eligible maker
  bundles act for `owner`.
  Midnight sells, `midnightTakeLend` and repay-withdraw always
  measure `msg.sender` and reject any explicit `account`; Blue parking and
  `midnightSupplyCollateralMakeBorrow` measure the bundle sender, so `account`
  must equal `owner` or be omitted; Midnight
  take bundles act for `owner`/`msg.sender`.

- Slippage-check result types: `VerifiedSimulationResult`, `SimulationVerification`, `SimulatedOperation`, `AuthorizationPreparation`.
- Input-based limits: `InputOperationLimit`, `OperationInputs`, `AssetsOrShares`, `RepayInputs`, `SimulationInputLimits` and `SimulateInputParams`; checked input outputs use `CheckedInputOperationLimit`, `CheckedSimulationInputLimits`, `SimulationInputVerification` and `VerifiedSimulationInputResult`. `ScalarQuoteField` names the keys of `fieldChecks`; `FeelessInputType` names the input operation types that reject `referralFee`, and `ReallocationPenaltyInputType` names those that accept `reallocationPenalty`. Existing `SimulateParams`, `SimulationLimits`, `CheckedOperationLimit` and quote-only result types remain unchanged; `simulate()` accepts both forms and preserves its quote-only return overload, including wrappers typed with `SimulateParams`.
- Report types: `SimulationReport` (quote-only `simulate`), `SimulationInputReport` (typed-input `simulate`) and their shared `ok: false` branch `SimulationFailure`, whose `severity` and every error's `severity` are a `SimulationErrorSeverity`.
- Result types: `SimulationResult`, `SimulationCall`, `Transfer`, `AccountAssetChanges`, `AssetChange`, `RawLog`.
- Errors: `SimulationPackageError` (abstract base — `instanceof` it to catch any package error), `SimulationSafetyError`, `SimulationExecutionError`, `SimulationInvalidRequestError`, `SimulationInfrastructureError`, `SimulationRevertedError`, `SimulationAssertError`, `SimulationLogAssertError`, `BlacklistViolationError`, `RpcTransportError`, `SimulationValidationError`, `UnsupportedChainError`, and the verification errors `UnsupportedOperationError`, `InvalidSimulationResponseError`, `SlippageCheckUnavailableError`, `ApprovalCheckUnavailableError`, `UnexpectedPositionChangeError`, `UnexpectedTokenApprovalError`, `UnexpectedMorphoAuthorizationError`, `UnexpectedMidnightAuthorizationError`, `SimulationEffectError`, `AuthorizationRequestMismatchError`, `UnusedAuthorizationError`, `ConsumerLimitViolationError`, `UnexpectedSimulationError`, and the limit-building errors `LimitAccountMismatchError`, `MissingExpectedQuoteError`, `AmbiguousExpectedQuoteError`, `UnsupportedLimitActionError`.
- Error helpers: `SIMULATION_ERROR_CODES` / `SimulationErrorCode` (every `error.code`), `isSimulationPackageError` (structural guard for one package error, including its `severity`), `toSimulationErrorResponse(error)` / `SimulationErrorResponse` (JSON-safe fields of one failure for API responses; map it over `report.failures`), `RetainedAsset`. Errors use standard `message` and optional `cause`; `SimulationRevertedError` carries `revertData?: Hex` and `transactionIndex?: number`; `SimulationAssertError` carries `transactionIndex`, `phase`, `assertionIndex`, a copy of the caller's `assertion` (`to`, `data`, and `check`), and raw `returnData`; `SimulationLogAssertError` carries `transactionIndex`, `assertionIndex`, a copy of the caller's assertion, and the lowercase log values passed to its check, which receives them in a frozen copy. `ConsumerLimitViolationError` names what failed: `operationIndex`, `operationType`, `field` (`ConsumerLimitField`), `check` (one of `CONSUMER_LIMIT_CHECKS` / `ConsumerLimitCheck`), `expected` and `observed`, plus `tolerance` or `bound` when the check applies one, and `entry` (`ConsumerLimitEntry`: `{ marketId }` for `positions` and `deallocations`, `{ collateralIndex }` for `collateralSupplies`, `collateralWithdrawals` and `position.maxCollateral`, `{ token, account }` for `walletBalance`) naming the failing entry when the quote or bound has several, undefined otherwise; `ConsumerLimitViolation` is that field set. The fields are optional in the type because the constructor accepts a message alone; `simulate` always sets them.
- Slippage-unavailable diagnostics: `SlippageCheckUnavailableError` carries `field` and `reason`, plus `operationIndex` and `operationType` for operation-scoped failures. `SLIPPAGE_CHECK_UNAVAILABLE_REASONS` / `SlippageCheckUnavailableReason` list the documented reasons. The seven reasons describe unavailable evidence. Caller-input conflicts and combined flows that cannot be measured separately are reported as `SimulationValidationError` with operation-scoped `fieldErrors` instead. These fields are optional in the type because the constructor accepts a message alone; the SDK always sets `field` and `reason`.
- Verification vocabulary: `SIMULATION_MODES` / `SimulationMode`, `OPERATION_TYPES` / `OperationType`, `BLUE_MARKET_OPERATION_TYPES` / `BlueMarketOperationType`, `VAULT_OPERATION_TYPES` / `VaultOperationType`, `SimulationOperationSubject` and its members `BlueMarketOperationSubject`, `BlueRefinanceSubject`, `VaultOperationSubject`, `VaultV1MigrateToV2Subject`, `MidnightBuySubject`, `MidnightBlueParkingSubject`, `MidnightCollateralOperationSubject`, `MidnightRedeemSubject`, `MidnightSellSubject`, and `MidnightRepayWithdrawCollateralSubject` (operation groups and the operation-keyed subject union used by verification results).

### Assertions

Each transaction may declare caller-supplied `assertBefore` and `assertAfter`
assertions, plus `assertLogs` checks over that transaction's frozen log copy,
whose hex `address`, `topics`, and `data` are lowercase. Log
assertions run after the transaction succeeds and before its `assertAfter`
assertions; they do not add calls to the simulation plan. The `erc20BalanceAssertion`, `nativeBalanceAssertion`, and
`maxDepositAssertion` helpers construct common calls; their optional `min` and
`max` bounds are inclusive and require at least one bound. Values are in token
base units, wei, or vault asset units, respectively.

Assertions run as ordinary calls from the bundle owner (`msg.sender` is the
owner), so they must be view calls: a call that writes state acts with the
owner's authority, and later calls see its writes.

An assertion can also call any view function and inspect its return data:

```ts
const allowanceIsZero: Assertion = {
  to: USDC,
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  }),
  check: (returnData) =>
    hexToBigInt(returnData) === 0n
      ? undefined
      : `Allowance is "${hexToBigInt(returnData)}", expected "0".`,
};
```

Every `assertLogs` check for a transaction receives the same recursively frozen
copy of its logs. The address, topics, and data are lowercase hex, so the event
signature can be compared directly with viem's `toEventSelector`. Use viem to
decode a log from the transaction's `RawLog[]`. `decodeEventLog` requires a
non-empty topics tuple, so this example narrows the signature topic and builds
that tuple without changing the `RawLog` shape or casting:

```ts
import type { LogAssertion } from "@morpho-org/evm-simulation";
import {
  decodeEventLog,
  erc20Abi,
  isAddressEqual,
  toEventSelector,
  type Address,
  type Hex,
} from "viem";

const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const approvalTopic = toEventSelector("Approval(address,address,uint256)");
const approvalMatches = (
  owner: Address,
  spender: Address,
  amount: bigint,
): LogAssertion => ({
  check: (logs) => {
    const log = logs.find(
      (entry) =>
        isAddressEqual(entry.address, USDC) &&
        entry.topics[0] === approvalTopic,
    );
    if (!log) return "Approval event is missing.";
    const [signature, ...indexedTopics] = log.topics;
    if (!signature) return "Approval event is missing.";
    const topics: [Hex, ...Hex[]] = [signature, ...indexedTopics];
    const { args } = decodeEventLog({
      abi: erc20Abi,
      eventName: "Approval",
      data: log.data,
      topics,
    });
    return isAddressEqual(args.owner, owner) &&
      isAddressEqual(args.spender, spender) &&
      args.value === amount
      ? undefined
      : "Approval event has unexpected values.";
  },
});
```

`assertBefore` and `assertAfter` assertions run as ordinary calls inside the
same `eth_simulateV1` request, not as static calls. They must be view calls: any
state they write is visible to later calls. Morpho Vault V2's `maxDeposit` is
`pure` and always returns 0, so
`min > 0` always fails there; the helper is meaningful for Vault V1/MetaMorpho.

A failed `assertBefore` or `assertAfter` check is reported as `SimulationAssertError`
(`SIMULATION_ASSERT_FAILED`) with
`transactionIndex`, `phase`, `assertionIndex`, a copy of the caller's
`assertion` (`to`, `data`, and `check`), and raw `returnData`. A failing `assertBefore` is listed in `report.failures`
before its transaction's own revert. Reverted assertion reads are also reported as
`SimulationAssertError`; the check decides whether empty or malformed return
data passes. Assertion declarations are omitted from returned `simulationTxs`.
An `assertLogs` failure is reported as `SimulationLogAssertError` with the same
`SIMULATION_ASSERT_FAILED` code, the transaction and assertion indexes, a copy
of the log assertion, and the lowercase log values passed to its check, which
receives them in a frozen copy. A transaction
revert is the last failure of its run, so its log and `assertAfter` assertions are
not reported; otherwise a failing log assertion is listed before that
transaction's `assertAfter` failures.

### Limits

`limits` is required on every call: pass quote-only `SimulationLimits`,
`SimulationInputLimits` for typed inputs or mixed operations (via
`SimulateInputParams`), or the literal `"none"` to skip limit and approval checks
and their state reads. Final-mode signed-authorization use checks still run.
`"none"` is
reserved for transactions that no operation type covers (Merkl reward claims,
unsupported Midnight actions such as `midnightCancelAndMake` bundles that combine
a Blue supply with collateral supplies, contain unfunded publications, or
contain cancellations only), and
every transaction an operation type covers must pass limits. Missing `limits`
and an empty `operations` array without non-empty validated `effects` are rejected as `SimulationValidationError` —
an implicit
opt-out is never accepted.

#### Exact control effects

`SimulationLimits.effects` (also accepted with typed inputs) declares exact effects
for control transactions. `operations: []` is valid only with non-empty validated
effects. Each effect optionally carries `txIdx`, a zero-based index into caller
transactions, never preview preparations. An omitted index binds to the **last**
caller transaction, after SDK requirements. Out-of-range indices are rejected.
Successful reports include the frozen checked effects in `verification.limits.effects`,
with every `txIdx` resolved to its caller transaction index.

| Effect `type` | Required fields | Evidence required in the bound transaction |
| --- | --- | --- |
| `erc20Approval` | `token`, `owner`, `spender`, `amount` | Exact `Approval` from `token`, including amount `0n` |
| `blueAuthorization` | `authorizer`, `authorized`, `isAuthorized` | Exact `SetAuthorization` from registered Blue, including revocation |
| `midnightAuthorization` | `onBehalf`, `authorized`, `isAuthorized` | Exact `SetIsAuthorized` from registered Midnight, including revocation |
| `midnightCancelOffers` | `onBehalf`, non-empty unique bytes32 `groups` | Matching `SetConsumed` from registered Midnight with `maxUint128` for every group |

The last event for each permission pair or cancellation group in the bound
transaction must match; an earlier matching event cannot mask a later change.
Missing/mismatched evidence, malformed transfer evidence, or positive token/native
outflow from that transaction's sender blocks with `SimulationEffectError`
(`SIMULATION_EFFECT_FAILED`). Incoming, zero and self transfers are not outflows.
Effects-only transactions must have zero `value`, including self-directed value.
When operation limits are also present, positive bound-transaction `value` to
another address still fails, even if native traces are omitted. Self-directed
value is not an outflow in mixed operation/effect requests, but sender ETH debit
traces must cover the declared value; missing or partial evidence fails closed.
This is event evidence, not an allowance read-back or a guarantee about dishonest
or logless tokens. Existing unexpected-grant allowlists are unchanged: each
effect's permission pair is implicitly allowed only in its bound transaction,
not in preparations or other transactions. Extra grants remain checked.
Direct ERC-20 approval effects never implicitly allow Permit2 grants for the same pair.
Only granting effects implicitly allow a permission pair; zero approvals and revocations
do not permit a preceding grant. The converter retains owner-only account checks for
control actions, including encoded Midnight `onBehalf`. Its `expected`,
`slippageTolerance` and `market` options are ignored for control actions because
effect expectations are exact rather than economic quotes.
When `operations` is empty, every caller transaction (excluding simulation preparations)
must have at least one effect resolving to its index. Omitted `txIdx` covers only the
last caller transaction, not earlier requirement calls: declare their own indexed
effects or simulate them separately. Each caller transaction must target its declared
token or registered protocol and contain only declared control calls: ERC-20
`approve`, Blue `setAuthorization`/`setAuthorizationWithSig`, or Midnight
`setIsAuthorized`/`setConsumed`. Midnight's SDK cancellation `multicall` is accepted
only when every subcall matches a declared effect; nested multicalls and economic
calls such as collateral withdrawals are rejected with `SimulationEffectError`.
Arguments must match the declared effects; SDK analytics metadata may trail calldata.
This calldata inspection only restricts effects-only transactions: it never infers
permissions or economic limits. Requests with operation limits keep their existing
bundle-wide economic checks.

`toSimulationLimits(action, { owner, token?, txIdx? })` derives these effects.
For `erc20Approval`, `token` must be the approval transaction's `to`: SDK action
metadata contains only the spender and amount. Missing `token` throws
`SimulationValidationError` with instructions. `txIdx` is copied only when supplied.

New integrations should supply `inputs`, independently of the transaction builder:

```typescript
const report = await simulate(client, {
  transactions: [{ from: owner, to: tx.to, data: tx.data, value: tx.value }],
  limits: {
    operations: [{ type: "vaultV2Deposit", vault, inputs: { assets } }],
  },
});
```

`InputOperationLimit` accepts typed amounts through `inputs`: vault deposits and
withdrawals use `{ assets }`, redemptions use `{ shares }`; Blue supply, borrow
and collateral operations use `{ assets }`; Blue withdrawal accepts `{ assets }`
or `{ shares }`, and repayment additionally accepts `"full"`. Combined Blue
operations use `{ collateralAssets?, borrowAssets? }` or
`{ repay?, collateralAssets? }`, with at least one active leg. Migration names
`sourceVault` and `targetVault`, with `{ assets }` or `{ shares }`. The position
owner is `account` (default: transaction sender); `receiver` also defaults to
the sender. `OperationInputs`, `AssetsOrShares` and `RepayInputs` describe these
amounts. `InputOperationLimit` is preferred for the types `OperationInputs`
covers; `OperationLimit` remains supported as the quote-only type.

Expectations come from hidden before-state calls in the same simulated block:
vault previews, Morpho `accrueInterest` followed by market totals and the owner's
position. Migration uses the source preview and the target V2's accrued totals,
fee shares and virtual shares, reproducing its `previewDeposit` formula. Helper
calls never appear in `simulationTxs`, transfers or asset changes. Blue accrual
does carry into the bundle: a typed Blue input accrues its market before the
user's transactions, so when the market has not yet accrued in the simulated
block, `calls[i].logs` omit that market's `AccrueInterest` event and
`calls[i].gasUsed` excludes the accrual and interest-rate-model cost. Quote-only
limits do not accrue.

Derived sides use **no percentage tolerance**. A directly selected amount must match
exactly; converted outputs must be at least the derived amount and converted
costs at most it. Derived debt shares on borrow legs and source shares on vault
withdrawals and migrations must match exactly, preventing amounts split across
subjects. Assets-mode Blue withdrawals additionally require at least the derived
shares minus one share wei per earlier subject-market supply evidenced by a
simulated Blue `Supply` event (including public-allocator reallocations). Each
supply rounds minted shares down and can lower the withdrawal conversion by one
share wei. Larger conversion changes fail closed. Explicit `quote` sides override derivation and retain the
existing `slippageTolerance` behavior (default `DEFAULT_SLIPPAGE_TOLERANCE`).
`slippageTolerance` is validated but ignored on derived sides, even if supplied.
Checked quotes include the derived values. Input-based checked limits also
report `fieldChecks` per scalar side: `exact` means equality, `minimum` and
`maximum` are zero-tolerance derived bounds, and `quoted` uses the reported
`slippageTolerance`. Internal derivation fields are not returned.
When a derivation read fails, the report carries its
`SlippageCheckUnavailableError` and skips that operation's quote-dependent
checks, including the inactive-leg checks of combined Blue operations;
absolute `position` bounds and unchanged-state guards still run.
Inactive combined-operation pay-in legs receive automatic `1n` caps. An inactive
repay leg permits no debt-share growth; an inactive collateral-supply leg permits
no collateral loss. These subject checks survive explicit quote overrides.
For combined Blue operations with both legs active, matching wallet tokens and
matching sender/receiver, the derived wallet expectations net the pay-in against
the payout. `assetsReceived` is signed (zero or a debit is possible), and
`assetsPaid` is the nonnegative net debit. Subject collateral and share checks
remain independent of this netting, including on-behalf positions. Different
tokens or wallet holders do not net.
Wallet measurements cover the whole bundle, not individual operations. If two
operation limits measure the same wallet token balance (including native tokens
and vault-share balances), and either uses typed inputs, simulation rejects them
with `SimulationValidationError` before execution. Split the bundle or use
quote-only limits for every overlapping operation, with bundle-wide wallet quotes.
Multiple sides within one operation may share a wallet measurement; disjoint
wallet measurements and existing quote-only overlaps remain supported.
Migration target shares retain a strict minimum: if an earlier source withdrawal
changes the target's conversion, quote `sharesMinted` explicitly rather than
assuming a percentage or fixed rounding allowance.

Declare an integrator's WAD-scaled percentage as `referralFee` (default zero,
strictly below `1e18`); it is not a user amount. Gross funding/proceeds fees
round down; Blue repay fees are `floor(repaidAssets * pct / (1e18 - pct))`.
Collateral-only Blue operations have no fee-bearing leg. For `blueBorrow`,
`blueWithdraw` (assets or shares mode), and an active borrow leg of
`blueSupplyCollateralBorrow`, also declare `reallocationPenalty`: the aggregate
allocator charge in **absolute loan-token base units**, default zero, not a
WAD-scaled rate. Sum `ceil(allocation.assets * allocation.penalty / 1e18)` across
allocations. Net proceeds are `(assets - penalty) - floor((assets - penalty) *
referralFee / 1e18)`; position shares still derive from the gross assets.
The penalty must leave positive proceeds. Other input types do not accept it;
refinance still requires a quote including its penalty. Undeclared fees and
penalties are not deducted from expectations and fail the derived check.
In-kind redeems, refinance, V2 force exits and Midnight operations
still require explicit quotes; `inputs` is rejected for these types.

Quote-only limits and `toSimulationLimits` keep their v8 behavior and are not
deprecated. They remain the only form for refinance, in-kind redeems, force
exits and Midnight operations. For quote-only callers, the caller chooses the
action, subject, quote, and percentage tolerance. Every
operation type requires the quote sides of the required-minimums and
required-caps lists below — the per-operation table lives in
`docs/migrations/evm-simulation-v7-to-v8.md`:

- Required minimums: callback-position `sharesMinted` on
  `midnightSupplyBlueMakeLend`; `assetsReceived` on payout ops (`blueWithdraw`,
  `blueBorrow`, `blueWithdrawCollateral`, `midnightRedeem`,
  `midnightTakeBorrow`, `midnightTakeWithdraw`, and every vault
  withdraw, redeem and force-exit); supply/vault `sharesMinted` (`blueSupply`,
  `vaultV1Deposit`, `vaultV2Deposit`, `vaultV1MigrateToV2`); debt
  `sharesBurned` (`blueRepay`, `blueRefinance`); `collateralSupplied` on
  `blueSupplyCollateral`, `midnightSupplyCollateral`, and
  `midnightSupplyCollateralMakeBorrow`; `unitsBought` on
  `midnightTakeLend`; `debtRepaid` when quoted and `collateralWithdrawals`
  delivery on `midnightRepayWithdrawCollateral` and
  `midnightTakeRepayWithdrawCollateral`; `collateralSupplies`, `unitsSold`, and
  `assetsReceived` on `midnightSupplyCollateralTakeBorrow`; and either of
  `collateralSupplied`/`assetsReceived` or `sharesBurned`/`assetsReceived` on
  the combined ops.
- For `midnightSupplyCollateralTakeBorrow`, each `collateralSupplies` amount is
  both the exact minimum credited at that index and the exact sender pull cap
  source; percentage tolerance does not widen either bound.
  The helper derives these amounts from the action and rejects
  `expected.collateralSupplies` overrides. Owner native value from all
  transactions in the bundle, including unrelated ones, is subtracted from the
  owner's wNative pull cap, which is the quoted wNative collateral. If native
  value exceeds that cap, simulation fails closed with
  `SimulationValidationError`. This includes a `0n` cap: any positive
  native value fails closed, for example when the owner receives wNative loan
  proceeds but no quoted collateral is wNative. Native value sent on a chain
  without registered wNative fails closed with `SlippageCheckUnavailableError`;
  otherwise, if the operation has no owner wNative bound, native value is not
  checked. The combined operation is reported as
  `SimulationValidationError` when its wallet bounds overlap another
  operation's wallet balance reads or wallet bounds, or when its Midnight
  collateral, credit, or debt reads overlap another operation's Midnight
  position reads.
- Required caps: `assetsPaid` on every pay-in op (`blueSupply`,
  `blueSupplyCollateral`, `midnightSupplyCollateral`,
  `midnightSupplyCollateralMakeBorrow`,
  `midnightSupplyBlueMakeLend`, `midnightTakeLend`, `blueRepay`, `vaultV1Deposit`, `vaultV2Deposit`,
  and unconditionally on both combined ops, on an active repay leg of
  `midnightRepayWithdrawCollateral`, and on `midnightTakeRepayWithdrawCollateral`); supply/vault `sharesBurned`
  (including `vaultV1MigrateToV2`'s source-vault shares);
  debt `sharesMinted` (`blueBorrow`, `blueRefinance`'s target market,
  `blueSupplyCollateralBorrow`); `collateralWithdrawn` on
  `blueWithdrawCollateral` and `blueRepayWithdrawCollateral`; the position-
  decrease side of `collateralWithdrawals` on
  `midnightRepayWithdrawCollateral` and `midnightTakeRepayWithdrawCollateral`; `creditRedeemed`
  on `midnightRedeem` and `midnightTakeWithdraw`; `unitsSold` on
  `midnightTakeBorrow` and `midnightSupplyCollateralTakeBorrow`.

A single-leg combined use quotes `1n` on each inactive leg's cap
(`sharesMinted`, `collateralWithdrawn`, `assetsPaid`, since `0` is rejected);
an active leg on either side requires that leg's other side: `sharesMinted`
above `1n` requires `assetsReceived` on `blueSupplyCollateralBorrow`, and
`collateralWithdrawn` above `1n` requires it on
`blueRepayWithdrawCollateral`; symmetrically, `assetsPaid` above `1n`
requires `collateralSupplied` on `blueSupplyCollateralBorrow` and
`sharesBurned` on `blueRepayWithdrawCollateral`. In-kind redeems must quote
`positions` — the Blue supply shares delivered to the receiver per market —
or `assetsReceived` for the idle wallet portion, on top of the `sharesBurned`
cap.
For `blueRefinance`, source collateral withdrawals authorized only by the refinance
must be covered by Blue target `SupplyCollateral` events on the owner's behalf:
the source withdrawal receiver must equal the target supply caller, and each
supplied unit can cover only one withdrawn unit across all declared refinances.
This flow check supports full and partial moves and arbitrary market IDs;
unmatched withdrawals produce an `UNEXPECTED_POSITION_CHANGE` warning. It requires enough
target collateral, not exact equality: extra target supplies are allowed. It does
not prove the provenance of fungible collateral supplied by the same flow account.
The source and target markets' collateral tokens are resolved in the existing
`eth_simulateV1` state reads and must match for a refinance withdrawal to be
authorized.
Matching is partitioned by flow account. A single account's graph is limited to
4096 aggregated market/account movements and 10,000 route edges; larger graphs
produce an `UNEXPECTED_POSITION_CHANGE` warning.
A separately declared collateral withdrawal is checked by its own limits instead.
Midnight collateral withdrawals must match the resolved tokens of quoted
`collateralWithdrawals` indices, not just the declared market.
`midnightSupplyCollateral` and `midnightSupplyCollateralMakeBorrow` limits
name the Midnight market (`marketId`, from morpho-sdk's
`MidnightMarketUtils.toId`) and the `collateralIndex` they supply; `collateralSupplied`
is the `Midnight.collateral(marketId, account, collateralIndex)` delta, and
`assetsPaid` is the sender's balance delta in the collateral token, resolved
from `Midnight.toMarket(marketId)` or the supplied market struct at that index.
Two supplies to the same slot in one bundle are checked against one aggregate
quote. The chain must have a registered `midnight` address; otherwise
the report fails with `UnsupportedChainError`. A market that does not exist yet at the
state block has no `toMarket` entry. For a first `midnightTakeLend`,
`midnightTakeBorrow`,
`midnightSupplyCollateralTakeBorrow`, `midnightSupplyCollateral`, or
`midnightSupplyCollateralMakeBorrow` into a
market created in the bundle, pass its struct via `market`; the Midnight
`MarketUtils.toId(market)` must equal `marketId`. For a first
`midnightSupplyCollateral` or `midnightSupplyCollateralMakeBorrow`,
`assetPaid` is a fallback when no `market` is passed: set it to
`collateralParams[collateralIndex].token`. The override is
not checked, and a wrong address lets the `assetsPaid` cap pass without
measuring anything. It is also the token the approval check allows to Midnight
and MidnightBundlesV2.
`midnightSupplyBlueMakeLend` checks both the sender's exact debit of the full
parked amount and the BlueBuyCallback's supply-share increase over the whole
bundle. For wNative loan tokens, the debit measurement adds ETH sent to the net
wNative balance change, so native funding needs no quote adjustment. The caller
must quote callback-position `sharesMinted`; `slippageTolerance` applies to
that minimum but does not widen the exact `assetsPaid` comparison. It uses
`loanToken` directly without token metadata reads. The limit names the Blue
`marketId` (`MarketUtils.getMarketId(blueSupply.market)`) and the
`callbackSalt`; `simulate()` computes the callback address from the bundle
sender and that salt. Combining Blue parking with any collateral supplies is
unsupported and throws `UnsupportedLimitActionError`.
On chains with no registered wNative, sending native value with Blue parking
fails with `SlippageCheckUnavailableError`.

`toSimulationLimits` also supports a funded maker publication produced by
`supplyCollateralMakeBorrow`: `tx.action.type` must be `midnightCancelAndMake`,
`collateralSupplies` must be non-empty, and `blueSupply` must be `undefined`.
It emits one operation per distinct collateral index, preserving first-seen
order and summing repeated indices: a non-zero root uses
`midnightSupplyCollateralMakeBorrow`, while a zero root uses
`midnightSupplyCollateral`. MidnightBundlesV2 acts for
`msg.sender`, so each operation uses `owner` as its collateral account;
`onBehalf` cannot change that. If the maker publishes supplies at more than one
index, omit `expected` because its quote cannot be assigned to an individual
operation; a defined `expected` field throws `AmbiguousExpectedQuoteError`.
If the maker's supply creates the market, the `toMarket` rule above applies:
pass the struct via `market` to `toSimulationLimits`, or, when no market is
passed, set `assetPaid` to `collateralParams[collateralIndex].token` on each
returned operation.
Otherwise, `simulate()` reports `SimulationValidationError`.
Other Midnight actions—including `midnightCancelAndMake` bundles that combine Blue parking with collateral
supplies, contain unfunded publications, or contain cancellations only—remain
unsupported; pass `limits: "none"` only when no covered operation is present.

When supplied collateral is wNative, the check counts ETH sent plus the
sender's net wNative change against `assetsPaid`, so native funding needs no
quote adjustment. Sending value when no supplied collateral is wNative fails with
`SimulationValidationError`. Sending value on a chain without registered
wNative fails with `SlippageCheckUnavailableError`.
For Blue parking, the helper quotes the full amount parked. When the loan token
is wNative, the check adds the sender's ETH sent to the net wNative change, so
native funding needs no quote adjustment.

After fulfilling the maker output's token-approval and Midnight-authorization
requirements, pass its action through the helper before simulation:

```ts
const output = await client.morpho.midnight(base.id).supplyCollateralMakeBorrow({
  accountAddress: user,
  offers: rateTree,
  collateral: {
    market,
    supplies: [{ collateralIndex: 0n, assets: collateralAssets }],
  },
  deadline: maxUint256,
});
const tx = output.buildTx();
const report = await simulate(client, {
  transactions: [{ from: user, to: tx.to, data: tx.data, value: tx.value }],
  limits: toSimulationLimits(tx.action, { owner: user }),
});
```

`midnightRedeem` limits name the Midnight market (`marketId`, from morpho-sdk's
`MidnightMarketUtils.toId`). `account` is the credit owner (`onBehalf`) and
`receiver` the address paid. `creditRedeemed` caps the drop in `account`'s
credit as returned by `Midnight.updatePositionView(market, marketId, account)`,
read before and after the bundle: that is the credit after realized losses and
accrued continuous fees, so fees that accrue are not counted as redeemed credit.
`assetsReceived` is the receiver's balance delta in the market's loan token.
`position.maxCredit` caps the same credit after the bundle; `0n` requires the
bundle to close the position and is not loosened by `slippageTolerance`.
Several redeems from one market in one bundle are checked against one
aggregate quote. `midnightTakeBorrow`, `midnightTakeWithdraw` and
`midnightSupplyCollateralTakeBorrow` are whole-bundle
sell limits that always measure the sender and take no `account` field; any
supplied `account` is rejected. Proceeds are measured on `receiver` in the
market's loan token.
`midnightTakeBorrow.unitsSold` and
`midnightSupplyCollateralTakeBorrow.unitsSold` cap the
net position decrease, computed from `updatePositionView` credit minus `debt`
before and after the bundle. `midnightTakeWithdraw.creditRedeemed` caps accrued
credit reduction and the entire bundle must leave debt unchanged. None of these sells
supports `position` or `sharePrice` bounds. The default
`slippageTolerance` also applies to the sell target's bounds; pass
`slippageTolerance: 0n` for exact bounds.
`midnightTakeLend` limits are whole-bundle limits for the sender too:
`assetsPaid` caps the loan-token balance decrease, and `unitsBought` is the
minimum increase in the account's net position (credit minus debt). Assets
targets derive `assetsPaid` from `target.assets` and `unitsBought` from
`target.minUnits`; units targets derive them from `target.maxBuyerAssets` and
`target.units`. On wNative loan markets, `assetsPaid` counts ETH sent plus the
sender's net wNative change against the full cap, whether native funding covers
part or all of it. Sending native value on a chain without registered wNative
also fails closed; send no ETH. Multiple takes in one market share one aggregate limit, with
the summed quote passed through `expected`. The default `slippageTolerance`
also applies to the buy target; pass `slippageTolerance: 0n` for exact bounds.
takeLend supports neither `position` nor `sharePrice` bounds.
Direct repay-withdraw limits always measure the sender and reject any explicit
`account`; they measure repayment, collateral withdrawal, and unchanged credit
across the whole bundle; without a `debtRepaid` quote (withdraw-only or full
repay), debt must not increase. A quoted repayment fails closed if loan-token
collateral is delivered to the payer; use another receiver or split repayment
and withdrawal into separate bundles. If native value is sent while wNative
collateral is delivered to the sender, use another receiver or send no ETH,
regardless of the loan market. Sending native value on a chain without
registered wNative also fails closed; send no ETH. `debtRepaid` is the
minimum debt reduction; quoted collateral is checked against both position
reduction and delivery to `receiver`. `position.maxDebt` and
`position.maxCollateral` are inclusive final-state bounds and are not scaled by
tolerance. A zero bound requires debt closure or an emptied collateral index.
`midnightTakeRepayWithdrawCollateral` (repayment through offers, with the
optional direct fallback) uses the same checks: it always measures the sender
and rejects any explicit `account`. An assets target quotes
`assetsPaid: target.assets` and `debtRepaid: minUnits`; a units target quotes
`assetsPaid: maxBuyerAssets` and `debtRepaid: units`; the `maxUint256`
full-debt target quotes `assetsPaid: maxBuyerAssets` and requires
`position.maxDebt: 0n`. The default `slippageTolerance` scales both quote
fields; pass `slippageTolerance: 0n` for exact bounds. `position.maxDebt: 0n`
is never scaled.

```ts
import { midnightRedeem } from "@morpho-org/morpho-sdk";
import { simulate, toSimulationLimits } from "@morpho-org/evm-simulation";

// An authorized operator redeems `units` of `owner`'s credit to `receiver`.
const tx = midnightRedeem({ chainId, market, units, onBehalf: owner, receiver });
const report = await simulate(client, {
  transactions: [{ from: operator, to: tx.to, data: tx.data, value: tx.value }],
  limits: toSimulationLimits(tx.action, { owner: operator, onBehalf: owner, receiver }),
});
```

For a sell, the target provides receiver proceeds and the position cap. Use a
zero tolerance to enforce those contract bounds exactly:

```ts
import { midnightTakeBorrow } from "@morpho-org/morpho-sdk";
import { simulate, toSimulationLimits } from "@morpho-org/evm-simulation";

const tx = midnightTakeBorrow({
  chainId, market, target, receiver, takeableOffers, deadline,
  referralFeePct, referralFeeRecipient,
});
const report = await simulate(client, {
  transactions: [{ from: owner, to: tx.to, data: tx.data, value: tx.value }],
  limits: toSimulationLimits(tx.action, {
    owner, receiver, slippageTolerance: 0n,
  }),
});
```
All quote amounts must be > 0.
`slippageTolerance` is optional and defaults to blue-sdk's
`DEFAULT_SLIPPAGE_TOLERANCE` (0.03%); when supplied it must be below `1e18`
(100%). Unknown input keys are rejected as `SimulationValidationError` rather
than silently ignored. The simulator never decodes calldata or fetches a quote
to infer constraints — set `account`/`receiver` from the connected user, never
from the transaction's own `onBehalf`. For `midnightRedeem`, set `account` to
the intended credit owner and `receiver` to the intended payee.
Optional extras keep their own rules: `sharePrice` bounds the realized
assets-per-share rate of an operation's priced quote pair, `position` bounds
the subject's post-bundle Blue position (or its Midnight credit, `maxCredit`,
on `midnightRedeem`), `positions` bounds the supply shares
an in-kind redeem delivers per market, and `penalty`/`deallocations` bound a
Vault V2 force exit's realized economics — `penalty` and `deallocations` are
checked only when quoted and never zero-rejected.

Preview authorizations, final-mode Blue authorization signatures, and every operation type require a Morpho Blue address
registered in blue-sdk's `getChainAddresses`; otherwise
the report fails with `UnsupportedChainError`. Blue parking also requires registered
Midnight and `midnightBlueBuyCallbackFactory` addresses.
`midnightAuthorizationSignature` additionally requires registered Midnight and
EcrecoverAuthorizer addresses.
A missing required approval-registry address is reported as
`ApprovalCheckUnavailableError`. Bundler spenders (`vaultBundlesV1`,
`vaultExitBundlesV1`, `blueBundlesV1`) are allowed only where the registry lists
them; on other chains, grants to them need a `limits.approvals` entry. Preview authorizations and final-mode Blue signatures with `limits: "none"`
still require a registered Morpho Blue address and otherwise report
`UnsupportedChainError`.

#### Sender outflow check

With `SimulationLimits` or `SimulationInputLimits`, sender outflows are also checked after
transfer derivation. **Undeclared sender outflows are non-blocking warnings**:
`UnexpectedTokenTransferError` findings never enter `report.failures`, and the report
is `ok: true` if nothing else fails. All other failures remain blocking.

Both success and failure reports always carry `warnings: readonly SimulationWarning[]`,
a frozen array of recursively frozen plain data, empty when no warnings exist.
Each warning has a discriminating `code`, `severity: "warn"`, `message` and `chainId`.
Sender-outflow warnings add `token`, `sender` and `recipients`; they are not Error instances.
**Integrators who gate signing must inspect `report.warnings`, even when `ok` is true.**
The SDK performs no logging. `options.logger` and `SimulationLogger` are deprecated and ignored: the option remains accepted, but no method is invoked. Read `report.warnings` instead; both legacy symbols stay through at least one coexistence minor before removal in a future major. Consumers decide whether to reject, alert or accept warnings.

| Warning code | Additional context |
| --- | --- |
| `UNEXPECTED_TOKEN_TRANSFER` | Token, sender and recipients |
| `RETENTION_CHECK_SKIPPED` | `reason`: `unsupported-chain` or `missing-restricted-addresses` |
| `BUNDLES_BALANCE_SWEPT` | Restricted address, token and bigint `netSwept` in token base units, one warning per pair |
| `MALFORMED_TRANSFER_LOG` | Log address, topics, data, transaction index and reason; the log was skipped |
| `WRAPPED_NATIVE_DEDUP_MISS` | Token, mint/burn kind, transaction index and data |
| `WRAPPED_NATIVE_MIRROR_DETECTED` | The same context, when a configured non-mirroring wrapper emits a matching mirror |

Transfer-signature logs must have three topics, except that four-topic ERC-721
events with empty data (`"0x"`) remain outside the parser's scope and are silently
ignored. Other topic counts, including four-topic events with non-empty data,
produce `MALFORMED_TRANSFER_LOG` and omit report-level `verification`.

`report.verification.retention` is `"checked"` when the retention stage checks
configured restricted intermediaries (even if it finds retained value), or
`"skipped-unsupported-chain"` when blue-sdk does not know the chain or catalogs
neither standalone bundles nor `midnightBundlesV2`. Skips also produce
`RETENTION_CHECK_SKIPPED`. Success and failure reports include `verification`
only after retention ran with every user transaction's logs present, every planned
retention `balanceOf` read returned and decoded in both phases, and no transfer
records discarded by the parser. A retention balance read that cannot be used
omits `verification` and fails the report: `SlippageCheckUnavailableError` when
it reverts or returns empty data, `InvalidSimulationResponseError` when its data
does not decode or the RPC omits its call result. Any `MALFORMED_TRANSFER_LOG` warning
omits `verification`, while warnings and failures from remaining evidence are
preserved. Omitted user-transaction logs omit coverage, even with `limits: "none"`;
explicit empty `logs: []` are valid evidence. Early failures, reverts and unusable transfer
evidence also omit it instead of claiming a completed check. This report-level
coverage is separate from `result.verification`, which describes operation limits.
Warnings never affect `ok` or a failure report's severity. Their order follows the
pipeline: transfer parsing, sender outflows, then retention diagnostics. No logging,
clock or randomness participates in warning construction. Bigint warning context
needs application-owned JSON serialization.

The check detects any net sender loss, including burns, and any positive outgoing transfer
to another non-zero address, even if returned later. Incoming transfers, self-transfers and
zero amounts do not produce findings. Native movements come from `traceTransfers`, excluding gas.
Preparation transfers already fail separately; together these checks cover transactions and
preparations. Assertion calls are not transfer-checked and [must be view calls](#assertions).

Verified paired emitters have a directional, chain-scoped exception. When a listed
primary token is spendable, every transfer from its paired emitter is ignored by
the sender-outflow check on that chain. No primary transfer evidence, transaction,
sender, recipient, amount or one-to-one matching is required. The primary token
keeps all existing checks. Ignored paired emitters produce no warning. Transfer evidence
remains in the report and other checks.

| Chain | Spendable primary | Ignored paired emitter |
|---|---|---|
| Ethereum (1) | Legacy EURe `0x3231Cb76718CDeF2155FC47b5286d82e6eDA273f` | EURe v2 `0x39b8B6385416f4cA36a20319F70D28621895279D` |
| HyperEVM (999) | wstHYPE `0x94e8396e0869c9F2200760aF0621aFd240E1CF38` | stHYPE `0xfFaa4a3D97fE9107Cef8a3F48c069F577Ff76cC1` |
| Arc mainnet (5042) | USDC `0x3600000000000000000000000000000000000000` | Native mirror `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` |

See [identity and shared-ledger evidence](https://github.com/morpho-org/sdks/blob/main/packages/evm-simulation/test/paired-emitters.md) for issuer
sources, pinned code reads and integration tests. Standard Anvil cannot reproduce
Arc's native ledger; its pinned live-RPC test checks the native/ERC-20 interfaces
without broadcasting transactions.

These exceptions trust the verified representation relationships: **no amount bound
is enforced for any paired emitter**, even if no primary transfer occurs. They do not
authorize the reverse direction or apply on other chains. A paired emitter whose
primary is not spendable retains the normal sender-outflow check. No Arc testnet pair
has been verified for this registry.

The same post-transfer stage reports a non-blocking `UNEXPECTED_POSITION_CHANGE`
warning when a registered Morpho Blue or Midnight position-decreasing event acts
for the simulation owner outside the declared operations, when a matching
event cannot be decoded, or when a refinance market-parameter read fails, cannot
be decoded or returns a non-zero tuple for another market. That last case uses
`event: "MarketParams"`, names the read's market and leaves the route unusable. The warning includes `protocol`, `event`, `owner` and the
`marketId` when known. It does not change `ok`; signing integrators must inspect
`report.warnings`. This check follows the existing missing-log skip path and is
disabled by `limits: "none"`.

Spendable tokens use the operation subjects and resolved tokens used by the approval allowlist,
not calldata or unrelated quote overrides. Existing vault and market tokens are resolved at the
pinned block. Two Midnight declarations also authorize spending: `loanToken` is the explicit
subject token of `midnightSupplyBlueMakeLend`; for the first `midnightSupplyCollateral` or
`midnightSupplyCollateralMakeBorrow` into an uncreated market, `assetPaid` is the collateral
fallback when no validated `market` struct is supplied. That fallback is a caller declaration,
not independently verified collateral; pass `market` to bind the token to its validated struct.
Vault exits and migration allow source vault shares even when
no share approval is needed; Blue borrow and collateral-withdrawal zero-pull approvals do not
authorize spending. Combined Blue operations permit their pay-in token only with an active
collateral-supply or repayment leg, not a borrow-only or withdrawal-only placeholder cap.
Midnight pay-ins use the resolved collateral or loan tokens; a withdrawal-only
`midnightRepayWithdrawCollateral` does not authorize loan-token spending. A spendable
registered wrapped-native token also allows native spending only when the same active pay-in
operation measures sender ETH. An inactive placeholder or a measurement from another operation
cannot provide that exemption. A Midnight collateral wallet bound permits only the native value it already
charges: total gross traced sender ETH debits must not exceed that value. Incoming ETH,
refunds and self-transfers do not increase this budget. Extra internal sends from a delegated
sender produce non-blocking `UNEXPECTED_TOKEN_TRANSFER` warnings in the report.
Explicit `limits.approvals`
authorizes permissions only and does not extend the spending set. These checks do not constrain
recipients or replace amount bounds for declared tokens. Tokens with missing or dishonest
Transfer logs remain outside this safeguard. These checks cover ERC-20 and native ETH evidence,
not ERC-721 or ERC-1155 transfers; success provides no NFT-outflow guarantee.

`limits: "none"` still skips this outflow check: existing consumers use it for funded Midnight
review bundles as well as unsupported actions, claims, and permission-only bundles. Success in
that mode does not attest that the sender keeps its tokens.

#### Approval allowlist

With `SimulationLimits` or `SimulationInputLimits`, the simulator derives allowed approvals from each
declared operation, its real vault or market token, the simulation sender, and
spender addresses in the chain registry. `limits.approvals` adds entries to
that set; it does not replace the derived entries. For example:

```ts
limits: {
  operations: [operationLimit],
  approvals: [
    {
      type: "token",
      token: USDC,
      owner: user,
      spender: trustedContract,
    },
    {
      type: "morphoAuthorization",
      authorizer: user,
      authorized: trustedContract,
    },
    {
      type: "midnightAuthorization",
      onBehalf: user,
      authorized: trustedContract,
    },
  ],
}
```

The check rejects sender-granted ERC-20 allowances, ERC-721 token/operator
approvals, Permit2 approvals and permits, Morpho authorizations, and Midnight
`setIsAuthorized` grants on the registered Midnight contract that are outside the derived-plus-explicit set. It checks events across preparation and
user calls, and checks pending preview authorization requests before
`eth_simulateV1`, including permits that may be used outside this bundle.
Permit2 is optional: chains without a registered address do not derive Permit2
spenders, but Permit2-topic events are still decoded from any emitter and
checked against the allowlist.
Approvals of zero amount and revocations are allowed. The simulator does not
bound approval amounts, restrict call targets or recipients, or infer allowed
spenders from transaction calldata. Vault deposits additionally allow the
subject token directly to the vault; Blue pay-in legs additionally allow it
directly to Morpho Blue. Midnight pay-ins allow the paid token, read from
the pinned Midnight market or, for Blue parking (`midnightSupplyBlueMakeLend`),
from its declared `loanToken`, to Midnight and MidnightBundlesV2. For a first
`midnightSupplyCollateral` or `midnightSupplyCollateralMakeBorrow` into a
market the bundle creates, with no `market` struct, the explicit `assetPaid` is
the allowed token. Sender ERC-721
`Approval` and `ApprovalForAll` grants are always rejected and cannot be
allowlisted. Every Midnight operation allows a grant to `midnightBundlesV2`;
`midnightSupplyCollateralMakeBorrow` (emitted for
`supplyCollateralMakeBorrow`) and `midnightSupplyBlueMakeLend` also allow
`priceRatifierV1` and `rateRatifierV1`; direct `midnightSupplyCollateral`
allows only `midnightBundlesV2` and its token approvals.
Grants are checked whenever the sender is either `onBehalf` or `caller`,
whichever contract calls Midnight, including `MidnightBundlesV2` and
`EcrecoverAuthorizer`; a sender-called grant for another account needs an
explicit matching `midnightAuthorization` entry.
Ratifier root ratification (`SetIsRootRatified*` on `priceRatifierV1` /
`rateRatifierV1`) is not checked by `limits.approvals`.
ERC-777 operator grants (`authorizeOperator`) are not checked.
`limits: "none"` opts out of this check as
well as all limit checks.

Unexpected grants are reported as `UnexpectedTokenApprovalError` with `token`, `owner`,
`spender`, `source` (`"event"` or `"authorization"`), and `allowlistable`, or
`UnexpectedMorphoAuthorizationError` with `authorizer`, `authorized`, `source`,
and `allowlistable`, or `UnexpectedMidnightAuthorizationError` with `onBehalf`,
`authorized`, and `allowlistable`. These errors instruct the consumer not to
sign the request. A Midnight grant, or a token or Morpho grant whose
`allowlistable` is `true`, can be added to `limits.approvals`; ERC-721 grants,
Permit2 or Morpho signatures that name another verifying contract, and
EcrecoverAuthorizer signatures that name another verifying contract are never
allowlistable. Request mistakes found during approval-token resolution are reported as
`SimulationValidationError` with operation-scoped `fieldErrors`: a zero vault
subject (`vault`, or `sourceVault` for migration), a zero `loanToken` on
`midnightSupplyBlueMakeLend`, an absent `collateralIndex`
on an existing market for `midnightSupplyCollateral` or
`midnightSupplyCollateralMakeBorrow`, or missing `assetPaid` when that market
has not been created yet. Pass the market struct via `market` or the selected
collateral token via `assetPaid` for a first-market supply.
These caller mistakes are validation errors even for complete quotes without
asset overrides. A first-market supply is identified by the `MarketNotCreated`
revert; transport failures, unknown reverts and unusable market metadata remain
unavailable-evidence errors.
If a valid request's subject token or
required chain registry address cannot be resolved, the RPC response omits logs
for a preparation or user call, or an approval-topic event cannot be decoded,
`ApprovalCheckUnavailableError` fails the simulation closed.
If a user call with omitted logs also declares `assertLogs`, the report holds an
`InvalidSimulationResponseError` for those log checks as well.
Once any of these checks or the final-mode signed-use check reports omitted
user-call logs, slippage and retention checks are skipped: transfers parsed from
the remaining logs would report movements that never happened.
Retention is also checked against state: each restricted intermediary's `balanceOf` for every ERC-20 token
the operations measure is read before and after the bundle in the same simulated
block, and a balance that grows above dust reports `BlacklistViolationError`
even when the logs net to zero or a `MALFORMED_TRANSFER_LOG` discarded the
transfer.
A missing or zero `midnightBundlesV2` address is reported as `ApprovalCheckUnavailableError`, while
missing Morpho Blue or Midnight addresses are reported as `UnsupportedChainError`.
Missing `priceRatifierV1` or `rateRatifierV1` addresses required by an operation
are also reported as `ApprovalCheckUnavailableError`.

Minimums — `assetsReceived`, supply/vault `sharesMinted`, debt `sharesBurned`,
`collateralSupplied`, `debtRepaid`, `unitsBought` (net Midnight position units,
on `midnightTakeLend`) and the `collateralWithdrawals` delivery — must be at
least `ceil(quote * (1 - tolerance))`; caps — `assetsPaid`,
supply/vault `sharesBurned`, debt `sharesMinted`, `collateralWithdrawn`,
`creditRedeemed` (Midnight credit units), `unitsSold` (net Midnight position
units, on `midnightTakeBorrow`) and the `collateralWithdrawals` position
decrease — must be at most `floor(quote * (1 + tolerance))`.
`collateralSupplied` additionally must not exceed
`floor(quote * (1 + tolerance))`; typed-input exact collateral amounts remain exact.
This upper cap applies to the scalar `collateralSupplied` field on
`blueSupplyCollateral`, `blueSupplyCollateralBorrow`, `midnightSupplyCollateral`
and `midnightSupplyCollateralMakeBorrow`; only derived inactive placeholders skip
the cap. Explicit quotes on inactive legs remain capped at quote plus tolerance.
Per-index Midnight `collateralSupplies` remain lower-bound only.
`collateralSupplied` and `collateralWithdrawn` are measured on the Blue
position's `collateral`, except on `midnightSupplyCollateral` and
`midnightSupplyCollateralMakeBorrow`, where
`collateralSupplied` is the Midnight collateral slot delta. Equality and
favorable movement pass, except scalar `collateralSupplied` must stay within both bounds.

For typed-input vault exits, `sharesBurned` (including a migration's source vault)
measures the account's share-balance decrease plus vault shares minted to that
account during the bundle, counted once. This prevents accrued V1 or V2 fee shares
from masking shares spent on withdrawals, redeems or migrations. Both derived
checks and explicit quoted share caps on typed-input limits use this observation.
Quote-only limits, including force and in-kind exits, keep the net balance decrease.

```ts
const report = await simulate(client, {
  transactions,
  limits: {
    operations: [{
      type: "vaultV1Deposit",
      vault,
      account: user, // Share/position owner; defaults to transaction sender.
      receiver: user, // Asset recipient; defaults to transaction sender.
      quote: { sharesMinted: 1_000n, assetsPaid: 1_000n },
      slippageTolerance: 10_000000000000000n, // 1%
    }],
  },
});
// When report.ok, report.result.verification.operations[0].checkedLimits contains this quote and tolerance.
```

Typed-input asset overrides must match the canonical subject token. A native
`ethAddress` alias is allowed only for the chain's registered wNative; wallet
measurements then net ETH and wNative together, including extra wrapped-token
pulls or receipts. Quote-only overrides remain trusted as before.
For `blueSupplyCollateral` and `blueSupplyCollateralBorrow`, quote-only
`assetPaid: ethAddress` also measures ETH plus the sender's net wNative debit
when the market collateral is the chain's registered wNative:
`netPayment = max(0, net ETH sent + max(0, wrappedBefore - wrappedAfter))`, where net ETH sent subtracts ETH the sender receives back.
The collateral cap uses `assetsPaid = max(netPayment, grossFunding)`, where
`grossFunding` sums owner-originated ETH and wNative outflows, less only
matching wrap/unwrap conversion receipts as described below.
Wrapped credits never reduce the ETH payment. Separate wNative
debits count against `assetsPaid`; wrapping ETH into wNative and supplying it
does not count the same funding twice. This additional wNative balance read
applies only to native-sentinel Blue collateral quotes on registered wNative
collateral; other Blue collateral pay-ins still use the gross collateral cap
described below.
If another operation already checks the same sender wNative balance, that
operation's bound covers wNative funding instead of adding an overlapping read
to the native quote. Native-sentinel collateral quotes' combined payment reads
cannot provide this coverage for one another. Existing native wallet overlap
restrictions still apply.
When any operation's `assetsReceived` measures that same sender wNative balance
(including another native collateral quote), `assetsPaid` stays ETH-only:
borrow proceeds cannot offset ETH funding. Extra wNative debits instead reduce
`assetsReceived` and are checked against its minimum. A different token or
receiver does not trigger this exception. Typed same-token net measurements
remain unchanged.
Both ETH-only fallbacks retain the gross owner-originated ETH outflow cap;
ETH refunds cannot hide oversized native funding. ETH sent to the registered
wrapper is offset only up to matching ETH returned from that wrapper on unwrap,
after subtracting all external wNative credits to the owner (excluding mints
and self-transfers) from the eligible unwrap amount. Borrow proceeds or other
wNative credits can therefore conservatively prevent a round-trip offset.
Without external credits, a wallet-local wrap/unwrap round trip is not charged
as collateral funding.
Unmatched wraps and unwrapped ETH sent onward still count.
For Blue collateral quotes using the combined ETH+wNative payment measurement,
a helper that wraps the owner's ETH and returns wNative to the owner before
pulling it as collateral is unsupported: both the ETH send and the wNative pull
count as funding. If a quote already measures the owner's wNative proceeds,
the payment measurement instead falls back to ETH-only; the wrapped pull reduces
the measured net proceeds rather than increasing the native payment cap.
Blue SDK flows wrap inside BlueBundlesV1 without routing wNative through the
owner. This restriction does
not apply to Midnight's native collateral supply, which retains its net
ETH+wNative payment measurement.
If a sibling Blue collateral quote measures wNative as an ERC-20, its gross
pulls exclude matching wNative mints funded by ETH still charged to the native
quote's ETH-only fallback. Wraps already offset by that fallback cannot also
count toward this mint credit. The sibling also excludes owner-to-zero wNative
burns up to the fallback's matched unwrap offset. Unmatched burns and ordinary
transfers still count. Without that fallback, these offsets do not apply;
external wNative credits are not mints and cannot offset pulls.
Typed wNative measurements on the sender also include native ETH whenever the
request sends native value, even without an explicit native alias.
Requests that send native value with typed inputs must have that value covered
by a measured native or wNative side; otherwise the report fails with
`SimulationValidationError`.
For combined operations with the same token and sender/receiver wallet, either
native alias applies to the shared ETH-plus-wNative net measurement on both sides.
With distinct wallets, each side uses only its own asset override.

Typed single-leg Blue operations also protect the subject's counter-side:
supply and withdrawal forbid debt-share growth and collateral loss; borrow
and repay forbid collateral loss and supply-share loss; collateral operations
forbid debt-share growth and supply-share loss. Both combined Blue operations
also forbid undeclared supply-share loss. These are separate position-delta guards,
not percentage bounds or scalar share checks, and explicit quotes do not disable
them. Multi-operation input bundles that move the undeclared counter-side in
these adverse directions are rejected; quote-only behavior is unchanged.
Use a supported combined operation, or quote-only limits with explicit position
bounds for the intended bundle-wide effects.

Measurements cover the named subject over the **whole bundle**. Entries do not
attribute aggregate state changes to individual transactions. Use separate
simulations for per-transaction limits. Asset bounds use net wallet balance
changes (gas excluded), except Blue collateral supply pay-ins (`blueSupplyCollateral`
and `blueSupplyCollateralBorrow`): their `assetsPaid` cap uses the larger of
the net debit and gross parsed collateral-token transfers from the owner to
other addresses, including traced ETH outflows for native-ETH quotes.
Same-token loan proceeds and refunds do not offset gross pulls;
downstream forwarding is not counted again.
When measuring ETH and wNative together, gross pulls also count outgoing native
ETH. Wrap and unwrap conversions are offset only up to matching wNative mints
to the owner or native ETH receipts from the wrapper. Unmatched burns remain
counted, and loan proceeds and refunds do not offset external outflows.
Missing or skipped transfer events retain the net measurement where available.
Native transaction value without corresponding outgoing traces fails closed.
Typed-input same-token collateral/borrow operations retain net measurement when
`assetsPaid` is derived as collateral paid minus loan proceeds; an explicit
`assetsPaid` quote still caps gross pulls.
Loan receipts remain net; Midnight composed wallet bounds are unchanged.
To measure native ETH alone in a quote-only limit (subject to the Blue
collateral ETH+wNative exception above), set `assetPaid` or `assetReceived` to
viem's `ethAddress` (`0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`); other
sentinels such as `zeroAddress` are read as ERC-20 tokens. For a native-funded
Midnight collateral supply, measure ETH and wrapped native together as described
[below](#building-quote-based-limits-with-tosimulationlimits). Share bounds use the
selected account's vault shares or Blue position shares. Borrow/repay entries
use debt shares; refinance selects
source shares burned and target shares minted; migration selects source vault
shares burned and target vault shares minted. Combined collateral/borrow actions
measure collateral paid and loan assets received; repay/collateral-withdraw actions
measure loan assets paid and collateral received.

For `vaultV1InKindRedeem` and `vaultV2InKindRedeem`, `assetsReceived` measures
only the receiver's wallet balance of the vault asset (the idle portion). These
operations must quote `positions`, the expected Blue
supply shares delivered to the receiver per market (`{ marketId, supplyShares }`),
or `assetsReceived` (an idle-only redeem delivers no position); each entry is
checked as a minimum output under the same tolerance. Quote supply
shares, not assets: convert a preview's delivered assets with the accrued
market's `toSupplyShares(assets, "Down")` at the simulated block, since interest
accrued between quote and execution lowers the shares delivered. `positions` is
rejected on every other operation type.

An operation may also carry a `sharePrice` bound `{ expected, tolerance }` on
the realized assets-per-share rate, computed from the two quoted amounts the
operation prices — `assetsPaid`/`sharesMinted` for deposits and `blueSupply`,
`assetsReceived`/`sharesBurned` for withdrawals, redeems and `blueWithdraw`,
`assetsReceived`/`sharesMinted` for borrows, and `assetsPaid`/`sharesBurned` for
repays. `expected` is RAY-scaled (raw assets per raw share × 1e27, the scaling
VaultBundlesV1 `maxSharePrice` and VaultExitBundlesV1 `minSharePriceE27` use)
and `tolerance` a WAD fraction from 0 to 1e18 inclusive. The realized rate is
measured on what moves in and out of the wallet. Referral fees, a flat share
of the amount on every route that takes `referralFeePct`, must be folded into
`expected`: `price * WAD / (WAD - feePct)` when a higher price is adverse
(deposits, supply, repays), `price * (WAD - feePct) / WAD` when a lower one is
(withdrawals, redeems, force exits, borrows). A force exit's `minSharePriceE27`
already nets the force-deallocation penalty — only its referral fee is
deducted after the check, so it needs only the referral-fee adjustment; never
apply the percentage formula to a penalty. For any other charge that isn't a
flat share of the amount, derive `expected` from the quoted delivered amount
(e.g. `previewVaultV2ForceWithdraw`) instead of a percentage. Both amounts
must be
quoted; a higher realized price is adverse for
deposits/supplies and repays, a lower one for withdrawals/redeems and borrows.
`sharePrice` is rejected on collateral-only operations, in-kind redeems,
`blueRefinance`, `vaultV1MigrateToV2`, `midnightTakeBorrow`,
`midnightTakeWithdraw`, `midnightTakeLend`,
`midnightRepayWithdrawCollateral`, `midnightTakeRepayWithdrawCollateral`,
`midnightSupplyCollateralTakeBorrow` and `midnightSupplyBlueMakeLend`, whose
deltas price no single conversion.

Blue operations may also carry a `position` bound on the subject's Blue
position after the whole bundle: `{ maxBorrowShares, minSupplyShares,
minCollateral }`, any subset. These are absolute final values compared
inclusively, not deltas, and are not scaled by `slippageTolerance`. For
`blueRefinance` the bound reads the target market's position, where the debt
lands. `position` is rejected on vault operations. LTV and health bounds are
not covered: they need oracle and market reads the simulation does not take.

Vault V2 force exits (`vaultV2ForceWithdraw`, `vaultV2ForceRedeem`) may quote the execution-time economics no delta covers: `penalty` is the expected total penalty assets charged to the account across the bundle's force deallocations, and `deallocations` lists the expected assets withdrawn from each Blue market (`{ marketId, assets }`). Both are read from the simulated calls' logs: the penalty sums `penaltyAssets` over the vault's `ForceDeallocate` events for the account, and each of those events is paired, within the same call, with the nearest earlier Blue `Withdraw` from its adapter for the same amount, so liquidity-adapter withdrawals are not counted. A higher realized penalty or deallocated amount than quoted is adverse; a realized deallocation in a market not quoted violates.
Slippage and the optional `sharePrice`/`position` bounds are checked; refunds are
not checked.
`sharesMinted` and `sharesBurned` quotes for `blueSupplyCollateral` and
`blueWithdrawCollateral` are invalid and are reported as `SimulationValidationError`
during request parsing, as do `collateralSupplied`/`collateralWithdrawn` quotes
on any other operation. `SlippageCheckUnavailableError` reports runtime
evidence gaps: a failed state read, native outgoing traces that do not cover
value sent, a metadata read that reverts or returns empty/invalid data, a
quoted force exit with no vault `Withdraw` for the account, or a
`ForceDeallocate` that cannot be paired with a Blue `Withdraw` while
`deallocations` is quoted (for example a non-Blue adapter), or a
`ForceDeallocate` that charges a penalty to another account, or native value
sent without registered wNative. Repay-withdraw checks report
`SimulationValidationError` when a quote returns loan-token collateral to the
payer, or native value is sent while wNative collateral is delivered to the
sender. A quoted
balance/position read whose non-empty return data cannot be decoded is reported as
`InvalidSimulationResponseError`, as does a matching `ForceDeallocate`/`Withdraw`
event log that fails to decode. Excessive slippage, a violated
`sharePrice`/`position` bound, a `midnightTakeWithdraw` bundle that
changes the sender's Midnight debt, or a `midnightRepayWithdrawCollateral` or
`midnightTakeRepayWithdrawCollateral` bundle that changes the sender's Midnight credit, increases debt on an
action without a `debtRepaid` quote, or under-delivers quoted collateral to
the receiver is reported as `ConsumerLimitViolationError`.

Only quoted amounts, `position` bounds and the sender's Midnight debt through
`debt(id, account)` for `midnightTakeBorrow`, `midnightTakeWithdraw`,
`midnightSupplyCollateralTakeBorrow`, `midnightRepayWithdrawCollateral`,
`midnightTakeRepayWithdrawCollateral`, and `midnightTakeLend` are observed.
`midnightSupplyCollateralTakeBorrow` also reads the sender's Midnight credit,
each quoted collateral index's position, and `balanceOf` for each wallet bound.
`midnightTakeLend` also reads the sender's
Midnight credit for `unitsBought`. The repay-withdraw operations also read the
sender's Midnight credit, each quoted collateral index's position, and the
receiver's `balanceOf` for that collateral token. Retention also reads each
restricted intermediary's `balanceOf` for every measured ERC-20 token. ERC-20 assets and
vault shares use `balanceOf`; Blue shares use `position`, checked against the
after-bundle position for `position` bounds. Each distinct observation runs before
and after the bundle. Input-based derivation reads (vault previews, Blue accrual
and market/position reads, migration target totals) run only before the bundle;
these helpers never appear in `simulationTxs`, `transfers` or `assetChanges`.
Blue accrual still affects the bundle's per-call logs and gas, as described
under input-based limits.
Native amounts use the existing transfer traces. With `limits: "none"` —
reserved for transactions no operation type covers — there are no slippage
reads and `verification.operations` is empty. Quotes with an asset amount resolve `asset()` or market parameters only
when an explicit `assetPaid` or `assetReceived` was not supplied; derived asset
sides also resolve metadata, and Blue inputs always resolve market parameters.
Share-only quotes need no metadata reads. No vault factories, full entities, allocations, risk metrics, allowances,
or nonces are fetched for slippage.

For example, a Vault V2 deposit quoting assets paid and shares minted makes four
in-bundle view calls — the sender's asset balance and the `account`'s share balance, each before
and after execution — plus one `asset()` read unless `assetPaid` is supplied.
Retention adds a `balanceOf` read of the asset and share tokens at each
restricted intermediary, before and after (16 more calls on Ethereum, which has three
`bundles` contracts plus MidnightBundlesV2). `verification.operations[].checkedLimits` records the quote
and tolerance checked, plus `sharePrice` and `position` when set, and input-based
`fieldChecks` identifying exact, minimum, maximum and quoted sides. The result does not include broad state snapshots or diffs;
`transfers` and `assetChanges` remain available.

The result's historical `VerifiedSimulationResult` name does not imply that
unchecked outcomes are economically verified.

### Building quote-based limits with `toSimulationLimits`

`toSimulationLimits(action, { owner, expected })` produces the
`SimulationLimits` of a transaction built by a morpho-sdk action (`tx.action`),
without touching the network. For operations that carry `account`, it is
`owner`, except on `blueWithdrawBuyCallback`, direct ERC-20
`midnightSupplyCollateral`, and `midnightRedeem`, where it is
`options.onBehalf ?? owner`. Native-funded collateral supplies credit the
sender and require `owner` as the account. Midnight sells always measure the
sender and reject any explicit `account`. `midnightRepayWithdrawCollateral` and
`midnightTakeRepayWithdrawCollateral` also always measure the sender and reject
any explicit `account`. When present, `args.onBehalf` must match the selected
account. For native-funded supplies, `args.accountAddress` must match `owner`.
`redeem.recipient` on `vaultV2ForceRedeem` and
encoded receivers on `midnightRedeem`, `midnightTakeBorrow`,
`midnightSupplyCollateralTakeBorrow` and `midnightTakeWithdraw` must match
`receiver ?? owner`. On collateral-withdrawing
`midnightRepayWithdrawCollateral` and `midnightTakeRepayWithdrawCollateral`,
`args.collateralReceiver` must match the
same value. Mismatches throw `LimitAccountMismatchError`.

`blueWithdrawBuyCallback` maps to the existing `blueWithdraw` operation. Pass the
intended callback as `onBehalf` and its payout quote as `expected.assetsReceived`:

```ts
const limits = toSimulationLimits(tx.action, {
  owner: maker,
  onBehalf: callbackAddress,
  expected: { assetsReceived: expectedAssets },
});
```

This checks the callback's supply-share burn separately from the maker's wallet
proceeds. The action's callback must match `onBehalf`, and its receiver must match
`owner`; omitting `onBehalf` does not infer the callback from the action. Callback
registration, ownership and authorization checks remain in the SDK action's
`getRequirements()`. Offer cancellation and confirmation still happen separately.

For `midnightSupplyBlueMakeLend`, the helper sets `account` to `owner`;
`simulate()` rejects a raw limit whose `account` is not the bundle sender with
`SimulationValidationError`, because MidnightBundlesV2 creates the
BlueBuyCallback for `msg.sender`.
The same applies to `midnightSupplyCollateralMakeBorrow`: its helper `account`
is `owner`, and `simulate()` rejects a raw limit whose `account` is not the
bundle sender with `SimulationValidationError` (omit it or use the sender),
because MidnightBundlesV2 `cancelAndMake` supplies collateral for `msg.sender`.

Derived limits catch on-chain divergence from the encoded calldata, not wrong
inputs; pass the UI's quote through `expected`.

| Operation | Derived from args | Required via `expected` (when not derivable) | Not quotable |
| --- | --- | --- | --- |
| `vaultV1Deposit` / `vaultV2Deposit` | `assetsPaid`, `sharesMinted` (`netAssets` vs `maxSharePrice`) | — | — |
| `vaultV1Withdraw` / `vaultV2Withdraw` | `assetsReceived` (`netAssets`, net of fee) | `sharesBurned` | — |
| `vaultV1Redeem` / `vaultV2Redeem` | `sharesBurned` | `assetsReceived` | — |
| `vaultV2ForceWithdraw` | `sharesBurned` cap (`exitAssets` vs `minSharePriceE27`) | `assetsReceived`; `sharesBurned` when `minSharePriceE27` is `0n` | — |
| `vaultV2ForceRedeem` | — | `sharesBurned` (total burn including penalty shares — `forceDeallocate` burns extra shares from `onBehalf`), `assetsReceived` | — |
| `vaultV1InKindRedeem` / `vaultV2InKindRedeem` | — | `sharesBurned` and `positions` or `assetsReceived` (per-market Blue supply shares delivered to the receiver, or the idle wallet portion) | — |
| `vaultV1MigrateToV2` | `sharesBurned` (shares mode), `sharesMinted` (when `netAssets` known) | either when not derivable | — |
| `blueSupply` | `assetsPaid` (gross; fee deducted inside) | `sharesMinted` | — |
| `blueWithdraw` | `assetsReceived` net of penalty and fee (assets mode); `sharesBurned` in shares mode | `sharesBurned` (assets mode), `assetsReceived` (shares mode) | — |
| `blueWithdrawBuyCallback` (emits `blueWithdraw`) | `sharesBurned`; `account` is the intended callback in `onBehalf`, `receiver` is `owner` | `assetsReceived` | Callback ownership and offer cancellation |
| `blueBorrow` | `assetsReceived` (`borrowAssets` − penalty − fee) | `sharesMinted` (debt-share cap) | — |
| `blueSupplyCollateral` | `assetsPaid`, `collateralSupplied` | — | — |
| `midnightSupplyCollateral` | `assetsPaid`, `collateralSupplied` (`assets`); `account` is `options.onBehalf ?? owner` for direct ERC-20 supply and `owner` (the sender) for native supply through MidnightBundlesV2; for `wNative` collateral, `assetsPaid` counts ETH sent plus the sender's net `wNative` change; native funding needs no quote adjustment; sending value without a measured native side fails with `SimulationValidationError`, while a chain without registered `wNative` fails with `SlippageCheckUnavailableError` | — | — |
| `midnightSupplyCollateralBatch` | exact `collateralSupplies` per index, used as minimum collateral credit and summed wallet pull caps per token; always measures the sender; encoded `args.onBehalf` must equal `owner`, and a non-owner `options.onBehalf` throws `LimitAccountMismatchError`; approval limits target Midnight for each distinct collateral token | — | — |
| `midnightWithdrawCollateral` (emits `midnightWithdrawCollateralBatch`) | One `collateralWithdrawals` entry from `collateralIndex` and `assets`; same receiver and tolerance checks as the batch; encoded `onBehalf` must equal the sender (`owner`), otherwise throws `LimitAccountMismatchError` | — | Delegated withdrawals |
| `midnightWithdrawCollateralBatch` | `collateralWithdrawals` per index; always measures the sender; `receiver` is `options.receiver ?? owner` and must match `args.receiver`, including a non-owner receiver; receiver delivery is checked against the sum of withdrawals per token | — | — |
| `midnightCancelAndMake` with non-empty `collateralSupplies` and no `blueSupply` | One operation per distinct collateral index; repeated indices are summed in first-seen order; non-zero roots emit `midnightSupplyCollateralMakeBorrow`, zero roots emit `midnightSupplyCollateral`; quote `assetsPaid` and `collateralSupplied`; `account` is `owner`; for `wNative` collateral, `assetsPaid` counts ETH sent plus the sender's net `wNative` change; native funding needs no quote adjustment; sending value without a measured native side fails with `SimulationValidationError`, while a chain without registered `wNative` fails with `SlippageCheckUnavailableError` | — | — |
| `midnightCancelAndMake` with `blueSupply` and no `collateralSupplies` (emits `midnightSupplyBlueMakeLend`) | exact `assetsPaid` (`blueSupply.assets`): sender debit of the full parked amount; for wNative, counts ETH sent plus net wNative change; combining with collateral supplies is unsupported | `sharesMinted` (the BlueBuyCallback's expected Blue supply-share increase) | Offer fillability |
| `midnightRedeem` | `assetsReceived`, `creditRedeemed` (`units`); `account` is `options.onBehalf ?? owner`, `receiver` is `options.receiver ?? owner` | — | — |
| `midnightTakeLend` | `assetsPaid` and `unitsBought`; always measures the sender, rejects any explicit `account` or `receiver`; a non-owner `options.receiver` throws `LimitAccountMismatchError` | — | — |
| `midnightTakeBorrow` | `assetsReceived` and `unitsSold`; always measures the sender, rejects any explicit `account`, a non-owner `options.onBehalf` throws `LimitAccountMismatchError`, `receiver` is `options.receiver ?? owner` | — | — |
| `midnightTakeWithdraw` | `assetsReceived` and `creditRedeemed`; always measures the sender, rejects any explicit `account`, a non-owner `options.onBehalf` throws `LimitAccountMismatchError`, `receiver` is `options.receiver ?? owner`; debt must remain unchanged | — | — |
| `midnightRepayWithdrawCollateral` | `assetsPaid` when repayment is active; `debtRepaid` for a positive asset repayment; finite `collateralWithdrawals` (summed per index) for any repay type; `position.maxDebt: 0n` on full repay; `position.maxCollateral` zero for withdraw-all; always measures sender and rejects any explicit `account`; `receiver` is `options.receiver ?? owner`; credit must remain unchanged; without a `debtRepaid` quote (withdraw-only or full repay), debt must not increase | `collateralWithdrawals` for each `maxUint256` index | — |
| `midnightTakeRepayWithdrawCollateral` | `assetsPaid` (`target.assets` or `maxBuyerAssets`); `debtRepaid` (`minUnits` or finite `units`); `position.maxDebt: 0n` for `units: maxUint256`; collateral sides as `midnightRepayWithdrawCollateral`; always measures sender and rejects any explicit `account`; `receiver` is `options.receiver ?? owner`; credit must remain unchanged; without a `debtRepaid` quote (full debt), debt must not increase | `collateralWithdrawals` for each `maxUint256` index | — |
| `midnightSupplyCollateralTakeBorrow` | `collateralSupplies` per-index amounts are exact minimum credit and pull-cap sources; `unitsSold` and `assetsReceived`; wallet spending and proceeds are checked together; owner native value is subtracted from the owner's wNative pull cap (the quoted wNative collateral), and excess fails closed even at `0n` (e.g. owner receives wNative loan proceeds without quoted wNative collateral); native value on a chain without registered wNative fails closed with `SlippageCheckUnavailableError`; otherwise, without an owner wNative bound, native value is not checked; always measures the sender, rejects any explicit `account`, a non-owner `options.onBehalf` throws `LimitAccountMismatchError`, `receiver` is `options.receiver ?? owner` | — | — |
| `blueSupplyCollateralBorrow` | collateral + borrow sides above; `sharesMinted: 1n` on a collateral-only use, `assetsPaid: 1n` on a borrow-only use | `sharesMinted` when borrowing; `assetsReceived` (net wallet gain — the payout minus the pay-in on a same-token market) when both legs are active | — |
| `blueRepay` | `assetsPaid` (`repayAssets` + fee; `maxRepayAssets` in shares mode); `sharesBurned` in shares mode | `sharesBurned` (assets mode, and the `maxUint256` full-repay sentinel) | — |
| `blueWithdrawCollateral` | `collateralWithdrawn`, `assetsReceived` | — | — |
| `blueRepayWithdrawCollateral` | repay + collateral sides above; `collateralWithdrawn: 1n` on a repay-only use, `assetsPaid: 1n` on a withdraw-only use | `sharesBurned` (assets-mode and `maxUint256` repays); `assetsReceived` (net wallet gain — the payout minus the pay-in on a same-token market) when both legs are active | — |
| `blueRefinance` | — | `sharesBurned` (source debt moved), `sharesMinted` (target-market debt cap) | moved collateral, destination debt and fees are execution-resolved |

`expected` values override derived ones except exact `collateralSupplies`,
which cannot be overridden; an explicit `0n` is passed through so
`simulate()` rejects it, while the helper itself never emits a `0n` quote — it
omits the field, or emits the `1n` cap on a combined op's inactive leg. A
missing required side throws `MissingExpectedQuoteError` naming the field and
what to compute. Supported Midnight actions are `midnightSupplyCollateral`,
`midnightSupplyCollateralWithNative`, `midnightSupplyCollateralBatch`,
`midnightWithdrawCollateral`, `midnightWithdrawCollateralBatch`,
`midnightRedeem`, `midnightTakeLend`, `midnightTakeBorrow`,
`midnightTakeWithdraw`, `midnightRepayWithdrawCollateral`,
`midnightTakeRepayWithdrawCollateral`, and `midnightSupplyCollateralTakeBorrow`, plus
`midnightCancelAndMake` with either non-empty `collateralSupplies` and no
`blueSupply`, or a `blueSupply` and no collateral supplies (which emits
`midnightSupplyBlueMakeLend`). `erc20Approval`, `blueAuthorization`,
`midnightAuthorization` and `midnightCancelOffers` derive exact control `effects`
instead of operations. Other action types without a supported operation or effect
throw `UnsupportedLimitActionError`. Cancel-only `midnightCancelAndMake` remains unsupported.

A full repay does not require `expected.debtRepaid`; when supplied, it acts as a
minimum.

`midnightRepayWithdrawCollateral` and `midnightTakeRepayWithdrawCollateral`
derive repay amounts, aggregate
repeated finite collateral indices, and require an expected amount for each
`maxUint256` (withdraw-all) entry. Full repayment adds `position.maxDebt: 0n`;
withdraw-all adds `position.maxCollateral: { collateralIndex, assets: 0n }`.
Withdrawals can target an external receiver when `options.receiver` matches
the action's `collateralReceiver`. A quoted repayment cannot withdraw the
loan token to the payer in the same bundle; use a different receiver or split
repayment and withdrawal into separate bundles.

Direct ERC-20 `midnightSupplyCollateral` calls Midnight, which pulls from
the sender and credits `onBehalf`. Pass `options.onBehalf` when supplying for
another account; `args.onBehalf` must match `options.onBehalf ?? owner`.
The `midnightSupplyCollateralWithNative` action goes through MidnightBundlesV2
and emits the same `midnightSupplyCollateral` operation. The bundle calldata has no
beneficiary field: the contract credits `msg.sender`, and simulation measures
payment on the sender's ETH and wrapped-native balances. For native supply,
`toSimulationLimits` checks the SDK metadata `action.args.accountAddress` against
`owner`; a mismatch or a non-owner `options.onBehalf` throws
`LimitAccountMismatchError`.

If the wallet has not authorized MidnightBundlesV2,
`supplyCollateralWithNative(...).getRequirements()` returns a
`midnightAuthorization` transaction. `toSimulationAuthorizations` cannot map
it for preview. Include it in `transactions` before the supply in final mode,
or submit and confirm it separately before previewing.

`midnightRedeem` debits `onBehalf`'s credit and pays `receiver`; the builder
defaults `receiver` to `onBehalf`. Pass `onBehalf` and `receiver` when they
differ from `owner`: the helper throws `LimitAccountMismatchError` when
`args.onBehalf` or `args.receiver` differs from the intended account.
Midnight sell actions act for `msg.sender`; an external receiver is supported
when `options.receiver` matches the action's encoded receiver.
Midnight takeLend acts for `msg.sender` and does not support an external receiver.
Withdrawals in `midnightRepayWithdrawCollateral` and
`midnightTakeRepayWithdrawCollateral` also accept an external
receiver when it matches the action's `collateralReceiver`.
Some native-funded actions mark `assetPaid` with viem's `ethAddress`.
`toSimulationLimits` leaves it unset for `midnightSupplyCollateralWithNative`
so the payment cap counts both ETH sent and the sender's net wrapped-native
debit. Do not set `assetPaid: ethAddress` on a manually built quote for this
route: that would measure only the ETH portion. For a first supply into a new
market, pass the market struct via `market`; if you omit it, set `assetPaid`
to the wrapped-native token at `collateralParams[collateralIndex].token`.

`midnightTakeLend`, `midnightRepayWithdrawCollateral`,
`midnightTakeRepayWithdrawCollateral`, and `midnightSupplyBlueMakeLend` also
measure `assetsPaid` across the bundle. Leave `assetPaid` unset for those
operations; an override is rejected. On wNative loan markets, these limits
count ETH sent plus the sender's net wNative change.

For Midnight Blue parking, the helper derives the wallet debit and callback
market from the SDK builder metadata. Supply the callback's expected shares via
`expected.sharesMinted`:

```ts
const tx = midnightCancelAndMake({
  chainId: base.id,
  cancellations: [],
  deadline: maxUint256,
  publication: {
    ratifier: rateRatifierV1,
    root,
    groups,
    payload,
    blueSupply: { market: blueMarket, assets: supplyAssets, callbackSalt },
  },
});
await simulate(client, {
  transactions: [{ from: user, to: tx.to, data: tx.data, value: tx.value }],
  limits: toSimulationLimits(tx.action, {
    owner: user,
    expected: { sharesMinted: quotedCallbackShares },
  }),
});
```

### Preview authorizations

Preview authorizations remain an adapter from `getRequirements()` through
`toSimulationAuthorizations` into preparation calls. No permission or nonce
read-back policy runs. Successful execution establishes success under the
simulated permissions; it does not prove that a future signature is valid.
`midnightAuthorizationSignature` prepares
`Midnight.setIsAuthorized(authorized, isAuthorized, sender)` from the sender;
the signed EcrecoverAuthorizer payload is not submitted in preview.
Preparation and user-transaction failures are still reported. A preparation that
emits asset transfers fails closed with `SimulationValidationError`; simulate
that authorization as a transaction in final mode to check its asset flows.
This rejects any ERC-20 Transfer or WETH Deposit/Withdrawal event signature,
including malformed and four-topic logs. Native-value trace transfers are also
rejected because they carry the ERC-20 Transfer topic.
Tokens that move value without emitting logs remain outside this check.
Final mode executes actual calldata without preparation. State reads and preparation calls do not
receive public transaction indices.

Pass the same `authorizations` descriptors in final mode to require signature-use
evidence: each ERC-2612 permit needs a token `Approval(owner, spender, value)`;
each Blue signature needs a registered Morpho `IncrementNonce` for its authorizer
and signed nonce; each EcrecoverAuthorizer signature needs a registered
`SetIsAuthorized` event matching the verifying contract, `authorizer`,
`authorized`, `isAuthorized`, and signed `nonce`. Its signer field is not
checked. Missing evidence is reported as `UnusedAuthorizationError` with the zero-based
`authorizationIndex` and request. These checks run even with
`limits: "none"` and use only user-transaction logs, not reads or preparations.
Permit2 signature transfers have no use check: invalid signatures revert when
submitted, but an omitted signature transfer is not detected and its signature
can remain valid until its deadline. Direct approval descriptors add no final-mode preparation or use check.
The events establish use evidence, not independent cryptographic verification:
ERC-2612 Approval events do not identify a signature or nonce. A token can also
emit Approval during `transferFrom`: if the remaining allowance equals the
permit's value, that event can satisfy the check even when the permit was skipped.
Conversely, a token that emits a clamped allowance instead of the signed value
fails this exact-value check, even when its permit ran successfully.
Blue IncrementNonce
events identify consumption of an authorizer's nonce, not the signed `authorized`
operator or `isAuthorized` value. Another signed grant or revoke at that nonce
would supply the same evidence; this check does not distinguish those requests.

### Revert messages and bytes

Catch `SimulationRevertedError` or match the stable `SIMULATION_REVERTED` code.
Its `message` reports the failed transaction/preparation index when known, the
custom error name and every decoded argument, the `Error(string)` text, or the
`Panic(uint256)` code. For example:

```text
Transaction 0 reverted: ERC20InsufficientBalance(sender="0x…", balance=1283, needed=2000)
```

`transactionIndex` is the zero-based index into the caller's `transactions`,
excluding internal state reads and preparation calls. It is undefined for
preparation and node-level reverts. The response helper includes it when known,
including index zero. Constructor options accept `{ cause, transactionIndex }`.

A node insufficient-funds rejection (viem `InsufficientFundsError` or JSON-RPC
`-38014`: the sender cannot fund `value`) whose revert bytes are absent or cannot be decoded uses `Sender native balance cannot fund transaction value. Fund the sender or reduce value.`
Any other revert whose bytes cannot be decoded uses `Revert reason unavailable`.
Provider messages are retained in `cause`, never copied into the revert message.
Decoded contract strings and arguments remain intact.

`revertData` preserves the original node-returned bytes, including unknown or
malformed payloads. `"0x"` means empty data; `undefined` means unavailable data.
Decode these bytes with your contract ABI for contract-specific handling. No
public typed-revert union or semantic `reasonCode` is exposed, and message text
is not a stable discriminator. Original node exceptions remain on `cause`.

Custom error definitions come from every pinned ABI exported by
`@morpho-org/morpho-sdk/abis`. The decoder also understands Solidity reason strings and
panics. It does not infer the emitting contract from a selector or guess a
category from provider message text. Other unknown, malformed, or ambiguous
data falls back to `Revert reason unavailable` (except the insufficient-funds
rejection above) without losing bytes.

See [AGENTS.md](./AGENTS.md) for pipeline conventions and retention rules.

## Error types

```ts
const report = await simulate(client, { transactions, limits });
if (!report.ok) {
  for (const failure of report.failures) {
    if (failure instanceof SimulationSafetyError)
      alerts.page(failure.code, failure.message);
    else if (failure instanceof SimulationInfrastructureError) retryOrAlert(failure);
    else ui.showError(failure.message);
  }
  return;
}
if (report.warnings.length > 0) {
  for (const warning of report.warnings) alerts.page(warning.code, warning.message);
  return;
}
if (report.verification?.retention !== "checked") {
  ui.showError("Retention verification requires review");
  return;
}
return report.result;
```

Every concrete error extends exactly one of these exported parent classes:

| Parent class | Meaning |
| --- | --- |
| `SimulationSafetyError` | Funds or permissions are at risk. |
| `SimulationExecutionError` | The user or caller acts. |
| `SimulationInvalidRequestError` | The integrator fixes the request or configuration. |
| `SimulationInfrastructureError` | The operator investigates the RPC/node or a check that could not run. |

| Group | Classes |
| --- | --- |
| `SimulationSafetyError`         | `BlacklistViolationError`, `UnexpectedPositionChangeError`, `UnexpectedTokenApprovalError`, `UnexpectedMorphoAuthorizationError`, `UnexpectedMidnightAuthorizationError`, `SimulationEffectError`, `UnexpectedTokenTransferError`                                                                                         |
| `SimulationExecutionError`       | `ConsumerLimitViolationError`, `SimulationAssertError`, `SimulationLogAssertError`, `UnusedAuthorizationError`, `SimulationRevertedError`                                                                                       |
| `SimulationInvalidRequestError` | `SimulationValidationError`, `UnsupportedChainError`, `UnsupportedOperationError`, `AuthorizationRequestMismatchError`, `LimitAccountMismatchError`, `MissingExpectedQuoteError`, `AmbiguousExpectedQuoteError`, `UnsupportedLimitActionError` |
| `SimulationInfrastructureError` | `SlippageCheckUnavailableError`, `ApprovalCheckUnavailableError`, `RpcTransportError`, `InvalidSimulationResponseError`, `UnexpectedSimulationError`                                     |

All four groups block the bundle except for the controlled sender-outflow reporting
case: `UnexpectedTokenTransferError` findings are converted to plain
`UNEXPECTED_TOKEN_TRANSFER` report warnings with severity `"warn"`, not Error instances.
The error class remains exported for compatibility; its class hierarchy does not
make report warnings blocking. `simulate` returns `ok: true` when nothing else fails.
Groups say who acts, not how bad it is.

Every error also carries `severity: SimulationErrorSeverity`, a default log
level named like common alert levels:

| Severity | Errors |
| --- | --- |
| `"fatal"` | Every `SimulationSafetyError` |
| `"warn"` | Every `SimulationExecutionError` except `UnusedAuthorizationError` |
| `"error"` | `UnusedAuthorizationError`, every `SimulationInvalidRequestError` and every `SimulationInfrastructureError` |

`UnusedAuthorizationError` is `"error"` because the signed request stays valid
and the integrator assembled the bundle wrong. Every entry in `report.failures` blocks the bundle regardless of severity:
a `"warn"` failure returns no result, as a `"fatal"` one does. A failed report's
`severity` is the highest of its failures' (`"fatal"` > `"error"` > `"warn"`), so it
levels the run as a whole. Consumers own error reporting and alerting.
`toSimulationErrorResponse` does not include severity, and
`isSimulationPackageError` accepts only objects with a known `severity`, so
`toSimulationErrorResponse` maps a structural error without one, such as an error
from an 8.x copy of the package, to the generic `UNEXPECTED_SIMULATION_ERROR` response.

`report.failures` lists every failure of the run, flat and in check order; there is
no primary error. A transaction revert ends verification: the failures are the
assertion failures evaluated before it, then the revert. A pre-execution failure (invalid request,
unsupported chain, RPC failure, a preparation revert) ends the run and is the only
failure. `toSimulationLimits` is not part of a run and still throws its typed errors.

## Handling failures in an API service

Return a transaction only from an `ok` report. Every failure blocks the
transaction response, including RPC outages and timeouts. Integrators gating signing
must also inspect `report.warnings` and `report.verification`. The template below
rejects all warnings before returning transactions. RPC failures become
`RpcTransportError` with code `RPC_TRANSPORT_ERROR` and the original viem error
as `cause`. SDK failures use `SimulationPackageError` and are returned in the report. Any
other unexpected failure, including a local viem error, rejects with
`UnexpectedSimulationError`, with the original value in `cause`.

Use `toSimulationErrorResponse(failure)` on each reported failure, or on a caught
`UnexpectedSimulationError`, to select JSON-safe fields: `code`,
`message`, and optional `revertData` and `transactionIndex`. It omits stack, cause, and specialized
fields that may contain bigint values. RPC failures receive a generic message
with `RPC_TRANSPORT_ERROR`. Unrecognized
and unexpected failures use `UNEXPECTED_SIMULATION_ERROR`. Domain messages are
preserved verbatim. This helper does not sanitize arbitrary SDK messages.
Keep the original exception in server-side logs; request IDs and HTTP status
mapping belong to the service. Never send a raw viem exception to the client:
its diagnostics can include RPC URLs and request data.

```ts
import {
  simulate,
  toSimulationErrorResponse,
  type SimulateParams,
  type SimulationClient,
} from "@morpho-org/evm-simulation";

declare const client: SimulationClient;
declare const params: SimulateParams;
declare const requestId: string;
declare const recordError: (error: unknown, requestId: string) => void;

async function prepareTransactionResponse() {
  try {
    const report = await simulate(client, params);
    if (report.ok) {
      if (report.warnings.length > 0 || report.verification?.retention !== "checked")
        return {
          ok: false as const,
          errors: [{ code: "SIMULATION_REVIEW_REQUIRED", message: "Simulation warnings or incomplete retention verification require review" }],
          warnings: report.warnings.map(({ code, message, chainId }) => ({ code, message, chainId })),
        };
      return { ok: true as const, transactions: report.result.simulationTxs };
    }
    for (const error of report.failures)
      recordError(error, requestId);
    return {
      ok: false as const,
      errors: report.failures.map(toSimulationErrorResponse),
      requestId,
    };
  } catch (error) {
    recordError(error, requestId);
    return { ok: false as const, errors: [toSimulationErrorResponse(error)], requestId };
  }
}
```

The success response above still contains bigint transaction quantities; apply
the API's normal transaction encoding before sending JSON. Simulation verifies
the requested mode and checks at the simulated state; it does not guarantee
execution against later onchain state.

## Migrating to 9.0

`simulate` no longer throws SDK failures; it returns a report.

| 8.x | 9.0 |
| --- | --- |
| `const result = await simulate(...)` inside `try` | `const report = await simulate(...)`, then `if (!report.ok)` before reading `report.result` |
| `catch (err)` with `instanceof` on the thrown error | `instanceof` on each of `report.failures` |
| Only the first failure, as the thrown error | `report.failures`, every failure in check order |
| 8.8.0's `err.findings` | Removed; read `report.failures`, every failure in check order |
| `toSimulationErrorResponse(err)` | `report.failures.map(toSimulationErrorResponse)` |
| Any rejection | Only `UnexpectedSimulationError`; keep a `catch` for it |
| A bare `await simulate(...)` that relies on a throw to stop | Find every one and branch on `report.ok`; it still compiles but no longer stops on a failure |
| 8.8.0's `SimulationRejectedError` group | `SimulationExecutionError`, the same classes under a new name, with no alias |
| Your own mapping from error codes to log levels | `report.severity`, or `failure.severity` |
| `simulate(config, { chainId, ... })` with `config.chains` entries of 8.9.0's `{ client }` (`ChainSimulationClientConfig`) | `simulate(client, params, options?)`: pass that entry's `client` as the first argument; `params.chainId`, `ChainSimulationClientConfig` and `ChainSimulationConfigEntry` are removed |
| `config.chains` entries with `simulateV1Url` | Create a viem client with `chain` set and `http(url)`, and pass it as the first argument. A non-JSON error body labeled `application/json` is then reported as `InvalidSimulationResponseError` instead of `RpcTransportError`, unless your transport's `fetchFn` drops `content-type` on non-2xx replies |
| `ChainSimulationConfig` `blockOverrides`, `callGasLimit`, and `parentHashCheck` | The same fields in `options` |
| `SimulationConfig.logger` | Move from the removed config to `options.logger` only for compatibility; the option is deprecated and ignored |
| `options.logger` / `SimulationLogger` | Deprecated, accepted but ignored; consume `report.warnings` and `report.verification`. Removal follows at least one coexistence minor, in a future major |
| `SimulationConfig.timeoutMs` | `options.timeoutMs`, with the same whole-simulation deadline; set your transport's `timeout` to at most this value |
| A client rejected for lacking `ccipRead: false` | Accepted; `simulate` turns CCIP-Read off on its own copy |
| `InvalidChainIdError` | Removed; a node rejecting `client.chain.id` reports `RpcTransportError` |

`toSimulationLimits` is unchanged and still throws.

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
