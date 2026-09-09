[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / BlueActions

# Interface: BlueActions

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:126](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L126)

## Properties

### borrow

> **borrow**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:296](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L296)

Prepares a borrow transaction.

Routed through bundler3 via `morphoBorrow`.
Validates position health with LLTV buffer (0.5%) using the pre-fetched `positionData`.
Computes `minSharePrice` from market borrow state and `slippageTolerance`.

When `reallocations` is provided, its homogeneous V1 or V2 actions are
prepended before borrowing. V1 fees add to the transaction
value; V2 penalties are paid in the loan token.
Vault V1 inputs are deprecated for high-level Blue writes; use Vault V2
reallocations for new integrations.

`getRequirements` returns the loan-token approval needed for V2 penalties
and Morpho authorization for GeneralAdapter1 when needed.

**Stale `positionData` may cause unexpected health.**

#### Parameters

##### params

Borrow parameters including pre-fetched `positionData` for health validation.

###### amount

`bigint`

###### positionData

[`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md)

###### reallocations?

[`BlueReallocationPlan`](../type-aliases/BlueReallocationPlan.md)

Vault V1 inputs are deprecated for high-level Blue writes; prefer Vault V2.

###### slippageTolerance?

`bigint`

###### userAddress

`` `0x${string}` ``

#### Returns

`object`

Object with `buildTx` and `getRequirements`.

##### buildTx

> **buildTx**: (`signatures?`) => `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueBorrowAction`](BlueBorrowAction.md)\>\>

###### Parameters

###### signatures?

readonly ([`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md))[]

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`BlueBorrowAction`](BlueBorrowAction.md)\>\>

##### getRequirements

> **getRequirements**: () => `Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueAuthorizationAction`](BlueAuthorizationAction.md)\>\>)[]\>

###### Returns

`Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueAuthorizationAction`](BlueAuthorizationAction.md)\>\>)[]\>

#### Throws

when a V2 plan is unsupported on the chain.

#### Throws

when a V2 reallocation asset amount exceeds `uint128` or its penalty exceeds WAD.

#### Throws

when V2 entries for one vault use different penalties.

#### Throws

when a V2 vault or adapter address is malformed.

#### Throws

when a V2 source is absent, incomplete, or has an unknown discriminator.

#### Throws

when an entry matches both or neither V1/V2 shape.

#### Throws

when one plan contains both V1 and V2 entries.

***

### getMarketData

> **getMarketData**: (`parameters?`) => `Promise`\<[`Market`](../../../blue-sdk/src/classes/Market.md)\>

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:133](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L133)

Fetches the latest market data with accrued interest.

#### Parameters

##### parameters?

`FetchParameters`

Optional fetch parameters (block number, state overrides).

#### Returns

`Promise`\<[`Market`](../../../blue-sdk/src/classes/Market.md)\>

Market state including total supply/borrow assets and shares.

***

### getPositionData

> **getPositionData**: (`userAddress`, `parameters?`) => `Promise`\<[`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md)\>

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:142](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L142)

Fetches the user's position in this market with accrued interest.

#### Parameters

##### userAddress

`` `0x${string}` ``

The user whose position to fetch.

##### parameters?

`FetchParameters`

Optional fetch parameters (block number, state overrides).

#### Returns

`Promise`\<[`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md)\>

Accrual position with health metrics (maxBorrowAssets, ltv, isHealthy).

***

### ~~getReallocationData~~

> **getReallocationData**: (`params`) => `Promise`\<`VaultV1ReallocationData`\>

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:587](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L587)

Fetches Vault V1 PublicAllocator state using the deprecated unversioned name.

#### Parameters

##### params

###### block

\{ `number`: `bigint`; `timestamp`: `bigint`; \}

###### block.number

`bigint`

Block number used for every RPC read.

###### block.timestamp

`bigint`

Timestamp corresponding to the fetched block.

###### vaultAddresses

readonly `` `0x${string}` ``[]

Addresses of MetaMorpho vaults that allocate to this market.

#### Returns

`Promise`\<`VaultV1ReallocationData`\>

A `VaultV1ReallocationData` snapshot populated from one block.

#### Throws

when the client chain does not match this market.

#### Deprecated

Vault V1 shared-liquidity planning will be removed in the next major. Use
[getVaultV2BlueReallocationData](#getvaultv2bluereallocationdata).

***

### ~~getReallocations~~

> **getReallocations**: (`params`) => readonly [`VaultV1Reallocation`](VaultV1Reallocation.md)[]

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:686](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L686)

