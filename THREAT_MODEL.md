# Threat model

This file states what the Morpho SDKs defend against and what they deliberately trust. Read it before reporting a finding: a report whose only precondition is a trusted party misbehaving is out of scope unless it shows a check the SDK could make against an independent source.

## RPC

The SDKs trust every endpoint the integrator configures:

- the JSON-RPC node behind the viem client or WDK account, including deployless `eth_call` queries, multicall reads, `eth_getCode`, `eth_chainId` and `eth_sendRawTransaction`;
- the `eth_simulateV1` endpoint configured in `evm-simulation`;
- the ERC-4337 bundler and paymaster endpoints configured on the WDK account.

A dishonest endpoint can return any state that decodes correctly, and it can keep that state consistent across calls. A second read, a fallback path or a cross-check through the same endpoint therefore adds no evidence. Detecting forgery would need a source the endpoint does not control, such as a light client with storage proofs or several independently operated nodes. The SDKs include neither.

### What the SDK checks

The SDK does reject an RPC answer when it can compare it with something the RPC cannot forge:

- Fetched market params, including tuples cached from earlier reads, must hash to the requested `MarketId`, else `MarketParamsIdMismatchError`. The all-zero tuple of an uncreated market is accepted, so a lying RPC can hide a market but not swap it.
- In token-paymaster mode, WDK rejects a paymaster response whose paymaster differs from the configured `paymasterAddress`.
- Reads and sends go through the WDK account's own provider, so one transaction cannot be built on one chain and broadcast on another.
- Token metadata reads fail closed: transport failures that `isTransportError` recognizes (timeouts, rate limits, socket errors, HTTP 408/429/5xx) and JSON-RPC errors that are not revert-shaped propagate instead of being silently defaulted, an absent or out-of-range `decimals()` read throws `UnknownTokenError` rather than returning `0`, and only `name`/`symbol`/`eip712Domain` stay optional, only when the call reverts or the contract has no code — malformed `eip712Domain()` or `bytes32` results throw `MalformedTokenMetadataError`. A permit is never signed against an unknown domain name — `getPermitTypedData` throws `MissingPermitDomainNameError` when neither `name()` nor `eip712Domain()` answers.
- An honest endpoint connected to another chain is rejected. `morpho-sdk` entity reads and requirement resolvers each send their own `eth_chainId` request (never cached; nested resolvers in one `getRequirements()` send one each) and throw `ChainIdMismatchError` before their own state reads. Guarded Blue, VaultV1 and VaultV2 `getRequirements()` normally read `eth_getCode` for each registry target first; VaultV1 `inKindRedeem` and VaultV2 `inKindRedeem` / `forceWithdraw` instead validate the client chain first. These guarded flows probe `eth_chainId` when a target has no code, so a wrong-chain endpoint still throws `ChainIdMismatchError` rather than `MissingContractCodeError`; the resolvers' own chain-ID check runs before allowance and nonce reads; WDK rechecks `eth_chainId` before signing and broadcasting; `simulate()` turns a failure from such an endpoint into the non-bypassable `InvalidChainIdError`. The `chaos: S5 wrong chain` tests cover these paths.

### Accepted gaps

The SDK could check these against a source the RPC cannot forge, but does not yet:

- In token-paymaster mode, the paymaster quote sizes the fee-token approval. `transactionMaxFee` would bound it, but it is optional and not enforced.
- Token metadata: an RPC can make `name`, `symbol` or `eip712Domain` look absent, and make `decimals()` throw `UnknownTokenError`, by answering with a revert-shaped error — a data-less `-32000 "execution reverted"`, including one inside a well-formed JSON-RPC body on a 5xx response, where viem drops the HTTP status. It cannot produce `decimals: 0`. Telling this apart from a genuinely missing method would need a second source.
- The SDK checks that the RPC's EOA hash is a 32-byte hex value but does not compare it with the signed bytes. A `keccak256` comparison would catch a swapped hash, but not a dropped transaction or a forged receipt.

