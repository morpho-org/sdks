[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / Market

# Class: Market

Defined in: [packages/midnight-sdk/src/market/Market.ts:468](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L468)

Hydrated Midnight market configuration plus state.

## Example

```ts
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import { Market } from "@morpho-org/midnight-sdk";

registerCustomAddresses({
  addresses: {
    31337: {
      morpho: "0x0000000000000000000000000000000000000001",
      bundler3: {
        bundler3: "0x0000000000000000000000000000000000000002",
        generalAdapter1: "0x0000000000000000000000000000000000000003",
      },
      adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
      midnight: "0x0000000000000000000000000000000000001000",
    },
  },
});

const market = new Market({
  params: {
    chainId: 31337,
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
    enterGate: "0x0000000000000000000000000000000000000000",
    liquidatorGate: "0x0000000000000000000000000000000000000000",
  },
  totalUnits: 1_000n,
  lossFactor: 0n,
  withdrawable: 500n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
  continuousFee: 10,
  tickSpacing: 4,
});
console.log(market.timeToMaturity(0n));
```

## Constructors

### Constructor

> **new Market**(`market`): `Market`

Defined in: [packages/midnight-sdk/src/market/Market.ts:499](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L499)

#### Parameters

##### market

[`IMarket`](../interfaces/IMarket.md)

#### Returns

`Market`

## Properties

### chainId

> `readonly` **chainId**: `bigint`

Defined in: [packages/midnight-sdk/src/market/Market.ts:473](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L473)

EIP-155 chain id captured in the market struct.

***

### continuousFee

> `readonly` **continuousFee**: `number`

Defined in: [packages/midnight-sdk/src/market/Market.ts:494](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L494)

Continuous fee per second.

***

### continuousFeeCredit

> `readonly` **continuousFeeCredit**: `bigint`

Defined in: [packages/midnight-sdk/src/market/Market.ts:488](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L488)

Continuous-fee credit.

***

### id

> `readonly` **id**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/market/Market.ts:470](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L470)

Market id.

***

### lossFactor

> `readonly` **lossFactor**: `bigint`

Defined in: [packages/midnight-sdk/src/market/Market.ts:482](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L482)

Current loss factor.

***

### params

> `readonly` **params**: [`MarketParams`](MarketParams.md)

Defined in: [packages/midnight-sdk/src/market/Market.ts:476](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L476)

Immutable market configuration.

***

### settlementFeeCbps

> `readonly` **settlementFeeCbps**: [`SettlementFeeCbps`](../type-aliases/SettlementFeeCbps.md)

Defined in: [packages/midnight-sdk/src/market/Market.ts:491](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L491)

Seven settlement-fee cbp buckets.

***

### tickSpacing

> `readonly` **tickSpacing**: `number`

Defined in: [packages/midnight-sdk/src/market/Market.ts:497](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L497)

Market tick spacing.

***

### totalUnits

> `readonly` **totalUnits**: `bigint`

Defined in: [packages/midnight-sdk/src/market/Market.ts:479](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L479)

Total market units.

***

### withdrawable

> `readonly` **withdrawable**: `bigint`

Defined in: [packages/midnight-sdk/src/market/Market.ts:485](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L485)

Withdrawable assets.

## Methods

### getCollateralByIndex()

> **getCollateralByIndex**(`index`): [`CollateralParams`](../interfaces/CollateralParams.md)

Defined in: [packages/midnight-sdk/src/market/Market.ts:738](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L738)

Returns collateral by numeric index.

#### Parameters

##### index

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Collateral index.

#### Returns

[`CollateralParams`](../interfaces/CollateralParams.md)

Collateral entry for the configured index.

#### Throws

when the index is not configured.

#### Example

