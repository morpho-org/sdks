import type { RawCall, RawLog } from "../types.js";

/**
 * Wrap a list of `RawLog` into a `RawCall` for spec fixtures. Defaults
 * to a successful call with no gas, no return data, and no asset changes.
 * Pass `overrides` to set status/returnData/gasUsed/assetChanges per fixture.
 */
export function makeCall(
  logs: RawLog[],
  overrides?: Partial<RawCall>,
): RawCall {
  return {
    logs,
    status: true,
    returnData: "0x",
    gasUsed: 0n,
    ...overrides,
  };
}
