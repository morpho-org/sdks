import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { DivisionByZeroError, InvalidBitLengthError } from "./errors.js";
import { MathLib, type RoundingDirection } from "./math.js";

const { WAD, RAY, MAX_UINT_128, MAX_UINT_256 } = MathLib;
const NUM_RUNS = 1_000;

// uint256 values biased to the protocol's edges: 0, 1, dust, WAD, the uint128 and uint256
// bounds, and a log-uniform spread over every bit length.
const uint256 = fc.oneof(
  fc.constantFrom(
    0n,
    1n,
    2n,
    WAD - 1n,
    WAD,
    WAD + 1n,
    MAX_UINT_128,
    MAX_UINT_256 - 1n,
    MAX_UINT_256,
  ),
  fc.bigInt({ min: 0n, max: 1_000_000n }),
  fc
    .integer({ min: 1, max: 256 })
    .chain((bits) => fc.bigInt({ min: 0n, max: (1n << BigInt(bits)) - 1n })),
);
const nonZeroUint256 = uint256.filter((d) => d > 0n);
const rounding = fc.constantFrom<RoundingDirection>("Up", "Down");

// Reference model of morpho-blue MathLib.sol (Solidity 0.8 checked arithmetic):
// `undefined` wherever the contract reverts.
type MulDivArgs = readonly [x: bigint, y: bigint, d: bigint];

function solMulDivDown([x, y, d]: MulDivArgs) {
  // `x * y` reverts past uint256; `/ d` reverts on d = 0.
  if (x * y > MAX_UINT_256 || d === 0n) return undefined;

  return (x * y) / d;
}

function solMulDivUp([x, y, d]: MulDivArgs) {
  // `d - 1` underflows on d = 0; `x * y` and `x * y + (d - 1)` revert past uint256.
  if (d === 0n || x * y + (d - 1n) > MAX_UINT_256) return undefined;

  return (x * y + (d - 1n)) / d;
}

function solWTaylorCompounded(x: bigint, n: bigint) {
  const firstTerm = x * n;
  if (firstTerm > MAX_UINT_256) return undefined;
  const secondTerm = solMulDivDown([firstTerm, firstTerm, 2n * WAD]);
  if (secondTerm === undefined) return undefined;
  const thirdTerm = solMulDivDown([secondTerm, firstTerm, 3n * WAD]);
  if (thirdTerm === undefined) return undefined;
  const sum = firstTerm + secondTerm + thirdTerm;

  return sum > MAX_UINT_256 ? undefined : sum;
}

const solMulDiv = (args: MulDivArgs, direction: RoundingDirection) =>
  direction === "Up" ? solMulDivUp(args) : solMulDivDown(args);

// Inputs on which Solidity's mulDivUp (hence also mulDivDown) does not revert.
const mulDivArgs = fc
  .tuple(uint256, uint256, nonZeroUint256)
  .filter(([x, y, d]) => solMulDivUp([x, y, d]) !== undefined);
const wadArgs = fc
  .tuple(uint256, uint256)
  .filter(([x, y]) => solMulDivUp([x, y, WAD]) !== undefined);
const wDivArgs = fc
  .tuple(uint256, nonZeroUint256)
  .filter(([x, y]) => solMulDivUp([x, WAD, y]) !== undefined);
// Inputs on which Solidity's mulDivDown does not revert (a superset of the mulDivUp domain).
const mulDivDownArgs = fc
  .tuple(uint256, uint256, nonZeroUint256)
  .filter(([x, y, d]) => solMulDivDown([x, y, d]) !== undefined);
const wadDownArgs = fc
  .tuple(uint256, uint256)
  .filter(([x, y]) => solMulDivDown([x, y, WAD]) !== undefined);
const wDivDownArgs = fc
  .tuple(uint256, nonZeroUint256)
  .filter(([x, y]) => solMulDivDown([x, WAD, y]) !== undefined);
const mulDivRoundingArgs = fc
  .tuple(uint256, uint256, nonZeroUint256, rounding)
  .filter(
    ([x, y, d, direction]) => solMulDiv([x, y, d], direction) !== undefined,
  );
