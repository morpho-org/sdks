[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / VaultV1Actions

# Interface: VaultV1Actions

Defined in: [packages/morpho-sdk/src/entities/vaultV1/vaultV1.ts:66](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/vaultV1/vaultV1.ts#L66)

## Properties

### deposit

> **deposit**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/vaultV1/vaultV1.ts:90](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/vaultV1/vaultV1.ts#L90)

Prepares a deposit into a VaultV1 (MetaMorpho) contract.

Uses pre-fetched vault data to compute `maxSharePrice` with slippage tolerance,
then returns `buildTx` and `getRequirements` for lazy evaluation.

#### Parameters

##### params

`object` & [`DepositAmountArgs`](../type-aliases/DepositAmountArgs.md)

The deposit parameters.

#### Returns

`object`

Object with `buildTx` and `getRequirements`.

##### buildTx

> **buildTx**: (`signatures?`) => `Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV1DepositAction`](VaultV1DepositAction.md)\>\>

###### Parameters

###### signatures?

readonly ([`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md))[]

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV1DepositAction`](VaultV1DepositAction.md)\>\>

##### getRequirements

> **getRequirements**: (`params?`) => `Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\>)[]\>

###### Parameters

###### params?

###### useSimplePermit?

`boolean`

###### Returns

`Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\>)[]\>

***

### getData

> **getData**: (`parameters?`) => `Promise`\<[`AccrualVault`](../../../blue-sdk/src/classes/AccrualVault.md)\>

Defined in: [packages/morpho-sdk/src/entities/vaultV1/vaultV1.ts:73](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/vaultV1/vaultV1.ts#L73)

Fetches the latest vault data with accrued interest.

#### Parameters

##### parameters?

`FetchParameters`

Optional fetch parameters (block number, state overrides, etc.).

#### Returns

`Promise`\<[`AccrualVault`](../../../blue-sdk/src/classes/AccrualVault.md)\>

The latest vault data.

***

### inKindRedeem

> `readonly` **inKindRedeem**: (`params`) => [`ActionOutput`](ActionOutput.md)\<[`VaultV1InKindRedeemAction`](VaultV1InKindRedeemAction.md), readonly ([`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md))[], `undefined`\>

Defined in: [packages/morpho-sdk/src/entities/vaultV1/vaultV1.ts:194](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/vaultV1/vaultV1.ts#L194)

Prepares an illiquid Vault V1 exit into the vault's Morpho Blue supply positions.

The caller controls market order and must call `getRequirements()` before `buildTx()` so the
RPC-backed Blue-balance and Morpho-deployment checks run. The SDK validates market coverage but
intentionally does not validate the user's share balance; size `amount` in asset terms against
`previewRedeem(sharesHeld)`. The share allowance first accrues pending performance-fee shares,
then uses the current rounded-up share preview; future interest can only reduce the required
burn.

Snapshot state can drift before inclusion, so a later reallocation may still make the on-chain
loop under-cover even after pre-flight succeeds.

#### Parameters

##### params

In-kind redemption parameters.

###### amount

`bigint`

Asset-denominated amount to exit.

###### deadline?

`bigint`

Optional shared permit/bundle deadline; defaults to two hours from now.

###### marketParamsList

readonly [`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)[]

Ordered vault markets consumed greedily by the contract;
  repeated entries cannot draw from the same vault position twice.

###### userAddress

`` `0x${string}` ``

Account that signs and submits the exit.

###### vaultData

[`AccrualVault`](../../../blue-sdk/src/classes/AccrualVault.md)

Pre-fetched Vault V1 accrual snapshot.

#### Returns

[`ActionOutput`](ActionOutput.md)\<[`VaultV1InKindRedeemAction`](VaultV1InKindRedeemAction.md), readonly ([`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md))[], `undefined`\>

Lazy prerequisite resolution and a synchronous transaction builder.

#### Throws

when the client and entity target different chains.

#### Throws

when `vaultData` belongs to another vault.

#### Throws

when `amount` is not positive.

#### Throws

when the market list is empty.

#### Throws

when `deadline` is not in the future at handle creation or
  requirement resolution.

#### Throws

when the ordered list cannot cover `amount` without
  assigning more than the vault owns in a repeated market.

#### Throws

when no address registry exists for the target chain.

#### Throws

when VaultExitBundlesV1 is not registered on the target chain.

#### Throws

from `getRequirements()` when an RPC or multicall contract read fails.

#### Throws

from `getRequirements()` when the vault uses another Morpho deployment.

#### Throws

from `getRequirements()` when Morpho Blue accrues protocol fees to the vault.

#### Throws

from `getRequirements()` when Blue cannot fund the flash loan.

#### Throws

from `buildTx()` when more than one permit signature is supplied.

#### Throws

from `buildTx()` when a non-permit signature is supplied.

#### Throws

from `buildTx()` when the requirement has the wrong permit kind, asset, or signature encoding.

#### Example

```ts
import { isRequirementSignature } from "@morpho-org/morpho-sdk";

const vault = client.morpho.vaultV1(vaultAddress, 1);
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
// tx satisfies Readonly<Transaction<VaultV1InKindRedeemAction>>
```

***

### migrateToV2

> **migrateToV2**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/vaultV1/vaultV1.ts:219](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/vaultV1/vaultV1.ts#L219)

Prepares a full migration from VaultV1 to VaultV2.

Redeems all V1 shares and atomically deposits the resulting assets into V2
via bundler3. Computes slippage-protected share prices for both legs.

#### Parameters

##### params

The migration parameters.

###### shares

`bigint`

User's V1 share balance to migrate.

###### slippageTolerance?

`bigint`

Slippage tolerance (default 0.03%, max 10%).

###### sourceVault

[`AccrualVault`](../../../blue-sdk/src/classes/AccrualVault.md)

Pre-fetched V1 vault data.

###### targetVault

[`AccrualVaultV2`](../../../blue-sdk/src/classes/AccrualVaultV2.md)

Pre-fetched V2 vault data.

###### userAddress

`` `0x${string}` ``

User address initiating the migration.

#### Returns

`object`

Object with `buildTx` and `getRequirements`.

##### buildTx

> **buildTx**: (`signatures?`) => `Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV1MigrateToV2Action`](VaultV1MigrateToV2Action.md)\>\>

###### Parameters

###### signatures?

readonly ([`PermitRequirementSignature`](PermitRequirementSignature.md) \| [`AuthorizationRequirementSignature`](AuthorizationRequirementSignature.md) \| [`MidnightOfferRootSignature`](MidnightOfferRootSignature.md))[]

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV1MigrateToV2Action`](VaultV1MigrateToV2Action.md)\>\>

##### getRequirements

> **getRequirements**: () => `Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\>)[]\>

###### Returns

`Promise`\<([`Requirement`](Requirement.md)\<[`PermitRequirementSignature`](PermitRequirementSignature.md), `undefined`\> \| `Readonly`\<[`Transaction`](Transaction.md)\<[`ERC20ApprovalAction`](ERC20ApprovalAction.md)\>\>)[]\>

***

### redeem

> **redeem**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/vaultV1/vaultV1.ts:128](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/vaultV1/vaultV1.ts#L128)

Prepares a redeem from a VaultV1 (MetaMorpho) contract.

#### Parameters

##### params

The redeem parameters.

###### shares

`bigint`

Amount of shares to redeem.

###### userAddress

`` `0x${string}` ``

User address initiating the redeem.

#### Returns

`object`

Object with `buildTx`.

##### buildTx

> **buildTx**: () => `Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV1RedeemAction`](VaultV1RedeemAction.md)\>\>

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV1RedeemAction`](VaultV1RedeemAction.md)\>\>

***

### withdraw

> **withdraw**: (`params`) => `object`

Defined in: [packages/morpho-sdk/src/entities/vaultV1/vaultV1.ts:117](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/entities/vaultV1/vaultV1.ts#L117)

Prepares a withdraw from a VaultV1 (MetaMorpho) contract.

#### Parameters

##### params

The withdraw parameters.

###### amount

`bigint`

Amount of assets to withdraw.

###### userAddress

`` `0x${string}` ``

User address initiating the withdraw.

#### Returns

`object`

Object with `buildTx`.

##### buildTx

> **buildTx**: () => `Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV1WithdrawAction`](VaultV1WithdrawAction.md)\>\>

###### Returns

`Readonly`\<[`Transaction`](Transaction.md)\<[`VaultV1WithdrawAction`](VaultV1WithdrawAction.md)\>\>