Computes Vault V1 PublicAllocator reallocations using the deprecated unversioned name.

#### Parameters

##### params

`VaultV1ReallocationsParams`

#### Returns

readonly [`VaultV1Reallocation`](VaultV1Reallocation.md)[]

Vault V1 reallocations ready for a Blue action.

#### Throws

when `reallocationData` belongs to another chain.

#### Throws

when shared liquidity cannot cover the operation.

#### Throws

when a withdrawal exceeds market supply.

#### Throws

when a selected vault lacks allocator state.

#### Throws

when the target market is absent.

#### Deprecated

Vault V1 shared-liquidity planning will be removed in the next major. Use
[getVaultV2BlueReallocations](#getvaultv2bluereallocations).

#### Example

```ts
const reallocations = market.getReallocations({
  reallocationData,
  operation: "borrow",
  amount: 1_000_000n,
});
```

***

### ~~getVaultV1ReallocationData~~

> **getVaultV1ReallocationData**: (`params`) => `Promise`\<`VaultV1ReallocationData`\>

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:568](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L568)

Fetches all on-chain data needed to construct a VaultV1ReallocationData
for computing vault reallocations via the public allocator.

The target market is refetched internally at `block.number` so the
reallocation planner always sees a snapshot from the same block as the
source vaults. A caller-owned market would let stale or adversarial data
inject unnecessary `reallocateTo` actions (and their PublicAllocator
fees) into the resulting bundle.

The returned reallocation data can be passed to [getVaultV1Reallocations](#getvaultv1reallocations)
to compute the `VaultV1Reallocation[]` array for `borrow()` or
`supplyCollateralBorrow()`.

**Stale data reverts on-chain (fail-safe).**

#### Parameters

##### params

###### block

\{ `number`: `bigint`; `timestamp`: `bigint`; \}

The block to fetch data at (number and timestamp).

###### block.number

`bigint`

###### block.timestamp

`bigint`

###### vaultAddresses

readonly `` `0x${string}` ``[]

Addresses of MetaMorpho vaults that allocate to this market.

#### Returns

`Promise`\<`VaultV1ReallocationData`\>

A VaultV1ReallocationData instance populated with all required data.

#### Throws

when the client chain does not match this market.

#### Deprecated

Vault V1 shared-liquidity planning will be removed in the next major. Use
[getVaultV2BlueReallocationData](#getvaultv2bluereallocationdata).

***

### ~~getVaultV1Reallocations~~

> **getVaultV1Reallocations**: (`params`) => readonly [`VaultV1Reallocation`](VaultV1Reallocation.md)[]

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:657](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L657)

Computes Vault V1 PublicAllocator reallocations for this market.

Uses the shared-liquidity algorithm to determine which vaults should reallocate liquidity to
this market via the PublicAllocator, based on the post-operation utilization target.

Pass `{ borrowAmount }` for a borrow (legacy alias, equivalent to `{ operation: "borrow",
amount }`) or `{ operation: "withdraw", amount }` for a loan-asset withdraw.

#### Parameters

##### params

`VaultV1ReallocationsParams`

#### Returns

readonly [`VaultV1Reallocation`](VaultV1Reallocation.md)[]

Array of vault reallocations ready to pass to `borrow()`, `supplyCollateralBorrow()`,
         or `withdraw()`. Empty array if no reallocation is needed.

#### Throws

when `reallocationData` belongs to a different chain than this market.

#### Throws

when shared liquidity cannot cover the operation's absolute shortfall on the target market — preventing fee-bearing reallocations from being attached to a call that would still revert onchain.

#### Throws

when a withdrawal exceeds the target market supply.

#### Throws

when a selected vault is missing its public allocator config.

#### Throws

when the target market is absent from the reallocation data.

#### Deprecated

Vault V1 shared-liquidity planning will be removed in the next major. Use
[getVaultV2BlueReallocations](#getvaultv2bluereallocations).

#### Example

```ts
const reallocations = market.getVaultV1Reallocations({
  reallocationData,
  operation: "borrow",
  amount: 1_000_000n,
});
```

***

### getVaultV2BlueReallocationData

> **getVaultV2BlueReallocationData**: (`params`) => `Promise`\<`VaultV2BlueReallocationData`\>

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:613](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L613)

Fetches Vault V2 BluePublicAllocator state for this target market.

Reads the target Morpho Blue market, each Vault V2 accrual tree, and each
vault's BluePublicAllocator permissions and allocation caps at one block.

#### Parameters

##### params

###### block

\{ `number`: `bigint`; `timestamp`: `bigint`; \}

###### block.number

`bigint`

Block number used for every RPC read.

###### block.timestamp

`bigint`

Timestamp corresponding to the fetched block.

###### vaultAddresses

readonly `` `0x${string}` ``[]

Vault V2 addresses to inspect for market or idle liquidity.

#### Returns

`Promise`\<`VaultV2BlueReallocationData`\>

A `VaultV2BlueReallocationData` snapshot ready for [getVaultV2BlueReallocations](#getvaultv2bluereallocations).

#### Throws

when the client chain does not match this market.

#### Throws

when the chain is absent from the address registry.

#### Throws

when the chain has no BluePublicAllocator deployment.

#### Throws

when the chain has no Vault V2 factory.

#### Throws

when a requested address is not a Vault V2 from that factory.

#### Throws

when a vault contains an unsupported adapter.

#### Throws

when an RPC or contract read fails with no fallback left.

***

### getVaultV2BlueReallocations

> **getVaultV2BlueReallocations**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:718](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L718)

Computes Vault V2 BluePublicAllocator reallocations for this market.

#### Parameters

##### params

`VaultV2BlueReallocationsParams`

#### Returns

`object`

Action-ready reallocations and their post-simulation state.

##### data

> `readonly` **data**: `VaultV2BlueReallocationData`

##### reallocations

> `readonly` **reallocations**: readonly [`VaultV2BlueReallocation`](VaultV2BlueReallocation.md)[]

#### Throws

when `reallocationData` belongs to another chain.

#### Throws

when a utilization or penalty limit is negative.

#### Throws

when a utilization or penalty limit exceeds WAD.

#### Throws

when an enabled operation amount is not positive.

#### Throws

when a required market is absent.

#### Throws

when configured vault state is absent.

#### Throws

when allocator authorization state is absent.

#### Throws

when active-adapter state is absent.

#### Throws

when an adapter-market allocator configuration is absent.

#### Throws

when required allocation state is absent.

#### Throws

when an inconsistent adapter snapshot underflows during the final transition.

#### Throws

when an inconsistent allocation snapshot underflows during the final transition.

#### Throws

when selected liquidity cannot cover the shortfall.

#### Throws

when a withdrawal exceeds market supply.

#### Example

```ts
const result = market.getVaultV2BlueReallocations({
  reallocationData,
  options: { operation: { type: "borrow", amount: 1_000_000n } },
});
```

***

### refinance

> **refinance**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:519](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L519)

