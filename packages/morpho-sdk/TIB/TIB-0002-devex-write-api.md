# TIB-0002: DevEx Write API — REST surface over morpho-sdk + evm-simulation

| Field             | Value      |
| ----------------- | ---------- |
| **Status**        | Proposed   |
| **Date**          | 2026-04-29 |
| **Author**        | @Benjamin  |
| **Scope**         | Repo-wide  |
| **Supersedes**    | N/A        |
| **Superseded by** | N/A        |

---

## Context

`@morpho-org/morpho-sdk` and `@morpho-org/evm-simulation` are now public TypeScript
packages. Together they cover the full "intent → secure transaction" pipeline:

- `morpho-sdk` exposes a `MorphoClient` whose `vaultV1`, `vaultV2`, and `marketV1`
  entities return a uniform `{ buildTx, getRequirements }` pair for every supported
  action (deposit, withdraw, redeem, supplyCollateral, borrow, supplyCollateralBorrow,
  repay, withdrawCollateral, repayWithdrawCollateral, forceWithdraw, forceRedeem,
  migrateToV2). Bundling, slippage protection, native-token wrapping, EIP-2612 permit
  / Permit2 signature flows, and Bundler3 `GeneralAdapter1` authorisation are all
  handled internally.
- `evm-simulation` exposes `simulate(config, params, options?)` and
  `screenAddresses({ simulationTxs, transfers })`. It runs an EVM bundle through
  Tenderly REST or `eth_simulateV1`, parses ERC-20 / WETH9 transfers, and screens the
  resolved address set against the static sanctioned list (and optionally
  Chainalysis).

These two packages cover everything a non-custodial integrator needs to construct,
preview, and screen a Morpho transaction *except the actual signing and broadcasting*,
which must remain client-side. There is no remaining technical blocker to exposing
this exact surface as a small REST service.

The motivation is developer experience. Today a partner integrating Morpho writes /
deposits has to:

1. Add `viem`, `@morpho-org/morpho-sdk`, `@morpho-org/evm-simulation`, and the various
   `@morpho-org/blue-sdk*` transitive workspace deps to a TypeScript project.
2. Wire a `viem` client per chain.
3. Construct a `MorphoClient`, pick an entity, call the action, follow the
   `getRequirements()` decision tree (approval / permit / Permit2 / Morpho
   authorisation), thread the resulting signature back into `buildTx`.
4. Optionally re-route the bundle through `simulate` and `screenAddresses` before
   showing it to a user.
5. Repeat the integration in any non-TypeScript stack by hand.

A REST surface collapses this to a single HTTP call returning a fully populated
`{ to, data, value, chainId }` plus a typed list of unsigned requirements.

This unlocks four developer audiences that are currently underserved:

- **Non-TS backends** (Python, Go, Rust, Elixir, Ruby) that today either re-implement
  bundler encoding or don't ship Morpho support at all.
- **AI agents and tool-use frameworks** for which an OpenAPI spec is a first-class
  citizen — far higher integration density than an npm package.
- **Lightweight frontends and mobile apps** that want to avoid shipping the full
  `viem` + Morpho dep tree to the client.
- **Internal observability**: every transaction the ecosystem builds passes through a
  logged, traced, version-pinned codepath. Today each integrator is its own black
  box.

## Goals / Non-Goals

**Goals**

- Ship a new package, tentatively `@morpho-org/write-api`, that exposes the full set
  of `morpho-sdk` actions as REST endpoints returning `{ to, data, value }` calldata.
- Mirror the SDK's entity-action structure 1:1 so that the on-chain semantics
  (Bundler3 routing, `maxSharePrice`, LLTV buffer, `userAddress = signer` invariant)
  are preserved exactly. The service is a thin wrapper, never a re-implementation.
- Express the requirements flow (ERC-20 approval, EIP-2612 permit, Permit2,
  `setAuthorization` on Morpho) over HTTP without ever touching a private key. The
  signing step always happens client-side; the API returns EIP-712 typed-data
  payloads for permit flows.
- Optionally pre-flight every built transaction through `evm-simulation`'s
  `simulate` + `screenAddresses` before returning it, so the response can include a
  preview (transfers, Tenderly URL) and a sanctioned-address screening result.