```ts
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import { Market } from "@morpho-org/midnight-sdk";

registerCustomAddresses({
  addresses: {
    31337: {
      morpho: "0x0000000000000000000000000000000000000001",
      bundler3: {
        bundler3: "0x0000000000000000000000000000000000000002",
        generalAdapter1: "0x0000000000000000000000000000000000000003",
      },
      adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
      midnight: "0x0000000000000000000000000000000000001000",
    },
  },
});

const market = new Market({
  params: {
    chainId: 31337,
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
    enterGate: "0x0000000000000000000000000000000000000000",
    liquidatorGate: "0x0000000000000000000000000000000000000000",
  },
  totalUnits: 1_000n,
  lossFactor: 0n,
  withdrawable: 500n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
  continuousFee: 10,
  tickSpacing: 4,
});
const collateral = market.getCollateralByIndex(0);
console.log(collateral.token);
```

***

### getCollateralIndexByToken()

> **getCollateralIndexByToken**(`token`): `number` \| `undefined`

Defined in: [packages/midnight-sdk/src/market/Market.ts:797](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L797)

Returns the configured collateral index for a token.

#### Parameters

##### token

`` `0x${string}` ``

Collateral token address.

#### Returns

`number` \| `undefined`

Collateral index, or undefined when the token is not configured.

#### Example

```ts
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import { Market } from "@morpho-org/midnight-sdk";

registerCustomAddresses({
  addresses: {
    31337: {
      morpho: "0x0000000000000000000000000000000000000001",
      bundler3: {
        bundler3: "0x0000000000000000000000000000000000000002",
        generalAdapter1: "0x0000000000000000000000000000000000000003",
      },
      adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
      midnight: "0x0000000000000000000000000000000000001000",
    },
  },
});

const collateralToken = "0x0000000000000000000000000000000000007000";
const market = new Market({
  params: {
    chainId: 31337,
    midnight: "0x0000000000000000000000000000000000001000",
    loanToken: "0x0000000000000000000000000000000000006000",
    collateralParams: [
      {
        token: collateralToken,
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle: "0x0000000000000000000000000000000000008000",
      },
    ],
    maturity: 54_000n,
    rcfThreshold: 0n,
    enterGate: "0x0000000000000000000000000000000000000000",
    liquidatorGate: "0x0000000000000000000000000000000000000000",
  },
  totalUnits: 1_000n,
  lossFactor: 0n,
  withdrawable: 500n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
  continuousFee: 10,
  tickSpacing: 4,
});
const index = market.getCollateralIndexByToken(collateralToken);
console.log(index);
```

***

### getCollateralParamsByToken()

> **getCollateralParamsByToken**(`token`): [`CollateralParams`](../interfaces/CollateralParams.md) \| `undefined`

Defined in: [packages/midnight-sdk/src/market/Market.ts:861](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L861)

Returns collateral params by token address.

#### Parameters

##### token

`` `0x${string}` ``

Collateral token address.

#### Returns

[`CollateralParams`](../interfaces/CollateralParams.md) \| `undefined`

Collateral params, or undefined when the token is not configured.

#### Example

```ts
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import { Market } from "@morpho-org/midnight-sdk";

registerCustomAddresses({
  addresses: {
    31337: {
      morpho: "0x0000000000000000000000000000000000000001",
      bundler3: {
        bundler3: "0x0000000000000000000000000000000000000002",
        generalAdapter1: "0x0000000000000000000000000000000000000003",
      },
      adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
      midnight: "0x0000000000000000000000000000000000001000",
    },
  },
});

const collateralToken = "0x0000000000000000000000000000000000007000";
const market = new Market({
  params: {
    chainId: 31337,
    midnight: "0x0000000000000000000000000000000000001000",
    loanToken: "0x0000000000000000000000000000000000006000",
    collateralParams: [
      {
        token: collateralToken,
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle: "0x0000000000000000000000000000000000008000",
      },
    ],
    maturity: 54_000n,
    rcfThreshold: 0n,
    enterGate: "0x0000000000000000000000000000000000000000",
    liquidatorGate: "0x0000000000000000000000000000000000000000",
  },
  totalUnits: 1_000n,
  lossFactor: 0n,
  withdrawable: 500n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
  continuousFee: 10,
  tickSpacing: 4,
});
const params = market.getCollateralParamsByToken(collateralToken);
console.log(params?.lltv);
```

