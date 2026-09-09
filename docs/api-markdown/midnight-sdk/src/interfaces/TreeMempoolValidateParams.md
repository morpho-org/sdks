[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / TreeMempoolValidateParams

# Interface: TreeMempoolValidateParams

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:461](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L461)

Parameters for [Tree.mempoolValidate](../classes/Tree.md#mempoolvalidate).

Use this when an already-created tree should be validated by the Midnight
API. By default it validates the pre-ratification tree with empty
`ratifierData`; pass `ratification` to validate the final payload shape with
real ratifier data.

## Example

```ts
import { Offer, Tree, type TreeMempoolValidateParams } from "@morpho-org/midnight-sdk";
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
const tree = Tree.create([offer]);
const params = { chainId: 8453 } satisfies TreeMempoolValidateParams;
await tree.mempoolValidate(params);
```

## Properties

### apiUrl?

> `readonly` `optional` **apiUrl?**: `string` \| `URL`

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:465](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L465)

Midnight API URL used for the validation HTTP request. Defaults to `https://api.morpho.org/v0/midnight`.

***

### chainId

> `readonly` **chainId**: `number`

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:463](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L463)

Chain id whose API policy should validate the tree.

***

### fetch?

> `readonly` `optional` **fetch?**: \{(`input`, `init?`): `Promise`\<`Response`\>; (`input`, `init?`): `Promise`\<`Response`\>; \}

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:469](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L469)

Fetch implementation used for the API call. Defaults to the global `fetch`.

#### Call Signature

> (`input`, `init?`): `Promise`\<`Response`\>

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Window/fetch)

##### Parameters

###### input

`URL` \| `RequestInfo`

###### init?

`RequestInit`

##### Returns

`Promise`\<`Response`\>

#### Call Signature

> (`input`, `init?`): `Promise`\<`Response`\>

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Window/fetch)

##### Parameters

###### input

`string` \| `URL` \| `Request`

###### init?

`RequestInit`

##### Returns

`Promise`\<`Response`\>

***

### ratification?

> `readonly` `optional` **ratification?**: [`TreeMempoolValidateRatification`](../type-aliases/TreeMempoolValidateRatification.md)

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:473](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L473)

Optional ratification inputs used to validate final payload bytes with real ratifier data.

***

### request?

> `readonly` `optional` **request?**: `MidnightApiRequestOptions`

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:471](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L471)

Additional fetch options forwarded to the API request.

***

### timestamp?

> `readonly` `optional` **timestamp?**: `string` \| `Date`

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:467](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L467)

Optional ISO-8601 timestamp or `Date` selecting the API policy snapshot.
