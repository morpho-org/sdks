import { describe, expect, test } from "vitest";
import {
  BASE_FORK_BLOCK,
  BASE_HISTORICAL_FORK_BLOCK,
  MAINNET_FORK_BLOCK,
  OPTIMISM_FORK_BLOCK,
  TEMPO_FORK_BLOCK,
} from "./index.js";

describe("fork blocks", () => {
  test.each([
    { chain: "mainnet", actual: MAINNET_FORK_BLOCK, expected: 26_140_000n },
    { chain: "Base", actual: BASE_FORK_BLOCK, expected: 53_550_000n },
    {
      chain: "historical Base",
      actual: BASE_HISTORICAL_FORK_BLOCK,
      expected: 53_249_570n,
    },
    { chain: "Optimism", actual: OPTIMISM_FORK_BLOCK, expected: 158_700_000n },
    { chain: "Tempo", actual: TEMPO_FORK_BLOCK, expected: 46_605_340n },
  ])("exports the pinned $chain target", ({ actual, expected }) => {
    expect(actual).toBe(expected);
  });
});