Prepares an atomic refinance migrating this market's position to another Morpho Blue market
that shares the same loan and collateral tokens. See [blueRefinance](../functions/blueRefinance.md) for the bundle.

Validates ownership, token/id match, that amounts do not exceed the source position, and that
both the residual source and the aggregate target position stay within LLTV − buffer. Both
markets are forward-accrued to `now`; in shares mode the target borrow is overshot by
`slippageTolerance` and the callback sweeps the residual.
A homogeneous V1 or V2 target reallocation plan runs first; V1 fees add
to the transaction value and V2 penalties are paid
in the loan token.
Vault V1 inputs are deprecated for high-level Blue writes; use Vault V2
reallocations for new integrations.

`getRequirements` returns the loan-token approval needed for V2 penalties
and Morpho authorization for GeneralAdapter1 when needed.

#### Parameters

##### params

###### borrowAssets?

`bigint`

Loan assets to repay on source; exclusive with `borrowShares`.

###### borrowShares?

`bigint`

Borrow shares to repay on source; exclusive with `borrowAssets`.

###### collateralAmount

`bigint`

Amount of collateral to migrate from source to target.

###### positionData

[`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md)

Pre-fetched source-market accrual position.

###### slippageTolerance?

`bigint`

WAD slippage tolerance. Defaults to `DEFAULT_SLIPPAGE_TOLERANCE`.

###### target

\{ `marketParams`: [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md); `positionData`: [`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md); \}

###### target.marketParams

[`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)

Target market params.

###### target.positionData

[`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md)

Pre-fetched target-market accrual position (zero-position if none).

###### targetReallocations?

[`BlueReallocationPlan`](../type-aliases/BlueReallocationPlan.md)

Vault V1 inputs are deprecated for high-level Blue writes; prefer Vault V2.

