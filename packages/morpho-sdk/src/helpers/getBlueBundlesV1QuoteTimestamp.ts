import { MathLib } from "@morpho-org/blue-sdk";
import { Time } from "@morpho-org/morpho-ts";

const MAX_BLUE_HEALTH_DEADLINE_HORIZON = Time.s.from.d(365n);

/**
 * @internal Projects health to realistic finite deadlines, never before now or the market snapshot.
 * Deadlines more than 365 days out (maxUint256/maxUint48-style unlimited sentinels) use
 * the legacy two-hour projection to avoid interest-accrual overflow.
 */
export function getBlueBundlesV1QuoteTimestamp({
  lastUpdate,
  now,
  deadline,
}: {
  readonly lastUpdate: bigint;
  readonly now: bigint;
  readonly deadline?: bigint;
}): bigint {
  const minTimestamp = MathLib.max(now, lastUpdate);
  return deadline === undefined ||
    deadline > minTimestamp + MAX_BLUE_HEALTH_DEADLINE_HORIZON
    ? minTimestamp + Time.s.from.h(2n)
    : MathLib.max(minTimestamp, deadline);
}
