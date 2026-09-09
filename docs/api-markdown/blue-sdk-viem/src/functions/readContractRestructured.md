[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / readContractRestructured

# Function: readContractRestructured()

> **readContractRestructured**\<`chain`, `abi`, `name`, `args`\>(`client`, `parameters`): `Promise`\<`ZipToObject`\<`ExtractAbiFunctionForArgs`\<`abi`, `"view"` \| `"pure"`, `name`, `args`\>\[`"outputs"`\], `Awaited`\<`ContractFunctionReturnType`\<`abi`, `"view"` \| `"pure"`, `name`, `args`\>\> *extends* readonly `unknown`[] ? readonly `unknown`[] & `Awaited`\<`ContractFunctionReturnType`\<`abi`, `"view"` \| `"pure"`, `name`, `args`\>\> : `never`\>\>

Defined in: [packages/blue-sdk-viem/src/utils.ts:235](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/utils.ts#L235)

When reading contracts, viem converts onchain tuples into arrays -- even when tuple values are named in the ABI.
[They argue](https://viem.sh/docs/faq#why-is-a-contract-function-return-type-returning-an-array-instead-of-an-object)
this information loss is justified, as it eliminates the ambiguity between tuple return types and struct return
types. This wrapper converts viem's arrays back to objects, _as if_ the onchain method returned a struct.

## Type Parameters

### chain

`chain` *extends* `Chain` \| `undefined`

### abi

`abi` *extends* `Abi`

### name

`name` *extends* `string`

### args

`args` *extends* `unknown`

## Parameters

### client

`Client`\<`Transport`, `chain`\>

Viem client used for the read.

### parameters

`ReadContractParameters`\<`abi`, `name`, `args`\>

Read contract parameters for a view or pure function with named tuple outputs.

## Returns

`Promise`\<`ZipToObject`\<`ExtractAbiFunctionForArgs`\<`abi`, `"view"` \| `"pure"`, `name`, `args`\>\[`"outputs"`\], `Awaited`\<`ContractFunctionReturnType`\<`abi`, `"view"` \| `"pure"`, `name`, `args`\>\> *extends* readonly `unknown`[] ? readonly `unknown`[] & `Awaited`\<`ContractFunctionReturnType`\<`abi`, `"view"` \| `"pure"`, `name`, `args`\>\> : `never`\>\>

An object whose keys are the named ABI outputs and whose values are the tuple elements.

## See

[restructure](restructure.md)

## Example

```ts
import { readContractRestructured } from "@morpho-org/blue-sdk-viem";

const market = await readContractRestructured(client, {
  address: morpho,
  abi: blueAbi,
  functionName: "market",
  args: [marketId],
});
```
