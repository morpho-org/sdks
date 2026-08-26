# TIB-2026-08-25: BlueBundlesV1 SDK action flows

| Field      | Value                                   |
| ---------- | --------------------------------------- |
| **Status** | Proposed                                |
| **Date**   | 2026-08-25                              |
| **Author** | @Rubilmax / Carapulse draft             |
| **Scope**  | Package: `morpho-sdk` / `BlueBundlesV1` |

---

## Context

The protocol team introduced `BlueBundlesV1` in `morpho-org/bundles`. Unlike Bundler3, it exposes a
fixed set of user-facing entrypoints whose call order, callbacks, token routing, fee accounting,
refunds, and residue behavior are defined onchain.

The contract currently covers:

- supply collateral and/or borrow;
- repay and/or withdraw collateral;
- supply loan assets;
- withdraw supplied loan assets;
- migrate a full borrow position between two Morpho Blue markets.

`morpho-sdk` already exposes similar Blue operations through Bundler3 and GeneralAdapter1, but those
are not interchangeable implementations. `BlueBundlesV1` has its own permit encoding, referral-fee
semantics, saturated full-repay behavior, full-position migration, and Vault V2 BluePublicAllocator
integration. It also deliberately omits the share-price slippage inputs used by existing Bundler3
flows.

This TIB defines the minimal SDK surface needed to use the new contract. Existing action-flow
conventions remain the default wherever the contract does not introduce different behavior.

PR #919 is the stack dependency because its Vault V2 Blue reallocation output can be mapped to the
contract's `PublicAllocations` input.

The contract revision reviewed for this proposal is `morpho-org/bundles` commit
`dceb05da1c730424e6b36caf445dff808a2d5007`. The implementation must pin the ABI from the final
reviewed deployment revision.

## Goals / Non-Goals

**Goals**

- Add typed SDK actions for all five `BlueBundlesV1` entrypoints.
- Call `BlueBundlesV1` directly rather than reproducing its flows through Bundler3.
- Reuse the existing action/entity/requirement model and existing Blue validation conventions.
- Reuse PR #919's Vault V2 Blue reallocation type and validation.
- Make contract-specific amount, fee, penalty, refund, and migration behavior clear to integrators.
- Keep existing Bundler3-backed Blue methods unchanged.

**Non-Goals**

- No generic bundle-call or arbitrary callback API.
- No automatic routing between Bundler3 and `BlueBundlesV1`.
- No new market-listing, fee-policy, or transaction-orchestration framework.
- No partial borrow-position migration or cross-asset migration.
- No new validation policy where existing action flows already define the behavior.

## Proposed Solution

### Explicit versioned surface

Expose `BlueBundlesV1` as a versioned, chain-scoped SDK surface, following the existing pattern for
fixed bundle contracts. It is chain-scoped because the migration entrypoint takes both source and
destination markets.

Each method returns the same lazy action output used by existing action flows:

- `getRequirements()` resolves only the approvals and Blue authorization needed by the selected
  operation;
- `buildTx(signatures)` remains synchronous and encode-only;
- the final transaction targets the registered `BlueBundlesV1` deployment directly.

Add the contract ABI to the ABI subpath and an optional `bundles.blueBundlesV1` address beside the
existing bundles addresses. Missing deployments follow the same address-resolution behavior as
other direct bundle actions.

Existing `MorphoBlue` methods continue to use Bundler3. The new actions use distinct
`blueBundlesV1...` metadata discriminators so apps and simulations can identify the selected route.

### Action set

| SDK action | Contract entrypoint |
| ---------- | ------------------- |
| `blueBundlesV1SupplyCollateralAndBorrow` | `blueBundlesV1SupplyCollateralAndBorrow` |
| `blueBundlesV1RepayAndWithdrawCollateral` | `blueBundlesV1RepayAndWithdrawCollateral` |
| `blueBundlesV1Supply` | `blueBundlesV1Supply` |
| `blueBundlesV1Withdraw` | `blueBundlesV1Withdraw` |
| `blueBundlesV1MigrateBorrowPosition` | `blueBundlesV1MigrateBorrowPosition` |

The pure builders mirror the contract inputs. The entity layer applies the same state-aware checks
and requirement discovery already used by equivalent Blue actions.

