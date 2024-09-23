# Time Utility

The `Time` utility provides a robust way to handle and convert time units in TypeScript, making it easier to work with various time durations. It allows you to convert between units like milliseconds, seconds, minutes, hours, days, weeks, months, and years, and provides additional utility functions such as waiting for a specified time and getting the current timestamp.

## Installation

To use the `Time` utility, ensure you have it correctly imported into your project:

```javascript
import { Time } from '@morpho-org/morpho-ts';
```

## Features

- [**Time Unit Conversion:**](#1-converting-time-units) Convert between different time units such as milliseconds, seconds, minutes, hours, days, weeks, months, and years.
- [**Wait Functionality:**](#timewaitms-number-value-t-promiset) Pause execution for a specified amount of time.
- [**Timestamp Generation:**](#timetimestamp-bigint) Get the current Unix timestamp as a bigint.
- [**Period Management**](#3-period-types) Manage time periods


## Usage

### 1. Converting Time Units

Each time unit has a `.from` method that allows you to convert from one unit to another.

#### Available Time Units

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

**Example:**

Convert 1 hour to minutes:

```javascript
const minutes = Time.h.from.min(1); // 60
```

Convert 5 days to hours:

```javascript
const hours = Time.d.from.h(5n); // 120n
```

Convert 2 weeks to days:

```javascript
const days = Time.w.from.d(2); // 14
```

### 2. Utility Methods

#### `Time.wait(ms: number, value?: T): Promise<T>`

Pauses execution for the specified amount of milliseconds, eventually returning a specific value afterwards.

**Usage:**

```javascript
await Time.wait(1000); // Waits for 1 second
const value = await Time.wait(1000, "Go"); // Waits for 1 second and returns "Go"
```

#### `Time.timestamp(): bigint`

Returns the current Unix timestamp in seconds as a bigint.

**Usage:**

```javascript
const timestamp = Time.timestamp(); // e.g., 1692671241n
```

### 3. Period Types

The `Time` utility also provides types to define periods:

- `Unit`: A type representing [supported time units](#available-time-units) (`ms`, `s`, `min`, etc.).
- `Period`: An object with `unit` and `duration` properties, defining a specific time period.
- `PeriodLike`: A type that can either be a `Period` object or a `Unit`.

#### Converting to a Period

```ts
function toPeriod(periodLike: PeriodLike): Period
```

You can convert a unit or a period-like object into a `Period`:

```javascript
const period = Time.toPeriod('h'); // { unit: 'h', duration: 1 }
const customPeriod = Time.toPeriod({ unit: 'min', duration: 15 }); // { unit: 'min', duration: 15 }
```

## Conclusion

The `Time` utility provides a versatile and straightforward way to handle time calculations and conversions in your TypeScript projects. Whether you need to convert time units, wait for specific durations, or work with Unix timestamps, this utility offers a comprehensive set of tools to make time management simpler and more consistent.
