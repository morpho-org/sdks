# TIB-2026-07-27: VaultExitBundlesV1 in-kind redemption for Vault V1 and Vault V2

| Field      | Value                                                            |
| ---------- | ---------------------------------------------------------------- |
| **Status** | Accepted                                                          |
| **Date**   | 2026-07-27                                                        |
| **Author** | @foulques                                                         |
| **Scope**  | Packages: `morpho-sdk`, `morpho-ts`                              |

---

## Context

A depositor in an illiquid Morpho vault is stuck. The vault's assets sit in Blue markets that are
borrowed out; `withdraw` and `redeem` revert for want of liquidity, and the only lever the SDK
offers today — `MorphoVaultV2.forceWithdraw` / `forceRedeem` — still needs *someone* to free real
assets, which a fully-utilized market cannot do. Getting out then depends on the curator
reallocating, i.e. on cooperation the depositor cannot compel.

[`VaultExitBundlesV1`](https://github.com/morpho-org/bundles/blob/main/src/vault-exit/VaultExitBundlesV1.sol)
removes that dependency by changing what the user receives. Rather than assets, the user walks away
holding **Morpho Blue supply positions in-kind** on the very markets the vault was allocated to. The
vault's exposure is transferred, not liquidated, so no new liquidity has to exist for the exit to
succeed. The user can then manage those Blue positions directly — including waiting for borrowers to
repay, which is the same wait the vault was imposing, but now on the user's own terms and without
the vault's fees or curator in the path.

This is a **complementary** exit path, not a replacement for anything. The classic `withdraw` /
`redeem` and the force-deallocate paths (`MorphoVaultV2.forceWithdraw` / `forceRedeem`) serve
*liquid* vaults: they hand the user the vault's underlying asset, and to do so they need free
liquidity in the underlying markets. In-kind redemption is the escape hatch for the *illiquid* case
— when no liquidity can be freed at all, the user still exits, by taking the Blue market position
itself instead of assets. The first consumer is `vvrm-app` (the app.morpho.org depositor interface),
which already ships the liquid-vault withdraw and force-deallocate flows and will surface in-kind
redemption as the illiquid-vault path *alongside* them, not in place of them. Nothing here
deprecates or reorders the existing flows.

The contract is **not modular**. Unlike bundler3, the call sequence is fixed and auditable rather
than crafted off-chain, and its entry points are meant to be called by EOAs directly. That is a good
fit for the SDK's Action layer: there is exactly one function call to encode, and all the difficulty
moves to *deciding whether the call will succeed*.

That difficulty is real. The in-kind loop is a bare `for (uint256 i; assetsToDeallocate > 0; i++)`
over a caller-supplied array with **no bound on `i`** — under-supply the market list and the
transaction dies with a raw `panic 0x32`, no custom error, no clue. Several other failure modes are
just as opaque: an ERC-20 transfer reverting inside a Morpho callback because Blue's token balance
is momentarily short, a vault gate rejecting the bundler as an asset recipient, an allowance
underflow because the penalty leg consumed more than the caller sized for. None of these are
guessable from the revert data.

This TIB freezes the decision for integrating the two **in-kind redemption** entry points, and for
the pre-flight validation that turns those opaque failures into named SDK errors.

## Goals / Non-Goals

**Goals**

- Add `vaultV1InKindRedeem` and `vaultV2InKindRedeem` to `morpho-sdk` as pure, synchronous
  actions plus lazy entity handles — thin wrappers over the contract's
  `vaultExitBundlesV1InKindRedemptionVaultV1` / `...VaultV2` entry points — following the existing
  Client → Entity → Action layering. These short `vaultV{1,2}InKindRedeem` names are the frozen
  **SDK** surface used everywhere below; the long names are the **contract** functions they encode.
- **Surface supported pre-flight failures before submission.** Handle construction synchronously
  validates snapshot-dependent inputs and market coverage. When the caller awaits
  `getRequirements()`, it performs the RPC-backed Blue balance, allowance, nonce, and
  Morpho-deployment checks. Vault V2 gates remain enforced on-chain and are intentionally not
  preflighted; see [Security](#security). `buildTx()` remains pure and synchronous and does not
  require those checks to have run. Share sufficiency is the one deliberate exception: `amount`
  sizing against the user's balance is the caller's job (see Non-Goals).
- Sign a **correct** Vault V2 shares permit. Vault V2's EIP-712 domain omits `name` and `version`,
  so the SDK's existing `getPermitTypedData` produces an unsignable digest for it.
- Always permit `maxUint256`, so an exit never fails on an allowance the caller could not have sized
  correctly.
- Offer an approve-only path when the integrator sets `supportSignature: false` — which is also the
  answer for smart-contract wallets, since Vault V2's `permit` is `ecrecover`-only.
- Ship with JSDoc, colocated unit tests, Anvil fork tests over the canonical Ethereum deployment,
  and a semver-relevant changeset.

**Non-Goals**

- **`vaultExitBundlesV1ForceWithdrawVaultV2` is out of scope** and gets its own TIB.
  `MorphoVaultV2.forceWithdraw` and `forceRedeem` are untouched and undeprecated by this decision.
- No market-list planning. The caller supplies `marketParamsList` and its order; the SDK validates
  it and never reorders or synthesizes it. Ordering determines which Blue markets the user ends up
  holding — that is a product choice, not an SDK one.
- No shares or `max` input mode. The amount is asset-denominated, matching the contract's
  `exitAssets` one-to-one.
- **No share-sufficiency validation.** The SDK does not check that the user holds enough vault shares
  for `amount`. Forcing a `maxUint256` allowance settles *authorization*, not *balance* — an `amount`
  above the user's holdings still reverts on-chain. Sizing `amount` against the share balance is the
  caller's job (`vvrm` derives it from the balance it already has), so the SDK spends no RPC on a
  `balanceOf` read it would only duplicate.
- No separate composition with a penalty-free `withdraw` leg. VaultExitBundlesV1 atomically
  withdraws available idle assets first and applies in-kind redemption only to the remainder.
- No new runtime dependencies. `viem` stays the only peer dep of `morpho-sdk`.

## Current Solution

Before this proposal, `morpho-sdk` had no support for `morpho-org/bundles` — a search for
`VaultExitBundles`, `vault-exit`, `InKindRedemption`, and `IKR` across `src/` returns nothing.

The nearest surface is the pair of Vault V2 force paths in
[`src/actions/vaultV2/forceWithdraw.ts`](../../packages/morpho-sdk/src/actions/vaultV2/forceWithdraw.ts)
and [`forceRedeem.ts`](../../packages/morpho-sdk/src/actions/vaultV2/forceRedeem.ts). Both encode a
`VaultV2.multicall` of caller-supplied `forceDeallocate` calls followed by a `withdraw` or `redeem`.
They differ from in-kind redemption in three ways that matter:

1. They yield **assets**, so they still require the underlying markets to have free liquidity.
2. The caller computes the deallocations. The SDK validates only non-emptiness and positivity
   (`EmptyDeallocationsError`, `NonPositiveInputError`) and performs **no** cross-check that the
   deallocated total covers the withdraw — `forceRedeem`'s own JSDoc pushes that onto the caller.
3. They cannot transfer the vault's Blue exposure to the user.

For Vault V1 there is no force path at all.

## Proposed Solution

### What the contract does

Both entry points burn the user's vault shares. Vault V1 gives the user Blue supply positions for
the full `exitAssets`. Vault V2 first withdraws `min(vault asset balance, exitAssets)` as idle tokens,
then gives the user Blue supply positions for
`floor((exitAssets - idleAssets)·WAD / (WAD + penalty))`. Quoting the V2 output as the full
`exitAssets` therefore overstates the Blue position. The action keeps `amount` penalty-inclusive and
maps it one-to-one to the contract's `exitAssets`; `previewVaultV2InKindRedeem` exposes the idle,
net, and fee split needed by frontends.

**Vault V2** — per market in the caller's list, the bundler supplies into Blue *on behalf of the
user* with a callback, and repays that supply from the vault inside the callback:

```solidity
idleAssets         = min(IERC20(asset).balanceOf(vault), exitAssets);
IVaultV2(vault).withdraw(idleAssets, address(this), msg.sender);
penalty            = IVaultV2(vault).forceDeallocatePenalty(adapter);
assetsToDeallocate = (exitAssets - idleAssets).mulDivDown(WAD, WAD + penalty);

for (uint256 i; assetsToDeallocate > 0; i++) {                       // <- unbounded
    bytes32 marketId = Id.unwrap(marketParamsList[i].id());
    uint256 adapterAssets = IMorphoMarketV1AdapterV2(adapter).expectedSupplyAssets(marketId);
    uint256 assets = UtilsLib.min(adapterAssets, assetsToDeallocate);
    assetsToDeallocate -= assets;
    if (assets > 0) IMorpho(BLUE).supply(marketParamsList[i], assets, 0, msg.sender, data);
}

// onMorphoSupply:
IVaultV2(vault).forceDeallocate(adapter, abi.encode(marketParams), assets, sender);
IVaultV2(vault).withdraw(assets, address(this), sender);
```

**Vault V1** — the bundler flash-loans the full amount from Blue, supplies it across the listed
markets on behalf of the user, then withdraws from the vault to repay the flash loan:

```solidity
IMorpho(BLUE).flashLoan(loanToken, exitAssets, data);

// onMorphoFlashLoan:
for (uint256 i; assetsToDeallocate > 0; i++) {                       // <- unbounded
    MarketParams memory marketParams = marketParamsList[i];
    if (!IMetaMorpho(vault).config(marketParams.id()).enabled) continue;
    uint256 vaultAssets = MorphoBalancesLib.expectedSupplyAssets(IMorpho(BLUE), marketParams, vault);
    uint256 assets = UtilsLib.min(vaultAssets, assetsToDeallocate);
    assetsToDeallocate -= assets;
    if (assets > 0) IMorpho(BLUE).supply(marketParams, assets, 0, sender, "");
}
IMetaMorpho(vault).withdraw(exitAssets, address(this), sender);
```

The differences the SDK has to model:

|                        | Vault V1 (`IMetaMorpho`)                                        | Vault V2 (`IVaultV2`)                                            |
| ---------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Funding                | Blue `flashLoan` for the full amount, up front                    | per-market `supply` + `onMorphoSupply` callback                    |
| Penalty                | none — `assetsToDeallocate == exitAssets`                         | `floor((exitAssets - idleAssets)·WAD / (WAD + penalty))`, penalty capped at 2% |
| Adapter argument       | absent                                                            | required; single, and must be a `MorphoMarketV1AdapterV2`          |
| Unknown markets        | skipped via `config(id).enabled`                                  | not skipped; contribute zero and burn an index                     |
| Blue balance needed    | `>= exitAssets` (whole amount at once — **stricter**)             | `>= max_i(assets_i)` (peak per-iteration chunk)                    |
| Vault gates            | none                                                              | enforced by Vault V2 during execution; not preflighted             |
| Shares permit domain   | standard OZ `ERC20Permit`                                         | **non-standard, see below**                                        |

### Public surface

**`morpho-ts` — `src/addresses.ts`.** A new optional `ChainAddresses` slot:

```ts
/** Standalone bundle periphery contracts. */
bundles?: {
  /** VaultExitBundlesV1 periphery contract for in-kind vault exits into Morpho Blue positions. */
  vaultExitBundlesV1: `0x${string}`;
};
```

The mirrored `bigint` deployment slot comes free via `ChainDeployments<Addresses>`. Canonical
deployments are registered on Ethereum, Base, Arbitrum, Optimism, Polygon, World Chain, Unichain,
HyperEVM, Katana, Monad, Stable, Tempo, and Robinhood Chain. On other chains, actions resolve the
optional entry with `getChainAddress` and therefore throw `UnknownAddressError` until an address is
registered.

**`morpho-sdk` — `src/abis.ts`.** Pin `vaultExitBundlesV1Abi` alongside `bundler3Abi` and
`generalAdapter1Abi`. This is the established split: core protocol ABIs live in `morpho-ts`,
periphery and bundler ABIs live in the SDK that drives them — the same placement `midnightBundlesAbi`
uses in `midnight-sdk`.

The ABI matches the deployed `morpho-org/bundles` commit
`9994e6abe5b18d5f7e0d6bd666f85eb259e3312f`. The deployed selectors are unchanged from the earlier
integration artifact, so `src/abis.ts` remains the single published source of truth.

Two properties of that compiled ABI are worth recording:

- It exposes **seven functions** — `BLUE`, `initiator`, `onMorphoFlashLoan`, `onMorphoSupply`, and
  the three entry points.
- It declares **eleven errors** — `AdapterNotPartOfVault`, `AlreadyInitiated`,
  `ApproveReturnedFalse`, `DeadlinePassed`, `InvalidAdaptersLength`, `MorphoMismatch`, `NoCode`,
  `PctExceeded`, `SlippageExceeded`, `TransferReturnedFalse`, `UnauthorizedCallback`. The
  reentrancy guard's `AlreadyInitiated` revert is therefore decodable by viem.

**Vault V2 permit domain.** The existing pure, synchronous `getPermitTypedData` reads
`erc20.eip5267Domain`. Vault V2 builds its domain from **two fields only**:

```solidity
// vault-v2/src/libraries/ConstantsLib.sol
bytes32 constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(uint256 chainId,address verifyingContract)");
// vault-v2/src/VaultV2.sol
function DOMAIN_SEPARATOR() public view returns (bytes32) {
    return keccak256(abi.encode(DOMAIN_TYPEHASH, block.chainid, address(this)));
}
```

No `name`, no `version`. Without hardcoded domain metadata,
[`getPermitTypedData`](../../packages/blue-sdk-viem/src/signatures/permit.ts) emits
`{ name, version, chainId, verifyingContract }` and therefore hashes a different domain typehash →
`InvalidSigner()`. Vault V2 does not implement `eip712Domain()`, so `fetchToken`'s EIP-5267 probe
cannot rescue it either; the helper would silently fall through to its `version: "1"` default.

`PERMIT_TYPEHASH` *is* the standard ERC-2612 struct, so the generic helper remains the single source
of truth — only the domain differs. The Vault V2 consumer clones the token with a synthetic
`Eip5267Domain` whose `fields: "0x0c"` bitmap selects only `chainId` and `verifyingContract`, then
passes it to `getPermitTypedData`. MetaMorpho is OpenZeppelin `ERC20Permit`, so V1 uses the original
token unchanged, consistent with the
`// V1 shares always implement EIP-2612.` comment already in
[`entities/vaultV1/vaultV1.ts`](../../packages/morpho-sdk/src/entities/vaultV1/vaultV1.ts).

> **Latent bug worth noting.** `getGeneralAdapterRequirements({ address: <a Vault V2>, useSimplePermit: true })`
> would today mint an unsignable permit for the same reason. No current call site does this, but
> nothing prevents one.

**`morpho-sdk` — actions.** `src/actions/vaultV1/inKindRedeem.ts` → `vaultV1InKindRedeem` and
`src/actions/vaultV2/inKindRedeem.ts` → `vaultV2InKindRedeem`, matching the existing
per-vault folder layout and `vaultV{1,2}<Verb>` naming, with `"vaultV1InKindRedeem"` /
`"vaultV2InKindRedeem"` joining the `TransactionAction` union in `src/types/action.ts`.

Pure, synchronous, deep-frozen, following the four-step pattern in
[`src/actions/AGENTS.md`](../../packages/morpho-sdk/src/actions/AGENTS.md). `to` resolves from
`getChainAddress(chainId, "bundles.vaultExitBundlesV1")`, which throws `UnknownAddressError` when
the deployment is not registered; `value` is always `0n`.

**`morpho-sdk` — entities.** `MorphoVaultV2.inKindRedeem(...)` and
`MorphoVaultV1.inKindRedeem(...)`:

```ts
inKindRedeem(params: {
  /** Assets to pull out of the vault. Penalty-inclusive on V2. */
  amount: bigint;
  /** Ordered; the contract consumes it greedily and never reorders. */
  marketParamsList: readonly MarketParams[];
  /** Pre-fetched vault state, from `getData()`. */
  vaultData: AccrualVaultV2;
  userAddress: Address;
  /** Defaults to `vaultData.adapters[0]`. V2 only. */
  adapter?: Address;
  /** Defaults to `now + 2h`. */
  deadline?: bigint;
}): {
  buildTx: (signatures?: readonly RequirementSignature[]) => Readonly<Transaction<VaultV2InKindRedeemAction>>;
  getRequirements: () => Promise<readonly ActionRequirement[]>;
};
```

`userAddress` is not optional decoration: the contract hardcodes `owner = msg.sender` and
`spender = address(this)` inside `TokenLib.submitPermit`, so the permit must be signed by the sending
account, and the same address drives the allowance and nonce reads.

The method is **synchronous**, like `deposit` / `withdraw` / `forceRedeem`, and runs every check
derivable from `(amount, marketParamsList, vaultData)` eagerly — it throws before returning the
handle. Checks that genuinely need RPC run inside the already-async `getRequirements()`. The single
`deadline` is resolved once at handle creation and closed over, so the requirement and `buildTx`
cannot disagree and the action stays clock-free. `getRequirements()` re-checks that closed-over
deadline against the current timestamp before performing any RPC reads, so a stale handle cannot
return a dead permit requirement.

**`buildTx` is not async — only `getRequirements()` is.** This is deliberate and non-negotiable: by
the SDK's layering rule (root `AGENTS.md` §1), the Action layer is synchronous and reads no chain
state, so `buildTx` neither awaits nor performs RPC — it only assembles the deep-frozen `Transaction`
from data already in hand. The "validate exhaustively before building" goal therefore has a precise
scope that must be stated rather than assumed: the **synchronous** matrix (everything derivable from
the `getData()` snapshot) always runs before the handle is returned, but the **RPC-backed** checks —
Blue balance, allowance, nonce, and V1 Morpho deployment and fee-recipient reads — run *only* when
the caller awaits `getRequirements()`. A caller who invokes `buildTx` without first awaiting
`getRequirements()` skips exactly those RPC checks and can still meet their reverts on-chain. That
is not a gap to close by making `buildTx` await state — doing so would break the layer boundary every
other entity method respects (see Considered Alternatives §5). It is a contract to document:
integrators must call `getRequirements()` first, and both entity methods say so in their JSDoc.

### The validation matrix

This is the load-bearing part of the decision. Each row was derived by walking
`VaultExitBundlesV1.sol`, `TokenLib.sol`, and `vault-v2/src/VaultV2.sol` line by line; every
`require`, every unchecked array index, and every nested call in `onMorphoSupply` /
`onMorphoFlashLoan` appears exactly once.

#### Synchronous — pure, from `(amount, marketParamsList, vaultData)`

| On-chain failure                        | Trigger                                                       | SDK check                                                                                                                                                    | Error                                          |
| --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| every RPC reads the wrong chain          | the viem client is connected to a chain other than `this.chainId`, so `getRequirements()` would read allowances, nonces, Blue balances, and V1 Morpho configuration on one chain while `buildTx` resolves the `vaultExitBundlesV1` address for another | `this.client.viemClient.chain?.id === this.chainId` — the same first-line guard every existing Vault V1/V2 entity method already applies before returning a handle | `ChainIdMismatchError` (reuse existing)        |
| every calc runs against the wrong vault | caller passes a `vaultData` fetched for a **different** vault — allocations, adapters, and penalties are then read off it while `buildTx` still targets `this.vault` | `vaultData.address === this.vault`, the same guard the Vault V1/V2 deposit and migration flows already apply — runs right after the chain-ID guard, since every row below trusts the snapshot | `VaultAddressMismatchError` (reuse existing)   |
| `InvalidAdaptersLength()`               | `adaptersLength() != 1`                                         | `vaultData.adapters.length === 1`                                                                                                                              | `InKindRedeemRequiresSingleAdapterError`       |
| `AdapterNotPartOfVault()`               | `!isAdapter(adapter)`                                           | `adapter ∈ vaultData.adapters`                                                                                                                                 | `AdapterNotPartOfVaultError`                   |
| revert / garbage from the contract casting the adapter to `IMorphoMarketV1AdapterV2` and calling `adapter.supplyShares(id)` / `adapter.morpho()` | the sole adapter is **not** a markets-based `MorphoMarketV1AdapterV2` — e.g. a legacy positions-based `MorphoMarketV1Adapter` or a `MorphoVaultV1Adapter` | `accrualAdapters[0] instanceof AccrualVaultV2MorphoMarketV1AdapterV2` — reject the other two `AccrualVaultV2*Adapter` types `vvrm`'s `deallocation.ts` already distinguishes; this is a **first-class check**, not an incidental one, because the whole V2 loop assumes the V2 adapter interface | `UnsupportedInKindAdapterError`                |
| `MorphoMismatch()`                      | `adapter.morpho() != BLUE`                                      | subsumed by the adapter-type row above — the `MorphoMarketV1AdapterV2` factory pins Blue in its constructor, so a genuine `AccrualVaultV2MorphoMarketV1AdapterV2` cannot mismatch | reuse `UnsupportedInKindAdapterError`          |
| **`panic 0x32`** (array out-of-bounds)  | list exhausted before `assetsToDeallocate` reaches 0            | simulate the version-specific loop below — id-deduplicated coverage on V2 and the raw ordered greedy loop on V1                                                 | `InKindRedeemCoverageError`                    |
| `NotEnoughLiquidity()` (V1)             | the raw loop assigns a non-zero chunk to the same market twice, but the final vault withdrawal cannot redeem more than the vault's position in that market | track cumulative assignment per market id and reject when it exceeds the snapshot position                                                                     | `InKindRedeemCoverageError`                    |
| entry silently contributes zero         | a listed `MarketParams.id` is not in `adapter.marketIds`        | treat it as zero in the coverage and peak-balance calculations, matching the contract                                                                           | —                                              |
| silent no-op that still burns the permit | no idle assets and `mulDivDown(amount, WAD, WAD + penalty) === 0` | require either idle assets or a positive derived `assetsToDeallocate`                                                                                         | `InKindRedeemZeroDeallocationError`             |
| `panic 0x32` on the first index         | `marketParamsList.length === 0` while deallocation is required   | require a non-empty list only when `assetsToDeallocate > 0`                                                                                                    | `EmptyMarketParamsListError`                   |
| `DeadlinePassed()` / `PermitDeadlineExpired()` | `block.timestamp > deadline`                             | `deadline > Time.timestamp()` at handle creation and again before `getRequirements()` performs RPC                                                                                                                           | `ExpiredDeadlineError`                         |
| —                                       | `amount <= 0`                                                   | positive amount                                                                                                                                                | `NonPositiveInputError("amount")`              |

Coverage, for Vault V2:

```
penalty            = vaultData.forceDeallocatePenalties[adapter]
idleAssets         = min(vaultData.assetBalance, amount)
assetsToDeallocate = mulDivDown(amount - idleAssets, WAD, WAD + penalty)
covered            = Σ over dedup(marketParamsList) of
                       market(id).accrueInterest(t).toSupplyAssets(adapter.supplyShares[id])
require              covered >= assetsToDeallocate
maxExitAssets      = covered == 0
                       ? idleAssets
                       : idleAssets + mulDivUp(covered + 1, WAD + penalty, WAD) - 1
                                                                  // returned in the error payload
```

and for Vault V1, where there is no penalty and disabled markets are skipped by the contract, the
raw ordered loop must be simulated while bounding cumulative assignment by the vault's position:

```
remaining    = amount
assigned[id] = 0
for marketParams in marketParamsList while remaining > 0:
  available = allocation.position accrued to t → supplyAssets
  chunk     = min(available, remaining)
  require assigned[id] + chunk <= available
  assigned[id] += chunk
  remaining    -= chunk
require remaining == 0
```

Every input is already on `AccrualVaultV2` / `AccrualVault` — `adapters`,
`forceDeallocatePenalties`, `accrualAdapters[0].supplyShares`, the adapter's `markets[i].params`, and
`allocations` — so the whole synchronous matrix costs **zero extra RPC** beyond the `getData()` the
caller already made.

Two subtleties that are easy to get wrong:

- **Duplicate handling is version-specific.** The two versions drain the position they read at
  different times, so an identical duplicate has opposite effects:
  - On **V2**, `forceDeallocate` + `withdraw` run inside `onMorphoSupply` on every iteration, so the
    adapter's `expectedSupplyAssets(id)` is *drained mid-loop* and a market listed twice contributes
    ≈0 the second time round. A naive sum over the caller's raw list would over-count and then panic
    on-chain, so duplicates are **silently deduplicated** for the V2 coverage sum — a wasted
    iteration but no revert, and the contract explicitly acknowledges duplicate entries are possible.
  - On **V1**, the single `withdraw` runs *after* the loop (the loop only supplies flash-loaned
    assets on behalf of the user), so `expectedSupplyAssets(vault, id)` reads the **same undrained
    vault position on every iteration**. This can make the raw loop terminate, but the supplied
    assets are credited to the user, not the vault. The final MetaMorpho withdrawal still cannot
    redeem more than the vault owns in that market, so a second non-zero assignment is rejected
    before it can surface as `NotEnoughLiquidity()`.
- **Order is safety-relevant on V1.** V2's deduplicated capacity remains order-independent, with
  order affecting only which Blue positions the user receives. V1 must preserve the contract's raw
  order: a harmful duplicate reached before the amount is covered is rejected, while entries after
  the greedy loop has reached zero are never executed.

#### Asynchronous — in `getRequirements()`, batched into one multicall

| On-chain failure                            | Trigger                                                                                                                    | SDK check                                                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| opaque ERC-20 revert inside the callback     | Blue credits the supply **before** the callback but pulls the tokens **after**, while the adapter withdraws real tokens mid-callback | `balanceOf(vaultData.asset, blue) >= peak`, where `peak` is the largest single `assets_i` from simulating the greedy loop **in the caller's order**         |
| allowance underflow                          | `allowance[user][bundler] -= shares` runs on **both** the penalty leg and the main leg                                       | forced `maxUint256` on both the permit and the approve path (see below)                                                                                    |
| `InvalidSigner()`                            | nonce stale or ahead of chain                                                                                                | read `nonces(userAddress)` fresh at requirement time                                                                                                       |
| `MorphoMismatch()` (V1 only)                 | `IMetaMorpho(vault).MORPHO() != BLUE`                                                                                        | one `MORPHO()` read                                                                                                                                        |
| V1 callback undercounts accrued fee shares   | the Vault V1 is Morpho Blue's `feeRecipient`, a configuration VaultExitBundlesV1 explicitly does not support                 | read `BLUE.feeRecipient()` and reject when it equals the vault                                                                                              |

The Blue-balance row deserves emphasis, because it is **order-dependent** where coverage is not, and
because it is the live failure mode rather than a theoretical one. Inside `onMorphoSupply` the market's
own accounting always permits the withdraw — the bundler just added `assets` and immediately removes
`assets`, so `totalBorrowAssets <= totalSupplyAssets` still holds. What can fail is physical: Blue
must actually *hold* `assets` of the loan token at that instant, and the repaying `transferFrom`
lands only after the callback returns. Iterations are sequential and each nets to zero, so the bound
is the **peak chunk**, not the sum — the contract's docstring is deliberately conservative here.
Concretely: a 100%-utilized market is exitable in-kind only if Blue holds that loan token *elsewhere*,
which is exactly the situation in-kind redemption exists to serve.

Vault V1 inverts this: the flash loan takes the whole `exitAssets` up front, so the bound is
`balanceOf(loanToken, blue) >= exitAssets` — strictly stronger than V2's.

Blue's loan-token balance is not part of `vaultData`, so `getRequirements()` reads it for the first
time against the peak derived from the supplied snapshot. The vault's idle balance, penalty, and
adapter positions are already supplied together in `vaultData`. Re-reading only idle balance would
mix a fresh value with stale penalty and position values rather than refresh the state that produced
the coverage bound; a coherent refresh would require fetching the complete Vault V2 snapshot again.

Vault V2 gates are intentionally not preflighted. A receive-assets gate may inspect
`VaultExitBundlesV1.initiator()`, whose transient value is populated only inside the actual
periphery call. Reading `canReceiveAssets` directly — inside or outside multicall — therefore uses
a different execution context and can disagree with execution. `canSendShares(userAddress)` also
delegates to arbitrary external gate code and is evaluated repeatedly after intermediate penalty
share burns, so one standalone read can likewise disagree with the final sequence. Share-send and
asset-receive gates remain enforced by Vault V2 on-chain. Integrators that need gate assurance
before submission must simulate the finalized transaction after its permit is signed or its
approval is mined.

Failure modes deliberately left to documentation rather than checks: `AlreadyInitiated()`
(decodable transient reentrancy guard, unreachable from a normal EOA call),
`ApproveReturnedFalse()` from `TokenLib.forceApproveMax` (exotic tokens; the library already handles
USDT-style reset-to-zero and short-circuits above a `2^95` allowance), a share-price **drop** between
build and execution (the contract explicitly does not check share price), and — by explicit decision
— **share sufficiency**. The SDK does **not** verify that the user holds enough vault shares for the
exit. Forcing a `maxUint256` allowance solves *authorization*; it does not create shares, and an
`amount` sized above the user's balance still reverts on-chain (`ERC20InsufficientBalance` inside
`MetaMorpho.withdraw` on V1, a `deleteShares` underflow on V2). Sizing `amount` against the user's
share balance is the **caller's** responsibility — `vvrm` derives it from the balance it already
holds — so the SDK spends no RPC on a `balanceOf(vault, userAddress)` read it would only duplicate.
This is the one non-panic revert the matrix consciously leaves opaque; it is documented on both
entity methods and in § Security.

### Permit handling

The permit is embedded in the call, as a struct rather than a separate transaction:

```solidity
struct Permit { uint256 value; uint256 nonce; uint256 deadline; uint8 v; bytes32 r; bytes32 s; }
```

Three consequences for the action layer:

1. **It is `v`/`r`/`s`, not a packed signature.** The action accepts both 64-byte EIP-2098 compact
   and 65-byte serialized signatures, expands either form, and normalises
   `v = v ?? yParity + 27`.
2. **There is an explicit empty sentinel.** `TokenLib.submitPermit` skips when
   `v == 0 && r == 0 && s == 0`, which is how the approve path passes "no permit". It also skips
   when `nonces(msg.sender) > permit.nonce`, tolerating a third party front-running the submission.
3. **`spender` and `owner` are not ours to choose** — the contract hardcodes them to `address(this)`
   and `msg.sender`.

**The permitted value is always `maxUint256`.** This is a requirement, not a convenience. The
allowance is consumed twice per market — once by the main withdraw and once by the penalty withdraw
inside `forceDeallocate`, each with its own `previewWithdraw` rounding and an interest accrual in
between. No caller can size that correctly in advance, and every rounding wei short is a full revert
after the user has already signed.

`getRequirements()` therefore:

- returns `[]` when `allowance(user, vaultExitBundlesV1) === maxUint256` — safe precisely *because*
  max is permanent (below). It must **not** short-circuit on a merely large allowance, since the
  exact burn is unknowable;
- with `supportSignature: true`, the entity multicall reads `nonces(user)` and passes the nonce to
  the pure `encodeVaultSharesPermit` helper. The helper calls `getPermitTypedData`, hardcodes a
  synthetic `erc20.eip5267Domain` with only `chainId` and `verifyingContract` selected for V2, and
  signs through `signAndVerifyTypedData` (which already enforces signer === `userAddress`);
- with `supportSignature: false`, returns an `approve(vaultExitBundlesV1, maxUint256)`
  `CallRequirement` via `encodeErc20Approval`.

`RequirementSpenderKey` in
[`src/helpers/validateRequirementSpender.ts`](../../packages/morpho-sdk/src/helpers/validateRequirementSpender.ts)
gains `"vaultExitBundlesV1"`, and **both** requirement paths validate their spender against an
allowlist, so both allowlists must admit it:

- the permit path, through the new `encodeVaultSharesPermit`;
- the **default** approve path (`supportSignature: false`, and the only path a smart-contract wallet
  can take), through
  [`encodeErc20Approval`](../../packages/morpho-sdk/src/actions/requirements/encode/encodeErc20Approval.ts),
  whose allowlist before this change is `["generalAdapter1", "permit2", "midnight", "midnightBundles"]`.

`vaultExitBundlesV1` **must be added to `encodeErc20Approval`'s allowlist too** — this was the easy
omission to make. Leaving it out makes the default path throw `UnsupportedErc20ApprovalSpenderError`
before it can return a requirement, breaking exactly the integrators who did not opt into signatures.
The default approve authorization path gets its own test (§ Testing). `encodeErc20Permit`'s allowlist
is a separate list for a separate encoder and stays `["generalAdapter1", "midnightBundles"]`; the
new shares permit does not route through it.

`buildTx` routes the selected signature through `getVaultExitBundlesV1PermitStruct`, colocated with
and following the established `getTokenRequirementActions` convention. It rejects
Permit2, checks that the signed asset is the vault and the signed amount is `maxUint256`, then parses
the signature into the standalone contract's `{ value, nonce, deadline, v, r, s }` tuple. The tuple
uses the signed requirement's nonce and deadline. Owner, spender, duplicated action metadata, and
the signature's cryptographic validity are left to the vault's on-chain ERC-2612 verification,
which hardcodes `owner = msg.sender` and `spender = address(this)`.

**Deadline.** One value, `now + 2h`, used for both `permit.deadline` and the bundle `deadline`,
matching `encodeErc20Permit`. `TokenLib` notes the two are independent — a signature that never
lands stays submittable until `permit.deadline` — so keeping them equal bounds the floating-signature
window to the bundle's own lifetime. The entity accepts an override, which matters for slow signing
flows. Requirement resolution rejects the handle if that shared deadline has expired before its
allowance, nonce, and balance reads begin.

### Testing

Per root `AGENTS.md` §5, tests use the canonical deployment on the pinned mainnet fork.

- **Unit, colocated.** Both actions: happy path, inline calldata snapshots, the empty-permit
  sentinel, 65-byte `v`/`yParity` and 64-byte EIP-2098 normalisation, and every mismatch guard. A
  `fast-check` property test over the `Permit` tuple round-trip with pinned `numRuns` and `seed`, per
  the convention in `src/bundler/actions.test.ts`.
- **Unit, mock client.** Every row of the synchronous matrix, and each `getRequirements()` branch
  (allowance already max / permit / approve), via `createMockClient` from `@morpho-org/test/mock`.
- **Fork.** The fork block includes the canonical Ethereum `VaultExitBundlesV1`, resolved through
  the built-in address registry. End-to-end coverage includes an illiquid Vault V2 exited in-kind
  across several markets with idle assets and a non-zero penalty, the
  V1 flash-loan path, and the Blue-balance rejection. **At least one V2 case must exercise
  the `supportSignature: true` permit path end-to-end** — sign the `PermitRequirementSignature` that
  `getRequirements()` returns, feed the resulting `v`/`r`/`s` into the bundle, and execute on the
  fork — so the hardcoded two-field `erc20.eip5267Domain` passed to `getPermitTypedData` is checked
  against the
  live `VaultV2.DOMAIN_SEPARATOR()` by the contract's own `ecrecover`. This cannot be substituted by
  a unit round-trip (signing and re-verifying with the same helper only proves the SDK is
  self-consistent, never that its domain matches the contract's) nor by an approve-based exit
  (`supportSignature: false` skips `submitPermit` via the empty `v=0, r=0, s=0` sentinel and never
  touches the domain). Either substitute would stay green while a wrong domain reverts every real
  permit with `InvalidSigner()`.
- **Security invariants as tests** (§5): the permitted value is always `maxUint256`; the empty permit
  is exactly `v=0, r=0, s=0`; a **V2** duplicate-heavy list that only covers the amount when
  double-counted is *rejected* (deduped coverage), and the mirror **V1** list is also *rejected* when
  the raw greedy loop assigns a second non-zero chunk from the same vault position; a
  V2 list may contain an absent market before a covering live market, with the absent entry preserved
  in calldata but counted as zero; an under-covering list is rejected rather than left to panic; the
  **default**
  `supportSignature: false` path returns a valid `approve` requirement (i.e. `vaultExitBundlesV1` is
  on `encodeErc20Approval`'s allowlist) instead of throwing `UnsupportedErc20ApprovalSpenderError`;
  `buildTx` rejects Permit2 and a requirement whose signed asset or amount does not match the exit;
  a `vaultData` fetched for a different vault is rejected
  with `VaultAddressMismatchError`; a handle built from a client on the wrong chain is rejected with
  `ChainIdMismatchError`; and a Vault V2 exit signed with `getPermitTypedData` using the synthetic
  two-field `erc20.eip5267Domain` and submitted
  on a fork is **accepted** by the contract's `ecrecover` — the on-chain proof that the two-field
  domain does not produce `InvalidSigner()`.

### Implementation Phases

The implementation originally landed in phases ahead of deployment. The canonical deployments are
now registered, the fork suite exercises the live Ethereum bytecode, and the temporary creation-code
artifact and deployment helper have been removed. The verified selectors and `BLUE` immutable match
the vendored ABI.

- **Phase 0 — Prerequisite:** establish predeployment fork coverage (completed by PR #907 and now
  superseded by the canonical deployment).
- **Phase 1 — Plumbing:** promote the ABI into `src/abis.ts` and add the
  `bundles.vaultExitBundlesV1` address slot.
- **Phase 2 — Actions:** both pure builders, the new error classes, the action-union members,
  colocated unit and property tests.
- **Phase 3 — Entities:** the full validation matrix, `getRequirements`, mock-client tests per branch.
- **Phase 4 — Fork tests and release:** end-to-end coverage against the canonical deployment,
  JSDoc `@example` blocks, and changeset.

## Considered Alternatives

### Alternative 1: The SDK plans and orders the market list

Derive the list from the adapter's markets and sort by descending exposure, so callers cannot
under-supply it. All the inputs are already on `AccrualVaultV2`, so this costs nothing extra.

**Why rejected:** ordering decides which Blue markets the user is left holding after the exit. That
is a product decision — a UI may want the user to pick, and a curator-facing tool may want a very
different order than a retail one. Baking one policy into the SDK would make the wrong choice
authoritative. Validation gives the safety without taking the choice away, and because
deduplicated coverage is order-independent, the caller cannot break correctness by ordering badly —
only alter the outcome.

### Alternative 2: Shares-denominated or `max` input modes

Accept `{ shares }` or `{ max: true }` and convert internally, mirroring `blueRepay` / `blueWithdraw`.
The full exit is the archetypal use case and it is naturally share-denominated.

**Why rejected:** the contract's `exitAssets` is penalty-*inclusive*, so a shares mode would have to
invert the penalty as well as the share price, and a `max` mode would additionally have to combine
the vault's changing idle balance with the adapter's total exposure. Each conversion is a place for
the SDK to be subtly wrong about an amount the user cannot
verify. A 1:1 passthrough keeps the SDK honest about what it is doing; convenience modes can be
added later, additively, once the primitive has real usage.

### Alternative 3: Reuse `getGeneralAdapterRequirements` for the shares permit

It already resolves approve / permit / permit2 against a token and a spender, and `vaultV1MigrateToV2`
already uses it to pull vault shares.

**Why rejected:** it hardcodes `generalAdapter1` as the spender and routes permits through
`getPermitTypedData`, which produces the wrong EIP-712 domain for Vault V2. Its Permit2 branch is
also dead weight here — the contract only understands ERC-2612. A dedicated `encodeVaultSharesPermit`
is smaller than the changes reusing it would require.

### Alternative 4: Exact-amount permit with a safety buffer

Estimate the shares to be burned, add headroom, and permit that instead of `maxUint256`, so the
allowance self-exhausts and leaves nothing behind.

**Why rejected:** it trades a documented, non-exploitable standing allowance for an undocumented
revert risk. The true figure depends on per-market `mulDivUp` penalty rounding, `previewWithdraw`
rounding on two legs per market, and interest accruing between them — any buffer large enough to be
safe is large enough that its "self-exhausting" property is theatre. Reverting *after* the user has
signed is the worse failure.

### Alternative 5: Make `inKindRedeem` async and fold every check into one place

One `await`, one error surface, no split between synchronous and asynchronous validation.

**Why rejected:** it breaks the shape every other entity method has — `deposit`, `withdraw`,
`redeem`, `forceWithdraw`, and `forceRedeem` are all synchronous over pre-fetched data — and it would
force an RPC round-trip on callers who only want to encode. The cost of the split is that a caller
who never calls `getRequirements()` skips the asynchronous checks; that is the same trade every
existing entity makes, and it is documented on the method.

### Alternative 6: Vendor the `bundles` submodules and compile in-repo

Use `scripts/compile-solidity.js` rather than committing a pre-compiled artifact.

**Why rejected:** already settled in PR #907 — the contract pulls in 37 Solidity files across six
foundry submodules, which would mean checking roughly 150 KB of upstream contracts into this repo.
The temporary predeployment artifact carried its provenance in a header and was deleted once the
canonical deployment became available.

## Assumptions & Constraints

- **Vault V2 in-kind redemption only works on single-adapter vaults** whose sole adapter is a
  `MorphoMarketV1AdapterV2`. This is the contract's constraint, not ours; multi-adapter vaults and
  vaults on the legacy positions-based `MorphoMarketV1Adapter` (or a `MorphoVaultV1Adapter`) are
  simply out of reach. The SDK **actively asserts the adapter type** (`instanceof
  AccrualVaultV2MorphoMarketV1AdapterV2`) and throws `UnsupportedInKindAdapterError` before building,
  rather than letting the contract revert opaquely when it casts to `IMorphoMarketV1AdapterV2` — the
  three `AccrualVaultV2*Adapter` variants that `vvrm` already models are exactly the discriminants
  this check keys on. How many live vaults qualify at launch is a product/reach question, not a
  correctness one, and should be sized with the `vvrm` team before enabling each chain's address slot.
- **The adapter's markets all share the vault's asset as loan token** — enforced on-chain by the
  adapter's `LoanAssetMismatch`. This is what lets the Blue-balance check be a single `balanceOf`.
- **The vault's share price only moves up between build and execution.** True for accrual; false for
  a bad-debt realisation, which the contract explicitly does not guard against — and neither does the
  SDK, since it validates neither share price nor share sufficiency (see Non-Goals and Security).
- **Smart-contract wallets cannot use the permit path.** `VaultV2.permit` calls `ecrecover` with no
  EIP-1271 fallback. They must go through `supportSignature: false`, which the integrator sets — the
  SDK does not sniff `getCode` to decide this, since that would misclassify EIP-7702-delegated EOAs,
  which carry code yet sign ECDSA. The permit-vs-approve choice is the integrator's
  `supportSignature` flag, authoritatively: `false` keeps the classic on-chain `approve` path, `true`
  uses the off-chain shares permit.
- **The builder must be the signer.** The contract binds `owner` and the allowance it spends to
  `msg.sender`, so `userAddress` must be the sending account — the same caveat already recorded in
  `BUNDLER3.md`.
- **Markets absent from the adapter snapshot contribute zero.** Adapter market additions are
  timelocked, so a caller can list a market the SDK cannot yet observe. The SDK neither credits that
  market toward coverage nor includes it in the peak Blue-balance calculation, but it preserves the
  entry in calldata. This matches the contract, which skips zero-share and foreign markets, and lets
  callers pass comprehensive ordered lists that remain useful across allocation changes.
- **The pinned fork block includes the Osaka-compiled canonical deployment**, so the suite validates
  the exact live bytecode rather than a locally compiled artifact.

## Dependencies

- [`morpho-org/bundles`](https://github.com/morpho-org/bundles) `VaultExitBundlesV1`, at deployed
  commit `9994e6abe5b18d5f7e0d6bd666f85eb259e3312f`. No runtime dependency is added — the ABI is
  vendored, as all ABIs in this repo are.
- `@morpho-org/morpho-ts` for the address slot. Per root `AGENTS.md` §7, bumping it requires auditing
  direct dependents and including them in the changeset.

## Security

- **A max permit leaves a permanent allowance.** `VaultV2.exit()` skips the decrement when the
  allowance is `type(uint256).max`, so the approval survives the transaction indefinitely — and the
  permit `deadline` does not bound it, only when the signature may be submitted. This is **not**
  third-party exploitable: every entry point spends `allowance[msg.sender][bundler]`, so an attacker
  invoking the contract burns their own shares, never a victim's. The residual risks are
  permit-nonce griefing (a front-run submission consumes the nonce and forces a re-sign, which
  `submitPermit`'s `nonces(...) <= permit.nonce` guard tolerates) and the general exposure of a
  standing approval to a periphery contract. This must be stated in the JSDoc of both entity
  methods, not just here.
- **Blue token-balance dependency.** The exit's success depends on Blue's aggregate balance of the
  loan token at execution, which any other transaction in the same block can change. The pre-flight
  check is a snapshot, not a guarantee. This is Blue's first balance read because that value is not
  included in `vaultData`; it is not a selective refresh of an existing snapshot field.
- **Vault gates are enforced only during execution.** A receive-assets gate may inspect the
  periphery's transient `initiator`, which is unset during standalone RPC reads. A send-share gate
  is arbitrary external code and is called repeatedly after intermediate share burns, so its result
  can also change within the exit sequence. The SDK therefore does not preflight either Vault V2
  gate family: a direct or multicall read could reject a valid exit or approve one that later
  reverts. Simulate the finalized, authorized transaction when gate compatibility must be known
  before submission.
- **Share sufficiency is not validated — by decision.** The SDK forces a `maxUint256` allowance,
  which settles *authorization*, and then does **not** read the user's share balance. An `amount`
  sized above the user's holdings therefore reverts on-chain (`ERC20InsufficientBalance` in
  `MetaMorpho.withdraw` on V1, a `deleteShares` underflow on V2) rather than as a named build-time
  error. This is intentional, but the caller's sizing rule is **not** a raw `amount ≤ shares held`
  comparison: `amount` is asset-denominated while the balance is in shares, so the two coincide only
  at a share price of exactly 1. The caller must size in **asset terms** against what the shares can
  actually redeem — `amount ≤ vault.previewRedeem(sharesHeld)` — because after appreciation a raw
  share comparison over-caps a valid exit, while after a bad-debt write-down it *under*-caps and
  still selects more assets than the shares can burn, hitting the opaque revert above. On V2 the
  penalty leg burns extra shares on top of `previewWithdraw(amount)`, so the caller's share budget
  must cover both legs. `vvrm` derives this from the balance it already holds; a `balanceOf` check
  in the SDK would only duplicate that read while still owing the same preview math. It is stated in
  the JSDoc of both entity methods so no integrator relies on the SDK to catch it.
- **Idle balance, penalty, and adapter-position drift are an acknowledged, unclosable blind spot.**
  The contract reads the vault's asset balance, V2 penalty (`forceDeallocatePenalty(adapter)`), and
  each market's adapter position *live, on-chain*; the SDK derives `assetsToDeallocate` and the
  coverage sum from the `getData()` snapshot. Between build and execution these can move in the
  unsafe direction: a lower idle balance or penalty *raises* the on-chain `assetsToDeallocate`, and
  a reallocation or a third-party
  `forceDeallocate` *shrinks* the adapter's position on a listed market — either can make a list that
  passed pre-flight fall short and revert with the very `panic 0x32` this TIB set out to eliminate.
  **There is no SDK-side defence, and we do not pretend otherwise.** The SDK cannot pin on-chain
  state. Re-reading only `assetBalance` at `getRequirements()` time would mix that fresh value with
  stale penalty and adapter-position values; refetching the complete snapshot would only narrow the
  window, never close it. What bounds the exposure is external to us: penalty changes are timelocked
  and capped at 2%, and adapter market removals are timelocked too — so the realistic drift is small
  and slow, not adversarial-instant. This is documented on both entity methods as a residual, not
  defended against, and it is the one failure mode in the matrix we consciously leave able to
  surface as a raw panic.
- **Smart-contract wallets are silently permit-incapable.** Left unhandled this is a guaranteed
  `InvalidSigner()` after the user has gone through a signing flow. Routing them to the approve path
  is a correctness requirement, not a nicety.
- **Inherited from the contract, by its own acknowledgement:** the vault share price is never
  checked, so a bad-debt realisation between build and execution is absorbed silently; minted Blue
  shares are never checked (at most one wei per supply lost to rounding, acceptable for curated
  markets); duplicate inputs are permitted at contract level, although the SDK rejects V1 duplicates
  that over-assign a vault position; and no-ops and zero-checks are not systematically prevented.
- The contract carries two audits (blackthorn, trustsec, 2026-07-06) in
  [`audits/`](https://github.com/morpho-org/bundles/tree/main/audits).

## Future Considerations

- **`vaultExitBundlesV1ForceWithdrawVaultV2`** — the third entry point, deliberately deferred to its
  own TIB. It would give the SDK a force-withdraw that computes its own deallocations, unlike
  today's `forceWithdraw` / `forceRedeem`, and it carries extra surface (`minSharePriceE27`,
  referral fee and recipient) worth deciding on separately. This TIB neither deprecates nor changes
  the existing force paths.

## References

- [`VaultExitBundlesV1.sol`](https://github.com/morpho-org/bundles/blob/main/src/vault-exit/VaultExitBundlesV1.sol) — the contract
- [`TokenLib.sol`](https://github.com/morpho-org/bundles/blob/main/src/libraries/TokenLib.sol) — the `Permit` struct and `submitPermit` semantics
- [morpho-org/bundles README](https://github.com/morpho-org/bundles) — the bundles design rationale and audits
- [PR #907 — `test(morpho-sdk): deploy VaultExitBundlesV1 onto a fork`](https://github.com/morpho-org/sdks/pull/907) — historical predeployment fork setup
- [`vault-v2/src/VaultV2.sol`](https://github.com/morpho-org/vault-v2/blob/main/src/VaultV2.sol) — `DOMAIN_SEPARATOR`, `exit`, `forceDeallocate`, `permit`
- [`TIB-2026-06-03`](./TIB-2026-06-03-midnight-action-output-interface.md) — the `ActionOutput` direction these handles should converge on
- [`TIB-2026-07-02`](./TIB-2026-07-02-blue-repay-native-wrapping.md) — precedent for entity-resolved amounts with a purely assembling action

<!--
TIB conventions:
- Once accepted, do not substantively edit this TIB. If the decision needs to change,
  create a new TIB that supersedes this one and update the Status/Superseded by fields.
- Addenda may be appended to record operational updates that affect
  how the TIB is applied without changing the decision itself.
- TIB identifiers use CalVer (YYYY-MM-DD) based on the date the TIB was first drafted.
- A TIB is a *proposal* until its Status becomes Accepted. Once accepted, the rule the
  TIB decides on is codified in the relevant section of `AGENTS.md`; the TIB stays as
  the dated record of how the decision was reached. TIBs feed `AGENTS.md` — they do
  not override it.
-->
