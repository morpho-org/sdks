# @morpho-org/evm-simulation

## Overview

EVM transaction simulation engine for Morpho — bundle execution preview,
transfer parsing, and net per-account balance changes.

## Installation

```bash
pnpm add @morpho-org/evm-simulation
```

## Usage

```ts
import {
  simulate,
  type SimulationConfig,
  SimulationRevertedError
} from "@morpho-org/evm-simulation";

const config: SimulationConfig = {
  chains: new Map([
    [1, { simulateV1Url: "https://<your-mainnet-rpc>" }],
  ]),
  timeoutMs: 5000,
};

try {
  const { simulationTxs, calls, transfers, assetChanges } = await simulate(
    config,
    {
      chainId: 1,
      // mode: "final" (default) executes the signed calldata against actual
      // permissions; mode: "preview" accepts typed authorization descriptors.
      transactions: [{ from: user, to: vault, data: encodedDeposit }],
      // limits: { operations: [{ type: "vaultV1Deposit", vault, quote: { sharesMinted: 1000n }, slippageTolerance: 10_000000000000000n }] },
    },
  );
} catch (err) {
  if (err instanceof SimulationRevertedError) {
    // Display err.message; decode err.revertData with your ABI when needed.
  }
  throw err;
}
```

Every call inside `eth_simulateV1`, including preparation calls, state reads and assertions, carries the request's `chainId` as a hex quantity, so nodes that check it (geth, Anvil, Monad and Stable do) reject an endpoint on another chain with `InvalidChainIdError`.

Every chain entry requires `simulateV1Url`, pointing to a JSON-RPC endpoint that supports `eth_simulateV1`. Requests send `validation: false` so gas is not charged. Monad (chain 143) is handled internally: its nodes reject `false`, so it sends `true` (its simulated block charges no gas either way), and it pins to the `finalized` block by default because its `latest` block is not final — supply a finalized block when passing `block`. On Monad, `gasUsed` reports the call's gas limit, not the gas consumed. Set `blockOverrides.gasLimit` on a chain entry to send that gas limit as the simulated block's `blockOverrides.gasLimit`; without it, no block override is sent. Set `callGasLimit` on a chain entry to send it as `gas` on every simulated call; without it, no per-call `gas` is sent. This includes state reads and assertions. A call that needs more gas than `callGasLimit` runs out of gas and fails as a revert or a read/assertion failure, so set it above the heaviest expected call. On geth-style nodes, it must also fit in the gas left in the simulated block. Set `parentHashCheck` on a chain entry to turn on or off the check that the simulated block's `parentHash` is the pinned block hash. It defaults to off on Stable (chain 988), whose nodes report a `parentHash` that never matches the pinned block, and on for every other chain. The block number and timestamp checks always apply. Execution uses the full `timeoutMs` budget (default 5000 ms), with no retries or provider fallback. RPC failures, timeouts and reverts throw typed errors. The optional logger still reports parsing and retention warnings.

Native-ETH movements are observed through `traceTransfers` logs on the simulated calls — no `stateOverrides` or helper contracts are injected.

Upgrading from v4? See the [v4 → v5 migration guide](../../docs/migrations/evm-simulation-v4-to-v5.md) for the backend cutover. Upgrading from v5? See the [v5 → v6 migration guide](../../docs/migrations/evm-simulation-v5-to-v6.md) for the retention-guard address change and the 6.1.0 fail-closed RPC response handling. Upgrading from v6? See the [v6 → v7 migration guide](../../docs/migrations/evm-simulation-v6-to-v7.md) for the simplified errors and original revert bytes.

### API surface

All symbols below are re-exported from the package root.

