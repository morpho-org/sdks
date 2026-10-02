# Threat model

This file states what the Morpho SDKs defend against and what they deliberately trust. Read it before reporting a finding: a report whose only precondition is a trusted party misbehaving is out of scope unless it shows a check the SDK could make against an independent source.

## RPC

The SDKs trust every endpoint the integrator configures:

- the JSON-RPC node behind the viem client or WDK account, including deployless `eth_call` queries, multicall reads, `eth_getCode`, `eth_chainId` and `eth_sendRawTransaction`;
- the Tenderly and `eth_simulateV1` endpoints configured in `evm-simulation`;
- the ERC-4337 bundler and paymaster endpoints configured on the WDK account.

A dishonest endpoint can return any state that decodes correctly, and it can keep that state consistent across calls. A second read, a fallback path or a cross-check through the same endpoint therefore adds no evidence. Detecting forgery would need a source the endpoint does not control, such as a light client with storage proofs or several independently operated nodes. The SDKs include neither.

### What the SDK checks

The SDK does reject an RPC answer when it can compare it with something the RPC cannot forge:

- Fetched market params, including tuples cached from earlier reads, must hash to the requested `MarketId`, else `MarketParamsIdMismatchError`. The all-zero tuple of an uncreated market is accepted, so a lying RPC can hide a market but not swap it.
- In token-paymaster mode, WDK rejects a paymaster response whose paymaster differs from the configured `paymasterAddress`.
- Reads and sends go through the WDK account's own provider, so one transaction cannot be built on one chain and broadcast on another.

### Accepted gaps

The SDK could check these against a source the RPC cannot forge, but does not yet:

- In token-paymaster mode, the paymaster quote sizes the fee-token approval. `transactionMaxFee` would bound it, but it is optional and not enforced.
- The SDK returns the RPC's EOA hash as is. A `keccak256` check on the signed bytes would catch a swapped hash, but not a dropped transaction or a forged receipt.

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

#### `eth_simulateV1` responses and simulation chain (`evm-simulation`)

Backend output is the only execution evidence the retention check sees. Format checks catch clumsy lies, but a lying endpoint can return a clean, well-formed success.

- A `status: success` call with attached error data is treated as success.
- Omitted `logs` are treated as no transfers. The spec requires `logs` on every successful call.
- Incomplete ERC-20 logs hide retained tokens.
- A node that ignores `traceTransfers` hides native transfers.
- Malformed amount data can cancel a real residual. A node that forges data can omit the log instead.
- Native `assetChanges` and logs disagree. That needs contradictory output from the node.
- Reordered results shift effects between transactions. Only the endpoint controls the order.
- A result for a different request is accepted. Only the endpoint or a proxy in front of it can swap results.
- A truncated result fails with `ExternalServiceError`. A caller that bypasses it accepts an unsimulated bundle.
- A dropped adapter refund plus a lost fallback trace hides native residue. The refund is fixed; what remains is a node hiding the trace.
- A malicious token, not the endpoint, emits a fake `Transfer`. It is listed because the fix it proposes, reading balances from the node, adds nothing: a token that lies in its events can also lie in `balanceOf`.
- The endpoint serves another chain. A lying endpoint answers `eth_chainId` with the requested id. An honest endpoint on the wrong chain means the URL is set wrong, and the integrator owns that URL-to-chain mapping.
- Results carry no chain or block provenance. The caller chooses both.

#### Tenderly responses (`evm-simulation`)

Tenderly is a configured simulation endpoint, trusted like `eth_simulateV1`. When a response fails its schema, envelope or HTTP checks, the SDK re-simulates on `eth_simulateV1` if `simulateV1Url` is configured, and otherwise throws `ExternalServiceError`. Some optional fields are dropped or defaulted instead of rejected, as listed below.

- A malformed asset amount in a success response triggers the fallback or `ExternalServiceError`. Neither path uses the malformed evidence.
- An out-of-range `rawAmount` cancels native evidence. Only an endpoint that forges amounts emits one.
- A truncated bundle result becomes a bypassable `ExternalServiceError`. Bypassing it is the caller's choice to proceed unsimulated.
- Results are not correlated by JSON-RPC `id`. Separate responses mix only if the endpoint is compromised.
- A malformed or mixed revert envelope triggers the fallback or `ExternalServiceError`. The fallback re-simulates, so a real revert reverts again.
- A non-2xx body is treated as a service failure. Tenderly returns reverts with HTTP 200.
- Tenderly and fallback errors are each discarded. Both halves need non-compliant responses, and the fallback re-derives the revert.
- Partial native `assetChanges` rows hide inflows. The same endpoint writes the logs, so it can hide the transfer there too.
- Omitted `assetChanges` hide native flows. Omitting them for a value-moving bundle is malformed endpoint output.
- Omitted ERC-20 `assetChanges` become an empty ledger. ERC-20 retention reads `Transfer` logs, not `assetChanges`.
- Malformed log entries are dropped. An endpoint that forges logs could just as well omit them.
- An unexpected asset-change `type` cancels native evidence. Tenderly reports `Transfer`, `Mint` and `Burn`, and all three are normalized.
- A missing or zero `contractAddress` merges ERC-20 and native flows. Tenderly does not emit such rows.
- A success with no logs and no `assetChanges` is accepted. That is the real shape of a bundle that moves no value.
- A 206 or 207 reply is accepted as complete. Tenderly answers 200; other 2xx codes come from a proxy the integrator runs.
- Missing return data becomes `0x`, or non-root output becomes return data. No safety decision reads `returnData`.
- `assetChanges` are not reconciled with logs. Both come from the same endpoint.
- `status: true` with an error is treated as success. Only a non-compliant endpoint returns both.

#### Chain identity and transaction submission (`wdk-protocol-lending-morpho-evm`, `liquidity-sdk-viem`)

- A fork with the same chain id passes every check. A transaction signed against it is valid on the canonical chain, with bounds from forged state, so the risk is a lying RPC's; any check would ask the same endpoint.
- A provider reports chain A while serving chain B. Only the provider can answer `eth_chainId`.
- Failover to another backend with the same chain id is accepted. EIP-155 bytes are valid on every node of that chain.
- `LiquidityLoader` labels snapshots with `client.chain.id` while reading the transport's chain. This needs no lying endpoint, only a client paired with the wrong transport, and the integrator owns that pairing.
- A stale `block.timestamp` shortens the one-hour reallocation horizon. The same node supplies the caps and balances that horizon protects.

## Integrator inputs and the address registry

The SDK trusts the inputs its integrator passes in and the configuration it registers. It does not
treat an attacker-chosen value supplied by the integrator as a vulnerability.

- **Client and chain pairing.** Entities and actions check that the viem client reports the chain
  they were asked to build for (`ChainIdMismatchError`). They cannot detect a client whose transport
  points at a different network than the chain it declares; that falls under [RPC](#rpc).
- **Addresses passed as arguments.** Vault, market, receiver and `userAddress` values are used as
  given; choosing them is the integrator's responsibility.
- **Address registry.** Per-chain contract addresses ship in `@morpho-org/morpho-ts`.
  `registerCustomAddresses` adds entries for new chains or missing periphery, rejects malformed or
  wrongly checksummed addresses, and refuses to override an existing entry
  (`RegistryValueAlreadyRegisteredError`). Addresses an integrator registers are part of its trusted
  configuration. A wrong address in the shipped registry is in scope; see
  [`SECURITY.md`](./SECURITY.md#scope).
