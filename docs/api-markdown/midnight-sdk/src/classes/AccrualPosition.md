[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / AccrualPosition

# Class: AccrualPosition

Defined in: [packages/midnight-sdk/src/position/Position.ts:202](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L202)

Midnight position paired with its hydrated market.

## Example

```ts
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import { AccrualPosition } from "@morpho-org/midnight-sdk";

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

const position = new AccrualPosition(
  {
    user: "0x0000000000000000000000000000000000009000",
    credit: 1_000n,
    pendingFee: 100n,
    lastLossFactor: 0n,
    lastAccrual: 1_000n,
    debt: 0n,
    collateralBitmap: 1n,
    collateral: [50n],
  },
  {
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
  },
);
console.log(position.market.id);
```

## Extends

- [`Position`](Position.md)

## Implements

- [`IAccrualPosition`](../interfaces/IAccrualPosition.md)

## Constructors

### Constructor

> **new AccrualPosition**(`position`, `market`): `AccrualPosition`

Defined in: [packages/midnight-sdk/src/position/Position.ts:205](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L205)

#### Parameters

##### position

[`IAccrualPosition`](../interfaces/IAccrualPosition.md)

##### market

[`IMarket`](../interfaces/IMarket.md) \| [`Market`](Market.md)

#### Returns

`AccrualPosition`

#### Overrides

[`Position`](Position.md).[`constructor`](Position.md#constructor)

## Properties

### \_market

> `protected` `readonly` **\_market**: [`Market`](Market.md)

Defined in: [packages/midnight-sdk/src/position/Position.ts:203](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L203)

***

### collateral

> `readonly` **collateral**: readonly `bigint`[]

Defined in: [packages/midnight-sdk/src/position/Position.ts:95](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L95)

Collateral balances by index.

#### Implementation of

[`IAccrualPosition`](../interfaces/IAccrualPosition.md).[`collateral`](../interfaces/IAccrualPosition.md#collateral)

#### Inherited from

[`Position`](Position.md).[`collateral`](Position.md#collateral)

***

### collateralBitmap

> `readonly` **collateralBitmap**: `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:92](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L92)

Collateral bitmap.

#### Implementation of

[`IAccrualPosition`](../interfaces/IAccrualPosition.md).[`collateralBitmap`](../interfaces/IAccrualPosition.md#collateralbitmap)

#### Inherited from

[`Position`](Position.md).[`collateralBitmap`](Position.md#collateralbitmap)

***

### credit

> `readonly` **credit**: `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:77](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L77)

User credit.

#### Implementation of

[`IAccrualPosition`](../interfaces/IAccrualPosition.md).[`credit`](../interfaces/IAccrualPosition.md#credit)

#### Inherited from

[`Position`](Position.md).[`credit`](Position.md#credit)

***

### debt

> `readonly` **debt**: `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:89](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L89)

User debt.

#### Implementation of

[`IAccrualPosition`](../interfaces/IAccrualPosition.md).[`debt`](../interfaces/IAccrualPosition.md#debt)

#### Inherited from

[`Position`](Position.md).[`debt`](Position.md#debt)

***

### lastAccrual

> `readonly` **lastAccrual**: `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:86](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L86)

Last accrual timestamp.

#### Implementation of

[`IAccrualPosition`](../interfaces/IAccrualPosition.md).[`lastAccrual`](../interfaces/IAccrualPosition.md#lastaccrual)

#### Inherited from

[`Position`](Position.md).[`lastAccrual`](Position.md#lastaccrual)

***

### lastLossFactor

> `readonly` **lastLossFactor**: `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:83](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L83)

Last loss factor seen by the position.

#### Implementation of

[`IAccrualPosition`](../interfaces/IAccrualPosition.md).[`lastLossFactor`](../interfaces/IAccrualPosition.md#lastlossfactor)

#### Inherited from

[`Position`](Position.md).[`lastLossFactor`](Position.md#lastlossfactor)

***

### marketId

> `readonly` **marketId**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/position/Position.ts:74](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L74)

Id of the market on which this position is held.

#### Inherited from

[`Position`](Position.md).[`marketId`](Position.md#marketid)

***

### pendingFee

> `readonly` **pendingFee**: `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:80](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L80)

Pending continuous fee.

#### Implementation of

[`IAccrualPosition`](../interfaces/IAccrualPosition.md).[`pendingFee`](../interfaces/IAccrualPosition.md#pendingfee)

#### Inherited from

[`Position`](Position.md).[`pendingFee`](Position.md#pendingfee)

***

### user

> `readonly` **user**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/position/Position.ts:71](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L71)

User holding this position.

#### Implementation of

[`IAccrualPosition`](../interfaces/IAccrualPosition.md).[`user`](../interfaces/IAccrualPosition.md#user)

#### Inherited from

[`Position`](Position.md).[`user`](Position.md#user)

## Accessors

### faceValue

#### Get Signature

> **get** **faceValue**(): `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:131](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L131)

Returns credit net of pending fee, floored to zero for invalid raw inputs.

##### Example

```ts
import { Position } from "@morpho-org/midnight-sdk";

const position = new Position({
  user: "0x0000000000000000000000000000000000009000",
  marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
  credit: 1_000n,
  pendingFee: 100n,
  lastLossFactor: 0n,
  lastAccrual: 0n,
  debt: 0n,
  collateralBitmap: 1n,
  collateral: [50n],
});
console.log(position.faceValue);
```

##### Returns

`bigint`

Credit minus pending fee.

#### Inherited from

[`Position`](Position.md).[`faceValue`](Position.md#facevalue)

***

### market

#### Get Signature

> **get** **market**(): [`Market`](Market.md)

Defined in: [packages/midnight-sdk/src/position/Position.ts:212](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L212)

Hydrated market for this position.

##### Returns

[`Market`](Market.md)

***

### withdrawable

#### Get Signature

> **get** **withdrawable**(): `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:269](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L269)

Returns the maximum credit units currently withdrawable from this position.

The protocol capacity is limited by both the accrued position credit and
the market's currently withdrawable liquidity. Default redemption flows may
still choose the position face value.

##### Example

```ts
import { AccrualPosition } from "@morpho-org/midnight-sdk";

const position = new AccrualPosition(
  {
    user: "0x0000000000000000000000000000000000009000",
    credit: 1_000n,
    pendingFee: 100n,
    lastLossFactor: 0n,
    lastAccrual: 1_000n,
    debt: 0n,
    collateralBitmap: 1n,
    collateral: [50n],
  },
  {
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
    withdrawable: 950n,
    continuousFeeCredit: 0n,
    settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
    continuousFee: 10,
    tickSpacing: 4,
  },
);
console.log(position.withdrawable); // 950n
```

##### Returns

`bigint`

Maximum credit units currently withdrawable.

## Methods

### accrueInterest()

> **accrueInterest**(`timestamp`): `AccrualPosition`

Defined in: [packages/midnight-sdk/src/position/Position.ts:567](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L567)

Returns a new position locally accrued like Midnight `updatePositionView`.

#### Parameters

##### timestamp

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Timestamp at which to accrue. Must be greater than or equal to `lastAccrual`.

#### Returns

`AccrualPosition`

New accrual position with updated credit, pending fee, last loss factor, last accrual, and market continuous-fee credit.

#### Throws

when timestamp is before `lastAccrual`.

#### Throws

when the market loss factor is older than the position loss factor.

#### Throws

when raw inputs violate Midnight accounting invariants.

#### Example

```ts
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import { AccrualPosition } from "@morpho-org/midnight-sdk";

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

const position = new AccrualPosition(
  {
    user: "0x0000000000000000000000000000000000009000",
    credit: 1_000n,
    pendingFee: 100n,
    lastLossFactor: 0n,
    lastAccrual: 1_000n,
    debt: 0n,
    collateralBitmap: 1n,
    collateral: [50n],
  },
  {
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
  },
);
const accrued = position.accrueInterest(1_500n);
console.log(accrued.credit);
```

***

### getCollateralBalanceByIndex()

> **getCollateralBalanceByIndex**(`index`): `bigint` \| `undefined`

Defined in: [packages/midnight-sdk/src/position/Position.ts:342](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L342)

Returns the position collateral balance at an index configured by the market.

#### Parameters

##### index

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Collateral index.

#### Returns

`bigint` \| `undefined`

Collateral balance, or undefined when the index is not configured.

#### Example

```ts
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import { AccrualPosition } from "@morpho-org/midnight-sdk";

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

const position = new AccrualPosition(
  {
    user: "0x0000000000000000000000000000000000009000",
    credit: 1_000n,
    pendingFee: 100n,
    lastLossFactor: 0n,
    lastAccrual: 1_000n,
    debt: 0n,
    collateralBitmap: 1n,
    collateral: [50n],
  },
  {
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
  },
);
const balance = position.getCollateralBalanceByIndex(0);
console.log(balance);
```

***

### getCollateralBalanceByToken()

> **getCollateralBalanceByToken**(`token`): `bigint` \| `undefined`

Defined in: [packages/midnight-sdk/src/position/Position.ts:422](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L422)

Returns the position collateral balance for a configured token.

#### Parameters

##### token

`` `0x${string}` ``

Collateral token address.

#### Returns

`bigint` \| `undefined`

Collateral balance, or undefined when the token is not configured.

#### Example

```ts
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import { AccrualPosition } from "@morpho-org/midnight-sdk";

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
const position = new AccrualPosition(
  {
    user: "0x0000000000000000000000000000000000009000",
    credit: 1_000n,
    pendingFee: 100n,
    lastLossFactor: 0n,
    lastAccrual: 1_000n,
    debt: 0n,
    collateralBitmap: 1n,
    collateral: [50n],
  },
  {
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
  },
);
const balance = position.getCollateralBalanceByToken(collateralToken);
console.log(balance);
```

***

### getSettlementFee()

> **getSettlementFee**(`timestamp`): `bigint`

Defined in: [packages/midnight-sdk/src/position/Position.ts:494](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/position/Position.ts#L494)

Returns the market settlement fee at a timestamp.

#### Parameters

##### timestamp

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Timestamp used to compute time to maturity.

#### Returns

`bigint`

WAD-scaled settlement fee.

#### Example

```ts
import { registerCustomAddresses } from "@morpho-org/morpho-ts";
import { AccrualPosition } from "@morpho-org/midnight-sdk";

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

const position = new AccrualPosition(
  {
    user: "0x0000000000000000000000000000000000009000",
    credit: 1_000n,
    pendingFee: 100n,
    lastLossFactor: 0n,
    lastAccrual: 1_000n,
    debt: 0n,
    collateralBitmap: 1n,
    collateral: [50n],
  },
  {
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
  },
);
const fee = position.getSettlementFee(0n);
console.log(fee);
```
