// SPDX-License-Identifier: Apache-2.0
//
// JSON.stringify on a BigInt throws by default, which trips up jest-worker's
// parent/child IPC when any thrown error, console output, or test result
// contains a bigint. viem-heavy fork tests routinely surface bigints in error
// payloads (chain ids, amounts, gas), so we polyfill BigInt.prototype.toJSON
// to its decimal string form. This matches the convention used elsewhere in
// the monorepo's viem-based fixtures.

// biome-ignore lint: BigInt polyfill, intentional global mutation
BigInt.prototype.toJSON = function () {
  return this.toString();
};