###### userAddress

`` `0x${string}` ``

Position owner on both markets.

#### Returns

`object`

Object with `buildTx` and `getRequirements`.

##### buildTx

> **buildTx**: (`signatures?`) => `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueRefinanceAction`](BlueRefinanceAction.md)\>\>

###### Parameters

###### signatures?

readonly ([`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md))[]

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`BlueRefinanceAction`](BlueRefinanceAction.md)\>\>

##### getRequirements

> **getRequirements**: () => `Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueAuthorizationAction`](BlueAuthorizationAction.md)\>\>)[]\>

###### Returns

`Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueAuthorizationAction`](BlueAuthorizationAction.md)\>\>)[]\>

#### Throws

when a V2 plan is unsupported on the chain.

#### Throws

when a V2 reallocation asset amount exceeds `uint128` or its penalty exceeds WAD.

#### Throws

when V2 entries for one vault use different penalties.

#### Throws

when a V2 vault or adapter address is malformed.

#### Throws

when a V2 source is absent, incomplete, or has an unknown discriminator.

#### Throws

when an entry matches both or neither V1/V2 shape.

#### Throws

when one plan contains both V1 and V2 entries.

***

### repay

> **repay**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:334](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L334)

Prepares a repay transaction.

Routed through bundler3 via GeneralAdapter1.
Supports two modes via [RepayAmountArgs](../type-aliases/RepayAmountArgs.md):
- **By assets** (`{ amount }`): repays an exact asset amount (partial repay).
- **By shares** (`{ shares }`): repays exact shares (full repay, immune to interest accrual).

Computes `maxSharePrice` from market borrow state and `slippageTolerance`.

`getRequirements` returns ERC20 approval for loan token to GeneralAdapter1.
Does NOT require Morpho authorization (anyone can repay on behalf of anyone).

**Shares mode:** `slippageTolerance` also caps `transferAmount`.

#### Parameters

##### params

`object` & [`RepayAmountArgs`](../type-aliases/RepayAmountArgs.md)

Repay parameters including pre-fetched `positionData`.

#### Returns

`object`

Object with `buildTx` and `getRequirements`.

##### buildTx

> **buildTx**: (`signatures?`) => `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueRepayAction`](BlueRepayAction.md)\>\>

###### Parameters

###### signatures?

readonly ([`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md))[]

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`BlueRepayAction`](BlueRepayAction.md)\>\>

##### getRequirements

> **getRequirements**: (`params?`) => `Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\>)[]\>

###### Parameters

###### params?

###### useSimplePermit?

`boolean`

Prefer the ERC-2612 simple-permit path when the SDK detects support.
Leave unset or set to `false` to force the Permit2/classic approval fallback when
a token is known to be incompatible despite passing the SDK's shallow nonce probe.

###### Returns

`Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\>)[]\>

***

### repayWithdrawCollateral

> **repayWithdrawCollateral**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:398](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L398)

Prepares an atomic repay-and-withdraw-collateral transaction.

Routed through bundler3. Bundle order: repay FIRST, then withdraw.
Validates combined position health: simulates the repay, then checks
that the resulting position can sustain the collateral withdrawal.

`getRequirements` returns in parallel:
- ERC20 approval for loan token to GeneralAdapter1 (for the repay).
- `morpho.setAuthorization(generalAdapter1, true)` if not yet authorized (for the withdraw).

**Stale `positionData` risks underestimated debt and unsafe withdrawal.**

#### Parameters

##### params

`object` & [`RepayAmountArgs`](../type-aliases/RepayAmountArgs.md)

Combined parameters including pre-fetched `positionData`.

#### Returns

`object`

Object with `buildTx` and `getRequirements`.

##### buildTx

> **buildTx**: (`signatures?`) => `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueRepayWithdrawCollateralAction`](BlueRepayWithdrawCollateralAction.md)\>\>

###### Parameters

###### signatures?

