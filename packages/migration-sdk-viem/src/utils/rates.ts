import type { BigIntish } from "@morpho-org/blue-sdk";
import { format, Time } from "@morpho-org/morpho-ts";

export function rateToApy(rate: BigIntish, period: Time.PeriodLike) {
  const { unit, duration } = Time.toPeriod(period);
  const factor = Time[unit].from.y(1) / duration;

  return (
    (1 + Number(format.number.locale("en").of(BigInt(rate), 18))) ** factor - 1
  );
}
