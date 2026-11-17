import { Time } from "@morpho-org/morpho-ts";
import { ExpiredDeadlineError } from "../../types/index.js";

/**
 * Rejects a Midnight bundle deadline that is not strictly after `now`.
 *
 * Midnight bundles revert with `DeadlinePassed()` once the deadline has passed, so a deadline at
 * or before `now` builds a transaction that cannot succeed. `maxUint256` still means
 * "no expiry". The check uses the supplied reference timestamp, falling back to the device clock. Transaction
 * builders stay clock-free and only check the deadline's `uint256` shape.
 *
 * @param deadline - Bundle execution deadline timestamp, in seconds.
 * @param now - Timestamp in seconds used to validate the deadline; defaults to `Time.timestamp()`.
 * @returns Nothing when `deadline` is after `now`.
 * @throws {ExpiredDeadlineError} when `deadline` is at or before `now`.
 * @internal
 */
export const validateMidnightDeadline = (
  deadline: bigint,
  now: bigint = Time.timestamp(),
): void => {
  if (deadline <= now) throw new ExpiredDeadlineError(deadline, now);
};