***

### getSettlementFee()

> **getSettlementFee**(`timeToMaturity`): `bigint`

Defined in: [packages/midnight-sdk/src/market/Market.ts:676](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L676)

Computes the settlement fee for a time to maturity from the hydrated market state.

#### Parameters

##### timeToMaturity

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Seconds until maturity.

#### Returns

`bigint`

WAD-scaled settlement fee.

#### Throws

when `timeToMaturity` is negative.

#### Example

```ts
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import { Market } from "@morpho-org/midnight-sdk";

registerCustomAddresses({
  addresses: {
    31337: {
      morpho: "0x0000000000000000000000000000000000000001",
      bundler3: {
        bundler3: "0x0000000000000000000000000000000000000002",
        generalAdapter1: "0x0000000000000000000000000000000000000003",
      },
      adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
      midnight: "0x0000000000000000000000000000000000001000",
    },
  },
});

const market = new Market({
  params: {
    chainId: 31337,
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
    enterGate: "0x0000000000000000000000000000000000000000",
    liquidatorGate: "0x0000000000000000000000000000000000000000",
  },
  totalUnits: 1_000n,
  lossFactor: 0n,
  withdrawable: 500n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
  continuousFee: 10,
  tickSpacing: 4,
});
console.log(market.getSettlementFee(0n));
```

***

### timeToMaturity()

> **timeToMaturity**(`timestamp`): `bigint`

Defined in: [packages/midnight-sdk/src/market/Market.ts:613](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L613)

Returns the non-negative time remaining before maturity.

#### Parameters

##### timestamp

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Timestamp to compare.

#### Returns

`bigint`

Seconds until maturity, floored to zero.

#### Throws

when `timestamp` is negative.

#### Example

```ts
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import { Market } from "@morpho-org/midnight-sdk";

registerCustomAddresses({
  addresses: {
    31337: {
      morpho: "0x0000000000000000000000000000000000000001",
      bundler3: {
        bundler3: "0x0000000000000000000000000000000000000002",
        generalAdapter1: "0x0000000000000000000000000000000000000003",
      },
      adaptiveCurveIrm: "0x0000000000000000000000000000000000000004",
      midnight: "0x0000000000000000000000000000000000001000",
    },
  },
});

const market = new Market({
  params: {
    chainId: 31337,
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
    enterGate: "0x0000000000000000000000000000000000000000",
    liquidatorGate: "0x0000000000000000000000000000000000000000",
  },
  totalUnits: 1_000n,
  lossFactor: 0n,
  withdrawable: 500n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
  continuousFee: 10,
  tickSpacing: 4,
});
console.log(market.timeToMaturity(0n));
```

***

### from()

> `static` **from**(`market`): `Market`

Defined in: [packages/midnight-sdk/src/market/Market.ts:555](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L555)

Returns a hydrated market instance from class or plain input.

Existing `Market` instances are returned as-is. Plain hydrated market objects
are normalized through the constructor so nested params and bigint fields use
the SDK's canonical shapes.

#### Parameters

##### market

[`IMarket`](../interfaces/IMarket.md) \| `Market`

Hydrated market class or plain market input.

#### Returns

`Market`

Hydrated market instance.

#### Throws

when nested market params are invalid.

#### Example

```ts
import { Market } from "@morpho-org/midnight-sdk";

const market = Market.from({
  params: {
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
    enterGate: "0x0000000000000000000000000000000000000000",
    liquidatorGate: "0x0000000000000000000000000000000000000000",
  },
  totalUnits: 1_000n,
  lossFactor: 0n,
  withdrawable: 500n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
  continuousFee: 10,
  tickSpacing: 4,
});
console.log(market.id);
```
