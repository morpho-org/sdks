# @morpho-org/evm-simulation — agent guide

Authoritative context when working inside `packages/evm-simulation/`. Overrides
the repo-root `CLAUDE.md` for anything package-specific.

This file deliberately omits things derivable from the code (file tree, public
symbol table, type signatures, error class shapes). Read `src/index.ts` for the
public surface, `ls src/` for the layout. What follows is the non-obvious
context.

## What this package does

EVM transaction simulation engine. Bundles execute through Tenderly REST
(primary) or viem `eth_simulateV1` (fallback); ERC20 / WETH9 transfers are
parsed from the resulting logs; bundler-retention and sanctioned-address checks
gate the result.

Protocol-agnostic except for the bundler-retention check, which depends on
`@morpho-org/blue-sdk` for Morpho's `bundler3` addresses.

**No app in this monorepo currently imports it.** API shape changes are still
free.

## Backends — choosing and falling back

- Tenderly REST is the primary. It runs only when `tenderlyRest` is configured
  AND `chainId ∈ supportedChainIds`. It produces shareable URLs and richer
  asset-change data.
- `eth_simulateV1` runs as fallback (or as the primary when Tenderly is not
  available for the chain). No shareable URL, no asset-change data.

**Budget split.** `DEFAULT_TIMEOUT_MS = 5000`, `TENDERLY_BUDGET_RATIO = 0.6`
in `src/simulate/pipeline/execute-simulation.ts`. Tenderly gets 3 s; the
fallback gets the remainder, with a 1500 ms floor (`FALLBACK_MIN_BUDGET_MS`)
so a slow Tenderly never starves the fallback completely.

**Fallback only triggers on `ExternalServiceError`.** A
`SimulationRevertedError` propagates immediately — a revert is a property of
the bundle, not the backend.

**Adding a new backend.** Conform to `RawSimulationResult` from `src/types.ts`,
add a file under `src/simulate/backends/`, re-export it, extend
`ChainSimulationConfig` with any per-chain knobs, branch on it in
`executeSimulation`, write a colocated spec including a parity case.

## The `shareable` option

`shareable` is the single behavioral knob on `simulate(...)`. It only changes
whether Tenderly is asked to persist the simulation. The caller-facing return
shape is identical either way — `tenderlyUrl` is just `undefined` when
`shareable` is false or when the `eth_simulateV1` fallback ran.

The translation to Tenderly's wire field happens in exactly one place
(`tenderly-rest.ts` → body's `save` / `save_if_fails`). Don't propagate the
naming further into the package.

## Authorizations

`signature`-type authorizations are encoded as
`approve(spender, amount ?? maxUint256)` and prepended to the bundle. The
`maxUint256` default is intentional — most simulations want infinite-allowance
preview.

**Future plan (unimplemented):** simulate EIP-2612 permit via ecrecover state
override so callers don't have to send literal approve txs. Keep the current
discriminated-union shape stable when that lands.

## Screening — fail-open vs fail-closed

Two independent tracks, run in parallel:

1. Static `sanctionedAddresses` set — always on. Sourced from
   `offchain-services-server/src/functions/screen/blacklist.ts`. Re-sync from
   there; keep entries lowercased (the validate-on-import guard will throw if
   you don't).
2. Chainalysis Entity API — only fires when `chainalysisApiKey` is set. **5 s
   timeout per address.**

**Fail-open on Chainalysis transport errors.** If Chainalysis is down,
screening logs a warning and returns success. Rationale: a Chainalysis outage
must not block all simulations.

**Fail-closed once a Chainalysis address is partially registered.** If the
register-POST succeeded but the lookup-GET failed, that address is treated as
`'severe'` (block). Rationale: don't let a half-completed call create a hole.

**Severe-only throws.** `High` / `Medium` / `Low` Chainalysis tiers do NOT
throw. Only `Severe` does.

**What gets screened:** `from` + `to` of every `Transfer` AND every tx in
`simulationTxs` (deduped, lowercased, zero-addr removed). The
`simulationTxs` track is the only thing that catches native-value-only flows
(no ERC20 logs to parse).

## Bundler retention

Invariant: for every `(bundler3 address, token)` pair, `|net|` (inbound minus
outbound) must be `≤ DUST_THRESHOLD = 100` wei. The absolute value matters —
the check fires both for stuck deposits AND for unintended drains.

Bundler3 legitimately receives tokens as an intermediary, so a gross-inbound
check would false-fire constantly. Only trapped tokens (positive net) and
unexpected outflows (negative net) are problems.

**blue-sdk lookup behavior:** `getChainAddresses(chainId)` is wrapped. If the
chain is unknown to blue-sdk (`UnsupportedChainIdError`), the check is
**skipped** with `logger.warn`. Any other error is **rethrown** — a blue-sdk
bug must not silently disable a compliance check.

## Error hierarchy

Every thrown error descends from `SimulationPackageError` (abstract,
`readonly code: string`). Consumers should `try/catch` + `instanceof`, never
parse messages.

**Bypassable matrix** — only one error class is bypassable; the rest must
block the user flow:

| Error                       | Bypassable | Caller's typical UX                                            |
| --------------------------- | ---------- | -------------------------------------------------------------- |
| `SimulationRevertedError`   | no         | Show the revert reason; let the user fix their inputs.         |
| `BlacklistViolationError`   | no         | Hard block; log `assetChanges` for investigation.              |
| `AddressScreeningError`     | no         | Hard block; do not retry.                                      |
| `ExternalServiceError`      | **yes**    | Offer a "proceed without simulation" escape hatch if intended. |
| `SimulationValidationError` | no         | Caller-side bug; fix the call site.                            |
| `UnsupportedChainError`     | no         | Gate the UI so the chain isn't reachable.                      |

## Adding a new chain

1. Extend the caller's `SimulationConfig.chains` with an entry.
2. Set `simulateV1Url` if an `eth_simulateV1`-compatible RPC exists.
3. If Tenderly supports the chain, add its `chainId` to
   `TenderlyRestConfig.supportedChainIds`.
4. Confirm `@morpho-org/blue-sdk` knows the chain. If not, the
   bundler-retention check is silently skipped — that's fine for non-Morpho
   chains but should be intentional.
5. Add a colocated spec mocking both backends.

No code change inside this package is required — the chain set is
caller-controlled.

## Test conventions

- Vitest, colocated `{module}.spec.ts`. No `__tests__/` directories (Jest-ism;
  not used here).
- Shared fixture helpers in `src/test-helpers/` — one file per helper. Always
  pull from there rather than re-inlining hex fixtures.
- **Parity specs are load-bearing.** When touching either backend or
  `parseTransfers`, the parity spec under `src/simulate/parsing/` and any
  backend-pair parity case must stay green. They assert a structurally
  equivalent `RawSimulationResult` from both backends for the same input.

## Self-verification

```bash
pnpm --filter @morpho-org/evm-simulation build
pnpm --filter @morpho-org/evm-simulation test
pnpm lint
```

For cross-package sanity after non-trivial changes:

```bash
pnpm build
```
