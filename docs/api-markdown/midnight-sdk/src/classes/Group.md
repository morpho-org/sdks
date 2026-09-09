[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / Group

# Class: Group

Defined in: [packages/midnight-sdk/src/signatures/Group.ts:49](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Group.ts#L49)

Protocol offer group with one shared consumption group id.

Create a group after building related offers and before building the tree to
publish. Offers inside one group must share maker, side, and loan token. The
constructor hashes every offer to derive the group id, then copies each offer
with that id. Offers inside one group must also share cap mode and value
because Midnight tracks one consumed scalar per maker and group; group
creation is resource-intensive compared to offer construction.

## Example

```ts
import { Group, Offer } from "@morpho-org/midnight-sdk";
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
const group = Group.create([offer]);
console.log(group.offers.length);
```

## Implements

- [`IGroup`](../interfaces/IGroup.md)

## Properties

### id

> `readonly` **id**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/Group.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Group.ts#L53)

Content-addressed group id.

## Accessors

### offers

#### Get Signature

> **get** **offers**(): readonly [`Offer`](Offer.md)[]

Defined in: [packages/midnight-sdk/src/signatures/Group.ts:103](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Group.ts#L103)

Offers in this protocol group.

Returns a fresh array so callers cannot mutate the group's offer list.

##### Example

```ts
import { Group, Offer } from "@morpho-org/midnight-sdk";
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
const group = Group.create([offer]);
console.log(group.offers.length);
```

##### Returns

readonly [`Offer`](Offer.md)[]

Offers in caller order.

Offers in this protocol group. The group id is derived from this list.

#### Implementation of

[`IGroup`](../interfaces/IGroup.md).[`offers`](../interfaces/IGroup.md#offers)

## Methods

### create()

> `static` **create**(`offers`): `Group`

Defined in: [packages/midnight-sdk/src/signatures/Group.ts:204](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Group.ts#L204)

Creates a protocol-valid offer group.

Use after `Offer.create` for laddered offers with the same cap mode and
value that should consume from one group id. Pass the returned group into
`Tree.create` alongside other groups or standalone offers. This hashes every
offer and copies the validated offers into group-owned instances, so it is
resource-intensive and should be done once per group definition.

#### Parameters

##### offers

`Iterable`\<[`IOffer`](../interfaces/IOffer.md)\>

Iterable of offers to group.

#### Returns

`Group`

Group instance.

#### Throws

when group mechanics are invalid.

#### Example

```ts
import { Group, Offer } from "@morpho-org/midnight-sdk";
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
const group = Group.create([offer]);
console.log(group.offers.length);
```

***

### from()

> `static` **from**(`entry`): `Group`

Defined in: [packages/midnight-sdk/src/signatures/Group.ts:151](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/Group.ts#L151)

Returns a group instance from group or standalone offer input.

Use at boundaries that accept either a prebuilt `Group`, a plain `IGroup`,
or a standalone offer that should form its own group. Existing `Group`
instances are returned as-is.

#### Parameters

##### entry

[`GroupInput`](../type-aliases/GroupInput.md)

Group object or standalone offer.

#### Returns

`Group`

Group instance.

#### Throws

when group mechanics are invalid.

#### Example

```ts
import { Group, Offer } from "@morpho-org/midnight-sdk";
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
const group = Group.from(offer);
console.log(group.offers.length);
```
