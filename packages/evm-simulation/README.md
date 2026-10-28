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

Upgrading from v4? Start with the [v4 → v5 migration guide](../../docs/migrations/evm-simulation-v4-to-v5.md) for the backend cutover, then apply the [v5 → v6](../../docs/migrations/evm-simulation-v5-to-v6.md), [v6 → v7](../../docs/migrations/evm-simulation-v6-to-v7.md), and [v7 → v8](../../docs/migrations/evm-simulation-v7-to-v8.md) guides in order.
Upgrading from v5? Apply the [v5 → v6 migration guide](../../docs/migrations/evm-simulation-v5-to-v6.md) first (retention-guard address change and 6.1.0 fail-closed RPC responses), then the [v6 → v7 migration guide](../../docs/migrations/evm-simulation-v6-to-v7.md) for simplified errors and original revert bytes, then the [v7 → v8 migration guide](../../docs/migrations/evm-simulation-v7-to-v8.md) for required limits.
Upgrading from v6? See the [v6 → v7 migration guide](../../docs/migrations/evm-simulation-v6-to-v7.md) for simplified errors and original revert bytes, then the [v7 → v8 migration guide](../../docs/migrations/evm-simulation-v7-to-v8.md) for required limits.
Upgrading from v7? See the [v7 → v8 migration guide](../../docs/migrations/evm-simulation-v7-to-v8.md) for required limits.

### API surface

All symbols below are re-exported from the package root.

- `simulate(config, params)` — run a bundle through the simulation pipeline.
- Config types: `SimulationConfig`, `ChainSimulationConfig`, `SimulationLogger`.
- Input types: `SimulateParams` (v5 shape: `mode`, `SimulationAuthorization` requests, `SimulationLimits`), `SimulationMode`, `SimulationTransaction`, `Assertion`, `LogAssertion`, `AssertionBounds`, `StateBlock` (the optional `SimulateParams.block`: `{ number, hash, timestamp }`).
- Assertion helpers: `erc20BalanceAssertion` (token balance), `nativeBalanceAssertion` (native balance), and `maxDepositAssertion` (vault deposit cap); all use inclusive `min`/`max` bounds.
- `toSimulationAuthorizations({ owner, requirements })` — map morpho-sdk `ActionRequirement[]` onto `SimulationAuthorization[]` straight from `action.args` — nothing is decoded or validated; validation happens in `simulate()`'s request parser.
- Authorizations and limits: `SimulationAuthorization` and its members (`Erc20ApprovalAuthorization`, `Erc2612PermitAuthorization`, `Permit2TransferAuthorization`, `BlueAuthorization`, `BlueAuthorizationSignature`) with their EIP-712 payloads (`Eip712Domain`, `Eip712Field`, `Erc2612PermitTypedData`, `Permit2TransferTypedData`, `BlueAuthorizationTypedData`); `SimulationLimits`, `OperationLimit`, and the shared `SlippageLimits`, `CheckedSlippageLimits` (the checked result carrying the applied `slippageTolerance`), `CheckedOperationLimit` and `CheckedSimulationLimits` (the type of `verification.limits` on a checked run), `SlippageQuote`, `SharePriceLimit`, `InKindPositionQuote`, `ForceExitDeallocationQuote`, `BluePositionBounds`, `MidnightPositionBounds`, `MidnightDebtPositionBounds`, `MidnightMarketStruct`, and `MidnightCollateralAmount`.
- `toSimulationLimits(action, { owner, onBehalf?, receiver?, slippageTolerance?, market?, expected? })` — build the `SimulationLimits` of a morpho-sdk action transaction (`tx.action`), deriving quote sides the encoded args fix and merging the caller's `expected` quote over them.
  `market` is forwarded for `midnightSupplyCollateral`, `midnightTakeLend`,
  `midnightTakeBorrow`, and `midnightSupplyCollateralTakeBorrow`; it is also
  forwarded for `midnightCancelAndMake` when collateral supplies are present
  and `blueSupply` is absent. The Midnight `MarketUtils.toId(market)` must
  equal the action's market id. `receiver` applies to `vaultV2ForceRedeem`,
  Midnight redeem/sell actions, `midnightSupplyCollateralTakeBorrow`,
  `midnightTakeBorrow`, `midnightTakeWithdraw`, and repayment-withdraw actions
  with collateral withdrawals; for the latter, it must match
  `collateralReceiver`. For Midnight sells, pass the action's encoded receiver
  when it differs from `owner`; `takeLend` acts for `msg.sender` and does not
  allow an external receiver. `onBehalf` applies only to
  `midnightSupplyCollateral` and `midnightRedeem`; eligible maker bundles act
  for `owner`. Midnight sells, `midnightTakeLend` and repay-withdraw always
  measure `msg.sender` and reject any explicit `account`; Blue parking measures
  the bundle sender, so `account` must equal `owner` or be omitted; Midnight
  take bundles act for `owner`/`msg.sender`.

