[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / \_try

# Function: \_try()

Runs an accessor and returns `undefined` for expected lookup errors.

## Param

**accessor**

Accessor to run.

## Param

**errorClasses**

Optional error classes to catch. When omitted, all errors are caught.

## Example

```ts
import { _try, UnknownAddressError } from "@morpho-org/morpho-ts";

const address = _try(() => {
  throw new UnknownAddressError({ chainId: 1, label: "midnight" });
}, UnknownAddressError);
console.log(address);
```

## Call Signature

> **\_try**\<`T`, `ErrorClasses`\>(`accessor`, ...`errorClasses`): `Promise`\<`T` \| `undefined`\>

Defined in: [packages/morpho-ts/src/errors.ts:190](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/errors.ts#L190)

Runs an async accessor and returns `undefined` for expected lookup errors.

### Type Parameters

#### T

`T`

#### ErrorClasses

`ErrorClasses` *extends* readonly [`ErrorClass`](../interfaces/ErrorClass.md)\<`Error`\>[] = \[\]

### Parameters

#### accessor

() => `Promise`\<`T`\>

Async accessor to run.

#### errorClasses

...`ErrorClasses`

Optional error classes to catch. When omitted, all errors are caught.

### Returns

`Promise`\<`T` \| `undefined`\>

The accessor result, or `undefined` when the accessor throws a matching error.

### Example

```ts
import { _try, UnknownAddressError } from "@morpho-org/morpho-ts";

const address = await _try(async () => {
  throw new UnknownAddressError({ chainId: 1, label: "midnight" });
}, UnknownAddressError);
console.log(address);
```

## Call Signature

> **\_try**\<`T`, `ErrorClasses`\>(`accessor`, ...`errorClasses`): `T` \| `undefined`

Defined in: [packages/morpho-ts/src/errors.ts:210](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/errors.ts#L210)

Runs a sync accessor and returns `undefined` for expected lookup errors.

### Type Parameters

#### T

`T`

#### ErrorClasses

`ErrorClasses` *extends* readonly [`ErrorClass`](../interfaces/ErrorClass.md)\<`Error`\>[] = \[\]

### Parameters

#### accessor

() => `T`

Sync accessor to run.

#### errorClasses

...`ErrorClasses`

Optional error classes to catch. When omitted, all errors are caught.

### Returns

`T` \| `undefined`

The accessor result, or `undefined` when the accessor throws a matching error.

### Example

```ts
import { _try, UnknownAddressError } from "@morpho-org/morpho-ts";

const address = _try(() => {
  throw new UnknownAddressError({ chainId: 1, label: "midnight" });
}, UnknownAddressError);
console.log(address);
```
