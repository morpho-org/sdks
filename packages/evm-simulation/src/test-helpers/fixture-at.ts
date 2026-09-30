import type { At } from "../simulate/internal/error-context.js";
import type { ExecutionContext } from "../simulate/internal/evidence.js";

/** Deterministic execution context for unit fixtures. @internal */
export const FIXTURE_EXECUTION_CONTEXT: ExecutionContext = {
  chainId: 1,
  stateBlockNumber: 20_000_000n,
  stateBlockHash: `0x${"ab".repeat(32)}` as `0x${string}`,
  stateBlockTimestamp: 1_700_000_000n,
  blockNumber: 20_000_000n,
  blockTimestamp: 1_700_000_000n,
};

/** Deterministic {@link At} wrapper for unit fixtures. @internal */
export const fixtureAt = (mode: "final" | "preview" = "final"): At => ({
  context: FIXTURE_EXECUTION_CONTEXT,
  mode,
});