- Slippage-check result types: `VerifiedSimulationResult`, `SimulationVerification`, `SimulatedOperation`, `AuthorizationPreparation`.
- Input-based limits: `InputOperationLimit`, `OperationInputs`, `AssetsOrShares`, `RepayInputs`, `SimulationInputLimits` and `SimulateInputParams`; checked input outputs use `CheckedInputOperationLimit`, `CheckedSimulationInputLimits`, `SimulationInputVerification` and `VerifiedSimulationInputResult`. `ScalarQuoteField` names the keys of `fieldChecks`; `FeelessInputType` names the input operation types that reject `referralFee`, and `ReallocationPenaltyInputType` names those that accept `reallocationPenalty`. Existing `SimulateParams`, `SimulationLimits`, `CheckedOperationLimit` and quote-only result types remain unchanged; `simulate()` accepts both forms and preserves its quote-only return overload, including wrappers typed with `SimulateParams`.
- Result types: `SimulationResult`, `SimulationCall`, `Transfer`, `AccountAssetChanges`, `AssetChange`, `RawLog`.
- Errors: `SimulationPackageError` (abstract base — `instanceof` it to catch any package error), `SimulationRevertedError`, `SimulationAssertError`, `SimulationLogAssertError`, `BlacklistViolationError`, `RpcTransportError`, `SimulationValidationError`, `UnsupportedChainError`, and the verification errors `UnsupportedOperationError`, `InvalidSimulationResponseError`, `InvalidChainIdError`, `SlippageCheckUnavailableError`, `AuthorizationRequestMismatchError`, `ConsumerLimitViolationError`, `UnexpectedSimulationError`, and the limit-building errors `LimitAccountMismatchError`, `MissingExpectedQuoteError`, `AmbiguousExpectedQuoteError`, `UnsupportedLimitActionError`.
- Error helpers: `SIMULATION_ERROR_CODES` / `SimulationErrorCode` (every `error.code`), `isSimulationPackageError` (structural guard narrowing to `SimulationPackageError`), `toSimulationErrorResponse(error)` / `SimulationErrorResponse` (JSON-safe failure fields for API responses), `RetainedAsset`. Errors use standard `message` and optional `cause`; `SimulationRevertedError` carries `revertData?: Hex` and `transactionIndex?: number`; `SimulationAssertError` carries `transactionIndex`, `phase`, `assertionIndex`, a copy of the caller's `assertion` (`to`, `data`, and `check`), and raw `returnData`; `SimulationLogAssertError` carries `transactionIndex`, `assertionIndex`, a copy of the caller's assertion, and the lowercase log values passed to its check, which receives them in a frozen copy.
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

A failed `assertBefore` or `assertAfter` check throws `SimulationAssertError`
(`SIMULATION_ASSERT_FAILED`) with
`transactionIndex`, `phase`, `assertionIndex`, a copy of the caller's
`assertion` (`to`, `data`, and `check`), and raw `returnData`. A failing `assertBefore` takes precedence
over its transaction's own revert. Reverted assertion reads also throw
`SimulationAssertError`; the check decides whether empty or malformed return
data passes. Assertion declarations are omitted from returned `simulationTxs`.
An `assertLogs` failure throws `SimulationLogAssertError` with the same
`SIMULATION_ASSERT_FAILED` code, the transaction and assertion indexes, a copy
of the log assertion, and the lowercase log values passed to its check, which
receives them in a frozen copy. A transaction
revert takes precedence over its log assertions, and a failing log assertion
takes precedence over its `assertAfter` assertions.

### Limits