- `simulate(config, params)` — run a bundle through the simulation pipeline.
- Config types: `SimulationConfig`, `ChainSimulationConfig`, `SimulationLogger`.
- Input types: `SimulateParams` (v5 shape: `mode`, `SimulationAuthorization` requests, `SimulationLimits`), `SimulationMode`, `SimulationTransaction`, `Assertion`, `AssertionBounds`, `StateBlock` (the optional `SimulateParams.block`: `{ number, hash, timestamp }`).
- Assertion helpers: `erc20BalanceAssertion` (token balance), `nativeBalanceAssertion` (native balance), and `maxDepositAssertion` (vault deposit cap); all use inclusive `min`/`max` bounds.
- `toSimulationAuthorizations({ owner, requirements })` — map morpho-sdk `ActionRequirement[]` onto `SimulationAuthorization[]` straight from `action.args` — nothing is decoded or validated; validation happens in `simulate()`'s request parser.
- Authorizations and limits: `SimulationAuthorization` and its members (`Erc20ApprovalAuthorization`, `Erc2612PermitAuthorization`, `Permit2TransferAuthorization`, `BlueAuthorization`, `BlueAuthorizationSignature`) with their EIP-712 payloads (`Eip712Domain`, `Eip712Field`, `Erc2612PermitTypedData`, `Permit2TransferTypedData`, `BlueAuthorizationTypedData`); `SimulationLimits`, `OperationLimit`, and the shared `SlippageLimits`, `SlippageQuote`, `SharePriceLimit`, `InKindPositionQuote`, `ForceExitDeallocationQuote` and `BluePositionBounds`.
- Slippage-check result types: `VerifiedSimulationResult`, `SimulationVerification`, `SimulatedOperation`, `AuthorizationPreparation`.
- Result types: `SimulationResult`, `SimulationCall`, `Transfer`, `AccountAssetChanges`, `AssetChange`, `RawLog`.
- Errors: `SimulationPackageError` (abstract base — `instanceof` it to catch any package error), `SimulationRevertedError`, `SimulationAssertError`, `BlacklistViolationError`, `RpcTransportError`, `SimulationValidationError`, `UnsupportedChainError`, and the verification errors `UnsupportedOperationError`, `InvalidSimulationResponseError`, `InvalidChainIdError`, `SlippageCheckUnavailableError`, `AuthorizationRequestMismatchError`, `ConsumerLimitViolationError`, `UnexpectedSimulationError`.
- Error helpers: `SIMULATION_ERROR_CODES` / `SimulationErrorCode` (every `error.code`), `isSimulationPackageError` (structural guard narrowing to `SimulationPackageError`), `toSimulationErrorResponse(error)` / `SimulationErrorResponse` (JSON-safe failure fields for API responses), `RetainedAsset`. Errors use standard `message` and optional `cause`; `SimulationRevertedError` carries `revertData?: Hex` and `transactionIndex?: number`; `SimulationAssertError` carries `transactionIndex`, `phase`, `assertionIndex`, a copy of the caller's `assertion` (`to`, `data`, and `check`), and raw `returnData`.
- Verification vocabulary: `SIMULATION_MODES` / `SimulationMode`, `OPERATION_TYPES` / `OperationType`, `BLUE_MARKET_OPERATION_TYPES` / `BlueMarketOperationType`, `VAULT_OPERATION_TYPES` / `VaultOperationType`, `SimulationOperationSubject` and its members `BlueMarketOperationSubject`, `BlueRefinanceSubject`, `VaultOperationSubject`, `VaultV1MigrateToV2Subject` (operation groups and the operation-keyed subject union used by verification results).

### Assertions

Each transaction may declare caller-supplied `assertBefore` and `assertAfter`
assertions. The `erc20BalanceAssertion`, `nativeBalanceAssertion`, and
`maxDepositAssertion` helpers construct common calls; their optional `min` and
`max` bounds are inclusive and require at least one bound. Values are in token
base units, wei, or vault asset units, respectively.

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

Assertions run as ordinary calls inside the same `eth_simulateV1` request, not
as static calls. They must be view calls: any state they write is visible to
later calls. Morpho Vault V2's `maxDeposit` is `pure` and always returns 0, so
`min > 0` always fails there; the helper is meaningful for Vault V1/MetaMorpho.

A failed check throws `SimulationAssertError` (`SIMULATION_ASSERT_FAILED`) with
`transactionIndex`, `phase`, `assertionIndex`, a copy of the caller's
`assertion` (`to`, `data`, and `check`), and raw `returnData`. A failing `assertBefore` takes precedence
over its transaction's own revert. Reverted assertion reads also throw
`SimulationAssertError`; the check decides whether empty or malformed return
data passes. Assertion declarations are omitted from returned `simulationTxs`.

### Optional limits

The caller chooses the action, subject, quote, and percentage tolerance. Each
entry supplies `quote` with at least one raw-unit amount: `assetsReceived`,
`sharesMinted`, `assetsPaid`, or `sharesBurned` (or, on force exits,
`penalty`/`deallocations`), plus `slippageTolerance` as a WAD-scaled fraction
(`10_000000000000000n` = 1%, `1e18` = 100%). Tolerance must be between 0 and
100% inclusive; it has no default. Omit `limits` to skip checks. Unquoted
amounts stay unchecked. The simulator never decodes calldata or fetches a quote
to infer constraints.
Unknown input keys are rejected as `SimulationValidationError` rather than
silently ignored.

Non-empty `limits.operations` and preview authorizations require a Morpho Blue
address registered in blue-sdk's `getChainAddresses`; otherwise
`UnsupportedChainError` is thrown.

Received assets and minted supply shares must be at least
`ceil(quote * (1 - tolerance))`; paid assets and burned supply shares must be at
most `floor(quote * (1 + tolerance))`. For debt shares, minting is capped at
`floor(quote * (1 + tolerance))` and burning must be at least
`ceil(quote * (1 - tolerance))`. Equality and favorable movement pass.

```ts
const result = await simulate(config, {
  chainId: 1,
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
// result.verification.operations[0].checkedLimits contains this quote and tolerance.
```