const wMulRoundingArgs = fc
  .tuple(uint256, uint256, rounding)
  .filter(
    ([x, y, direction]) => solMulDiv([x, y, WAD], direction) !== undefined,
  );
const wDivRoundingArgs = fc
  .tuple(uint256, nonZeroUint256, rounding)
  .filter(
    ([x, y, direction]) => solMulDiv([x, WAD, y], direction) !== undefined,
  );

const mulDivDownOverflowArgs = fc
  .tuple(uint256, uint256, nonZeroUint256)
  .filter(([x, y]) => x * y > MAX_UINT_256);
const mulDivDownOverflowExamples: [[bigint, bigint, bigint]][] = [
  [[1n << 128n, 1n << 128n, 1n]],
  [[MAX_UINT_256, MAX_UINT_128, MAX_UINT_128]],
];
const mulDivUpOverflowArgs = fc
  .tuple(uint256, uint256, nonZeroUint256)
  .filter(([x, y, d]) => x * y + (d - 1n) > MAX_UINT_256);
const mulDivUpOverflowExamples: [[bigint, bigint, bigint]][] = [
  [[MAX_UINT_256, 1n, 2n]],
  [[MAX_UINT_256, MAX_UINT_128, MAX_UINT_128]],
];

// morpho-blue src/libraries/MathLib.sol `mulDivDown`: (x * y) / d.
describe("mulDivDown", () => {
  test.prop([mulDivDownArgs], {
    numRuns: NUM_RUNS,
    examples: [
      [[MAX_UINT_256, 1n, 1n]],
      [[MAX_UINT_128, MAX_UINT_128, 3n]],
      [[MAX_UINT_256, 1n, 2n]],
    ],
  })("default", ([x, y, d]) => {
    expect(MathLib.mulDivDown(x, y, d)).toBe(solMulDivDown([x, y, d]));
  });

  test.prop([uint256, uint256], { numRuns: NUM_RUNS })(
    "error: DivisionByZeroError when d = 0",
    (x, y) => {
      expect(() => MathLib.mulDivDown(x, y, 0n)).toThrow(DivisionByZeroError);
    },
  );

  // Diverges: Solidity reverts when x * y exceeds uint256; the SDK returns the unbounded quotient.
  test.fails.prop([mulDivDownOverflowArgs], {
    numRuns: NUM_RUNS,
    examples: mulDivDownOverflowExamples,
  })("behavior: throws when x * y exceeds uint256", ([x, y, d]) => {
    expect(() => MathLib.mulDivDown(x, y, d)).toThrow();
  });

  // Pins the current divergent result so the expected failure above cannot pass for another reason.
  test.prop([mulDivDownOverflowArgs], {
    numRuns: NUM_RUNS,
    examples: mulDivDownOverflowExamples,
  })(
    "behavior: currently returns the unbounded quotient past uint256",
    ([x, y, d]) => {
      expect(MathLib.mulDivDown(x, y, d)).toBe((x * y) / d);
    },
  );
});

