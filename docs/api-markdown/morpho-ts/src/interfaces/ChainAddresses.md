[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / ChainAddresses

# Interface: ChainAddresses

Defined in: [packages/morpho-ts/src/addresses.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L18)

Registry entry for protocol, adapter, factory, and token addresses on one chain.

## Properties

### adaptiveCurveIrm

> **adaptiveCurveIrm**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:68](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L68)

AdaptiveCurveIrm contract that lets Morpho update utilization-responsive borrow rates per market.

***

### blue?

> `optional` **blue?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:24](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L24)

Morpho Blue core contract for isolated lending markets, positions, authorization, and liquidations.

TODO(vNext-major): make `blue` required when the deprecated `morpho` alias is removed.

***

### bundler3

> **bundler3**: `object`

Defined in: [packages/morpho-ts/src/addresses.ts:34](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L34)

Bundler3 batch executor and adapters for composing user workflows.

#### aaveV2MigrationAdapter?

> `optional` **aaveV2MigrationAdapter?**: `` `0x${string}` ``

Bundler3 adapter for migrating Aave V2 debt and aToken positions to Morpho.

#### aaveV3CoreMigrationAdapter?

> `optional` **aaveV3CoreMigrationAdapter?**: `` `0x${string}` ``

Bundler3 adapter for migrating positions from the core Aave V3 pool to Morpho.

#### aaveV3EtherFiMigrationAdapter?

> `optional` **aaveV3EtherFiMigrationAdapter?**: `` `0x${string}` ``

Bundler3 adapter for migrating positions from the Aave V3 EtherFi pool to Morpho.

#### aaveV3OptimizerMigrationAdapter?

> `optional` **aaveV3OptimizerMigrationAdapter?**: `` `0x${string}` ``

Bundler3 adapter for migrating Aave V3 Optimizer positions to Morpho.

#### aaveV3PrimeMigrationAdapter?

> `optional` **aaveV3PrimeMigrationAdapter?**: `` `0x${string}` ``

Bundler3 adapter for migrating positions from the Aave V3 Prime pool to Morpho.

#### bundler3

> **bundler3**: `` `0x${string}` ``

Bundler3 multicall executor that transiently records the bundle initiator for adapters.

#### compoundV2MigrationAdapter?

> `optional` **compoundV2MigrationAdapter?**: `` `0x${string}` ``

Bundler3 adapter for migrating Compound V2 cToken or cETH debt and collateral positions to Morpho.

#### compoundV3MigrationAdapter?

> `optional` **compoundV3MigrationAdapter?**: `` `0x${string}` ``

Bundler3 adapter for migrating Compound V3 base debt and collateral positions to Morpho.

#### erc20WrapperAdapter?

> `optional` **erc20WrapperAdapter?**: `` `0x${string}` ``

Bundler3 adapter for ERC20Wrapper deposit and withdraw flows, especially permissioned wrappers.

#### generalAdapter1

> **generalAdapter1**: `` `0x${string}` ``

Chain-agnostic Bundler3 adapter for Morpho Blue, ERC4626, wrapped native, and token-transfer actions.

#### paraswapAdapter?

> `optional` **paraswapAdapter?**: `` `0x${string}` ``

Bundler3 adapter for Paraswap Augustus swaps, including swaps sized from Morpho debt.

***

### bundles?

> `readonly` `optional` **bundles?**: `object`

Defined in: [packages/morpho-ts/src/addresses.ts:59](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L59)

Standalone bundle periphery contracts for composing protocol workflows outside Bundler3.

#### blueBundlesV1?

> `readonly` `optional` **blueBundlesV1?**: `` `0x${string}` ``

BlueBundlesV1 periphery contract for fixed Morpho Blue supply, borrow, repay, withdraw, and migrate flows.

#### vaultBundlesV1?

> `readonly` `optional` **vaultBundlesV1?**: `` `0x${string}` ``

VaultBundlesV1 periphery contract for vault deposit, withdraw, and same-asset migrate flows.

#### vaultExitBundlesV1

> `readonly` **vaultExitBundlesV1**: `` `0x${string}` ``

VaultExitBundlesV1 periphery contract for force-withdraw and in-kind redemption vault-exit flows.

***

### chainlinkOracleFactory?

> `optional` **chainlinkOracleFactory?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:92](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L92)

MorphoChainlinkOracleV2 factory that creates and indexes Morpho Blue Chainlink/ERC4626 price oracles.

***

### dai?

> `optional` **dai?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:104](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L104)

DAI token.

Must implement DAI-specific permit, otherwise permit signatures break.

***

### ecrecoverAuthorizer?

> `optional` **ecrecoverAuthorizer?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:132](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L132)

