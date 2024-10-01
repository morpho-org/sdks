# Format Utility

The `format` utility provides a set of formatters to represent numeric values in various human-readable forms. It supports formatting numbers as standard decimal, comma-separated, short notation with units, hexadecimal, and percentages.

## Installation

Ensure that the module is properly imported where the format utility is needed:

```javascript
import { format } from '@morpho-org/morpho-ts';
```

## Available Formatters

The `format` object provides access to different formatters:

- [**Hex Formatter**](#1-hex-formatter): Formats the value as a hexadecimal string.
- [**Number Formatter**](#2-number-formatter): Formats the value as a standard decimal number.
- [**Commas Formatter**](#3-commas-formatter): Formats the value as a comma-separated number.
- [**Short Formatter**](#4-short-formatter): Formats the value in a short notation with units (e.g., `k`, `M`).
- [**Percent Formatter**](#5-percent-formatter): Formats the value as a percentage.

### Usage

Each formatter can be accessed through the `format` object and provides chainable methods to customize the output. The formatted value can be obtained calling `.of(value)` for `number` or `.of(value, decimals)` for `bigint`.
The return value will retain the nullability of the input value, unless a `.default()` method is applied (refer to [Number Formatter](#2-number-formatter) for details).

> [!Tip]
> You can store the populated `of` function in a custom formatter:
> ```ts
> const formatDollar = format.short.digits(2).smallValuesWithCommas().unit("$").of
> 
> formatDollar(123456.789); // "$123.45k"
> formatDollar(123456789n, 4); // "$12.34k"
> ```


### 1. Hex Formatter

Formats a value as a hexadecimal string.

**Usage:**

```javascript
const hexValue = format.hex.of(255n); // "ff"
```

> [!NOTE]
> `decimals` will be ignored if this formatter is used with BigInts

**Customization Methods:**
- `.prefix()`: Prepend the result with `0x`

### 2. Number Formatter

Formats a value as a standard number with optional customization.

**Usage:**

```javascript
const numberValue = format.number.of(12345n, 2); // "123.45"
const numberValue = format.number.of(123.45); // "123.45"
```

**Customization Methods:**
- `.digits(number)`: Sets the number of decimal digits.
- `.removeTrailingZero()`: Removes trailing zeros after the decimal.
- `.min(number)`: Sets the minimum value; values below this will display as `< min`.
- `.max(number)`: Sets the maximum value; values above this will display as `> max`.
- `.sign()`: Adds a sign to the number (`+` or `-`).
- `.unit(string)`: Adds a unit to the number (e.g., "$", "%").
- `.locale(string)`: Formats the number according to the specified locale.
- `.readable()`: Makes the value more readable for small numbers.
- `.default(string)`: Sets a default value in case value is `null` or `undefined`.

### 3. Commas Formatter

Formats a value as a comma-separated string.

**Usage:**

```javascript
const commasValue = format.commas.of(123456789n, 2); // "1,234,567.89"
const commasValue = format.commas.of(1234567.89); // "1,234,567.89"
```

**Customization Methods:**
- Same as [Number Formatter](#2-number-formatter).

### 4. Short Formatter

Formats a value in a short notation with units (e.g., k, M, B).

**Usage:**

```javascript
const shortValue = format.short.of(1234567890n, 2); // "12.34567890M"
const shortValue = format.short.of(12345678.90); // "12.34567890M"
```

**Customization Methods:**
- Same as [Number Formatter](#2-number-formatter).
- `.smallValuesWithCommas()`: Formats small values using commas instead of short notation.

### 5. Percent Formatter

Formats a value as a percentage.

**Usage:**

```javascript
const percentValue = format.percent.of(1000, 4); // "10"
const percentValue = format.percent.of(0.1); // "10"
```

**Customization Methods:**
- Same as [Number Formatter](#2-number-formatter).

## Examples

```javascript
// Formatting a number with commas
const formattedCommas = format.commas.digits(2).unit("$").of(1234567); // "$1,234,567.00"

// Formatting a percentage
const formattedPercent = format.percent.digits(1).sign().of(0.123456); // "+12.3%"

// Formatting a number in short notation with units
const formattedShort = format.short.digits(2).smallValuesWithCommas().of(1000000_00000000n, 8); // "1.00M"
```

## Conclusion

The `format` utility provides a flexible and powerful way to present numbers in various formats tailored to specific display needs. By using the provided customization methods, you can adapt the output to suit different requirements and locales.