### Requirements

Reuse the existing requirement output and ordering conventions.

Token-funded entrypoints support the paths accepted by the contract: existing allowance,
ERC-2612, Permit2 SignatureTransfer, or native funding when the asset is wrapped native. Add only
the minimal `TokenLib` permit representation needed by the ABI; do not redesign the shared
requirement model.

For first-time Permit2 users, follow the existing Permit2 requirement pattern: return the token
approval to Permit2 and the SignatureTransfer signature requirement together. Existing sufficient
allowance removes only the approval step, not the signature.

Blue authorization targets the resolved `BlueBundlesV1` contract instead of GeneralAdapter1. Reuse
the existing authorization helper with a configurable authorized target.

Call deadlines and signature deadlines keep the same separation as other signed action flows. The
pure builder validates input shape only; current-time checks stay in the stateful requirement or
simulation boundary.

### Vault V2 Blue reallocations

Accept structural values matching the public `VaultV2BlueReallocation` type, including planner
output from PR #919. Map them to `PublicAllocations` without introducing a second public
reallocation model.

Reuse the existing V2 validation and add only the compatibility required by this contract: every
reallocation source and destination must use the operation's loan token. Vault V1 and mixed plans
remain unsupported.

Reallocations are unconditional. A failed call or a changed configured penalty reverts the whole
bundle. The aggregate penalty changes the user's proceeds or destination debt as described below.

### Operation behavior

| Operation | Contract-specific behavior |
| --------- | -------------------------- |
| Supply collateral and/or borrow | Supports pure collateral supply, pure borrow, or both. Reallocations require a nonzero borrow. Borrow proceeds are reduced by allocator penalties and referral fee. |
| Repay and/or withdraw collateral | Supports pure repay, pure withdrawal, or both. Full repay uses the saturated max-shares input. `maxRepayAssets` covers repayment plus referral fee; unused funding is refunded. |
| Supply | Referral fee is deducted from the supplied gross assets. Native funding follows the existing wrapped-native convention. |
| Withdraw | Supports assets or shares mode. Allocator penalties and referral fee are deducted from withdrawn assets. Shares mode has no minimum-assets guarantee. |
| Migrate borrow position | Moves the user's full live source debt and collateral to a destination market with the same loan and collateral tokens. Referral fee and allocator penalties are added to destination debt. |

Common amount exclusivity, positivity, chain, sender, signature, deadline, wrapped-native, allowance,
and buffered-LTV checks follow equivalent implemented Blue actions. This TIB does not add parallel
validators or a stricter policy.

### Share-price behavior

`BlueBundlesV1` does not expose the share-price slippage inputs used by existing Bundler3 actions.
The new SDK methods must not expose parameters the contract cannot enforce, and their documentation
must state this difference. Existing Bundler3 methods remain available when an app requires those
onchain bounds.

### Full borrow-position migration

The migration action is intentionally full-position only:

- source and destination market IDs must differ;
- loan and collateral tokens must match;
- the contract reads the user's live source collateral and borrow shares at execution;
- the remaining source debt is repaid and the full source collateral is moved;
- any existing destination position is extended rather than replaced;
- referral fee and allocator penalties increase destination debt;
- the existing Blue LTV buffer applies to the resulting complete destination position;
- no wallet funding is required; the move is financed through the destination borrow;
- Blue authorization to `BlueBundlesV1` is required.

A third-party partial repay before inclusion reduces the debt migrated. If the source debt reaches
zero, the migration reverts instead of moving a collateral-only position. Because the source debt
is closed before collateral withdrawal, a broken source oracle does not necessarily block the
exit; destination health checks still apply.

### Full repay and exact-share withdrawal

Full repay uses the contract's saturated max-shares behavior, so an epsilon repay before inclusion
does not invalidate the close. If debt is already zero, repayment becomes a no-op and the requested
withdrawal/refund can continue.

`blueBundlesV1Withdraw` has no equivalent max-shares sentinel. A full-close intent therefore encodes
the exact supply shares from the supplied snapshot. An intervening share increase can leave residual
shares; an intervening decrease can revert. The SDK must not describe this as a saturated full
close.

### Native refund behavior

