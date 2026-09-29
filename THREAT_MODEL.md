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

- **SDKS-136** (SDK-619, SDK-1153), **SDKS-623** (SDK-726), and the cached-tuple compositions **SDKS-827** (SDK-730), **SDKS-811** (SDK-775), **SDKS-856** (SDK-804), **SDKS-523** (SDK-938): fetched market params must hash to the requested `MarketId`, else `MarketParamsIdMismatchError`. The all-zero tuple of an uncreated market is accepted, so a lying RPC can hide a market but not swap it.
- **SDKS-69** (SDK-504, SDK-1127): in token-paymaster mode, WDK rejects a paymaster response whose paymaster differs from the configured `paymasterAddress`.
- **SDKS-455** (SDK-639), **SDKS-542** (SDK-640), **SDKS-726** (SDK-657): token-paymaster mode requires `transactionMaxFee`, which bounds the fee-token approval that the paymaster quote sizes.
- **SDKS-169** (SDK-452, SDK-1248): reads and sends go through the WDK account's own provider, so one transaction cannot be built on one chain and broadcast on another.

### Accepted gaps

The SDK could check these against a source the RPC cannot forge, but does not yet:

- **SDKS-493** (SDK-771): the SDK returns the RPC's EOA hash as is. A `keccak256` check on the signed bytes would catch a swapped hash, but not a dropped transaction or a forged receipt.

### Out of our threat model

Each finding below requires the endpoint to lie, unless its entry names another precondition. Mitigating it would require trusting or independently verifying another source of truth. Cantina ids come first; Linear ids follow in parentheses.

#### Vault accounting read by deployless queries (`blue-sdk-viem`)

Each value comes from the same `eth_call` that returns the vault it describes. The signed slippage or allowance bound is only as honest as that call.

- **SDKS-3** (SDK-382): a stale `lastUpdate` widens the Vault V2 deposit `maxSharePrice`.
- **SDKS-4** (SDK-383), **SDKS-812** (SDK-899): a raised `maxRate` widens the deposit `maxSharePrice`.
- **SDKS-6** (SDK-385): understated performance and management fees hide share dilution in deposit pricing.
- **SDKS-7** (SDK-386): a lowered nested V1 `decimalsOffset` overvalues nested shares.
- **SDKS-11** (SDK-390): a lowered nested V1 `totalSupply` inflates modeled assets.
- **SDKS-14** (SDK-393): an inflated nested `lostAssets` inflates Vault V2 accrual.
- **SDKS-33** (SDK-412): forged fee-recipient eligibility changes the fee shares used in deposit pricing.
- **SDKS-48** (SDK-427): a forged nested `vaultV1Shares` overstates nested assets. Re-reading `balanceOf(adapter)` would ask the same node.
- **SDKS-50** (SDK-429): inflated `_totalAssets` and `assetBalance` widen the deposit bound.
- **SDKS-163** (SDK-446): an inflated nested `lastTotalAssets` suppresses fee dilution.
- **SDKS-165** (SDK-448): a lowered nested V1 `fee` suppresses fee-share dilution.
- **SDKS-186** (SDK-469): a forged adapter-market `rateAtTarget` widens the deposit bound. Any in-range value is a valid rate, so range checks cannot catch it.
- **SDKS-836** (SDK-678): spoofed `totalSupply` and `virtualShares` inflate the exact-asset withdrawal allowance.
- **SDKS-779** (SDK-757): an overstated `assetBalance` with understated `virtualShares` widens `maxSharePriceE27`.
- **SDKS-825** (SDK-817): a forged market tuple with forged root share scalars widens asset withdrawals.
- **SDKS-863** (SDK-897): a lowered `_totalAssets` widens the exact-asset withdrawal share allowance.
- **SDKS-786** (SDK-898): forged fee rates and fee-recipient flags inflate the withdrawal share allowance.
- **SDKS-808** (SDK-900): a lowered `totalSupply` widens the deposit `maxSharePrice`.
- **SDKS-795** (SDK-901): a lowered `virtualShares` widens the deposit `maxSharePriceE27`, and a raised one widens the exact-asset withdrawal allowance.
- **SDKS-814** (SDK-896): a lowered V1 `fee` widens the deadline deposit bound.
- **SDKS-840** (SDK-758): a duplicated `withdrawQueue` id plus a lowered `totalSupply`. MetaMorpho rejects duplicate queue ids (`DuplicateMarket`), so only a forged response has one.
- **SDKS-789** (SDK-738): a forged `market(id)` tuple plus a failed nested `lostAssets()`. A v1.1 vault only "fails" that read if the node returns selective errors.
- **SDKS-775** (SDK-743): the same `lostAssets()` failure plus the adapter IRM leg. The SDK tolerates that revert only because pre-v1.1 vaults lack the function.
- **SDKS-783** (SDK-831), **SDKS-784** (SDK-832): the `lostAssets()` failure combined with an understated `assetBalance` or forged `virtualShares`.
- **SDKS-853** (SDK-740), **SDKS-778** (SDK-742), **SDKS-854** (SDK-741): combine a forged scalar or positional tuple with the adapter IRM or `canReceiveShares` leg. The forged leg is what makes each one exploitable.
- **SDKS-788** (SDK-739), **SDKS-837** (SDK-762): the omitted parent `allocation()` leg is handled on `main`. What remains is a forged `assetBalance` or `totalSupply`.
- **SDKS-857** (SDK-848): the forged accounting leg is out of scope. The paymaster leg is bounded by the mandatory `transactionMaxFee` (SDKS-455).

