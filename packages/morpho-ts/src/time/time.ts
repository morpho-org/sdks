const toNumberish = (returnValue: bigint, initialValue: bigint | number) => {
  if (typeof initialValue === "bigint") return returnValue;
  return Number(returnValue);
};

const UNITS = ["ms", "s", "min", "h", "d", "w", "mo", "y"] as const;
type TUnit = (typeof UNITS)[number];
type TPeriod = {
  unit: TUnit;
  duration: number;
};

type P = {
  [U in TUnit]: <T extends number | bigint>(
    value: T,
  ) => T extends number ? number : bigint;
};

type Converters = { from: P; fromPeriod(period: Time.PeriodLike): number };

/**
 * Groups unit converters for milliseconds, seconds, minutes, hours, days, weeks, months, and years.
 */
// biome-ignore lint/complexity/noStaticOnlyClass: namespace-style API for unit converters
export class Time {
  static ms: Converters;
  static s: Converters;
  static min: Converters;
  static h: Converters;
  static d: Converters;
  static w: Converters;
  static mo: Converters;
  static y: Converters;
}

Object.defineProperties(
  Time,
  Object.fromEntries(
    UNITS.map((unit, i) => [
      unit,
      {
        writable: false,
        value: {
          fromPeriod(period: Time.PeriodLike) {
            const { unit: unitFrom, duration } = Time.toPeriod(period);
            return Time[unit].from[unitFrom](duration);
          },
          from: Object.fromEntries(
            UNITS.map((unitFrom, iFrom) => {
              if (iFrom < i)
                return [
                  unitFrom,
                  (value: bigint | number) => {
                    const normalizer = Time[unitFrom].from[unit](1n);
                    return toNumberish(BigInt(value) / normalizer, value);
                  },
                ];
              if (iFrom > i)
                return [
                  unitFrom,
                  (value: bigint | number) => {
                    switch (unitFrom) {
                      /* v8 ignore next -- unitFrom cannot be ms in this larger-unit conversion branch. */
                      case "ms":
                        return value;
                      case "s":
                        return toNumberish(BigInt(value) * 1000n, value);
                      case "min":
                        return toNumberish(
                          Time[unit].from.s(BigInt(value)) * 60n,
                          value,
                        );
                      case "h":
                        return toNumberish(
                          Time[unit].from.min(BigInt(value)) * 60n,
                          value,
                        );
                      case "d":
                        return toNumberish(
                          Time[unit].from.h(BigInt(value)) * 24n,
                          value,
                        );
                      case "w":
                        return toNumberish(
                          Time[unit].from.d(BigInt(value)) * 7n,
                          value,
                        );
                      case "mo":
                        return toNumberish(
                          Time[unit].from.d(BigInt(value)) * 31n,
                          value,
                        );
                      case "y":
                        return toNumberish(
                          Time[unit].from.d(BigInt(value)) * 365n,
                          value,
                        );
                    }
                  },
                ];
              return [unitFrom, (value: bigint | number) => value];
            }),
          ),
        },
      },
    ]),
  ),
);

/**
 * Exposes time helper types and functions merged onto the `Time` converter class.
 */
export namespace Time {
  /**
   * Supported time unit identifier.
   */
  export type Unit = TUnit;

  /**
   * Object form of a time period with a unit and duration.
   */
  export type Period = TPeriod;

  /**
   * Time period accepted either as a unit shorthand or a full period object.
   */
  export type PeriodLike = TPeriod | TUnit;

  /**
   * Normalizes a period-like value into object form.
   *
   * @param periodLike - Unit shorthand or full period object to normalize.
   * @returns A period object with `unit` and `duration`.
   * @example
   * ```ts
   * import { Time } from "@morpho-org/morpho-ts";
   *
   * const period = Time.toPeriod("d");
   * // { unit: "d", duration: 1 }
   * ```
   */
  export function toPeriod(periodLike: PeriodLike): Period {
    if (typeof periodLike === "object") return periodLike;
    return {
      unit: periodLike,
      duration: 1,
    };
  }

  /**
   * Resolves a value after waiting for a duration in milliseconds.
   *
   * @param ms - Duration to wait in milliseconds.
   * @param value - Optional value resolved by the returned promise.
   * @returns A promise that resolves with `value` after the wait duration.
   * @example
   * ```ts
   * import { Time } from "@morpho-org/morpho-ts";
   *
   * const value = await Time.wait(10, "ready");
   * // "ready"
   * ```
   */
  export async function wait<T>(ms: number, value?: T) {
    return new Promise((resolve) => setTimeout(() => resolve(value), ms));
  }

  /**
   * Returns the current Unix timestamp rounded up to the next second.
   *
   * @returns The current Unix timestamp as a bigint.
   * @example
   * ```ts
   * import { Time } from "@morpho-org/morpho-ts";
   *
   * const now = Time.timestamp();
   * // now satisfies bigint
   * ```
   */
  export function timestamp() {
    return BigInt(Math.ceil(Date.now() / 1_000));
  }
  /* v8 ignore next -- TypeScript emits an untestable namespace-merge fallback branch. */
}