// morpho-blue src/libraries/MathLib.sol `mulDivUp`: (x * y + (d - 1)) / d.
describe("mulDivUp", () => {
  test.prop([mulDivArgs], {
    numRuns: NUM_RUNS,
    examples: [[[MAX_UINT_256, 1n, 1n]], [[MAX_UINT_256 - 1n, 1n, 2n]]],
  })("default", ([x, y, d]) => {
    expect(MathLib.mulDivUp(x, y, d)).toBe(solMulDivUp([x, y, d]));
  });

  test.prop([mulDivArgs], { numRuns: NUM_RUNS })(
    "behavior: exceeds mulDivDown by 1 exactly when d does not divide x * y",
    ([x, y, d]) => {
      const up = MathLib.mulDivUp(x, y, d);
      const down = MathLib.mulDivDown(x, y, d);

      expect(up >= down).toBe(true);
      expect(up - down).toBe((x * y) % d === 0n ? 0n : 1n);
    },
  );

  test.prop([uint256, uint256], { numRuns: NUM_RUNS })(
    "error: DivisionByZeroError when d = 0",
    (x, y) => {
      expect(() => MathLib.mulDivUp(x, y, 0n)).toThrow(DivisionByZeroError);
    },
  );

  // Diverges: Solidity reverts when x * y + (d - 1) exceeds uint256; the SDK returns the unbounded
  // quotient.
  test.fails.prop([mulDivUpOverflowArgs], {
    numRuns: NUM_RUNS,
    examples: mulDivUpOverflowExamples,
  })("behavior: throws when x * y + (d - 1) exceeds uint256", ([x, y, d]) => {
    expect(() => MathLib.mulDivUp(x, y, d)).toThrow();
  });

  // Pins the current divergent result so the expected failure above cannot pass for another reason.
  test.prop([mulDivUpOverflowArgs], {
    numRuns: NUM_RUNS,
    examples: mulDivUpOverflowExamples,
  })(
    "behavior: currently returns the unbounded quotient past uint256",
    ([x, y, d]) => {
      expect(MathLib.mulDivUp(x, y, d)).toBe((x * y + (d - 1n)) / d);
    },
  );
});

// morpho-blue src/libraries/MathLib.sol `mulDivDown` / `mulDivUp`.
describe("mulDiv", () => {
  test.prop([mulDivRoundingArgs], { numRuns: NUM_RUNS })(
    "default",
    ([x, y, d, direction]) => {
      expect(MathLib.mulDiv(x, y, d, direction)).toBe(
        solMulDiv([x, y, d], direction),
      );
    },
  );
});

// morpho-blue src/libraries/MathLib.sol `wMulDown`: mulDivDown(x, y, WAD).
describe("wMulDown", () => {
  test.prop([wadDownArgs], {
    numRuns: NUM_RUNS,
    examples: [[[MAX_UINT_256, 1n]]],
  })("default", ([x, y]) => {
    expect(MathLib.wMulDown(x, y)).toBe(solMulDivDown([x, y, WAD]));
  });
});

// No Blue `wMulUp`; the WAD product rounded up is mulDivUp(x, y, WAD) as in morpho-blue MathLib.sol.
describe("wMulUp", () => {
  test.prop([wadArgs], { numRuns: NUM_RUNS })("default", ([x, y]) => {
    expect(MathLib.wMulUp(x, y)).toBe(solMulDivUp([x, y, WAD]));
  });

  test.prop([wadArgs], { numRuns: NUM_RUNS })(
    "behavior: wMulUp >= wMulDown and differs by at most 1",
    ([x, y]) => {
      const difference = MathLib.wMulUp(x, y) - MathLib.wMulDown(x, y);

      expect(difference === 0n || difference === 1n).toBe(true);
    },
  );
});

// morpho-blue src/libraries/MathLib.sol `wMulDown` and its rounded-up counterpart.
describe("wMul", () => {
  test.prop([wMulRoundingArgs], { numRuns: NUM_RUNS })(
    "default",
    ([x, y, direction]) => {
      expect(MathLib.wMul(x, y, direction)).toBe(
        solMulDiv([x, y, WAD], direction),
      );
    },
  );
});

// morpho-blue src/libraries/MathLib.sol `wDivDown`: mulDivDown(x, WAD, y).
describe("wDivDown", () => {
  test.prop([wDivDownArgs], {
    numRuns: NUM_RUNS,
    examples: [[[MAX_UINT_256 / WAD, MAX_UINT_256]]],
  })("default", ([x, y]) => {
    expect(MathLib.wDivDown(x, y)).toBe(solMulDivDown([x, WAD, y]));
  });

  test.prop([wDivDownArgs], { numRuns: NUM_RUNS })(
    "behavior: wMulDown(wDivDown(x, y), y) never exceeds x",
    ([x, y]) => {
      expect(MathLib.wMulDown(MathLib.wDivDown(x, y), y) <= x).toBe(true);
    },
  );

  test.prop([uint256], { numRuns: NUM_RUNS })(
    "error: DivisionByZeroError when y = 0",
    (x) => {
      expect(() => MathLib.wDivDown(x, 0n)).toThrow(DivisionByZeroError);
    },
  );
});