With a single provider, or a provider array configured with `retries: 0`, an unrecognized send error (`UnknownRpcError`) is rethrown as is and delivery is unknown: the transaction may have reached the node. The error exposes neither the signed transaction nor its local hash, so reconcile using the sender's account nonce and pending transactions before retrying.

### Out of our threat model

Each finding below requires the endpoint to lie, unless its entry names another precondition. Mitigating it would require trusting or independently verifying another source of truth.

#### Vault accounting read by deployless queries (`blue-sdk-viem`)

Each value comes from the same `eth_call` that returns the vault it describes. The signed slippage or allowance bound is only as honest as that call.

- A stale `lastUpdate` widens the Vault V2 deposit `maxSharePrice`.
- A raised `maxRate` widens the deposit `maxSharePrice`.
- Understated performance and management fees hide share dilution in deposit pricing.
- A lowered nested V1 `decimalsOffset` overvalues nested shares.
- A lowered nested V1 `totalSupply` inflates modeled assets.
- An inflated nested `lostAssets` inflates Vault V2 accrual.
- Forged fee-recipient eligibility changes the fee shares used in deposit pricing.
- A forged nested `vaultV1Shares` overstates nested assets. Re-reading `balanceOf(adapter)` would ask the same node.
- Inflated `_totalAssets` and `assetBalance` widen the deposit bound.
- An inflated nested `lastTotalAssets` suppresses fee dilution.
- A lowered nested V1 `fee` suppresses fee-share dilution.
- A forged adapter-market `rateAtTarget` widens the deposit bound. Any in-range value is a valid rate, so range checks cannot catch it.
- Spoofed `totalSupply` and `virtualShares` inflate the exact-asset withdrawal allowance.
- An overstated `assetBalance` with understated `virtualShares` widens `maxSharePriceE27`.
- A forged market tuple with forged root share scalars widens asset withdrawals.
- A lowered `_totalAssets` widens the exact-asset withdrawal share allowance.
- Forged fee rates and fee-recipient flags inflate the withdrawal share allowance.
- A lowered `totalSupply` widens the deposit `maxSharePrice`.
- A lowered `virtualShares` widens the deposit `maxSharePriceE27`, and a raised one widens the exact-asset withdrawal allowance.
- A lowered V1 `fee` widens the deadline deposit bound.
- A duplicated `withdrawQueue` id plus a lowered `totalSupply` weakens deposit pricing. MetaMorpho rejects duplicate queue ids (`DuplicateMarket`), so only a forged response has one.
- A forged `market(id)` tuple plus a failed nested `lostAssets()` widens asset withdrawals. A v1.1 vault only "fails" that read if the node returns selective errors.
- A failed nested `lostAssets()` plus a forged adapter IRM read undercounts the withdrawal allowance. The SDK tolerates that revert only because pre-v1.1 vaults lack the function.
- A failed nested `lostAssets()` combined with an understated `assetBalance` or forged `virtualShares` widens withdrawals.
- A forged scalar or market tuple, combined with an omitted adapter IRM or fee-share leg, widens withdrawals or in-kind redemptions. The forged read is what makes each exploitable.
- An omitted nested allocation plus a forged `assetBalance` or `totalSupply` widens the deposit price guard. The allocation is now read; the forged read remains.
- A poisoned Vault V2 accounting cap plus the ERC-4337 fee-token approval. The accounting read is out of scope; the approval is the fee-cap gap under "Accepted gaps".

#### Adapter, market-list and identity binding (`blue-sdk-viem`)

The "expected" identity each finding proposes to check (adapter list, market ids, factory membership) is read from the same node that supplied the data.

