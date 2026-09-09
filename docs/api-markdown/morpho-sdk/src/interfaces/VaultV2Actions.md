[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultV2Actions

# Interface: VaultV2Actions

Defined in: [packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts:64](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts#L64)

## Properties

### deposit

> **deposit**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts:94](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts#L94)

Prepares a deposit transaction for the VaultV2 contract.

This function constructs the transaction data required to deposit a specified amount of assets into the vault.
Uses pre-fetched vault data for accurate calculations of slippage and asset address,
then returns the prepared deposit transaction and a function for retrieving all required approval transactions.
Bundler Integration: This flow uses the bundler to atomically execute the user's asset transfer and vault deposit in a single transaction for slippage protection.

#### Parameters

##### params

`object` & [`DepositAmountArgs`](../type-aliases/DepositAmountArgs.md)

The deposit parameters.

#### Returns

`object`

The result object.

##### buildTx

> **buildTx**: (`signatures?`) => `Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV2DepositAction`](VaultV2DepositAction.md)\>\>

###### Parameters

###### signatures?

readonly ([`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md))[]

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV2DepositAction`](VaultV2DepositAction.md)\>\>

##### getRequirements

> **getRequirements**: (`params?`) => `Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\>)[]\>

###### Parameters

###### params?

###### useSimplePermit?

`boolean`

###### Returns

`Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\>)[]\>

***

### forceRedeem

> **forceRedeem**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts:266](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts#L266)

Prepares a force redeem transaction for the VaultV2 contract using the vault's native multicall.

This function encodes one or more on-chain forceDeallocate calls followed by a single redeem,
executed atomically via VaultV2's multicall. This allows a user to free liquidity from multiple
illiquid markets and redeem all their shares in one transaction.

This is the share-based counterpart to forceWithdraw, useful for maximum withdrawal scenarios
where specifying an exact asset amount is impractical.

The total assets passed to forceDeallocate calls must be greater than or equal to the
asset-equivalent of the redeemed shares. The caller should apply a buffer on the deallocated
amounts to account for share-price drift between submission and execution.

#### Parameters

##### params

The force redeem parameters.

###### deallocations

readonly [`Deallocation`](Deallocation.md)[]

The typed list of deallocations to perform.

###### redeem

\{ `shares`: `bigint`; \}

The redeem parameters applied after deallocations.

###### redeem.shares

`bigint`

The amount of shares to redeem.

###### userAddress

`` `0x${string}` ``

User address (penalty source and redeem recipient).

#### Returns

`object`

The result object.

##### buildTx

> **buildTx**: () => `Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV2ForceRedeemAction`](VaultV2ForceRedeemAction.md)\>\>

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV2ForceRedeemAction`](VaultV2ForceRedeemAction.md)\>\>

***

### forceWithdraw

> **forceWithdraw**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts:237](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts#L237)

Prepares a force withdraw transaction for the VaultV2 contract using the vault's native multicall.

This function encodes one or more on-chain forceDeallocate calls followed by a single withdraw,
executed atomically via VaultV2's multicall. This allows a user to free liquidity from multiple
illiquid markets and withdraw the resulting assets in one transaction.

#### Parameters

##### params

The force withdraw parameters.

###### deallocations

readonly [`Deallocation`](Deallocation.md)[]

The typed list of deallocations to perform.

###### userAddress

`` `0x${string}` ``

User address (penalty source and withdraw recipient).

###### withdraw

\{ `amount`: `bigint`; \}

The withdraw parameters applied after deallocations.

###### withdraw.amount

`bigint`

The amount of assets to withdraw.

#### Returns

`object`

The result object.

##### buildTx

> **buildTx**: () => `Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV2ForceWithdrawAction`](VaultV2ForceWithdrawAction.md)\>\>

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV2ForceWithdrawAction`](VaultV2ForceWithdrawAction.md)\>\>

***

### getData

> **getData**: (`parameters?`) => `Promise`\<[`AccrualVaultV2`](../../../blue-sdk/src/classes/AccrualVaultV2.md)\>

