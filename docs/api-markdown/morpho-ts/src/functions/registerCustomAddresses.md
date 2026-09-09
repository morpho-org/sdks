[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / registerCustomAddresses

# Function: registerCustomAddresses()

> **registerCustomAddresses**\<`TAddresses`, `TDeployments`\>(`options?`): `void`

Defined in: [packages/morpho-ts/src/addresses.ts:2709](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L2709)

Registers custom addresses, deployment blocks, and unwrapped token mappings.

## Type Parameters

### TAddresses

`TAddresses` *extends* `Record`\<`number`, `unknown`\> = `Record`\<`never`, `never`\>

### TDeployments

`TDeployments` *extends* `Record`\<`number`, `unknown`\> = `Record`\<`never`, `never`\>

## Parameters

### options?

Optional configuration object

#### addresses?

`RegistryInput`\<`TAddresses`, [`ChainId`](../enumerations/ChainId.md), [`ChainAddresses`](../interfaces/ChainAddresses.md), `ChainAddressRegistration`\>

Custom address entries to merge into the default registry.
                           Known-chain entries may be partial; custom-chain entries must include the required
                           Blue addresses and may add Midnight fields beside `blue`, `bundler3`, and other
                           periphery addresses.

#### deployments?

`RegistryInput`\<`TDeployments`, [`ChainId`](../enumerations/ChainId.md), [`ChainDeployments`](../type-aliases/ChainDeployments.md)\<[`ChainAddresses`](../interfaces/ChainAddresses.md)\>, `ChainDeploymentRegistration`\>

Custom deployment entries to merge into the default registry.
                             Known-chain entries may be partial; custom-chain entries must include the required
                             Blue deployments and may add Midnight fields beside `blue`, `bundler3`, and other
                             periphery deployments.

#### unwrappedTokens?

`Record`\<`number`, `Record`\<`` `0x${string}` ``, `` `0x${string}` ``\>\>

A mapping of chain IDs to token address maps,
                                 where each entry maps wrapped tokens to their unwrapped equivalents.

## Returns

`void`

Nothing.

## Throws

RegistryValueAlreadyRegisteredError when registration attempts to override an existing value.

## Throws

IncompleteChainRegistryError when a custom-chain entry does not include the required Blue registry fields.

## Example

```ts
import { registerCustomAddresses } from "@morpho-org/morpho-ts";

registerCustomAddresses({
  addresses: {
    31337: {
      blue: "0x0000000000000000000000000000000000000001",
      bundler3: {
        bundler3: "0x0000000000000000000000000000000000000002",
        generalAdapter1: "0x0000000000000000000000000000000000000003",
      },
      adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
      midnight: "0x0000000000000000000000000000000000000005",
      midnightBundles: "0x0000000000000000000000000000000000000006",
      midnightMempool: "0x0000000000000000000000000000000000000007",
      ecrecoverRatifier: "0x0000000000000000000000000000000000000008",
      ecrecoverAuthorizer: "0x0000000000000000000000000000000000000009",
      setterRatifier: "0x0000000000000000000000000000000000000010",
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    },
  },
  unwrappedTokens: {
    31337: {
      "0x0000000000000000000000000000000000000005": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    },
  },
});
```
