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

// biome-ignore lint/complexity/noStaticOnlyClass:
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

export namespace Time {
  export type Unit = TUnit;
  export type Period = TPeriod;
  export type PeriodLike = TPeriod | TUnit;

  export function toPeriod(periodLike: PeriodLike): Period {
    if (typeof periodLike === "object") return periodLike;
    return {
      unit: periodLike,
      duration: 1,
    };
  }

  export async function wait<T>(ms: number, value?: T) {
    return new Promise((resolve) => setTimeout(() => resolve(value), ms));
  }

  export function timestamp() {
    return BigInt(Math.ceil(Date.now() / 1_000));
  }
}
