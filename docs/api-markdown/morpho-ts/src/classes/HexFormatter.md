[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / HexFormatter

# Class: HexFormatter

Defined in: [packages/morpho-ts/src/format/format/format.ts:409](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L409)

Formats integer values as hexadecimal strings.

## Extends

- [`BaseFormatter`](BaseFormatter.md)

## Constructors

### Constructor

> **new HexFormatter**(`__options?`): `HexFormatter`

Defined in: [packages/morpho-ts/src/format/format/format.ts:415](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L415)

#### Parameters

##### \_\_options?

`Partial`\<`FormatHexOptions`\> = `{}`

#### Returns

`HexFormatter`

#### Overrides

[`BaseFormatter`](BaseFormatter.md).[`constructor`](BaseFormatter.md#constructor)

## Properties

### \_options

> `protected` **\_options**: `Readonly`\<`FormatHexOptions`\>

Defined in: [packages/morpho-ts/src/format/format/format.ts:410](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L410)

#### Overrides

[`BaseFormatter`](BaseFormatter.md).[`_options`](BaseFormatter.md#_options)

## Methods

### \_clone()

> **\_clone**(`_options`): `HexFormatter`

Defined in: [packages/morpho-ts/src/format/format/format.ts:431](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L431)

#### Parameters

##### \_options

`FormatHexOptions`

#### Returns

`HexFormatter`

#### Overrides

[`BaseFormatter`](BaseFormatter.md).[`_clone`](BaseFormatter.md#_clone)

***

### createOf()

> **createOf**(): \{\<`T`, `D`\>(`value`, `decimals`): `string` \| `Exclude`\<`T`, `bigint`\> \| `Exclude`\<`D`, `number`\>; \<`T`\>(`value`): `string` \| `Exclude`\<`T`, `number`\>; \}

Defined in: [packages/morpho-ts/src/format/format/format.ts:330](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L330)

Creates a bound version of the `of` method, retaining the current formatter options.

#### Returns

A bound `of` function.

> \<`T`, `D`\>(`value`, `decimals`): `string` \| `Exclude`\<`T`, `bigint`\> \| `Exclude`\<`D`, `number`\>

Formats a given value according to the formatter's configuration.

##### Type Parameters

###### T

`T` *extends* `bigint` \| `null` \| `undefined`

###### D

`D` *extends* `number` \| `null` \| `undefined`

##### Parameters

###### value

`T`

The value to format. It can be:
 - A `bigint` for precise numeric representation.
 - A `number` for floating-point or scientific notation input.
 - `null` or `undefined`, in which case the method will retain the nullability of the input unless a default value is set.

###### decimals

`D`

If input value is a bigint. It can be  `null` or `undefined`, in which case the method will retain the nullability of the input unless a default value is set.

##### Returns

`string` \| `Exclude`\<`T`, `bigint`\> \| `Exclude`\<`D`, `number`\>

The formatted value as a string, or:
 - The default value `value` or `decimals` is `null` or `undefined`.
 - `null`or `undefined` in case `value` or `decimals` is `null` or `undefined` and no default value is set

##### Examples

```ts
// Example with bigint input
console.log(formatter.of(123456789n, 2)); // Output: "1234567.89"
```

```ts
// Example with number input
console.log(formatter.of(123.45)); // Output: "123.45"
```

```ts
// Handling null or undefined
console.log(formatter.of(null, 2)); // Output: null
```

> \<`T`\>(`value`): `string` \| `Exclude`\<`T`, `number`\>

Formats a given value according to the formatter's configuration.

##### Type Parameters

###### T

`T` *extends* `number` \| `null` \| `undefined`

##### Parameters

###### value

`T`

The value to format. It can be:
 - A `bigint` for precise numeric representation.
 - A `number` for floating-point or scientific notation input.
 - `null` or `undefined`, in which case the method will retain the nullability of the input unless a default value is set.

##### Returns

`string` \| `Exclude`\<`T`, `number`\>

The formatted value as a string, or:
 - The default value `value` or `decimals` is `null` or `undefined`.
 - `null`or `undefined` in case `value` or `decimals` is `null` or `undefined` and no default value is set

##### Examples

```ts
// Example with bigint input
console.log(formatter.of(123456789n, 2)); // Output: "1234567.89"
```

```ts
// Example with number input
console.log(formatter.of(123.45)); // Output: "123.45"
```

```ts
// Handling null or undefined
console.log(formatter.of(null, 2)); // Output: null
```

#### Inherited from

[`BaseFormatter`](BaseFormatter.md).[`createOf`](BaseFormatter.md#createof)

***

### default()

#### Call Signature

> **default**(`_d`): `FormatterWithDefault`\<`HexFormatter`\>

Defined in: [packages/morpho-ts/src/format/format/format.ts:316](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L316)

Sets a default value for the formatter. If the provided value is `undefined` or `null`,
the method returns the current instance without modifying it. Otherwise, it creates
a new formatter instance with the specified default value.

##### Parameters

###### \_d

`string`

The default value to set. Accepts a string or `undefined`/`null`.

##### Returns

`FormatterWithDefault`\<`HexFormatter`\>

A new formatter instance with the updated default value, or the current instance
         if `_d` is `undefined` or `null`.

- `default(_d: string): FormatterWithDefault<this>;`
- `default(_d: string | undefined | null): this;`

##### Example

```ts
const formatter = new Formatter();
const updatedFormatter = formatter.default("N/A");

console.log(updatedFormatter.of(null)); // Outputs: "N/A"
```

##### Inherited from

[`BaseFormatter`](BaseFormatter.md).[`default`](BaseFormatter.md#default)

#### Call Signature

> **default**(`_d`): `this`

Defined in: [packages/morpho-ts/src/format/format/format.ts:317](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L317)

Sets a default value for the formatter. If the provided value is `undefined` or `null`,
the method returns the current instance without modifying it. Otherwise, it creates
a new formatter instance with the specified default value.

##### Parameters

###### \_d

`string` \| `null` \| `undefined`

The default value to set. Accepts a string or `undefined`/`null`.

##### Returns

`this`

A new formatter instance with the updated default value, or the current instance
         if `_d` is `undefined` or `null`.

- `default(_d: string): FormatterWithDefault<this>;`
- `default(_d: string | undefined | null): this;`

##### Example

```ts
const formatter = new Formatter();
const updatedFormatter = formatter.default("N/A");

console.log(updatedFormatter.of(null)); // Outputs: "N/A"
```

##### Inherited from

[`BaseFormatter`](BaseFormatter.md).[`default`](BaseFormatter.md#default)

***

### of()

#### Call Signature

> **of**\<`T`, `D`\>(`value`, `decimals`): `string` \| `Exclude`\<`T`, `bigint`\> \| `Exclude`\<`D`, `number`\>

Defined in: [packages/morpho-ts/src/format/format/format.ts:360](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L360)

Formats a given value according to the formatter's configuration.

##### Type Parameters

###### T

`T` *extends* `bigint` \| `null` \| `undefined`

###### D

`D` *extends* `number` \| `null` \| `undefined`

##### Parameters

###### value

`T`

The value to format. It can be:
 - A `bigint` for precise numeric representation.
 - A `number` for floating-point or scientific notation input.
 - `null` or `undefined`, in which case the method will retain the nullability of the input unless a default value is set.

###### decimals

`D`

If input value is a bigint. It can be  `null` or `undefined`, in which case the method will retain the nullability of the input unless a default value is set.

##### Returns

`string` \| `Exclude`\<`T`, `bigint`\> \| `Exclude`\<`D`, `number`\>

The formatted value as a string, or:
 - The default value `value` or `decimals` is `null` or `undefined`.
 - `null`or `undefined` in case `value` or `decimals` is `null` or `undefined` and no default value is set

##### Examples

```ts
// Example with bigint input
console.log(formatter.of(123456789n, 2)); // Output: "1234567.89"
```

```ts
// Example with number input
console.log(formatter.of(123.45)); // Output: "123.45"
```

```ts
// Handling null or undefined
console.log(formatter.of(null, 2)); // Output: null
```

##### Inherited from

`BaseFormatter.of`

#### Call Signature

> **of**\<`T`\>(`value`): `string` \| `Exclude`\<`T`, `number`\>

Defined in: [packages/morpho-ts/src/format/format/format.ts:364](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L364)

Formats a given value according to the formatter's configuration.

##### Type Parameters

###### T

`T` *extends* `number` \| `null` \| `undefined`

##### Parameters

###### value

`T`

The value to format. It can be:
 - A `bigint` for precise numeric representation.
 - A `number` for floating-point or scientific notation input.
 - `null` or `undefined`, in which case the method will retain the nullability of the input unless a default value is set.

##### Returns

`string` \| `Exclude`\<`T`, `number`\>

The formatted value as a string, or:
 - The default value `value` or `decimals` is `null` or `undefined`.
 - `null`or `undefined` in case `value` or `decimals` is `null` or `undefined` and no default value is set

##### Examples

```ts
// Example with bigint input
console.log(formatter.of(123456789n, 2)); // Output: "1234567.89"
```

```ts
// Example with number input
console.log(formatter.of(123.45)); // Output: "123.45"
```

```ts
// Handling null or undefined
console.log(formatter.of(null, 2)); // Output: null
```

##### Inherited from

`BaseFormatter.of`

***

### prefix()

> **prefix**(): `HexFormatter`

Defined in: [packages/morpho-ts/src/format/format/format.ts:425](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L425)

Enables the `0x` prefix for the hexadecimal format.

#### Returns

`HexFormatter`

A new `HexFormatter` instance with the prefix enabled.