// morpho-blue src/libraries/MathLib.sol `wDivUp`: mulDivUp(x, WAD, y).
describe("wDivUp", () => {
  test.prop([wDivArgs], { numRuns: NUM_RUNS })("default", ([x, y]) => {
    expect(MathLib.wDivUp(x, y)).toBe(solMulDivUp([x, WAD, y]));
  });

  test.prop([wDivArgs], { numRuns: NUM_RUNS })(
    "behavior: wDivUp >= wDivDown and differs by at most 1",
    ([x, y]) => {
      const difference = MathLib.wDivUp(x, y) - MathLib.wDivDown(x, y);

      expect(difference === 0n || difference === 1n).toBe(true);
    },
  );

  test.prop([wDivArgs], { numRuns: NUM_RUNS })(
    "behavior: wMulUp(wDivUp(x, y), y) is never below x",
    ([x, y]) => {
      expect(MathLib.wMulUp(MathLib.wDivUp(x, y), y) >= x).toBe(true);
    },
  );

  test.prop([uint256], { numRuns: NUM_RUNS })(
    "error: DivisionByZeroError when y = 0",
    (x) => {
      expect(() => MathLib.wDivUp(x, 0n)).toThrow(DivisionByZeroError);
    },
  );
});

// morpho-blue src/libraries/MathLib.sol `wDivDown` / `wDivUp`.
describe("wDiv", () => {
  test.prop([wDivRoundingArgs], { numRuns: NUM_RUNS })(
    "default",
    ([x, y, direction]) => {
      expect(MathLib.wDiv(x, y, direction)).toBe(
        solMulDiv([x, WAD, y], direction),
      );
    },
  );
});

// Per-second borrow rates up to ~3,150% APR and elapsed times up to ~10 years, as in Blue
// `_accrueInterest`, mixed with the full uint256 domain.
const borrowRate = fc.oneof(fc.bigInt({ min: 0n, max: 10n ** 12n }), uint256);
const elapsed = fc.oneof(fc.bigInt({ min: 0n, max: 315_360_000n }), uint256);
const taylorArgs = fc
  .tuple(borrowRate, elapsed)
  .filter(([x, n]) => solWTaylorCompounded(x, n) !== undefined);
const taylorOverflowArgs = fc
  .tuple(borrowRate, elapsed)
  .filter(([x, n]) => solWTaylorCompounded(x, n) === undefined);
const taylorOverflowExamples: [[bigint, bigint]][] = [
  [[1n << 128n, 1n]],
  [[MAX_UINT_256, 1n]],
];

// morpho-blue src/libraries/MathLib.sol `wTaylorCompounded`: x * n + (x * n)^2 / (2 * WAD)
// + (x * n)^3 / (6 * WAD^2), each term rounded down from the previous one.
describe("wTaylorCompounded", () => {
  test.prop([taylorArgs], {
    numRuns: NUM_RUNS,
    examples: [[[WAD, 1n]], [[1n, 1n << 64n]]],
  })("default", ([x, n]) => {
    expect(MathLib.wTaylorCompounded(x, n)).toBe(solWTaylorCompounded(x, n));
  });

  test.prop([taylorArgs, taylorArgs], { numRuns: NUM_RUNS })(
    "behavior: non-decreasing in the rate and the elapsed time",
    ([x1, n1], [x2, n2]) => {
      const [xLow, xHigh] = x1 <= x2 ? [x1, x2] : [x2, x1];
      const [nLow, nHigh] = n1 <= n2 ? [n1, n2] : [n2, n1];
      fc.pre(solWTaylorCompounded(xHigh, nHigh) !== undefined);

      expect(
        MathLib.wTaylorCompounded(xLow, nLow) <=
          MathLib.wTaylorCompounded(xHigh, nHigh),
      ).toBe(true);
    },
  );

  // Diverges: Solidity reverts when a term or the sum exceeds uint256; the SDK returns the unbounded
  // sum.
  test.fails.prop([taylorOverflowArgs], {
    numRuns: NUM_RUNS,
    examples: taylorOverflowExamples,
  })("behavior: throws when an intermediate term exceeds uint256", ([x, n]) => {
    expect(() => MathLib.wTaylorCompounded(x, n)).toThrow();
  });

  // Pins the current divergent result so the expected failure above cannot pass for another reason.
  test.prop([taylorOverflowArgs], {
    numRuns: NUM_RUNS,
    examples: taylorOverflowExamples,
  })("behavior: currently returns the unbounded sum past uint256", ([x, n]) => {
    const firstTerm = x * n;
    const secondTerm = (firstTerm * firstTerm) / (2n * WAD);
    const thirdTerm = (secondTerm * firstTerm) / (3n * WAD);

    expect(MathLib.wTaylorCompounded(x, n)).toBe(
      firstTerm + secondTerm + thirdTerm,
    );
  });
});