EcrecoverAuthorizer contract that validates EIP-712 Midnight authorization signatures.

***

### ecrecoverRatifier?

> `optional` **ecrecoverRatifier?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:130](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L130)

EcrecoverRatifier contract that validates EIP-712 signed Merkle roots of Midnight offers.

***

### eurc?

> `optional` **eurc?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:116](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L116)

EURC token.

Must implement EURC permit version 2, otherwise permit signatures break.

***

### metaMorphoFactory?

> `optional` **metaMorphoFactory?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:80](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L80)

MetaMorpho factory that creates and indexes Morpho Vault V1 ERC4626 vaults.

***

### midnight?

> `optional` **midnight?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:122](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L122)

Midnight core contract for fixed-maturity credit/debt markets, offers, collateral, and liquidations.

***

### midnightBlueBuyCallbackFactory?

> `optional` **midnightBlueBuyCallbackFactory?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:126](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L126)

BlueBuyCallback factory for parking Midnight buy-offer funds in Morpho Blue markets.

***

### midnightBundles?

> `optional` **midnightBundles?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:124](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L124)

MidnightBundles periphery contract for batched take, repay, collateral, permit, and referral workflows.

***

### midnightMempool?

> `optional` **midnightMempool?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:128](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L128)

Midnight onchain mempool log contract used by app and orderbook flows for offer payload publication.

***

### ~~morpho~~

> **morpho**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:30](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L30)

Deprecated alias for the Morpho Blue core contract.

#### Deprecated

Use `blue` instead.

***

### morphoMarketV1AdapterFactory?

> `optional` **morphoMarketV1AdapterFactory?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:84](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L84)

Legacy VaultV2 Morpho Market V1 adapter factory used to create and index Blue market adapters.

***

### morphoMarketV1AdapterV2Factory?

> `optional` **morphoMarketV1AdapterV2Factory?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:86](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L86)

VaultV2 Morpho Market V1 adapter V2 factory for Blue market adapters constrained to AdaptiveCurveIrm markets.

***

### morphoToken?

> `optional` **morphoToken?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:98](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L98)

Morpho governance token.

***

### morphoVaultV1AdapterFactory?

> `optional` **morphoVaultV1AdapterFactory?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:88](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L88)

VaultV2 Morpho Vault V1 adapter factory for adapters that allocate VaultV2 assets into MetaMorpho vaults.

***

### permit2?

> `optional` **permit2?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:32](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L32)

Permit2 contract used by Bundler3 and Midnight periphery for Permit2 token approvals.

***

### preLiquidationFactory?

> `optional` **preLiquidationFactory?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:94](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L94)

PreLiquidation factory that creates and indexes linear LIF/LCF pre-liquidation contracts for Morpho markets.

***

### ~~publicAllocator?~~

> `optional` **publicAllocator?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:76](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L76)

Deprecated alias for the Vault V1 PublicAllocator contract.

#### Deprecated

Use `vaultV1PublicAllocator` instead.

***

### registryList?

> `optional` **registryList?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:90](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L90)

Adapter RegistryList that delegates VaultV2 adapter validation to owner-added sub-registries.

***

### setterRatifier?

> `optional` **setterRatifier?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:134](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L134)

SetterRatifier contract that validates Midnight offer Merkle roots ratified onchain by the maker or delegate.

***

### stEth?

> `optional` **stEth?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:118](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L118)

Lido stETH token used in Ethereum native-token wrapping and staking flows.

***

### usdc?

> `optional` **usdc?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:110](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L110)

USDC token.

Must implement USDC permit version 2, otherwise permit signatures break.

***

### vaultV1PublicAllocator?

> `optional` **vaultV1PublicAllocator?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:70](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L70)

Vault V1 PublicAllocator contract for permissionless MetaMorpho reallocations subject to flow caps and vault fees.

***

### vaultV2BluePublicAllocator?

> `optional` **vaultV2BluePublicAllocator?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:78](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L78)

Vault V2 BluePublicAllocator contract for permissionless reallocations subject to allocation caps and penalties.

***

### vaultV2Factory?

> `optional` **vaultV2Factory?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:82](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L82)

VaultV2 factory that creates and indexes Morpho Vault V2 ERC4626/ERC2612 vaults.

***

### wNative?

> `optional` **wNative?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:96](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L96)

Canonical wrapped native token used by adapters and unwrapped-token mappings on this chain.

***

### wstEth?

> `optional` **wstEth?**: `` `0x${string}` ``

Defined in: [packages/morpho-ts/src/addresses.ts:120](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L120)

Lido wstETH token mapped to stETH for unwrap-aware flows.