- Publish a typed OpenAPI 3.1 schema generated from the same Zod definitions used
  for runtime validation, so AI agents and codegen pipelines can consume it.
- Remain stateless and horizontally scalable: no database, no per-user storage, no
  in-memory session state across requests.
- Map the SDK's typed error classes (e.g. `BorrowExceedsSafeLtvError`,
  `MissingClientPropertyError`, `NativeAmountOnNonWNativeVaultError`,
  `SimulationRevertedError`, `BlacklistViolationError`) onto a stable HTTP error
  taxonomy.

**Non-Goals**

- The service does **not** sign transactions. It does **not** hold keys or KMS
  references. Custody is unchanged.
- The service does **not** broadcast transactions. The consumer is responsible for
  submission via their own RPC/relayer.
- The service is **not** a read API for the Morpho protocol. Indexed historical
  data, market lists, vault analytics, and APYs continue to live behind the existing
  GraphQL Blue API.
- The service does **not** replace the SDK. The SDK stays the canonical entry point
  for TS integrators; the API is an additional surface for everyone else.
- The service does **not** add new on-chain capabilities. If `morpho-sdk` doesn't
  support an action, neither does the API.
- No quote / price aggregation, no path-finding across protocols, no router-style
  meta-aggregation.
- No JSON-RPC interface and no GraphQL surface in v1. REST + OpenAPI only.
- No per-user persistence (history, favourites, drafts). The service is fully
  stateless.

## Current Solution

There is no Morpho-hosted write API today. Every integrator imports the TS SDK
directly. This works well for first-party apps and the Tether WDK launch use case,
but produces the friction enumerated in *Context* for everyone else. There is no
shared observability layer for write traffic across the ecosystem; each integrator
operates its own opaque codepath.

## Proposed Solution

Build a thin, stateless HTTP service that wraps `@morpho-org/morpho-sdk` and
`@morpho-org/evm-simulation`. The service constructs a `MorphoClient` per incoming
request, calls the SDK action that matches the route, optionally pipes the result
through `simulate` + `screenAddresses`, and returns a JSON document containing the
populated transaction, the unsigned requirements (approvals as ready-to-send
`{to,data,value}`; permits as EIP-712 typed data the client must sign), and the
optional simulation preview.

### Surface — endpoint shape

URLs follow REST conventions and mirror the SDK's `entity.action` naming so that
documentation, tests, and AI tool descriptors line up with the package they wrap.

```
POST /v1/chains/{chainId}/vaults-v2/{vaultAddress}/deposit
POST /v1/chains/{chainId}/vaults-v2/{vaultAddress}/withdraw
POST /v1/chains/{chainId}/vaults-v2/{vaultAddress}/redeem
POST /v1/chains/{chainId}/vaults-v2/{vaultAddress}/force-withdraw
POST /v1/chains/{chainId}/vaults-v2/{vaultAddress}/force-redeem

POST /v1/chains/{chainId}/vaults-v1/{vaultAddress}/deposit
POST /v1/chains/{chainId}/vaults-v1/{vaultAddress}/withdraw
POST /v1/chains/{chainId}/vaults-v1/{vaultAddress}/redeem
POST /v1/chains/{chainId}/vaults-v1/{vaultAddress}/migrate-to-v2

POST /v1/chains/{chainId}/markets-v1/{marketId}/supply-collateral
POST /v1/chains/{chainId}/markets-v1/{marketId}/borrow
POST /v1/chains/{chainId}/markets-v1/{marketId}/supply-collateral-borrow
POST /v1/chains/{chainId}/markets-v1/{marketId}/repay
POST /v1/chains/{chainId}/markets-v1/{marketId}/withdraw-collateral
POST /v1/chains/{chainId}/markets-v1/{marketId}/repay-withdraw-collateral

GET  /v1/healthz
GET  /v1/openapi.json
```

### Request / response sketch

A representative deposit:

```http
POST /v1/chains/1/vaults-v2/0xVAULT/deposit
Content-Type: application/json
Idempotency-Key: 7b8e…

{
  "userAddress": "0xUSER",
  "amount": "1000000000000000000",
  "nativeAmount": "0",
  "supportSignature": true,
  "preview": true
}
```

```http
HTTP/1.1 200 OK
X-Sdk-Version: morpho-sdk@1.0.0; evm-simulation@…
Content-Type: application/json

{
  "transaction": {
    "chainId": 1,
    "to": "0xBUNDLER3",
    "data": "0x…",
    "value": "0",
    "frozen": true
  },
  "requirements": [
    {
      "type": "permit",
      "spender": "0xGENERALADAPTER1",
      "amount": "1000000000000000000",
      "deadline": 1735689600,
      "typedData": { "domain": "…", "types": "…", "primaryType": "Permit", "message": "…" }
    }
  ],
  "preview": {
    "transfers": [{ "token": "0xWETH", "from": "0xUSER", "to": "0xBUNDLER3", "amount": "1000000000000000000" }],
    "tenderlyUrl": "https://dashboard.tenderly.co/shared/simulation/…",
    "screening": { "ok": true, "screened": ["0xUSER", "0xBUNDLER3", "0xVAULT"] }
  },
  "meta": {
    "generatedAt": "2026-04-29T12:34:56Z",
    "blockNumber": "21034567",
    "sdkVersion": "morpho-sdk@1.0.0"
  }
}
```

The two-step signing dance is preserved without server-side state. The flow is:

1. Client `POST`s the action with `supportSignature: true`.
2. Server returns `requirements: [{ type: "permit", typedData }]` *plus* the partial
   transaction (the SDK's `buildTx` is invoked with no signature). Today this returns
   an unsigned bundle that won't pass on-chain — the response makes that explicit by
   marking `transaction.requiresSignature: true` when applicable.
3. Client signs the typed data locally and `POST`s the *same* request again with
   `requirementSignatures: [...]` populated. Server replays the SDK call with the
   signature threaded into `buildTx(signature)` and returns the final, ready-to-send
   transaction.

Because the server is stateless, step 1 and step 3 can be served by different
instances. The client carries state (the original request payload) across the
signing pause. `Idempotency-Key` allows clients to safely retry on network errors.

### Layering — strict thin wrapper

```
HTTP request
    │
    ▼
Zod request schema  ─────── runtime validation, normalises bigint strings, addresses
    │
    ▼
Route handler
    │
    ▼
new MorphoClient(viemClientForChainId, { supportSignature, supportDeployless, … })
    │
    ▼
client.{vaultV1|vaultV2|marketV1}(...).{action}(typedParams)
    │
    ▼
{ buildTx, getRequirements } from morpho-sdk
    │
    ▼  (optional, controlled by `preview` flag)
evm-simulation.simulate({ chainId, transactions, authorizations })
evm-simulation.screenAddresses({ simulationTxs, transfers })
    │
    ▼
Zod response schema  ────── shape, then JSON-serialise (bigint → decimal string)
    │
    ▼
HTTP response
```

The handler layer is *only* for transport: schema validation, error mapping,
serialisation. All protocol logic stays in `morpho-sdk`. All simulation logic stays
in `evm-simulation`. The service is a transport translator.

### Deployment shape

- Single Node ≥22 process per instance, packaged as a Docker image.
- Stateless. Scale horizontally behind a load balancer.
- Two minimum required configs: `RPC_URL_<chainId>` per supported chain, and
  Tenderly credentials (or per-chain `eth_simulateV1` URL) for the `preview` flag.
- `/healthz` (liveness), `/readyz` (readiness — checks at least one RPC per
  supported chain responds), `/openapi.json` (live spec).
- TLS termination, rate limiting, and optional API-key auth handled at the gateway
  / ingress layer, not inside the service. The service emits the metrics needed for
  the gateway to apply per-key quotas.

### Implementation Phases

- **Phase 1 — Skeleton & one action end-to-end:**
  - Stand up `packages/write-api/` with Hono on Node 22, Zod for runtime schemas,
    and `@hono/zod-openapi` (or equivalent) to derive the OpenAPI spec.
  - Wire chain-aware `MorphoClient` factory backed by an `RPC_URL_<chainId>` config
    map. Reject unknown chain IDs with 400.
  - Implement `POST /v1/chains/{chainId}/vaults-v2/{vaultAddress}/deposit`
    end-to-end (no `preview` yet). Includes the two-step signature flow.
  - Error taxonomy v1: map each `morpho-sdk` typed error class to an HTTP status +
    machine-readable `code` field. Negative tests for the obvious classes
    (`AddressMismatchError`, `BorrowExceedsSafeLtvError`,
    `NativeAmountOnNonWNativeVaultError`, `MissingClientPropertyError`).
  - CI: lint, build, unit + integration tests against an Anvil fork (reusing
    `@morpho-org/test`).

- **Phase 2 — Full SDK coverage:**
  - Expose every entity × action combination listed under *Surface* above.
  - Reuse a single shared route factory that takes an entity selector and an action
    name; this avoids drift between routes and keeps each handler ~10 LOC.
  - Snapshot tests that compare the API response to the SDK's `buildTx` output
    byte-for-byte for a representative request matrix.

- **Phase 3 — Simulation & screening preview:**
  - Add `evm-simulation` integration behind the `preview: true` request flag.
    Default is `false` to keep latency budgets predictable.
  - Surface `simulate` errors (`SimulationRevertedError`, etc.) as a structured
    `preview.error` field with `code` + `reason` rather than failing the whole
    request — the calldata is still useful even when the simulation reverts (e.g. a
    missing approval the client still has to send).
  - Add `screenAddresses` and surface `BlacklistViolationError` as `409 Conflict`
    with `code: "ADDRESS_BLOCKED"` plus the offending address. This is a hard fail;
    calldata is *not* returned.
  - Document the simulation budget (Tenderly ~60% of `timeoutMs`, `eth_simulateV1`
    fallback for the remainder).

- **Phase 4 — Public hardening & launch:**
  - OpenAPI spec published at `/v1/openapi.json` and mirrored to a docs site.
  - OpenTelemetry tracing across handler → SDK → simulation → response, with
    consistent `request_id` and `idempotency_key` log fields.
  - Prometheus metrics: per-route latency histograms, error code counters, RPC
    upstream latency, simulation cache hit rate.
  - Load testing against the documented latency SLO (target: p95 < 500 ms with
    `preview: false`, p95 < 2.5 s with `preview: true`).
  - Independent security review focused on parameter coercion, bigint handling,
    chain-ID confusion, response replay, and the two-step signature flow.

## Considered Alternatives

### Alternative 1: Continue requiring direct SDK integration

Status quo. Every integrator pulls in the npm packages.

**Why rejected:** Excludes non-TS stacks entirely and adds avoidable friction for
TS stacks (transitive deps, viem version coupling, manual requirements wiring). The
DX gap is exactly what this TIB exists to close.

### Alternative 2: Per-language SDKs (Python / Go / Rust)

Re-implement the SDK behaviour in each target language.

**Why rejected:** Bundler3 calldata encoding, the slippage parameters, the
`maxSharePrice` math, the requirements decision tree, and the Permit2 nonce logic
are non-trivial and security-sensitive. Three parallel implementations would be a
permanent maintenance and audit liability and would inevitably drift from the TS
canonical version. A REST surface ships the same `morpho-sdk` everywhere by
construction.

### Alternative 3: GraphQL gateway

Add write mutations to the existing GraphQL Blue API.

**Why rejected:** (a) Mixing read and write endpoints under one ownership boundary
complicates the security model — the Blue API is heavily cached and has different
threat assumptions. (b) AI tool-use ergonomics are markedly better for OpenAPI than
for GraphQL today (OpenAI / Anthropic tool schemas, MCP `openapi` connectors). (c)
The request shape is intrinsically RPC-style ("build me this transaction"), not
graph-style; GraphQL adds ceremony without a benefit. (d) The two-step signing flow
doesn't fit a query/mutation model cleanly.

### Alternative 4: JSON-RPC interface

Expose `morpho_buildTx` etc. over a single JSON-RPC endpoint.

**Why rejected:** Lower discoverability, weaker tooling story, no native HTTP
status semantics for error classes, and the audience (non-TS backends, AI agents,
docs sites) overwhelmingly expects REST + OpenAPI. JSON-RPC's only advantage —
matching Ethereum's request style — is irrelevant here because the API is a build
service, not a node interface.

### Alternative 5: Server-side stateful sessions for the signing pause

Store the in-flight request server-side between step 1 and step 3 of the signature
flow, identified by an opaque session token.

**Why rejected:** Adds a database / cache, breaks horizontal scaling guarantees,
introduces a new attack surface (session theft, replay across instances), and buys
nothing — the client already has the original request payload and can resend it.
Statelessness is load-bearing for the operational profile.

## Assumptions & Constraints

- `@morpho-org/morpho-sdk` and `@morpho-org/evm-simulation` are published, public,
  and stable enough that pinning a minor range is safe. If either package's API
  shape becomes unstable, the API's release cadence becomes coupled to it.
- Every supported chain has at least one RPC endpoint reachable from the service
  with sufficient rate budget for `fetchVault` / `fetchAccrualVault` /
  `fetchAccrualPosition` / `fetchHolding` calls per request.
- Tenderly credentials (or a chain with `eth_simulateV1` support) are available for
  the chains where `preview: true` is offered. `preview` is opt-in per-request;
  chains without simulation backend simply reject the flag with a typed error.
- Operators accept the trust model: the service builds calldata only and never
  holds keys. Consumers are responsible for signing and broadcasting.
- The `userAddress = signer` invariant from the SDK is enforced *by the consumer's
  wallet*, not the API. The API documents the invariant and surfaces the SDK's
  `AddressMismatchError` / `MissingClientPropertyError` as `400`.
- This service does not absolve consumers of slippage / health / liveness checks.
  It surfaces the SDK's protections (`maxSharePrice`, `minSharePrice`, LLTV buffer)
  as documented response fields the consumer can inspect.

## Dependencies

- `@morpho-org/morpho-sdk` — primary wrapped library.
- `@morpho-org/evm-simulation` — simulation + screening.
- `viem` ^2 — RPC client.
- `hono` (or chosen Node-compatible HTTP framework) for routing.
- `zod` + OpenAPI bridge for typed schemas.
- Tenderly account (optional, per chain) for the simulation backend.
- TIB-0001 (open-sourcing of `morpho-sdk`) — strict prerequisite, already in
  progress.

## Observability

- **Tracing:** OpenTelemetry spans per request: `handler → sdk → simulate →
  screen`. Trace context propagates to upstream RPCs via standard headers.
- **Metrics:** per-route request count, latency histogram (p50/p95/p99), error
  count by `code`, simulation cache hit rate, RPC upstream latency, OpenAPI spec
  fetch count.
- **Logs:** structured JSON with `request_id`, `idempotency_key`, `chainId`,
  `route`, `userAddress` (hashed), `sdkVersion`, `bundlerAddress`. Never log raw
  signatures, raw private input beyond what's necessary for replay.
- **Headers:** every response carries `X-Sdk-Version` (the exact `morpho-sdk` and
  `evm-simulation` versions used to build the response) so consumers can detect
  drift.
- **Dashboards:** Grafana board covering p95 latency, 4xx/5xx rate, top error
  codes, RPC failure rate per chain. Alert thresholds set after Phase 4 load test.

## Security

- **No keys, no signing, no broadcast.** Stated explicitly in `/v1/openapi.json`
  description and on the docs landing page.
- **Sanctioned-address screening** runs on every `preview: true` response via
  `screenAddresses`. Optional Chainalysis backing toggled via env. A
  `BlacklistViolationError` returns `409 Conflict` with `code: "ADDRESS_BLOCKED"`
  and the calldata is *not* included in the response — the service refuses to
  materialise transactions involving sanctioned addresses. Document explicitly that
  this screening is a defence-in-depth signal, not a legal guarantee.
- **Chain-ID confusion:** the service derives `chainId` from the URL path and
  passes it to both the viem client and the SDK; any mismatch in body fields is
  rejected. Each route response includes `transaction.chainId` so clients can
  verify before signing.
- **`userAddress = signer` invariant:** documented in OpenAPI schema. The SDK's
  `MissingClientPropertyError` and `AddressMismatchError` are surfaced as `400`
  with explanatory codes. Particular attention to `repayWithdrawCollateral` per
  the BUNDLER3.md pitfall — covered with a dedicated integration test.
- **Idempotency:** `Idempotency-Key` header. Responses are deterministic given
  identical `(request, blockNumber)`; replay is safe.
- **Replay protection:** every response includes `meta.blockNumber` and
  `meta.generatedAt`. EIP-712 typed data carries a `deadline`. Clients should
  reject responses older than a configurable freshness window.
- **Input validation:** Zod refusing unknown fields (`strict()`); bigint values
  accepted only as decimal strings; addresses parsed via viem `getAddress`
  (checksum-correct).
- **Rate limiting / DDoS:** delegated to the gateway. Service emits per-key
  metrics so the gateway can act.
- **Dependency supply chain:** all `@morpho-org/*` deps pinned to exact versions
  (per the open question raised in TIB-0001). Lockfile committed.
- **Audit:** Phase 4 includes an external review focused on parameter-coercion
  edge cases, the two-step signature flow, and chain-ID handling.

## Future Considerations

- **Read endpoints** (e.g. proxying `getPositionData` so the consumer doesn't need
  a viem client at all). Tempting, but blurs the boundary with the GraphQL Blue
  API; defer until there's clear demand.
- **Quote endpoints** (e.g. "what `minSharePrice` should I send for this
  borrow?") — small extension; could land in v1.1.
- **Bundling multiple actions per call** — only if the SDK gains a multi-entity
  bundle builder; today the API is one-action-per-call.
- **MCP server** wrapping the OpenAPI spec, so AI agents can call the API as
  native tool-use without OpenAPI plumbing.
- **Self-hostable distribution** as a Docker image consumers can run alongside
  their own infrastructure if they don't want to depend on a Morpho-hosted
  endpoint.
- **WebSocket transaction-status feed** if combined with broadcast support
  (would change the trust model — out of scope for v1).

## Open Questions

1. **Hosting model:** Morpho-hosted SaaS, self-hosted only (Docker image), or
   both? Affects auth design, infra ownership, SLAs.
2. **Auth model:** anonymous + per-IP rate limit, public API keys, or signed
   requests? Defaults differ for SaaS vs self-hosted.
3. **Versioning strategy:** URL prefix (`/v1/...`) only, or also a `Accept:
   application/vnd.morpho.v1+json` header? URL prefix is simpler; header is more
   conventional.
4. **Package and repo location:** new `packages/write-api/` in this monorepo, or
   a sibling repo (`morpho-org/write-api`)? Monorepo gives deterministic coupling
   to the SDK version; sibling repo gives independent release cadence.
5. **Whether to integrate the GraphQL Blue API for `positionData` / market
   metadata** so the consumer can pass just `{ userAddress, marketId }` and let
   the service fetch the position. Trades request brevity for an extra upstream
   dependency on the API's read path.
6. **TIB number reservation:** confirm `TIB-0002` is free repo-wide. (TIB-0001 is
   the only existing TIB in the imported `morpho-sdk` directory; if the numbering
   is per-package rather than repo-wide, this should be re-numbered.)

## References

- TIB-0001 — Open-Source consumer-sdk as @morpho-org/morpho-sdk v1.0.0
  (`packages/morpho-sdk/TIB/TIB-0001-open-source-morpho-sdk.md`)
- `packages/morpho-sdk/README.md` — entity / action surface
- `packages/morpho-sdk/ARCHITECTURE.md` — Client / Entity / Action layering and
  Bundler3 routing
- `packages/morpho-sdk/BUNDLER3.md` — `userAddress = signer` invariant pitfalls
- `packages/evm-simulation/README.md` — `simulate` + `screenAddresses` surface
- `packages/evm-simulation/src/types.ts` — `SimulationConfig`, `SimulateParams`,
  `SimulationResult`, error taxonomy
- Linear epic — _add when created_
- Discussion thread — _add when created_