- `liquidityAdapterInfo` is not rebound to `liquidityAdapter`. Both fields come from one response.
- Adapter allocations are not bound to the adapter's market list, which is read in the same response.
- A legacy-adapter tuple and its nested market describe different markets.
- A forged `adapterType` relabels an adapter. Factory membership would be re-read from the same node.
- A V1 vault has no independent factory-membership read. Any read would go to the same node.
- Duplicate allocations double-count supply shares. The deployed adapter keeps `marketIds` unique, so only a forged response repeats one.
- Extra or foreign adapters are not matched against `adapters(i)`, which the same node answers.
- Truncated liquidity-cap arrays overstate `maxDeposit`.
- A foreign `marketParamsList(i)` row is valued as the adapter's own.
- A wrong factory classification picks the wrong adapter decoder. Factory membership is read from the same node.
- A forged `isAllocator` bit authorizes a custom allocator.
- A truncated inner market list drops a funded market.
- A forged `supplyShares` in the accrual query resizes the reallocation. Binding the allocator query to that snapshot would not help, because the same node answers both.
- A foreign nested V1 vault plus an omitted parent allocation weakens deposit pricing. The allocation is now read; the foreign vault needs a forged read.
- A shortened `adaptersLength()` in the sequential fallback omits funded adapters.
- Repeated adapter entries double-count, or point planning at the wrong adapter.
- An omitted adapter market combined with an understated balance or fee-share count widens withdrawals.
- Adapter queries return no adapter identity, so foreign state cannot be told from the requested adapter's.
- `GetVaultV2.query` returns no identity the node cannot also forge.
- `morphoVaultV1()` is immutable, so a different nested vault can only come from a forged read.
- Unlike the market-params check above, the market id is itself taken from the adapter's list in the same response, so there is no caller commitment to check.
- Response-supplied cap ids bind the wrong cap tuple.
- The allocator `(canPullFromIdle, penalty)` tuple has no vault identity to bind.

#### Vault V1 queues and allocations (`blue-sdk-viem`)

- A truncated `withdrawQueue` understates `totalAssets`. The fallback reads the same queue from the same node.
- MetaMorpho reverts `updateWithdrawQueue` with `DuplicateMarket`, so a duplicated id requires a forged response.
- A foreign `position()` tuple is labeled as the vault's allocation. `position()` has no vault identity to check.
- Forged market-config caps produced invalid V1 reallocations. That planner was removed, so this no longer applies.

#### Market state (`blue-sdk-viem`)

- `market(id)` returns totals, fee and `lastUpdate` with no identity. Unlike params, nothing hashes back to `id`.
- A forged oracle `price()` changes health and price floors. The oracle is only reachable through the node.
- A forged `rateAtTarget` inflates V1 source withdrawal capacity. Any value within `MIN_RATE_AT_TARGET`..`MAX_RATE_AT_TARGET` is a valid rate, so range checks cannot catch it.
- A false `market(id)`, `assetBalance` or `liquidityData` weakens the Vault V2 force-withdraw price floor.

#### Point reads in prepared flows (`morpho-sdk`, `midnight-sdk`)

- A forged `allowance()` skips the approval requirement. The SDK can learn the allowance only from the node.
- `asset()` answers differently on two calls. An honest node cannot change an immutable asset.
- A forged `feeRecipient()` suppresses `VaultIsBlueFeeRecipientError` for an in-kind exit.
- Forged `eth_getCode` suggests a `Setter` ratifier. The caller still chooses the ratifier on `Offer.create`.
- A forged Vault V2 snapshot inflates share authority for an in-kind target. It also needs an attacker-registered `vaultExitBundlesV1` address in the integrator's own registry.

#### `eth_simulateV1` responses (`evm-simulation`)

The sole simulation backend: no fallback, no retry. Backend output is trusted as execution evidence — a well-formed forged result is not detectable; the checks below catch non-compliant endpoints and inconsistent block responses (a reorg of the pinned block and a wrong-chain endpoint are accepted residuals, below) — a dishonest endpoint can pass them all with a consistent forged response.

