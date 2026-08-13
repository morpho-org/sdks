/**
 * Runs the synchronous prefix of a callback with `Date.now()` pinned to a test timestamp.
 *
 * The override is restored before the JavaScript event loop can yield, so concurrent async tests
 * can use different fork timestamps without sharing a fake clock across RPC calls.
 */
export const withChainTimestamp = <result>(
  timestamp: bigint,
  callback: () => result,
): result => {
  const dateNow = Date.now;
  Date.now = () => Number(timestamp) * 1_000;

  try {
    return callback();
  } finally {
    Date.now = dateNow;
  }
};
