# @morpho-org/morpho-ts

<a href="https://www.npmjs.com/package/@morpho-org/morpho-ts">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@morpho-org/morpho-ts?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/v/@morpho-org/morpho-ts?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Version">
    </picture>
</a>
<a href="https://github.com/morpho-org/morpho-ts/blob/main/LICENSE">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/l/@morpho-org/morpho-ts?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/l/@morpho-org/morpho-ts?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="MIT License">
    </picture>
</a>
<a href="https://www.npmjs.com/package/@morpho-org/morpho-ts">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/@morpho-org/morpho-ts?colorA=21262d&colorB=21262d&style=flat">
        <img src="https://img.shields.io/npm/dm/@morpho-org/morpho-ts?colorA=f6f8fa&colorB=f6f8fa&style=flat" alt="Downloads per month">
    </picture>
</a>
<br />
<br />

TypeScript package to handle all things time & format-related.

## Installation

```bash
npm install @morpho-org/morpho-ts
```

```bash
yarn add @morpho-org/morpho-ts
```

## Getting Started

### Format

The `format` utility provides a set of formatters to format numeric values in various human-readable forms.

Here are all the available formatters:

- [**Hexadecimal Formatter**](#hex-formatter): Formats the value as a hexadecimal string.
- [**Number Formatter**](#number-formatter): Formats the value as a standard decimal number.
- [**Commas Formatter**](#commas-formatter): Formats the value as a comma-separated number.
- [**Short Formatter**](#short-formatter): Formats the value in a short notation with units (e.g., `k`, `M`).
- [**Percent Formatter**](#percent-formatter): Formats the value as a percentage.

### Usage

Each formatter can be accessed through the `format` object and provides chainable methods to customize the output. The formatted value can be obtained calling `.of(value)` for `number` or `.of(value, decimals)` for `bigint`.
The return value will retain the nullability of the input value (giving priority to `value` over `decimals` for bigints, if none is defined), unless a `.default()` method is applied (refer to [Number Formatter](#2-number-formatter) for details).

> [!Tip]
> You can store the partially populated formatter as a custom formatter:
>
> ```typescript
> import { format } from "@morpho-org/morpho-ts";
>
> const dollarFormatter = format.short
>   .smallValuesWithCommas()
>   .unit("$");
>
> dollarFormatter
>   .digits(2).of(123456.789); // "$123.45k"
> dollarFormatter
>   .digits(4).of(123456789n, 4); // "$12.3456k"
> ```


#### `createOf`
Alternatively, you can create a standalone formatting function by calling `createOf` on your populated formatter.

```typescript
import { format } from "@morpho-org/morpho-ts";

const formatDollar = format.short
  .smallValuesWithCommas()
  .digits(2)
  .unit("$")
  .createOf();

formatDollar(123456.789); // "$123.45k"
formatDollar(123456789n, 4); // "$12.34k"
```

### Hex Formatter

Formats a value as a hexadecimal string.

```typescript
import { format } from "@morpho-org/morpho-ts";

format.hex.of(255n); // "ff"
```

> [!NOTE]
> `decimals` will be ignored if this formatter is used with BigInts

**Customization:**

- `.prefix()`: Prepend the result with `0x`

---

### Number Formatter

Formats a value as a standard number with optional customization.

```typescript
import { format } from "@morpho-org/morpho-ts";

format.number.of(12345n, 2); // "123.45"
format.number.of(123.45); // "123.45"
```

**Customization Methods:**

- `.digits(number)`: Sets the number of decimal digits. <span style="color:#C73E59">*</span>
- `.trailingZero(enable = true)`: Enables or disables trailing zeros in the formatted output. If `enable` is `true`, trailing zeros will be kept; if `false`, they will be removed. The default value is `true`.
- `.min(number)`: Sets the minimum value; values below this will display as `< min`. <span style="color:#C73E59">*</span>
- `.max(number)`: Sets the maximum value; values above this will display as `> max`. <span style="color:#C73E59">*</span>
- `.sign()`: Adds a sign to the number (`+` or `-`).
- `.unit(string)`: Adds a unit to the number (e.g., `$`, `%`). <span style="color:#C73E59">*</span>
- `.locale(string)`: Formats the number according to the specified locale. <span style="color:#C73E59">*</span>
- `.readable()`: Makes the value more readable for small numbers.
- `.default(string)`: Sets a default value in case `value` (or `decimals`) is `null` or `undefined`. <span style="color:#C73E59">*</span>



_<sub><span style="color:#C73E59">*</span> If the provided value is `null` or `undefined`, the option is ignored.</sub>_


---

### Commas Formatter

Formats a value as a comma-separated string.

```typescript
import { format } from "@morpho-org/morpho-ts";

format.commas.of(123456789n, 2); // "1,234,567.89"
format.commas.of(1234567.89); // "1,234,567.89"

format.commas.digits(2).unit("$").of(1234567); // "$1,234,567.00"
```

**Customization:**

- Same as [Number Formatter](#number-formatter).

---

### Short Formatter

Formats a value in a short notation with units (e.g., `k`, `M`, `B`).

```typescript
import { format } from "@morpho-org/morpho-ts";

format.short.of(1234567890n, 2); // "12.34567890M"
format.short.of(12345678.9); // "12.34567890M"

format.short.digits(2).smallValuesWithCommas().of(1000000_00000000n, 8); // "1.00M"
```

**Customization:**

- Same as [Number Formatter](#number-formatter).
- `.smallValuesWithCommas()`: Formats small values using commas instead of short notation.

---

### Percent Formatter

Formats a value as a percentage.

```typescript
import { format } from "@morpho-org/morpho-ts";

format.percent.of(1000, 4); // "10"
format.percent.of(0.1); // "10"

format.percent.digits(1).sign().of(0.123456); // "+12.3%"
```

**Customization:**

- Same as [Number Formatter](#number-formatter).

---

### Create custom formatters

You can create a custom `format` object with default options that will be applied to all formatters created from it. You can also create custom formatters with specific names and options using the second argument.

```typescript
import { createFormat } from "@morpho-org/morpho-ts";

const customFormat = createFormat({
    all: { digits: 2 }, // all formatters will format with 2 digits
    short: { digits: 3 }, // all short formatters will format with 3 digits
    number: { sign: true }, // all number formatters will display signed values
    ...
}, {
    custom: { format: Format.number, unit: "$" }, // this will add a `custom` key in `customFormat` that creates a formatter with these options
})

customFormat.short.of(1234.5678); // "1234.567"
customFormat.number.of(1234.5678); // "+1234.56"
customFormat.custom.of(1234.5678); // "$1234.56"

// Default options can be normally overridden
customFormat.short.digits(1).of(1234.5678); // "1234.5"
```

> [!NOTE]
> Custom formatters will be impacted by `all` default options but not by type-specific default options

---

### Time

The `Time` utility provides a robust way to handle and convert time units in TypeScript, making it easier to work with various time durations.

- [**Period**](#period-types): Manage time periods
- [**Time Unit Conversion**](#converting-time-units): Convert between different time units such as milliseconds, seconds, minutes, hours, days, weeks, months, and years.
- [**Wait**](#timewait): Pause execution for a specified amount of time.
- [**Timestamp**](#timetimestamp): Get the current Unix timestamp as a bigint.


### Period Types

The `Time` utility also provides types to define periods:

- `Unit`: A type representing supported time units (`ms`, `s`, `min`, etc.).
- `Period`: An object with `unit` and `duration` properties, defining a specific time period.
- `PeriodLike`: A type that can either be a `Period` object or a `Unit`.

You can convert a unit or a period-like object into a `Period`:

```typescript
import { Time } from "@morpho-org/morpho-ts";

Time.toPeriod("h"); // { unit: 'h', duration: 1 }
Time.toPeriod({ unit: "min", duration: 15 }); // { unit: 'min', duration: 15 }
```

---

#### Converting Time Units

Each time unit has a `.from` and a `.fromPeriod` method that allows you to convert from one unit to another.

The following units are supported:

- `ms` - milliseconds
- `s` - seconds
- `min` - minutes
- `h` - hours
- `d` - days
- `w` - weeks
- `mo` - months (assumed to be 31 days)
- `y` - years (assumed to be 365 days)

> [!Note]
> The converter seamlessly handles both number and bigint inputs, ensuring the output type matches the type of the input value, preserving data consistency throughout conversions.

Convert 1 hour to minutes:

```typescript
import { Time } from "@morpho-org/morpho-ts";

const minutes = Time.min.from.h(1); // 60
const minutesFromPeriod = Time.min.fromPeriod("h"); // 60
```

Convert 5 days to hours:

```typescript
import { Time } from "@morpho-org/morpho-ts";

const hours = Time.h.from.d(5n); // 120n
const hoursFromPeriod = Time.h.fromPeriod({unit: "d", duration: 5}); // 120
```

Convert 2 weeks to days:

```typescript
import { Time } from "@morpho-org/morpho-ts";

const days = Time.d.from.w(2); // 14
const daysFromPeriod = Time.w.fromPeriod({unit: "w", duration: 2}); // 14
```


---

### `Time.wait`

Pauses execution for the specified amount of milliseconds, eventually returning a specific value afterwards.

**Usage:**

```typescript
import { Time } from "@morpho-org/morpho-ts";

await Time.wait(1000); // Waits for 1 second
const value = await Time.wait(1000, "Go"); // Waits for 1 second and returns "Go"
```

---

### `Time.timestamp`

Returns the current Unix timestamp in seconds as a bigint.

**Usage:**

```typescript
import { Time } from "@morpho-org/morpho-ts";

Time.timestamp(); // 1692671241n
```