Measurements cover the named subject over the **whole bundle**. Entries do not
attribute aggregate state changes to individual transactions. Use separate
simulations for per-transaction limits. Asset bounds use net wallet balance
changes (gas excluded). For native ETH, set `assetPaid` or `assetReceived` to
viem's `ethAddress` (`0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`); other
sentinels such as `zeroAddress` are read as ERC-20 tokens. Share bounds use the
selected account's vault shares or Blue position shares. Borrow/repay entries
use debt shares; refinance selects
source shares burned and target shares minted; migration selects source vault
shares burned and target vault shares minted. Combined collateral/borrow actions
measure collateral paid and loan assets received; repay/collateral-withdraw actions
measure loan assets paid and collateral received.

For `vaultV1InKindRedeem` and `vaultV2InKindRedeem`, `assetsReceived` measures
only the receiver's wallet balance of the vault asset (the idle portion). These
operations additionally accept a `positions` quote listing the expected Blue
supply shares delivered to the receiver per market (`{ marketId, supplyShares }`);
each entry is checked as a minimum output under the same tolerance. Quote supply
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
`blueRefinance` and `vaultV1MigrateToV2`, whose deltas price no single
conversion.

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
`blueWithdrawCollateral` are invalid and throw `SimulationValidationError`
during request parsing. `SlippageCheckUnavailableError` reports runtime
evidence gaps: a failed state read, native outgoing traces that do not cover
value sent, a metadata read that reverts or returns empty/invalid data, a
quoted force exit with no vault `Withdraw` for the account, or a
`ForceDeallocate` that cannot be paired with a Blue `Withdraw` while
`deallocations` is quoted (for example a non-Blue adapter), or a
`ForceDeallocate` that charges a penalty to another account. A quoted
balance/position read whose non-empty return data cannot be decoded throws
`InvalidSimulationResponseError`, as does a matching `ForceDeallocate`/`Withdraw`
event log that fails to decode. Excessive slippage or a violated
`sharePrice`/`position` bound throws `ConsumerLimitViolationError`.

Only quoted amounts and `position` bounds are observed. ERC-20 assets and
vault shares use `balanceOf`; Blue shares use `position`, checked against the
after-bundle position for `position` bounds. Each distinct call runs before
and after the bundle.
Native amounts use the existing transfer traces. Without limits there are no
slippage reads. Quotes with an asset amount resolve `asset()` or market parameters only
when an explicit `assetPaid` or `assetReceived` was not supplied; share-only quotes need no metadata
reads. No vault factories, full entities, allocations, risk metrics, allowances,
or nonces are fetched for slippage.

For example, a Vault V2 deposit quoting assets paid and shares minted makes four
in-bundle view calls — the sender's asset balance and the `account`'s share balance, each before
and after execution — plus one `asset()` read unless `assetPaid` is supplied. `verification.operations[].checkedLimits` records the quote
and tolerance checked, plus `sharePrice` and `position` when set. The result does not include broad state snapshots or diffs;
`transfers` and `assetChanges` remain available.

The result's historical `VerifiedSimulationResult` name does not imply that
unchecked outcomes are economically verified.

Preview authorizations remain an adapter from `getRequirements()` through
`toSimulationAuthorizations` into preparation calls. No permission or nonce
read-back policy runs. Successful execution establishes success under the
simulated permissions; it does not prove that a future signature is valid.
Preparation and user-transaction failures still propagate. Final mode executes
actual calldata without preparation. State reads and preparation calls do not
receive public transaction indices.

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

## Development

Contribute from the monorepo root. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup, checks, and package workflow. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).

## Handling failures in an API service

Return a transaction only after `simulate` resolves. Every rejection blocks the
transaction response, including RPC outages and timeouts. RPC failures become
`RpcTransportError` with code `RPC_TRANSPORT_ERROR` and the original viem error
as `cause`. SDK failures use `SimulationPackageError`. Any other unexpected
failure, including a local viem error, becomes `UnexpectedSimulationError`, with
the original value in `cause`.

Use `toSimulationErrorResponse(error)` to select JSON-safe fields: `code`,
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
  type SimulationConfig,
} from "@morpho-org/evm-simulation";

declare const config: SimulationConfig;
declare const params: SimulateParams;
declare const requestId: string;
declare const logger: { error(fields: { error: unknown; requestId: string }): void };

async function prepareTransactionResponse() {
  try {
    const result = await simulate(config, params);
    return { ok: true as const, transactions: result.simulationTxs };
  } catch (error) {
    logger.error({ error, requestId });
    return { ok: false as const, error: toSimulationErrorResponse(error), requestId };
  }
}
```

The success response above still contains bigint transaction quantities; apply
the API's normal transaction encoding before sending JSON. Simulation verifies
the requested mode and checks at the simulated state; it does not guarantee
execution against later onchain state.
