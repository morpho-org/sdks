import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { lltvArbitrary, WAD } from "./__test__/morphoModel.js";
import { UnsupportedPreLiquidationParamsError } from "./errors.js";
import {
  defaultPreLiquidationParamsRegistry,
  getDefaultPreLiquidationParams,
} from "./preLiquidation.js";

const enabledLltvs = [...defaultPreLiquidationParamsRegistry.keys()];
const unsupportedLltv = lltvArbitrary.filter(
  (lltv) => !defaultPreLiquidationParamsRegistry.has(lltv),
);

// pre-liquidation src/PreLiquidation.sol constructor
describe("defaultPreLiquidationParamsRegistry", () => {
  test.prop([fc.constantFrom(...enabledLltvs)], { numRuns: 200 })(
    "default",
    (lltv) => {
      const params = getDefaultPreLiquidationParams(lltv);
      const maxPreLif = (WAD * WAD) / lltv;

      expect(params.preLltv).toBeLessThan(lltv);
      expect(params.preLCF1).toBeLessThanOrEqual(params.preLCF2);
      expect(params.preLCF1).toBeLessThanOrEqual(WAD);
      expect(params.preLIF1).toBeGreaterThanOrEqual(WAD);
      expect(params.preLIF1).toBeLessThanOrEqual(params.preLIF2);
      expect(params.preLIF2).toBeLessThanOrEqual(maxPreLif);
    },
  );
});

// pre-liquidation src/PreLiquidation.sol constructor
describe("getDefaultPreLiquidationParams", () => {
  test.prop([unsupportedLltv], { numRuns: 200 })(
    "behavior: throws for unsupported LLTVs",
    (lltv) => {
      expect(() => getDefaultPreLiquidationParams(lltv)).toThrow(
        UnsupportedPreLiquidationParamsError,
      );
    },
  );
});
