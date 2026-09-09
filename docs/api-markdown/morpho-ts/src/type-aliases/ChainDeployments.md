[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / ChainDeployments

# Type Alias: ChainDeployments\<Addresses\>

> **ChainDeployments**\<`Addresses`\> = `` { [key in keyof Addresses]: `0x${string}` extends Addresses[key] ? bigint : ChainDeployments<Addresses[key]> } ``

Defined in: [packages/morpho-ts/src/addresses.ts:1237](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L1237)

Deployment block registry with the same shape as `ChainAddresses`.

## Type Parameters

### Addresses

`Addresses` = [`ChainAddresses`](../interfaces/ChainAddresses.md)
