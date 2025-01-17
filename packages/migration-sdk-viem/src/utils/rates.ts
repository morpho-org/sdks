import type { BigIntish } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { formatUnits } from "viem";

export function rateToApy(
  rate: BigIntish,
  period: Time.PeriodLike,
  rateDecimals = 18,
) {
  const { unit, duration } = Time.toPeriod(period);
  const factor = Time[unit].from.y(1) / duration;

  return (1 + Number(formatUnits(BigInt(rate), rateDecimals))) ** factor - 1;
}
