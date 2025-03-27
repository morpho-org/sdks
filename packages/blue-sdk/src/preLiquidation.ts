import { parseEther } from "viem";
import { UnsupportedPreLiquidationParamsError } from "./errors";
import type { BigIntish } from "./types";

export const defaultPreLiquidationParamsRegistry = new Map([
  [
    parseEther("0.385"),
    {
      preLltv: 30_1514568055515563n,
      preLCF1: 22637943984157107n,
      preLCF2: 34_9673199983645648n,
      preLIF1: parseEther("1.15"),
      preLIF2: parseEther("1.15"),
    },
  ],
  [
    parseEther("0.625"),
    {
      preLltv: 56_2591950487445723n,
      preLCF1: 7543182567291709n,
      preLCF2: 27_9542312587328718n,
      preLIF1: 1_126760563380281690n,
      preLIF2: 1_126760563380281690n,
    },
  ],
  [
    parseEther("0.77"),
    {
      preLltv: 72_7366070175296029n,
      preLCF1: 3706417131700377n,
      preLCF2: 25_6643181309902852n,
      preLIF1: 1_074113856068743286n,
      preLIF2: 1_074113856068743286n,
    },
  ],
  [
    parseEther("0.86"),
    {
      preLltv: 83_2603694978499652n,
      preLCF1: 2001493508968667n,
      preLCF2: 24_5311807032632372n,
      preLIF1: 1_043841336116910229n,
      preLIF2: 1_043841336116910229n,
    },
  ],
  [
    parseEther("0.915"),
    {
      preLltv: 89_7868776651447149n,
      preLCF1: 1135586186384195n,
      preLCF2: 23_9205538157954887n,
      preLIF1: 1_026167265264238070n,
      preLIF2: 1_026167265264238070n,
    },
  ],
  [
    parseEther("0.965"),
    {
      preLltv: 95_7768981497388846n,
      preLCF1: 441038514876104n,
      preLCF2: 23_4108264807531861n,
      preLIF1: 1_010611419909044972n,
      preLIF2: 1_010611419909044972n,
    },
  ],
  [
    parseEther("0.985"),
    {
      preLltv: 97_5838577830248552n,
      preLCF1: 247773050273784n,
      preLCF2: 23_2655340599010079n,
      preLIF1: 1_006036217303822937n,
      preLIF2: 1_006036217303822937n,
    },
  ],
]);

export const getDefaultPreLiquidationParams = (lltv: BigIntish) => {
  lltv = BigInt(lltv);

  const defaultParams = defaultPreLiquidationParamsRegistry.get(lltv);

  if (defaultParams == null)
    throw new UnsupportedPreLiquidationParamsError(lltv);

  return defaultParams;
};