#### Adapter, market-list and identity binding (`blue-sdk-viem`)

The "expected" identity each finding proposes to check (adapter list, market ids, factory membership) is read from the same node that supplied the data.

- **SDKS-17** (SDK-396), **SDKS-777** (SDK-720): `liquidityAdapterInfo` is not rebound to `liquidityAdapter`. Both fields come from one response.
- **SDKS-26** (SDK-405): adapter allocations are not bound to the adapter's market list, which is read in the same response.
- **SDKS-27** (SDK-406): a legacy-adapter tuple and its nested market describe different markets.
- **SDKS-51** (SDK-430): a forged `adapterType` relabels an adapter. Factory membership would be re-read from the same node.
- **SDKS-54** (SDK-433): a V1 vault has no independent factory-membership read. Any read would go to the same node.
- **SDKS-55** (SDK-434), **SDKS-656** (SDK-935): duplicate allocations double-count supply shares. The deployed adapter keeps `marketIds` unique, so only a forged response repeats one.
- **SDKS-56** (SDK-491), **SDKS-672** (SDK-760): extra or foreign adapters are not matched against `adapters(i)`, which the same node answers.
- **SDKS-58** (SDK-493), **SDKS-709** (SDK-971): truncated liquidity-cap arrays overstate `maxDeposit`.
- **SDKS-179** (SDK-462): a foreign `marketParamsList(i)` row is valued as the adapter's own.
- **SDKS-182** (SDK-465): a wrong factory classification picks the wrong adapter decoder. Factory membership is read from the same node.
- **SDKS-199** (SDK-482): a forged `isAllocator` bit authorizes a custom allocator.
- **SDKS-716** (SDK-761): a truncated inner market list drops a funded market.
- **SDKS-810** (SDK-763): a forged `supplyShares` in the accrual query resizes the reallocation. Binding the allocator query to that snapshot would not help, because the same node answers both.
- **SDKS-861** (SDK-797): a foreign nested V1 vault with an omitted parent allocation. The allocation leg is handled on `main`.
- **SDKS-762** (SDK-870): a shortened `adaptersLength()` in the sequential fallback omits funded adapters.
- **SDKS-658** (SDK-871), **SDKS-649** (SDK-974): repeated adapter entries double-count, or point planning at the wrong adapter.
- **SDKS-782** (SDK-895), **SDKS-805** (SDK-919): an omitted adapter market combined with an understated balance or fee-share count.
- **SDKS-428** (SDK-926): adapter queries return no adapter identity, so foreign state cannot be told from the requested adapter's.
- **SDKS-432** (SDK-930): `GetVaultV2.query` returns no identity the node cannot also forge.
- **SDKS-732** (SDK-936): `morphoVaultV1()` is immutable, so a different nested vault can only come from a forged read.
- **SDKS-422** (SDK-969): unlike SDKS-136, the market id is itself taken from the adapter's list in the same response, so there is no caller commitment to check.
- **SDKS-388** (SDK-970): response-supplied cap ids bind the wrong cap tuple.
- **SDKS-426** (SDK-1052): the allocator `(canPullFromIdle, penalty)` tuple has no vault identity to bind.

#### Vault V1 queues and allocations (`blue-sdk-viem`)

