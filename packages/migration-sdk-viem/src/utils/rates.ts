import type { BigIntish } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { formatUnits } from "viem";

export function rateToApy(
  rate: BigIntish,
  period: Time.PeriodLike,
  rateDecimals = 18,
  isApr = false,
) {
  const { unit, duration } = Time.toPeriod(period);
  const factor = Time[unit].from.y(1) / duration;

  rate = BigInt(rate);

  if (isApr) rate /= Time[unit].from.y(1n);

  return (1 + Number(formatUnits(rate, rateDecimals))) ** factor - 1;
}
