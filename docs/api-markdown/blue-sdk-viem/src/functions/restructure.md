[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / restructure

# Function: restructure()

> **restructure**\<`abi`, `name`, `args`, `outputs`\>(`outputs`, `parameters`): `ZipToObject`\<`ExtractAbiFunctionForArgs`\<`abi`, `"view"` \| `"pure"`, `name`, `args`\>\[`"outputs"`\], `outputs`\>

Defined in: [packages/blue-sdk-viem/src/utils.ts:178](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/utils.ts#L178)

When reading contracts, viem converts onchain tuples into arrays -- even when tuple values are named in the ABI.
[They argue](https://viem.sh/docs/faq#why-is-a-contract-function-return-type-returning-an-array-instead-of-an-object)
this information loss is justified, as it eliminates the ambiguity between tuple return types and struct return
types. This utility can be used to convert viem's arrays back to objects, _as if_ the onchain method returned a
struct.

## Type Parameters

### abi

`abi` *extends* `Abi`

### name

`name` *extends* `string`

### args

`args` *extends* `unknown`

### outputs

`outputs` *extends* readonly `unknown`[]

Tuple output returned by viem.

## Parameters

### outputs

`outputs`

### parameters

`GetAbiItemParameters`\<`abi`, `name`, `args`\>

ABI item lookup parameters matching the read that produced `outputs`.

## Returns

`ZipToObject`\<`ExtractAbiFunctionForArgs`\<`abi`, `"view"` \| `"pure"`, `name`, `args`\>\[`"outputs"`\], `outputs`\>

An object whose keys are the named ABI outputs and whose values are the tuple elements.

## Examples

```
// Use with viem...
const params = restructure(
  await readContract(client, {
    ...parameters,
    address: morpho,
    abi: blueAbi,
    functionName: "idToMarketParams",
    args: [id],
  }),
  // These `args` should be placeholders; just match the type of the actual `args` above
  { abi: blueAbi, name: "idToMarketParams", args: ["0x"] },
)
```

```
// Use with wagmi hook...
const { data: marketsData } = useReadContracts({
  contracts: marketIds.map(
    (marketId) =>
      ({
        chainId,
        address: morphoAddress,
        abi: morphoAbi,
        functionName: "market",
        args: [marketId],
      }) as const,
  ),
  allowFailure: false,
  query: {
    select(data) {
      // These `args` should be placeholders; just match the type of the actual `args` above
      return data.map((x) => restructure(x, { abi: morphoAbi, name: "market", args: ["0x"] }));
    },
  },
});
```