- **SDKS-84** (SDK-584, SDK-1148), **SDKS-771** (SDK-759): a truncated `withdrawQueue` understates `totalAssets`. The fallback reads the same queue from the same node.
- **SDKS-668** (SDK-911): MetaMorpho reverts `updateWithdrawQueue` with `DuplicateMarket`, so a duplicated id requires a forged response.
- **SDKS-866** (SDK-799), **SDKS-511** (SDK-1048): a foreign `position()` tuple is labeled as the vault's allocation. `position()` has no vault identity to check.
- **SDKS-413** (SDK-1032): obsolete. The V1 reallocation planner that trusted forged caps was removed.

#### Market state (`blue-sdk-viem`)

- **SDKS-434** (SDK-789): `market(id)` returns totals, fee and `lastUpdate` with no identity. Unlike params, nothing hashes back to `id`.
- **SDKS-20** (SDK-399): a forged oracle `price()` changes health and price floors. The oracle is only reachable through the node.
- **SDKS-166** (SDK-449): a forged `rateAtTarget` inflates V1 source withdrawal capacity. Any value within `MIN_RATE_AT_TARGET`..`MAX_RATE_AT_TARGET` is a valid rate, so range checks cannot catch it.
- **SDKS-793** (SDK-785), **SDKS-872** (SDK-807), **SDKS-833** (SDK-929): a false `market(id)`, `assetBalance` or `liquidityData` weakens the Vault V2 force-withdraw price floor.

#### Point reads in prepared flows (`morpho-sdk`, `midnight-sdk`)

- **SDKS-657** (SDK-851): a forged `allowance()` skips the approval requirement. The SDK can learn the allowance only from the node.
- **SDKS-828** (SDK-852): `asset()` answered differently on two calls. An honest node cannot change an immutable asset.
- **SDKS-648** (SDK-1082): a forged `feeRecipient()` suppresses `VaultIsBlueFeeRecipientError` for an in-kind exit.
- **SDKS-436** (SDK-801): forged `eth_getCode` suggests a `Setter` ratifier. The caller still chooses the ratifier on `Offer.create`.
- **SDKS-157** (SDK-440): needs both a forged snapshot and an attacker-registered `vaultExitBundlesV1` address in the integrator's own registry.

#### `eth_simulateV1` responses and simulation chain (`evm-simulation`)

Backend output is the only execution evidence the retention check sees. Format checks catch clumsy lies, but a lying endpoint can return a clean, well-formed success.

- **SDKS-19** (SDK-398, SDK-1214), **SDKS-569** (SDK-975): a `status: success` call with attached error data is treated as success.
- **SDKS-171** (SDK-454): omitted `logs` are treated as no transfers. The spec requires `logs` on every successful call.
- **SDKS-555** (SDK-684): incomplete ERC-20 logs hide retained tokens.
- **SDKS-112** (SDK-603, SDK-1151), **SDKS-583** (SDK-778): a node that ignores `traceTransfers` hides native transfers.
- **SDKS-73** (SDK-508, SDK-1213): malformed amount data can cancel a real residual. A node that forges data can omit the log instead.
- **SDKS-572** (SDK-671): native `assetChanges` and logs disagree. That needs contradictory output from the node.
- **SDKS-77** (SDK-578, SDK-1163), **SDKS-558** (SDK-876): results reordered to shift effects between transactions.
- **SDKS-801** (SDK-782): a result for a different request is accepted. Only the endpoint or a proxy in front of it can swap results.
- **SDKS-15** (SDK-394): a truncated result fails with `ExternalServiceError`. A caller that bypasses it accepts an unsimulated bundle.
- **SDKS-543** (SDK-783): the dropped native refund was fixed separately (SDK-798). The remaining leg is a node hiding the trace.
- **SDKS-498** (SDK-865): a malicious token, not the endpoint, emits a fake `Transfer`. It is listed because the fix it proposes, reading balances from the node, adds nothing: a token that lies in its events can also lie in `balanceOf`.
- **SDKS-143** (SDK-621, SDK-1136), **SDKS-541** (SDK-890), **SDKS-406** (SDK-737): the endpoint serves another chain. A lying endpoint answers `eth_chainId` with the requested id. An honest endpoint on the wrong chain means the URL is set wrong, and the integrator owns that URL-to-chain mapping.
- **SDKS-512** (SDK-1109): results carry no chain or block provenance. The caller chooses both.

#### Tenderly responses (`evm-simulation`)

