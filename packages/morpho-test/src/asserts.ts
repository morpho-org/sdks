import { expect } from "chai";
import { parseEther } from "ethers";

export const assertApproxEqAbs = (actual: bigint, expected: bigint, tolerance = 0n, message?: string) =>
  expect(actual >= expected ? actual - expected : expected - actual).to.be.lessThanOrEqual(
    // @ts-ignore
    tolerance,
    message
  );

export const assertApproxEqRel = (actual: bigint, expected: bigint, tolerance = 0n, message?: string) =>
  assertApproxEqAbs(actual, expected, (expected * tolerance) / parseEther("1"), message);

export const assertEq = (actual: bigint, expected: bigint) => assertApproxEqAbs(actual, expected, 0n);