Native-funded repay unwraps and returns unused funding. If `msg.sender` cannot receive native token,
the transaction reverts atomically; the caller should use the ERC-20 funding path. Other native and
wrapped-native checks follow existing action conventions.

## Edge-Behavior Acceptance Matrix

Only behavior specific to `BlueBundlesV1` is listed here. Existing action validations are inherited
and intentionally omitted.

| Situation | Required behavior |
| --------- | ----------------- |
| Public allocator penalty changes or one reallocation fails | The whole bundle reverts; reallocations are unconditional and the penalty match is exact |
| Pure collateral supply includes reallocations | Reject because there is no borrow to consume the added liquidity |
| Native-funded repay cannot refund `msg.sender` | The transaction reverts; use ERC-20 funding for that sender |
| Full repay is epsilon-repaid or fully repaid before inclusion | Close the live remainder or make repayment a no-op, then continue the requested withdrawal/refund |
| Supply shares change after an exact-share close quote | The withdrawal can leave residual shares or revert; do not promise a saturated close |
| Source debt changes before migration | Move the live remaining debt; zero debt makes migration revert |
| Destination already has a position | Add migrated collateral and debt to it; apply the existing buffered-LTV check to the combined position |
| Source oracle is broken during full migration | Source exit may still proceed after debt closure; destination checks remain required |
| Shares-mode withdrawal realizes bad debt | No onchain minimum-assets bound exists; disclose the simulated output and contract trade-off |

## Architectural Decisions

- Call `BlueBundlesV1` directly; do not model it as a Bundler3 action.
- Add a separate versioned surface; do not reroute existing Blue methods.
- Support all five entrypoints with the existing action-output convention.
- Reuse existing requirements and validation helpers; add only contract-specific adaptations.
- Accept PR #919's structural V2 reallocation type; do not create another public model.
- Keep contract amount semantics visible, especially fees, penalties, refunds, and migration debt.
- Keep full borrow migration full-position only.
- Do not invent share-price protection absent from the contract.

## Considered Alternatives

### Model the calls as Bundler3 actions

**Rejected:** `BlueBundlesV1` exists to provide fixed, protocol-owned sequencing. Wrapping it in
Bundler3 changes sender, authorization, native, and refund semantics.

### Transparently switch existing Blue methods

**Rejected:** The routes differ in permit, fee, refund, migration, and share-price behavior. The
caller must select the new contract explicitly.

### Ship only the migration entrypoint

**Rejected:** All five entrypoints share the same deployment, requirements, ABI, and action-output
integration. Supporting them together avoids a one-off surface without introducing a new framework.

## Verification

Follow the existing action-flow test standard: unit calldata coverage, requirement/entity coverage,
and pinned fork execution. Add focused cases only for the contract-specific behavior in the matrix,
including reallocation penalties, saturated repay, migration debt drift, native refund failure, and
no residue.

Existing Bundler3 action tests must remain unchanged and green.

## Assumptions & Constraints

- The implementation pins the deployment-reviewed ABI and registered deployments.
- Product market eligibility and referral-fee policy remain outside core SDK.
- Final simulation remains an app requirement but is not an onchain slippage guarantee.
- The implementation is additive and follows the repository's normal changeset/dependent-package
  policy.

## References

- [BlueBundlesV1 source at reviewed revision](https://github.com/morpho-org/bundles/blob/dceb05da1c730424e6b36caf445dff808a2d5007/src/blue/BlueBundlesV1.sol)
- [BlueBundlesV1 interface at reviewed revision](https://github.com/morpho-org/bundles/blob/dceb05da1c730424e6b36caf445dff808a2d5007/src/blue/interfaces/IBlueBundlesV1.sol)
- [Bundles repository README](https://github.com/morpho-org/bundles/blob/main/README.md)
- [Blue Bundles public allocator integration PR #98](https://github.com/morpho-org/bundles/pull/98)
- [Pure collateral flows PR #125](https://github.com/morpho-org/bundles/pull/125)
- [Saturated full repay PR #126](https://github.com/morpho-org/bundles/pull/126)
- [Share-price slippage removal PR #128](https://github.com/morpho-org/bundles/pull/128)
- [Stack base — morpho-org/sdks PR #919](https://github.com/morpho-org/sdks/pull/919)