Tenderly is a configured simulation endpoint, trusted like `eth_simulateV1`. When a response fails its schema, envelope or HTTP checks, the SDK re-simulates on `eth_simulateV1` if `simulateV1Url` is configured, and otherwise throws `ExternalServiceError`. Some optional fields are dropped or defaulted instead of rejected (SDKS-156, SDKS-508, SDKS-627).

- **SDKS-13** (SDK-392, SDK-1232), **SDKS-706** (SDK-816): a malformed asset amount in a success response triggers the fallback or `ExternalServiceError`. Neither path uses the malformed evidence.
- **SDKS-41** (SDK-420, SDK-1235), **SDKS-748** (SDK-1026): an out-of-range `rawAmount` cancels native evidence. Only an endpoint that forges amounts emits one.
- **SDKS-42** (SDK-421, SDK-1192), **SDKS-548** (SDK-887): a truncated bundle result becomes a bypassable `ExternalServiceError`. Bypassing it is the caller's choice to proceed unsimulated.
- **SDKS-44** (SDK-423), **SDKS-525** (SDK-886): results are not correlated by JSON-RPC `id`. Separate responses mix only if the endpoint is compromised.
- **SDKS-49** (SDK-428), **SDKS-618** (SDK-891), **SDKS-470** (SDK-712): a malformed or mixed revert envelope triggers the fallback or `ExternalServiceError`. The fallback re-simulates, so a real revert reverts again.
- **SDKS-154** (SDK-437), **SDKS-400** (SDK-889), **SDKS-391** (SDK-802): a non-2xx body is treated as a service failure. Tenderly returns reverts with HTTP 200.
- **SDKS-407** (SDK-711): Tenderly and fallback errors are each discarded. Both halves need non-compliant responses, and the fallback re-derives the revert.
- **SDKS-53** (SDK-432), **SDKS-539** (SDK-697): partial native `assetChanges` rows hide inflows. The same endpoint writes the logs, so it can hide the transfer there too.
- **SDKS-120** (SDK-612, SDK-1165), **SDKS-626** (SDK-691): omitted `assetChanges` hide native flows. Omitting them for a value-moving bundle is malformed endpoint output.
- **SDKS-156** (SDK-439, SDK-1233): omitted ERC-20 `assetChanges` become an empty ledger. ERC-20 retention reads `Transfer` logs, not `assetChanges`.
- **SDKS-627** (SDK-690): malformed log entries are dropped. An endpoint that forges logs could just as well omit them.
- **SDKS-181** (SDK-464): an unexpected asset-change `type` cancels native evidence. Tenderly reports `Transfer`, `Mint` and `Burn`, and all three are normalized.
- **SDKS-463** (SDK-837), **SDKS-474** (SDK-892): a missing or zero `contractAddress` merges ERC-20 and native flows. Tenderly does not emit such rows.
- **SDKS-642** (SDK-883): a success with no logs and no `assetChanges` is accepted. That is the real shape of a bundle that moves no value.
- **SDKS-743** (SDK-884): a 206 or 207 reply is accepted as complete. Tenderly answers 200; other 2xx codes come from a proxy the integrator runs.
- **SDKS-508** (SDK-885), **SDKS-466** (SDK-1029): missing return data becomes `0x`, or non-root output becomes return data. No safety decision reads `returnData`.
- **SDKS-566** (SDK-1027): `assetChanges` are not reconciled with logs. Both come from the same endpoint.
- **SDKS-746** (SDK-1028): `status: true` with an error is treated as success. Only a non-compliant endpoint returns both.

#### Chain identity and transaction submission (`wdk-protocol-lending-morpho-evm`, `liquidity-sdk-viem`)

- **SDKS-159** (SDK-442): a fork with the same chain id passes every check. It cannot spend canonical-chain funds, and any check would ask the same endpoint.
- **SDKS-816** (SDK-717): a provider that reports chain A while serving chain B. Only the provider can answer `eth_chainId`.
- **SDKS-527** (SDK-770), **SDKS-689** (SDK-769): failover to another backend with the same chain id. EIP-155 bytes are valid on every node of that chain.
- **SDKS-613** (SDK-990): `LiquidityLoader` labels snapshots with `client.chain.id` while reading the transport's chain. This needs no lying endpoint, only a client paired with the wrong transport, and the integrator owns that pairing.
- **SDKS-714** (SDK-1037): a stale `block.timestamp` shortens the one-hour reallocation horizon. The same node supplies the caps and balances that horizon protects.
