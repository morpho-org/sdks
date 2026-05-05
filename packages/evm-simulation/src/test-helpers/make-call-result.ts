import type { RawCallResult, RawLog } from "../types.js";

/**
 * Wrap a list of `RawLog` into a `RawCallResult` for spec fixtures. Defaults
 * to a successful call with no gas, no return data, and no asset changes.
 * Pass `overrides` to set status/returnData/gasUsed/assetChanges per fixture.
 */
export function makeCallResult(
  logs: RawLog[],
  overrides?: Partial<RawCallResult>,
): RawCallResult {
  return {
    logs,
    status: true,
    returnData: "0x",
    gasUsed: 0n,
    ...overrides,
  };
}