- The state block is pinned once: looked up from `blockNumber` (default `latest`) or supplied by the caller as `block`. It is not re-fetched after the simulation, so a reorg that replaces the pinned block mid-flight is not detected; this residual is accepted. A supplied `block` is not checked against the endpoint beyond the `parentHash` and timestamp checks below, so a wrong supplied hash passes on a same-height response, and on any response when `parentHashCheck` is off.
- The reported block must be the pinned block or its immediate successor, and a successor must carry `parentHash === stateBlockHash` unless `ChainSimulationConfig.parentHashCheck` is `false` (the default on Stable, 988, whose nodes report a `parentHash` that never matches the pinned block); anything else is `InvalidSimulationResponseError`. A simulated block whose timestamp is earlier than the pinned state block's is rejected the same way. A same-height response (Anvil re-hashes the pinned block) is tied to the pinned state only by number and timestamp: its `parentHash` is the pinned block's own parent either way, so it cannot distinguish execution on block N's state from execution on N-1's; this residual is accepted. With `parentHashCheck` off, a successor block is likewise tied to the pinned state only by block number and timestamp; this weaker binding is accepted for chains whose nodes cannot report a matching `parentHash`.
- A call-count mismatch is a non-bypassable `InvalidSimulationResponseError`.
- Before `eth_simulateV1` is sent, every distinct transaction `to` carrying calldata is checked for
  code at the pinned state block (`eth_getCode`); a code-less target is a
  `SimulationValidationError` naming `transactions[i].to`, because a call to an empty address would
  simulate as a silent success. Value-only transfers to EOAs stay allowed, and a `to` deployed by an
  earlier transaction in the same batch has no code at the state block and is rejected — both are
  product decisions. A node that lies about `eth_getCode` (reports code for an empty address, or the
  reverse) falls under the lying-node residual: the SDK reads code only from its endpoint.
