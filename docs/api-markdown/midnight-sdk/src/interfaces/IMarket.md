[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / IMarket

# Interface: IMarket

Defined in: [packages/midnight-sdk/src/market/Market.ts:369](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L369)

Plain input accepted by [Market](../classes/Market.md).

## Example

```ts
import type { IMarket } from "@morpho-org/midnight-sdk";

const market: IMarket = {
  params: {
    chainId: 31337,
    midnight: "0x0000000000000000000000000000000000001000",
    loanToken: "0x0000000000000000000000000000000000000001",
    collateralParams: [
      {
        token: "0x0000000000000000000000000000000000000002",
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle: "0x0000000000000000000000000000000000000003",
      },
    ],
    maturity: 1n,
    rcfThreshold: 0n,
    enterGate: "0x0000000000000000000000000000000000000000",
    liquidatorGate: "0x0000000000000000000000000000000000000000",
  },
  totalUnits: 0n,
  lossFactor: 0n,
  withdrawable: 0n,
  continuousFeeCredit: 0n,
  settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
  continuousFee: 0,
  tickSpacing: 4,
};
```

## Properties

### continuousFee

> `readonly` **continuousFee**: `number`

Defined in: [packages/midnight-sdk/src/market/Market.ts:383](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L383)

Continuous fee per second.

***

### continuousFeeCredit

> `readonly` **continuousFeeCredit**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/market/Market.ts:379](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L379)

Continuous-fee credit.

***

### lossFactor

> `readonly` **lossFactor**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/market/Market.ts:375](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L375)

Current loss factor.

***

### params

> `readonly` **params**: [`IMarketParams`](IMarketParams.md)

Defined in: [packages/midnight-sdk/src/market/Market.ts:371](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L371)

Immutable market configuration.

***

### settlementFeeCbps

> `readonly` **settlementFeeCbps**: [`SettlementFeeCbps`](../type-aliases/SettlementFeeCbps.md)

Defined in: [packages/midnight-sdk/src/market/Market.ts:381](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L381)

Seven settlement-fee cbp buckets.

***

### tickSpacing

> `readonly` **tickSpacing**: `number`

Defined in: [packages/midnight-sdk/src/market/Market.ts:385](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L385)

Market tick spacing.

***

### totalUnits

> `readonly` **totalUnits**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/market/Market.ts:373](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L373)

Total market units.

***

### withdrawable

> `readonly` **withdrawable**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/market/Market.ts:377](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/market/Market.ts#L377)

Withdrawable assets.