// morpho-blue src/libraries/UtilsLib.sol `zeroFloorSub`: max(0, x - y).
describe("zeroFloorSub", () => {
  test.prop([uint256, uint256], { numRuns: NUM_RUNS })("default", (x, y) => {
    expect(MathLib.zeroFloorSub(x, y)).toBe(x > y ? x - y : 0n);
  });
});

// morpho-blue src/libraries/UtilsLib.sol `min`: y < x ? y : x.
describe("min", () => {
  test.prop([uint256, uint256], { numRuns: NUM_RUNS })("default", (x, y) => {
    expect(MathLib.min(x, y)).toBe(y < x ? y : x);
  });

  test.prop([fc.array(uint256, { minLength: 1 })], { numRuns: NUM_RUNS })(
    "behavior: returns an input no greater than every input",
    (xs) => {
      const result = MathLib.min(...xs);

      expect(xs).toContain(result);
      expect(xs.every((x) => result <= x)).toBe(true);
    },
  );
});

// No Solidity counterpart: the dual of morpho-blue src/libraries/UtilsLib.sol `min`.
describe("max", () => {
  test.prop([uint256, uint256], { numRuns: NUM_RUNS })("default", (x, y) => {
    expect(MathLib.max(x, y)).toBe(y > x ? y : x);
  });

  test.prop([fc.array(uint256, { minLength: 1 })], { numRuns: NUM_RUNS })(
    "behavior: returns an input no less than every input",
    (xs) => {
      const result = MathLib.max(...xs);

      expect(xs).toContain(result);
      expect(xs.every((x) => result >= x)).toBe(true);
    },
  );
});

// No Solidity counterpart: signed helper over the int256 domain.
describe("abs", () => {
  test.prop([fc.bigInt({ min: -(1n << 255n), max: (1n << 255n) - 1n })], {
    numRuns: NUM_RUNS,
  })("default", (x) => {
    expect(MathLib.abs(x)).toBe(x < 0n ? -x : x);
    expect(MathLib.abs(-x)).toBe(MathLib.abs(x));
  });
});

// No Solidity counterpart in Morpho: rescales a WAD quantity to RAY exactly.
describe("wToRay", () => {
  test.prop([uint256], { numRuns: NUM_RUNS })("default", (x) => {
    expect(MathLib.wToRay(x)).toBe((x * RAY) / WAD);
  });
});

// Solidity `type(uintN).max` for every nibble-aligned N up to 256.
describe("maxUint", () => {
  test.prop([fc.integer({ min: 1, max: 64 })], { numRuns: NUM_RUNS })(
    "default",
    (nibbles) => {
      expect(MathLib.maxUint(nibbles * 4)).toBe(
        (1n << BigInt(nibbles * 4)) - 1n,
      );
    },
  );

  test.prop(
    [
      fc
        .integer({ min: -1024, max: 1024 })
        .filter((n) => n <= 0 || n % 4 !== 0),
    ],
    { numRuns: NUM_RUNS },
  )("error: InvalidBitLengthError when not a positive multiple of 4", (n) => {
    expect(() => MathLib.maxUint(n)).toThrow(InvalidBitLengthError);
  });
});
