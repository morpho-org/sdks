import fc from "fast-check";

const SEED_PERIOD_MS = 2 * 24 * 60 * 60 * 1000;

// The seed changes every two days (UTC): runs in the same window, local or CI, generate the same
// inputs, and each new window explores new ones. Failures print their seed and path.
fc.configureGlobal({
  seed: Math.floor(Date.now() / SEED_PERIOD_MS),
  numRuns: 200,
});
