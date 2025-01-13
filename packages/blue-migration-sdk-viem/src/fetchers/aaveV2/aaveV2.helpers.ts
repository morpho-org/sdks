import { Time, format } from "@morpho-org/morpho-ts";

export const rateToAPY = (ratePerYear: bigint) => {
  const period = Time.s.from.y(1n);
  const ratePerSeconds = ratePerYear / period;

  return (
    (1 + Number(format.number.locale("en").of(ratePerSeconds, 27))) **
      Number(period) -
    1
  );
};