readonly ([`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md))[]

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`BlueRepayWithdrawCollateralAction`](BlueRepayWithdrawCollateralAction.md)\>\>

##### getRequirements

> **getRequirements**: (`params?`) => `Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueAuthorizationAction`](BlueAuthorizationAction.md)\>\>)[]\>

###### Parameters

###### params?

###### useSimplePermit?

`boolean`

Prefer the ERC-2612 simple-permit path when the SDK detects support.
Leave unset or set to `false` to force the Permit2/classic approval fallback when
a token is known to be incompatible despite passing the SDK's shallow nonce probe.

###### Returns

`Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueAuthorizationAction`](BlueAuthorizationAction.md)\>\>)[]\>

***

### supply

> **supply**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:190](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L190)

Prepares a loan-asset supply transaction.

Routed through bundler via GeneralAdapter1. Computes `maxSharePrice` from the supply state of
`marketData` forward-accrued to execution and `slippageTolerance` to protect against
share-price inflation.
`getRequirements` returns ERC20 approval or permit for `GeneralAdapter1` on the loan token.
When `nativeAmount` is provided, native token is wrapped; the loan token must be wNative.

No Morpho authorization required (supplier is crediting, not withdrawing).

#### Parameters

##### params

`object` & [`DepositAmountArgs`](../type-aliases/DepositAmountArgs.md)

Supply parameters.

#### Returns

`object`

Object with `buildTx` and `getRequirements`.

##### buildTx

> **buildTx**: (`signatures?`) => `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueSupplyAction`](BlueSupplyAction.md)\>\>

###### Parameters

###### signatures?

readonly ([`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md))[]

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`BlueSupplyAction`](BlueSupplyAction.md)\>\>

##### getRequirements

> **getRequirements**: (`params?`) => `Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\>)[]\>

###### Parameters

###### params?

###### useSimplePermit?

`boolean`

Prefer the ERC-2612 simple-permit path when the SDK detects support.
Leave unset or set to `false` to force the Permit2/classic approval fallback when
a token is known to be incompatible despite passing the SDK's shallow nonce probe.

###### Returns

`Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\>)[]\>

***

### supplyCollateral

> **supplyCollateral**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:157](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L157)

Prepares a supply-collateral transaction.

Routed through bundler via GeneralAdapter1.
`getRequirements` returns ERC20 approval or permit for GeneralAdapter1.
When `nativeAmount` is provided, native token is wrapped; collateral must be wNative.

#### Parameters

##### params

`object` & [`DepositAmountArgs`](../type-aliases/DepositAmountArgs.md)

Supply collateral parameters.

#### Returns

`object`

Object with `buildTx` and `getRequirements`.

##### buildTx

> **buildTx**: (`signatures?`) => `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueSupplyCollateralAction`](BlueSupplyCollateralAction.md)\>\>

###### Parameters

###### signatures?

readonly ([`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md))[]

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`BlueSupplyCollateralAction`](BlueSupplyCollateralAction.md)\>\>

##### getRequirements

> **getRequirements**: (`params?`) => `Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\>)[]\>

###### Parameters

###### params?

###### useSimplePermit?

`boolean`

Prefer the ERC-2612 simple-permit path when the SDK detects support.
Leave unset or set to `false` to force the Permit2/classic approval fallback when
a token is known to be incompatible despite passing the SDK's shallow nonce probe.

###### Returns

`Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\>)[]\>

***

### supplyCollateralBorrow

> **supplyCollateralBorrow**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:454](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L454)

Prepares an atomic supply-collateral-and-borrow transaction.

Routed through the bundler. Validates position health with LLTV buffer
to prevent instant liquidation on new positions near the LLTV threshold.

When `reallocations` is provided, its homogeneous V1 or V2 actions run
between the collateral supply and `morphoBorrow`. V1 fees add
to the transaction value; V2 penalties are paid in the loan token.
Vault V1 inputs are deprecated for high-level Blue writes; use Vault V2
reallocations for new integrations.

`getRequirements` returns in parallel:
- ERC20 approval or permit for collateral token (to GeneralAdapter1).
- Classic ERC20 approval for any V2 loan-token penalties.
- `morpho.setAuthorization(generalAdapter1, true)` if adapter is not yet authorized.

**Stale `positionData` may cause unexpected health.**

#### Parameters

##### params

`object` & [`DepositAmountArgs`](../type-aliases/DepositAmountArgs.md)

Combined parameters including pre-fetched `positionData` for health validation.

#### Returns

`object`

Object with `buildTx` and `getRequirements`.

##### buildTx

> **buildTx**: (`signatures?`) => `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueSupplyCollateralBorrowAction`](BlueSupplyCollateralBorrowAction.md)\>\>

###### Parameters

###### signatures?

readonly ([`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md))[]

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`BlueSupplyCollateralBorrowAction`](BlueSupplyCollateralBorrowAction.md)\>\>

##### getRequirements

> **getRequirements**: (`params?`) => `Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueAuthorizationAction`](BlueAuthorizationAction.md)\>\>)[]\>