`limits` is required on every call: pass quote-only `SimulationLimits`,
`SimulationInputLimits` for typed inputs or mixed operations (via
`SimulateInputParams`), or the literal `"none"` to explicitly skip all checks and
state reads — `"none"` is
reserved for transactions that no operation type covers (Merkl reward claims,
unsupported Midnight actions and `midnightCancelAndMake` bundles that combine
a Blue supply with collateral supplies, contain unfunded publications, or
contain cancellations only, and approval/authorization-only bundles), and
every transaction an operation type covers must pass limits. Missing `limits`
and an empty `operations` array are rejected as `SimulationValidationError` —
an implicit
opt-out is never accepted.

New integrations should supply `inputs`, independently of the transaction builder:

```typescript
const result = await simulate(config, {
  chainId: 1,
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
  `blueSupplyCollateral` and `midnightSupplyCollateral`; `unitsBought` on
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
  `SlippageCheckUnavailableError`. This includes a `0n` cap: any positive
  native value fails closed, for example when the owner receives wNative loan
  proceeds but no quoted collateral is wNative. Native value sent on a chain
  without registered wNative fails closed with `SlippageCheckUnavailableError`;
  otherwise, if the operation has no owner wNative bound, native value is not
  checked. The combined operation throws
  `SimulationValidationError` when its wallet bounds overlap another
  operation's wallet balance reads or wallet bounds, or when its Midnight
  collateral, credit, or debt reads overlap another operation's Midnight
  position reads.
- Required caps: `assetsPaid` on every pay-in op (`blueSupply`,
  `blueSupplyCollateral`, `midnightSupplyCollateral`,
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
The collateral a refinance moves between markets is not verified.
`midnightSupplyCollateral` limits name the Midnight market (`marketId`, from
morpho-sdk's `MidnightMarketUtils.toId`) and the `collateralIndex` they supply; `collateralSupplied`
is the `Midnight.collateral(marketId, account, collateralIndex)` delta, and
`assetsPaid` is the sender's balance delta in the collateral token, resolved
from `Midnight.toMarket(marketId)` or the supplied market struct at that index.
Two supplies to the same slot in one bundle are checked against one aggregate
quote. The chain must have a registered `midnight` address; otherwise
`UnsupportedChainError` is thrown. A market that does not exist yet at the
state block has no `toMarket` entry. For a first `midnightTakeLend`,
`midnightTakeBorrow`,
`midnightSupplyCollateralTakeBorrow`, or `midnightSupplyCollateral` into a
market created in the bundle, pass its struct via `market`; the Midnight
`MarketUtils.toId(market)` must equal `marketId`. For a first
`midnightSupplyCollateral` only, `assetPaid` is a fallback when no `market` is
passed: set it to `collateralParams[collateralIndex].token`. The override is
not checked, and a wrong address lets the `assetsPaid` cap pass without
measuring anything.
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
throws `SlippageCheckUnavailableError`.

`toSimulationLimits` also supports a funded maker publication produced by
`supplyCollateralMakeBorrow`: `tx.action.type` must be `midnightCancelAndMake`,
`collateralSupplies` must be non-empty, and `blueSupply` must be `undefined`.
It emits one `midnightSupplyCollateral` operation per distinct index, preserving
first-seen order and summing repeated indices. MidnightBundlesV2 acts for
`msg.sender`, so each operation uses `owner` as its collateral account;
`onBehalf` cannot change that. If the maker publishes supplies at more than one
index, omit `expected` because its quote cannot be assigned to an individual
operation; a defined `expected` field throws `AmbiguousExpectedQuoteError`.
If the maker's supply creates the market, the `toMarket` rule above applies:
pass the struct via `market` to `toSimulationLimits`, or, when no market is
passed, set `assetPaid` to `collateralParams[collateralIndex].token` on each
returned operation.
Otherwise, `simulate()` throws `SlippageCheckUnavailableError`.
Other Midnight actions—including `midnightCancelAndMake` bundles that combine
Blue parking with collateral supplies, contain unfunded publications, or
contain cancellations only—remain unsupported; pass `limits: "none"` only
when no covered operation is present.

The action records `nativeAmount`. The collateral-only
(`supplyCollateralMakeBorrow`) path ignores it: MidnightBundlesV2 wraps any
native value into wNative before pulling the collateral, so `assetsPaid` caps
only the sender's wNative debit; these limits do not bound ETH sent as
`tx.value`. To bound it separately, add a caller-supplied
`nativeBalanceAssertion` to the maker transaction's `assertAfter`, using a bound
derived from the sender's pre-transaction native balance. No
`assetPaid: ethAddress` is added. For Blue parking, the helper quotes the full
amount parked. When the loan token is wNative, the check adds the sender's ETH
sent to the net wNative change, so native funding needs no quote adjustment.

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
const result = await simulate(config, {
  chainId: base.id,
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
const result = await simulate(config, {
  chainId,
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
const result = await simulate(config, {
  chainId,
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

Preview authorizations and every operation type require a Morpho Blue address
registered in blue-sdk's `getChainAddresses`; otherwise
`UnsupportedChainError` is thrown. Blue parking also requires registered
Midnight and `midnightBlueBuyCallbackFactory` addresses.

Minimums — `assetsReceived`, supply/vault `sharesMinted`, debt `sharesBurned`,
`collateralSupplied`, `debtRepaid`, `unitsBought` (net Midnight position units,
on `midnightTakeLend`) and the `collateralWithdrawals` delivery — must be at
least `ceil(quote * (1 - tolerance))`; caps — `assetsPaid`,
supply/vault `sharesBurned`, debt `sharesMinted`, `collateralWithdrawn`,
`creditRedeemed` (Midnight credit units), `unitsSold` (net Midnight position
units, on `midnightTakeBorrow`) and the `collateralWithdrawals` position
decrease — must be at most `floor(quote * (1 + tolerance))`.
`collateralSupplied` and `collateralWithdrawn` are measured on the Blue
position's `collateral`, except on `midnightSupplyCollateral`, where
`collateralSupplied` is the Midnight collateral slot delta. Equality and
favorable movement pass.

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

Typed-input asset overrides must match the canonical subject token. A native
`ethAddress` alias is allowed only for the chain's registered wNative; wallet
measurements then net ETH and wNative together, including extra wrapped-token
pulls or receipts. Quote-only overrides remain trusted as before.
Typed wNative measurements on the sender also include native ETH whenever the
request sends native value, even without an explicit native alias.
Requests that send native value with typed inputs must have that value covered
by a measured native or wNative side; otherwise simulation throws
`SlippageCheckUnavailableError`.
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
`blueWithdrawCollateral` are invalid and throw `SimulationValidationError`
during request parsing, as do `collateralSupplied`/`collateralWithdrawn` quotes
on any other operation. `SlippageCheckUnavailableError` reports runtime
evidence gaps: a failed state read, native outgoing traces that do not cover
value sent, a metadata read that reverts or returns empty/invalid data, a
quoted force exit with no vault `Withdraw` for the account, or a
`ForceDeallocate` that cannot be paired with a Blue `Withdraw` while
`deallocations` is quoted (for example a non-Blue adapter), or a
`ForceDeallocate` that charges a penalty to another account, or repay-withdraw
checks when a quote returns loan-token collateral to the payer, native value
is sent without registered wNative, or native value is sent while wNative
collateral is delivered to the sender, or a `midnightTakeLend` that sends
native value without registered wNative. A quoted
balance/position read whose non-empty return data cannot be decoded throws
`InvalidSimulationResponseError`, as does a matching `ForceDeallocate`/`Withdraw`
event log that fails to decode. Excessive slippage, a violated
`sharePrice`/`position` bound, a `midnightTakeWithdraw` bundle that
changes the sender's Midnight debt, or a `midnightRepayWithdrawCollateral` or
`midnightTakeRepayWithdrawCollateral` bundle that changes the sender's Midnight credit, increases debt on an
action without a `debtRepaid` quote, or under-delivers quoted collateral to
the receiver throws `ConsumerLimitViolationError`.

Only quoted amounts, `position` bounds and the sender's Midnight debt through
`debt(id, account)` for `midnightTakeBorrow`, `midnightTakeWithdraw`,
`midnightSupplyCollateralTakeBorrow`, `midnightRepayWithdrawCollateral`,
`midnightTakeRepayWithdrawCollateral`, and `midnightTakeLend` are observed.
`midnightSupplyCollateralTakeBorrow` also reads the sender's Midnight credit,
each quoted collateral index's position, and `balanceOf` for each wallet bound.
`midnightTakeLend` also reads the sender's
Midnight credit for `unitsBought`. The repay-withdraw operations also read the
sender's Midnight credit, each quoted collateral index's position, and the
receiver's `balanceOf` for that collateral token. ERC-20 assets and
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
and after execution — plus one `asset()` read unless `assetPaid` is supplied. `verification.operations[].checkedLimits` records the quote
and tolerance checked, plus `sharePrice` and `position` when set, and input-based
`fieldChecks` identifying exact, minimum, maximum and quoted sides. The result does not include broad state snapshots or diffs;
`transfers` and `assetChanges` remain available.

The result's historical `VerifiedSimulationResult` name does not imply that
unchecked outcomes are economically verified.

### Building quote-based limits with `toSimulationLimits`

`toSimulationLimits(action, { owner, expected })` produces the
`SimulationLimits` of a transaction built by a morpho-sdk action (`tx.action`),
without touching the network. For operations that carry `account`, it is
`owner`, except on `midnightSupplyCollateral` and `midnightRedeem`, where it is
`options.onBehalf ?? owner`. Midnight sells always measure the sender and reject
any explicit `account`. `midnightRepayWithdrawCollateral` and
`midnightTakeRepayWithdrawCollateral` also always measure the sender and reject
any explicit `account`. Encoded `args.onBehalf` must
match the selected account. `redeem.recipient` on `vaultV2ForceRedeem` and
encoded receivers on `midnightRedeem`, `midnightTakeBorrow`,
`midnightSupplyCollateralTakeBorrow` and `midnightTakeWithdraw` must match
`receiver ?? owner`. On collateral-withdrawing
`midnightRepayWithdrawCollateral` and `midnightTakeRepayWithdrawCollateral`,
`args.collateralReceiver` must match the
same value. Mismatches throw `LimitAccountMismatchError`.

For `midnightSupplyBlueMakeLend`, the helper sets `account` to `owner`;
`simulate()` rejects a raw limit whose `account` is not the bundle sender with
`SlippageCheckUnavailableError`, because MidnightBundlesV2 creates the
BlueBuyCallback for `msg.sender`.

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
| `blueBorrow` | `assetsReceived` (`borrowAssets` − penalty − fee) | `sharesMinted` (debt-share cap) | — |
| `blueSupplyCollateral` | `assetsPaid`, `collateralSupplied` | — | — |
| `midnightSupplyCollateral` | `assetsPaid`, `collateralSupplied` (`assets`); `account` is `options.onBehalf ?? owner` | — | — |
| `midnightCancelAndMake` with non-empty `collateralSupplies` and no `blueSupply` | One `midnightSupplyCollateral` operation per distinct collateral index; repeated indices are summed in first-seen order | — | — |
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
`midnightRedeem`, `midnightTakeLend`, `midnightTakeBorrow`,
`midnightTakeWithdraw`, `midnightRepayWithdrawCollateral`,
`midnightTakeRepayWithdrawCollateral`, and `midnightSupplyCollateralTakeBorrow`, plus
`midnightCancelAndMake` with either non-empty `collateralSupplies` and no
`blueSupply`, or a `blueSupply` and no collateral supplies (which emits
`midnightSupplyBlueMakeLend`). Other Midnight actions and action types without
a supported operation throw `UnsupportedLimitActionError`.

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

`midnightSupplyCollateral` calls Midnight directly, which pulls from the
sender and credits `onBehalf`. Pass `onBehalf` when the caller intends to
supply for another account; the helper throws `LimitAccountMismatchError`
when `args.onBehalf` differs from `options.onBehalf ?? owner`, and when
`onBehalf` is passed with another value than `owner` on any other action.
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
Native-funded actions mark `assetPaid` with viem's `ethAddress`, except for
`midnightTakeLend`, `midnightRepayWithdrawCollateral`,
`midnightTakeRepayWithdrawCollateral`, and `midnightSupplyBlueMakeLend`, which
measure `assetsPaid` across the bundle; leave `assetPaid` unset, as setting it
is rejected. On wNative loan markets, these limits count ETH sent plus the
sender's net wNative change.

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
await simulate(config, {
  chainId: base.id,
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
Preparation and user-transaction failures still propagate. A preparation that
emits asset transfers fails closed with `SimulationValidationError`; simulate
that authorization as a transaction in final mode to check its asset flows.
This rejects any ERC-20 Transfer or WETH Deposit/Withdrawal event signature,
including malformed and four-topic logs. Native-value trace transfers are also
rejected because they carry the ERC-20 Transfer topic.
Tokens that move value without emitting logs remain outside this check.
Final mode executes actual calldata without preparation. State reads and preparation calls do not
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
