[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TreeUtils](../README.md) / mempoolValidate

# Function: mempoolValidate()

> **mempoolValidate**(`params`): `Promise`\<`MempoolPayloadValidationSuccess`\>

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:551](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L551)

Validates a tree against Midnight mempool API policy.

This is an API-backed convenience: by default it encodes each tree leaf
with empty `ratifierData`, then sends the temporary payload to the Midnight
API `POST /mempool/validate` endpoint. Pass `ratification` after signing or
Setter root preparation to validate final payload bytes with real
`ratifierData`.

## Parameters

### params

`Pick`\<[`TreeMempoolValidateParams`](../../../interfaces/TreeMempoolValidateParams.md), `"chainId"` \| `"request"` \| `"timestamp"` \| `"fetch"` \| `"apiUrl"`\> & `object`

## Returns

`Promise`\<`MempoolPayloadValidationSuccess`\>

Successful API validation result with `valid: true`.

## Throws

when the tree is empty, all padding, or duplicated.

## Throws

when the resulting height is unsupported.

## Throws

when validation payload encoding fails.

## Throws

when the API returns a non-2xx response.

## Throws

when the API returns malformed success JSON.

## Throws

when the API returns validation issues.

## Example

```ts
import { Offer, TreeUtils } from "@morpho-org/midnight-sdk";
import { zeroAddress } from "viem";

const offer = Offer.create({
  market: {
    chainId: 8453,
    midnight: "0x0000000000000000000000000000000000001000",
    loanToken: "0x0000000000000000000000000000000000006000",
    collateralParams: [
      {
        token: "0x0000000000000000000000000000000000007000",
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle: "0x0000000000000000000000000000000000008000",
      },
    ],
    maturity: 54_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  },
  buy: true,
  maker: "0x0000000000000000000000000000000000009000",
  tick: 5_000n,
  expiry: 3_600n,
  ratifier: "0x0000000000000000000000000000000000004000",
  maxUnits: 100n,
});
await TreeUtils.mempoolValidate({
  chainId: 8453,
  tree: [offer],
});
```