###### Parameters

###### params?

###### useSimplePermit?

`boolean`

Prefer the ERC-2612 simple-permit path when the SDK detects support.
Leave unset or set to `false` to force the Permit2/classic approval fallback when
a token is known to be incompatible despite passing the SDK's shallow nonce probe.

###### Returns

`Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueAuthorizationAction`](BlueAuthorizationAction.md)\>\>)[]\>

#### Throws

when a V2 plan is unsupported on the chain.

#### Throws

when a V2 reallocation asset amount exceeds `uint128` or its penalty exceeds WAD.

#### Throws

when V2 entries for one vault use different penalties.

#### Throws

when a V2 vault or adapter address is malformed.

#### Throws

when a V2 source is absent, incomplete, or has an unknown discriminator.

#### Throws

when an entry matches both or neither V1/V2 shape.

#### Throws

when one plan contains both V1 and V2 entries.

***

### withdraw

> **withdraw**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:246](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L246)

Prepares a loan-asset withdraw transaction.

Routed through bundler3 via `morphoWithdraw`. Supports two modes via [AssetsOrSharesArgs](../type-aliases/AssetsOrSharesArgs.md):
- **By assets** (`{ assets }`): withdraws an exact asset amount.
- **By shares** (`{ shares }`): burns an exact share count (full close, immune to interest accrual).

Computes `minSharePrice` from market supply state and `slippageTolerance`.

When `reallocations` is provided, its homogeneous V1 or V2 actions are
prepended to move liquidity before withdrawing. V1 fees add
to the transaction value; V2 penalties are paid in the loan token.
Vault V1 inputs are deprecated for high-level Blue writes; use Vault V2
reallocations for new integrations.

`getRequirements` returns the loan-token approval needed for V2 penalties
and `morpho.setAuthorization(generalAdapter1, true)` when GA1 is not yet
authorized on Morpho.

**Stale `positionData` may cause unexpected supply share calculations.**

#### Parameters

##### params

`object` & [`AssetsOrSharesArgs`](../type-aliases/AssetsOrSharesArgs.md)

Withdraw parameters including pre-fetched `positionData`.

#### Returns

`object`

Object with `buildTx` and `getRequirements`.

##### buildTx

> **buildTx**: (`signatures?`) => `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueWithdrawAction`](BlueWithdrawAction.md)\>\>

###### Parameters

###### signatures?

readonly ([`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md))[]

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`BlueWithdrawAction`](BlueWithdrawAction.md)\>\>

##### getRequirements

> **getRequirements**: () => `Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueAuthorizationAction`](BlueAuthorizationAction.md)\>\>)[]\>

###### Returns

`Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueAuthorizationAction`](BlueAuthorizationAction.md)\>\>)[]\>

#### Throws

when a V2 plan is unsupported on the chain.

#### Throws

when a V2 reallocation asset amount exceeds `uint128` or its penalty exceeds WAD.

#### Throws

when V2 entries for one vault use different penalties.

#### Throws

when a V2 vault or adapter address is malformed.

#### Throws

when a V2 source is absent, incomplete, or has an unknown discriminator.

#### Throws

when an entry matches both or neither V1/V2 shape.

#### Throws

when one plan contains both V1 and V2 entries.

***

### withdrawCollateral

> **withdrawCollateral**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/blue/blue.ts:374](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/blue/blue.ts#L374)

Prepares a withdraw-collateral transaction.

Direct call to `morpho.withdrawCollateral()` — no bundler, no GeneralAdapter1.
The caller (`msg.sender`) must be `onBehalf`.
Validates position health after withdrawal using the LLTV buffer.

No `getRequirements` — no ERC20 approval or GeneralAdapter1 authorization needed
(collateral flows out of Morpho, not in).

**No on-chain slippage guard — stale `positionData` risks liquidation.**

#### Parameters

##### params

Withdraw collateral parameters including pre-fetched `positionData` for health validation.

###### amount

`bigint`

###### positionData

[`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md)

###### userAddress

`` `0x${string}` ``

#### Returns

`object`

Object with `buildTx`.

##### buildTx

> **buildTx**: () => `Readonly`\<[`Transaction`](Transaction.md)\<[`BlueWithdrawCollateralAction`](BlueWithdrawCollateralAction.md)\>\>

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`BlueWithdrawCollateralAction`](BlueWithdrawCollateralAction.md)\>\>