- A target holding *unexpected* code (e.g. a token's runtime copied onto the bundler) can execute a
  call as a no-op success that nothing in the code check or execution catches; simulation exposes it
  only through the caller's declared `limits` (slippage/outcome verification). Without declared
  limits this is an accepted residual.
- Transport failures, timeouts, HTTP error statuses and JSON-RPC errors become `RpcTransportError` (`RPC_TRANSPORT_ERROR`, original viem error as `cause`); like every other rejection it withholds the transaction, and there is no bypass.
  An HTTP error status stays `RpcTransportError` unless its body is a well-formed JSON-RPC error, which is classified by its code and message as under a 2xx status (so a 500 carrying `execution reverted` is a `SimulationRevertedError`).
  A plain-text body never becomes a `SimulationRevertedError`, whatever its wording: it stays `RpcTransportError` (`InvalidSimulationResponseError` under a 2xx), unless it reads as a chain-ID rejection, which is the non-bypassable `InvalidChainIdError`. For a quoted-asset metadata `eth_call`, viem's HTTP transport wraps an unparsable non-JSON 2xx body in `HttpRequestError`; `resolveAssets` detects that cause and reports `RpcTransportError`.
  When several `eth_getCode` reads fail, a non-transport failure wins over an outage.
  A malformed answer is not always an outage: a 2xx body that is not JSON (including one truncated mid-JSON) is rejected as `InvalidSimulationResponseError`.
  A bare JSON `null` from `eth_getBlock*` or `eth_getCode` is also rejected that way; other valid JSON bodies without an RPC result follow the action's missing-state path: block lookup remains `RpcTransportError`, while a code-less calldata target becomes `SimulationValidationError`.
  A valid JSON body that is not a JSON-RPC object from `eth_simulateV1` is rejected as `InvalidSimulationResponseError`.
  An `eth_getBlock*` reply without a `result` reads as a missing block, which a lagging node also returns, so it stays `RpcTransportError`.
  A node-level revert (code 3, or an `execution reverted` / `VM execution error` message under any code) becomes `SimulationRevertedError`, never `RpcTransportError`.
  Only the `eth_simulateV1` block envelope (number, timestamp, hash, `calls` array) is structurally checked and rejected as `InvalidSimulationResponseError`, and a per-call value that fails normalization (a non-quantity `gasUsed`, a present but non-array `logs`, or a log whose `topics` (each must be 32 bytes), `address` or `data` are malformed) is rejected the same way; other per-call fields are trusted: a malformed value from a non-compliant node may be read as a revert (any `status` other than `"0x1"`) or pass through unchecked. An absent or `null` per-call `logs` is treated as no transfers, so a node that drops `logs` hides retained tokens.
- Calls run with `validation: false` (gas is not charged) and `traceTransfers: true` so native-ETH moves appear as transfer logs; no `stateOverrides` are injected.
- Reordered results shift effects between transactions. Only the endpoint controls the order.
- Incomplete or forged ERC-20 logs hide retained tokens; a node that ignores `traceTransfers` hides native transfers.
- A forged `status`/`returnData` shapes the reported outcome; no check can tell it from a real one.
- A result for a different request is accepted. Only the endpoint or a proxy in front of it can swap results.
- A truncated result (fewer calls than planned) is a non-bypassable `InvalidSimulationResponseError`.
- A malicious token, not the endpoint, emits a fake `Transfer`. Reading balances from the node adds nothing: a token that lies in its events can also lie in `balanceOf`.
- The endpoint serves another chain. A successful simulation sends no `eth_chainId` lookup; instead every simulated call carries the request's `chainId`, and geth rejects a call chain ID that differs from its own chain. That rejection (geth, Anvil, Monad and Stable all check it) surfaces as the non-bypassable `InvalidChainIdError`. A wrong-chain endpoint can also fail without a chain-ID rejection: the block lookup or a metadata read returns "block not found" for a block that does not exist on that chain, and with a supplied `block` or `blockNumber` above that chain's head `eth_simulateV1` itself can return "header not found" while resolving the base block, before checking the per-call `chainId`. A quoted market or vault that does not exist on the served chain fails asset resolution with `SlippageCheckUnavailableError`; so does a failed planned state read reported by `executePlan`'s response parser. A calldata target with no code on the served chain fails the contract-code check with `SimulationValidationError`. After such an `RpcTransportError`, `SlippageCheckUnavailableError` or `SimulationValidationError` the pipeline sends one `eth_chainId` request, and an endpoint that reports another chain turns the failure into `InvalidChainIdError`; if that request fails or reports the requested chain, the original error stands. An endpoint that ignores the field, lies about `eth_chainId` or lies about execution can still simulate against the wrong state; trusting the endpoint remains an accepted residual.
- Results carry no block provenance: the pinned state block is resolved and checked internally but not returned on `SimulationResult`; callers that need a reproducible pin must pass an explicit `blockNumber` or `block`.

#### Chain identity and transaction submission (`wdk-protocol-lending-morpho-evm`, `liquidity-sdk-viem`)

- A fork with the same chain id passes every check. A transaction signed against it is valid on the canonical chain, with bounds from forged state, so the risk is a lying RPC's; any check would ask the same endpoint.
- A provider reports chain A while serving chain B. Only the provider can answer `eth_chainId`. The `morpho-sdk` test `accepted residual: provider lying about eth_chainId` pins this: such a client is not rejected with `ChainIdMismatchError`.
- Failover to another backend with the same chain id is accepted. EIP-155 bytes are valid on every node of that chain.
- `LiquidityLoader` labels snapshots with `client.chain.id` while reading the transport's chain. This needs no lying endpoint, only a client paired with the wrong transport, and the integrator owns that pairing.
- A stale `block.timestamp` shortens the one-hour reallocation horizon. The same node supplies the caps and balances that horizon protects.

## Midnight API

`midnight-sdk`'s `MidnightApi` client trusts the Midnight API endpoint the integrator configures, and the `morpho-sdk` Midnight take flows trust the quotes built from it. The API chooses which offers to return, in what order, and how many units of each it says are still takeable. Like an RPC, it can keep a forged view consistent across calls.

The API cannot change an offer's terms. When the take executes, Midnight checks that the maker authorized the offer's ratifier and that the ratifier accepts the offer, then applies the offer's own expiry, price and cap. A forged quote can make one offer fill less or fail, but cannot fill an offer beyond its terms. What bounds the taker's result onchain is the target bound the caller passes to the Midnight Bundles V2 call (`minUnits`, `maxUnits`, `maxBuyerAssets` or `minSellerAssets`), not the quote.

### What the SDK checks

- Book market params must hash to their returned ids; single-book requests also match the requested id, and book-list results satisfy requested filters. Each returned offer's market id is checked against its embedded market. Book quotes and book takeable-offer responses are bound to the requested market and side, and the general takeable-offer route enforces requested maker, market and group filters; mismatches raise `InvalidMidnightApiResponseError`.
- Each takeable offer must be executable: `receiverIfMakerIsSeller` is an address, and its caps pass `OfferUtils.validateOfferCaps`.
- A takeable offer's `units` cannot exceed the offer's own `maxUnits` when the offer is capped in units.
- When `fetchBookQuote` is given `averageWorstPrice` or `slippage`, it recomputes the average price of the returned offers from the offers' own ticks and rejects a quote outside the guard. With an explicit `averageWorstPrice`, the returned `averageWorstPrice` is the caller's guard, so a bound derived from it is the one the SDK checked.

### Accepted gaps

The SDK could check these without trusting the API, but does not yet:

- For an offer capped in assets (`maxAssets`), the units implied by that cap are not compared with the returned `units`.

### Out of our threat model

Each item below requires the API to lie. Checking it would need a source the API does not control, such as an RPC read of each offer's consumed amount or an independent copy of the book.

- The API claims more units than remain on an offer, because part of it was already consumed onchain. The quote then looks deeper than it is. The bundle takes only what remains on that offer and moves on to the next one, so the fill can come from worse offers, but it stays within the caller's target bound or the call reverts.
- The API omits better offers or returns them out of order. The SDK cannot see the full book, so the quote can be worse than the best available, but never worse than the caller's guard.
- In `slippage` mode, the API sets both the reference price and the guard. Callers that need a guard the API does not set pass `averageWorstPrice` instead.
- `averageBestPrice`, `availableAssets` and `availableUnits` are returned as the API reports them. Size target bounds from the caller's own target and guard, not from these fields.

## Integrator inputs and the address registry

The SDK trusts the inputs its integrator passes in and the configuration it registers. It does not
treat an attacker-chosen value supplied by the integrator as a vulnerability.

- **Client and chain pairing.** Entities and actions check that the viem client declares the chain
  they were asked to build for (`ChainIdMismatchError`). Entity reads and requirement resolvers also
  ask the transport for `eth_chainId`, so a client whose honest transport points at another network
  fails before their allowance, nonce or position reads. Guarded `getRequirements()` flows read
  `eth_getCode` for their registry targets first and probe `eth_chainId` only when a target has no
  code, so such a client still fails with `ChainIdMismatchError`. Synchronous builders (`buildTx`) check only the declared chain; their
  inputs come from those reads. VaultV1 `inKindRedeem` and VaultV2 `inKindRedeem` /
  `forceWithdraw` validate the client chain before their code checks. A transport that lies about
  `eth_chainId` falls under [RPC](#rpc).
- **Addresses passed as arguments.** Vault, market, receiver and `userAddress` values are used as
  given; choosing them is the integrator's responsibility.
- **Address registry.** Per-chain contract addresses ship in `@morpho-org/morpho-ts`.
  `registerCustomAddresses` adds entries for new chains or missing periphery, rejects malformed or
  wrongly checksummed addresses, and refuses to override an existing entry
  (`RegistryValueAlreadyRegisteredError`). Addresses an integrator registers are part of its trusted
  configuration. A wrong address in the shipped registry is in scope; see
  [`SECURITY.md`](./SECURITY.md#scope). Every Blue, VaultV1 and VaultV2 write's `getRequirements()`
  verifies the fixed bundles contract (and Permit2 or Blue when the flow touches them) holds code at
  its registered address, rejecting a code-less entry as `MissingContractCodeError` before planning
  any calldata that would no-op onchain; `buildTx` alone stays unchecked. On both the entity and the
  simulation side, a wrong-chain endpoint surfaces as `ChainIdMismatchError` / `InvalidChainIdError`
  before these missing-code errors. An entry that holds
  *unexpected* code — the wrong contract at the right address — passes this check and is caught only
  by simulation reverts or identity reads; that residual is accepted.