Defined in: [packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts:73](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts#L73)

Fetches the latest vault data.

This function fetches the latest vault data from the blockchain.

#### Parameters

##### parameters?

`FetchParameters`

The parameters for the fetch operation.

#### Returns

`Promise`\<[`AccrualVaultV2`](../../../blue-sdk/src/classes/AccrualVaultV2.md)\>

The latest vault data.

***

### inKindRedeem

> `readonly` **inKindRedeem**: (`params`) => [`ActionOutput`](ActionOutput.md)\<[`VaultV2InKindRedeemAction`](VaultV2InKindRedeemAction.md), readonly ([`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md))[], `undefined`\>

Defined in: [packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts:210](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts#L210)

Prepares an illiquid Vault V2 exit into idle assets and Morpho Blue supply positions.

The vault must have exactly one `MorphoMarketV1AdapterV2`. `amount` is penalty-inclusive and
the caller controls market order. Call `getRequirements()` before `buildTx()` so Blue balance,
allowance, and nonce are checked on-chain. Vault gates are enforced by the final transaction
and are not preflighted: receive gates may depend on VaultExitBundlesV1's transient initiator,
while arbitrary send-share gates may depend on intermediate state changed by the exit's
multiple share burns. The SDK intentionally does not validate the user's share balance; size
it so `amount + BigInt(marketParamsList.length) <= vault.previewRedeem(sharesHeld)`. The
per-market term covers V2 withdrawal rounding and is not needed for V1. The share allowance
includes that buffer, the penalty burns, and accrual through the bundle deadline.

Idle balance, penalty, and adapter positions can drift after the snapshot, so an on-chain
under-coverage panic remains possible if vault state changes between preparation and inclusion.

#### Parameters

##### params

In-kind redemption parameters.

###### adapter?

`` `0x${string}` ``

Optional adapter override; defaults to the vault's sole adapter.

###### amount

`bigint`

Penalty-inclusive, asset-denominated amount to exit.

###### deadline?

`bigint`

Optional shared permit/bundle deadline; defaults to two hours from now.

###### marketParamsList

readonly [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)[]

Ordered adapter markets consumed greedily after idle assets;
  its length is also the V2 share-sufficiency rounding buffer.

###### userAddress

`` `0x${string}` ``

Account that signs and submits the exit.

###### vaultData

[`AccrualVaultV2`](../../../blue-sdk/src/classes/AccrualVaultV2.md)

Pre-fetched Vault V2 accrual snapshot.

#### Returns

[`ActionOutput`](ActionOutput.md)\<[`VaultV2InKindRedeemAction`](VaultV2InKindRedeemAction.md), readonly ([`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md))[], `undefined`\>

Lazy prerequisite resolution and a synchronous transaction builder.

#### Throws

when the client and entity target different chains.

#### Throws

when `vaultData` belongs to another vault.

#### Throws

when `amount` is not positive.

#### Throws

when the vault has no idle assets and the
  penalty-adjusted amount rounds to zero deallocated assets.

#### Throws

when assets must be deallocated and the market list is empty.

#### Throws

when `deadline` is not in the future at handle creation or
  requirement resolution.

#### Throws

when the vault does not have one adapter.

#### Throws

when `adapter` is not the vault's adapter.

#### Throws

when the adapter is not a MorphoMarketV1AdapterV2.

#### Throws

when the deduplicated list cannot cover the exit.

#### Throws

when no address registry exists for the target chain.

#### Throws

when VaultExitBundlesV1 is not registered on the target chain.

#### Throws

from `getRequirements()` when an RPC or multicall contract read fails.

#### Throws

from `getRequirements()` when Blue cannot fund the largest callback.

#### Throws

from `buildTx()` when more than one permit signature is supplied.

#### Throws

from `buildTx()` when a non-permit signature is supplied.

#### Throws

from `buildTx()` when the requirement has the wrong permit kind, asset, or signature encoding.

#### Example

```ts
import { isRequirementSignature } from "@morpho-org/morpho-sdk";

const vault = client.morpho.vaultV2(vaultAddress, 1);
const vaultData = await vault.getData();
const exit = vault.inKindRedeem({
  amount: 1_000_000n,
  marketParamsList,
  vaultData,
  userAddress,
});
const signatures = [];
for (const requirement of await exit.getRequirements()) {
  if (isRequirementSignature(requirement)) {
    signatures.push(await requirement.sign(walletClient, userAddress));
  } else {
    const hash = await walletClient.sendTransaction(requirement);
    await client.waitForTransactionReceipt({ hash });
  }
}
const tx = exit.buildTx(signatures);
// tx satisfies Readonly<Transaction<VaultV2InKindRedeemAction>>
```

***

### redeem

> **redeem**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts:138](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts#L138)

Prepares a redeem transaction for the VaultV2 contract.

This function constructs the transaction data required to redeem a specified amount of shares from the vault.

#### Parameters

##### params

The redeem parameters.

###### shares

`bigint`

The amount of shares to redeem.

###### userAddress

`` `0x${string}` ``

User address initiating the redeem.

#### Returns

`object`

The result object.

##### buildTx

> **buildTx**: () => `Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV2RedeemAction`](VaultV2RedeemAction.md)\>\>

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV2RedeemAction`](VaultV2RedeemAction.md)\>\>

***

### withdraw

> **withdraw**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts:124](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/vaultV2/vaultV2.ts#L124)

Prepares a withdraw transaction for the VaultV2 contract.

This function constructs the transaction data required to withdraw a specified amount of assets from the vault.

#### Parameters

##### params

The withdraw parameters.

###### amount

`bigint`

The amount of assets to withdraw.

###### userAddress

`` `0x${string}` ``

User address initiating the withdraw.

#### Returns

`object`

The result object.

##### buildTx

> **buildTx**: () => `Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV2WithdrawAction`](VaultV2WithdrawAction.md)\>\>

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV2WithdrawAction`](VaultV2WithdrawAction.md)\>\>
