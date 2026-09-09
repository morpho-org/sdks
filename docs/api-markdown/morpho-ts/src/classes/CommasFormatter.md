[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / CommasFormatter

# Class: CommasFormatter

Defined in: [packages/morpho-ts/src/format/format/format.ts:690](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L690)

A formatter for numeric values with comma-separated formatting.

The `CommasFormatter` class formats numbers with commas as thousands separators,
providing better readability for large numbers. It supports various customization
options such as decimal precision, units, and locale.

## Examples

```ts
// Basic usage
const formatter = formatter;
console.log(formatter.of(1234567.89)); // Output: "1,234,567.89"
```

```ts
// Customizing decimal places
const formatterWithDigits = formatter.digits(2);
console.log(formatterWithDigits.of(1234567.89)); // Output: "1,234,567.89"
```

```ts
// Adding a unit
const formatterWithUnit = formatter.unit("$");
console.log(formatterWithUnit.of(1234567.89)); // Output: "$1,234,567.89"
```

## Extends

- [`CommonFormatter`](CommonFormatter.md)

## Constructors

### Constructor

> **new CommasFormatter**(`__options?`): `CommasFormatter`

Defined in: [packages/morpho-ts/src/format/format/format.ts:693](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L693)

#### Parameters

##### \_\_options?

`Partial`\<`FormatCommasOptions`\> = `{}`

#### Returns

`CommasFormatter`

#### Overrides

[`CommonFormatter`](CommonFormatter.md).[`constructor`](CommonFormatter.md#constructor)

## Properties

### \_options

> `protected` **\_options**: `Readonly`\<`FormatCommasOptions`\>

Defined in: [packages/morpho-ts/src/format/format/format.ts:691](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L691)

#### Overrides

[`CommonFormatter`](CommonFormatter.md).[`_options`](CommonFormatter.md#_options)

## Methods

### \_clone()

> **\_clone**(`_options`): `CommasFormatter`

Defined in: [packages/morpho-ts/src/format/format/format.ts:698](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L698)

#### Parameters

##### \_options

`FormatCommasOptions`

#### Returns

`CommasFormatter`

#### Overrides

[`CommonFormatter`](CommonFormatter.md).[`_clone`](CommonFormatter.md#_clone)

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

[`CommonFormatter`](CommonFormatter.md).[`createOf`](CommonFormatter.md#createof)

***

### default()

#### Call Signature

> **default**(`_d`): `FormatterWithDefault`\<`CommasFormatter`\>

Defined in: [packages/morpho-ts/src/format/format/format.ts:316](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L316)

Sets a default value for the formatter. If the provided value is `undefined` or `null`,
the method returns the current instance without modifying it. Otherwise, it creates
a new formatter instance with the specified default value.

##### Parameters

###### \_d

`string`

The default value to set. Accepts a string or `undefined`/`null`.

##### Returns

`FormatterWithDefault`\<`CommasFormatter`\>

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

[`CommonFormatter`](CommonFormatter.md).[`default`](CommonFormatter.md#default)

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

[`CommonFormatter`](CommonFormatter.md).[`default`](CommonFormatter.md#default)

***

### digits()

> **digits**(`_d`): `CommasFormatter`

Defined in: [packages/morpho-ts/src/format/format/format.ts:456](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L456)

Sets the number of decimal places for the formatter.

If `_d` is `null` or `undefined`, the current instance is returned without modification.
Otherwise, a new formatter instance is created with the specified number of decimal places.

#### Parameters

##### \_d

`number` \| `null` \| `undefined`

The number of decimal places to use in formatting. Can be `null` or `undefined`.

#### Returns

`CommasFormatter`

A new formatter instance with the updated `digits` option, or the current instance
         if `_d` is `null` or `undefined`.

#### Example

```ts
const updatedFormatter = formatter.digits(2);
console.log(updatedFormatter.of(1234.567)); // Output: "1234.57"
```

#### Inherited from

[`CommonFormatter`](CommonFormatter.md).[`digits`](CommonFormatter.md#digits)

***

### locale()

> **locale**(`_l`): `CommasFormatter`

Defined in: [packages/morpho-ts/src/format/format/format.ts:624](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L624)

Sets the locale for the formatted output.

This method configures the formatter to format numbers according to the specified locale,
which can affect decimal symbols, thousand separators, and other locale-specific formatting rules.

If `_l` is `null` or `undefined`, the current instance is returned without modification.

#### Parameters

##### \_l

`string` \| `null` \| `undefined`

The locale identifier (e.g., `"en-US"`, `"fr-FR"`, `"de-DE"`) to use for formatting.
            Can be `null` or `undefined`.

#### Returns

`CommasFormatter`

A new formatter instance with the `locale` option set to the specified locale,
         or the current instance if `_l` is `null` or `undefined`.

#### Example

```ts
const updatedFormatter = formatter.locale("fr-FR");
console.log(updatedFormatter.of(1234.56)); // Output: "1 234,56" (French locale)

const usFormatter = formatter.locale("en-US");
console.log(usFormatter.of(1234.56)); // Output: "1,234.56" (US locale)
```

#### Inherited from

[`CommonFormatter`](CommonFormatter.md).[`locale`](CommonFormatter.md#locale)

***

### max()

> **max**(`_m`): `CommasFormatter`

Defined in: [packages/morpho-ts/src/format/format/format.ts:547](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L547)

Sets the maximum value for the formatter.

This method configures the formatter to apply an upper bound to the values being formatted.
If the value being formatted exceeds the specified maximum, it will be replaced with a
representation like `> maxValue`.

If `_m` is `null` or `undefined`, the current instance is returned without modification.

#### Parameters

##### \_m

`number` \| `null` \| `undefined`

The maximum value to enforce. Can be `null` or `undefined`.

#### Returns

`CommasFormatter`

A new formatter instance with the `max` option set to the specified value,
         or the current instance if `_m` is `null` or `undefined`.

#### Example

```ts
const updatedFormatter = formatter.max(100);
console.log(updatedFormatter.of(150)); // Output: "> 100"
```

#### Inherited from

[`CommonFormatter`](CommonFormatter.md).[`max`](CommonFormatter.md#max)

***

### min()

> **min**(`_m`): `CommasFormatter`

Defined in: [packages/morpho-ts/src/format/format/format.ts:523](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L523)

Sets the minimum value for the formatter.

This method configures the formatter to apply a lower bound to the values being formatted.
If the value being formatted is below the specified minimum, it will be replaced with a
representation like `< minValue`.

If `_m` is `null` or `undefined`, the current instance is returned without modification.

#### Parameters

##### \_m

`number` \| `null` \| `undefined`

The minimum value to enforce. Can be `null` or `undefined`.

#### Returns

`CommasFormatter`

A new formatter instance with the `min` option set to the specified value,
         or the current instance if `_m` is `null` or `undefined`.

#### Example

```ts
const updatedFormatter = formatter.min(10);
console.log(updatedFormatter.of(5)); // Output: "< 10"
```

#### Inherited from

[`CommonFormatter`](CommonFormatter.md).[`min`](CommonFormatter.md#min)

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

`CommonFormatter.of`

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

`CommonFormatter.of`

***

### readable()

> **readable**(): `CommasFormatter`

Defined in: [packages/morpho-ts/src/format/format/format.ts:500](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L500)

Enables readable formatting for small values.

This method adjusts the formatter's configuration to ensure that small values are represented
in a more human-readable format. For instance, very small non-zero numbers might be formatted
using a notation like `< 0.01` instead of showing many insignificant digits.

#### Returns

`CommasFormatter`

A new formatter instance with the `readable` option set to `true`.

#### Example

```ts
const updatedFormatter = formatter.readable();
console.log(updatedFormatter.of(0.0001, 2)); // Output: "< 0.01"
```

#### Inherited from

[`CommonFormatter`](CommonFormatter.md).[`readable`](CommonFormatter.md#readable)

***

### sign()

> **sign**(): `CommasFormatter`

Defined in: [packages/morpho-ts/src/format/format/format.ts:568](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L568)

Enables the inclusion of a sign (+/-) in the formatted output.

This method configures the formatter to explicitly display a positive sign (`+`) for positive
values, and a negative sign (`-`) for negative values. By default, positive values are displayed
without a sign.

#### Returns

`CommasFormatter`

A new formatter instance with the `sign` option set to `true`.

#### Example

```ts
const updatedFormatter = formatter.sign();
console.log(updatedFormatter.of(123));  // Output: "+123"
console.log(updatedFormatter.of(-123)); // Output: "-123"
```

#### Inherited from

[`CommonFormatter`](CommonFormatter.md).[`sign`](CommonFormatter.md#sign)

***

### trailingZero()

> **trailingZero**(`enable?`): `CommasFormatter`

Defined in: [packages/morpho-ts/src/format/format/format.ts:481](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L481)

Enables or disables trailing zeros in the formatted output.

This method modifies the formatter's configuration to remove or keep unnecessary trailing zeros
from decimal numbers based on the `enable` parameter. A new formatter instance is created with
this option enabled or disabled.

#### Parameters

##### enable?

`boolean` = `true`

A boolean indicating whether to enable trailing zeros. Defaults to `true`.

#### Returns

`CommasFormatter`

A new formatter instance with the `removeTrailingZero` option set to the opposite of `enable`.

#### Examples

```ts
const updatedFormatter = formatter.trailingZero(false);
console.log(updatedFormatter.of(123.4500)); // Output: "123.45"
```

```ts
const updatedFormatterDisabled = formatter.trailingZero(true);
console.log(updatedFormatterDisabled.of(123.4500)); // Output: "123.4500"
```

#### Inherited from

[`CommonFormatter`](CommonFormatter.md).[`trailingZero`](CommonFormatter.md#trailingzero)

***

### unit()

> **unit**(`_u`): `CommasFormatter`

Defined in: [packages/morpho-ts/src/format/format/format.ts:596](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/format/format.ts#L596)

Adds a unit symbol to the formatted output.

This method configures the formatter to append or prepend a unit symbol to the formatted value.
Common examples include currency symbols (`$`), percentage symbols (`%`), or custom units.

If `_u` is `null` or `undefined`, the current instance is returned without modification.

#### Parameters

##### \_u

`string` \| `null` \| `undefined`

The unit symbol to add to the formatted value. Can be `null` or `undefined`.

#### Returns

`CommasFormatter`

A new formatter instance with the `unit` option set to the specified symbol,
         or the current instance if `_u` is `null` or `undefined`.

#### Example

```ts
const updatedFormatter = formatter.unit("$");
console.log(updatedFormatter.of(1234.56)); // Output: "$1234.56"

const percentFormatter = formatter.unit("%");
console.log(percentFormatter.of(50)); // Output: "50%"

const otherFormatter = formatter.unit("UNIT");
console.log(percentFormatter.of(50)); // Output: "50 UNIT"
```

#### Inherited from

[`CommonFormatter`](CommonFormatter.md).[`unit`](CommonFormatter.md#unit)
