[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / EcrecoverRatificationTypedData

# Interface: EcrecoverRatificationTypedData

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:216](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L216)

Ecrecover typed-data descriptor returned to signing code.

Pass this descriptor to the maker or authorized signer before payload
encoding. The resulting signature is later embedded into every payload item
for the tree.

## Example

```ts
import { EcrecoverRatifierUtils, Offer, Tree, type EcrecoverRatificationTypedData } from "@morpho-org/midnight-sdk";
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
const typedData: EcrecoverRatificationTypedData =
  EcrecoverRatifierUtils.typedData({
    tree: Tree.create([offer]),
    chainId: 8453n,
  });
console.log(typedData.primaryType);
```

## Properties

### domain

> `readonly` **domain**: `object`

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:218](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L218)

EIP-712 domain.

#### chainId

> `readonly` **chainId**: `bigint`

#### verifyingContract

> `readonly` **verifyingContract**: `` `0x${string}` ``

***

### message

> `readonly` **message**: `object`

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:231](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L231)

Typed-data message.

#### offerTree

> `readonly` **offerTree**: `unknown`

***

### primaryType

> `readonly` **primaryType**: `"OfferTree"`

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:229](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L229)

Primary typed-data type.

***

### types

> `readonly` **types**: `object` & `object`

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:223](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L223)

EIP-712 type map.

#### Type Declaration

##### CollateralParams

> `readonly` **CollateralParams**: readonly \[\{ `name`: `"token"`; `type`: `"address"`; \}, \{ `name`: `"lltv"`; `type`: `"uint256"`; \}, \{ `name`: `"liquidationCursor"`; `type`: `"uint256"`; \}, \{ `name`: `"oracle"`; `type`: `"address"`; \}\]

##### EIP712Domain

> `readonly` **EIP712Domain**: readonly \[\{ `name`: `"chainId"`; `type`: `"uint256"`; \}, \{ `name`: `"verifyingContract"`; `type`: `"address"`; \}\]

##### Market

> `readonly` **Market**: readonly \[\{ `name`: `"chainId"`; `type`: `"uint256"`; \}, \{ `name`: `"midnight"`; `type`: `"address"`; \}, \{ `name`: `"loanToken"`; `type`: `"address"`; \}, \{ `name`: `"collateralParams"`; `type`: `"CollateralParams[]"`; \}, \{ `name`: `"maturity"`; `type`: `"uint256"`; \}, \{ `name`: `"rcfThreshold"`; `type`: `"uint256"`; \}, \{ `name`: `"enterGate"`; `type`: `"address"`; \}, \{ `name`: `"liquidatorGate"`; `type`: `"address"`; \}\]

##### Offer

> `readonly` **Offer**: readonly \[\{ `name`: `"market"`; `type`: `"Market"`; \}, \{ `name`: `"buy"`; `type`: `"bool"`; \}, \{ `name`: `"maker"`; `type`: `"address"`; \}, \{ `name`: `"start"`; `type`: `"uint256"`; \}, \{ `name`: `"expiry"`; `type`: `"uint256"`; \}, \{ `name`: `"tick"`; `type`: `"uint256"`; \}, \{ `name`: `"group"`; `type`: `"bytes32"`; \}, \{ `name`: `"callback"`; `type`: `"address"`; \}, \{ `name`: `"callbackData"`; `type`: `"bytes"`; \}, \{ `name`: `"receiverIfMakerIsSeller"`; `type`: `"address"`; \}, \{ `name`: `"ratifier"`; `type`: `"address"`; \}, \{ `name`: `"reduceOnly"`; `type`: `"bool"`; \}, \{ `name`: `"maxUnits"`; `type`: `"uint128"`; \}, \{ `name`: `"maxAssets"`; `type`: `"uint128"`; \}, \{ `name`: `"continuousFeeCap"`; `type`: `"uint256"`; \}\]

#### Type Declaration

##### OfferTree

> `readonly` **OfferTree**: readonly \[\{ `name`: `"offerTree"`; `type`: `string`; \}\]
