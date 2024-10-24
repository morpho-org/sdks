import { mainnetAddresses } from "@morpho-org/liquidation-sdk-viem";
import type { Address } from "viem";

export namespace Sky {
  export const MKR_SKY_CONVERTER = "0xBDcFCA946b6CDd965f99a839e4435Bcdc1bc470B";
  export const DAI_USDS_CONVERTER =
    "0x3225737a9Bbb6473CB4a45b7244ACa2BeFdB276A";

  export type ConversionFunction =
    | "usdsToDai"
    | "daiToUsds"
    | "skyToMkr"
    | "mkrToSky";

  export function getAlternativeToken(token: string): Address {
    switch (token) {
      case mainnetAddresses.usds:
        return mainnetAddresses.dai!;
      case mainnetAddresses.dai:
        return mainnetAddresses.usds!;
      case mainnetAddresses.sky:
        return mainnetAddresses.mkr!;
      case mainnetAddresses.mkr:
        return mainnetAddresses.sky!;
      default:
        throw new Error("Unsupported token for alternative swap");
    }
  }

  export function isTokenPair(
    token1: string | undefined,
    token2: string | undefined,
  ): boolean {
    if (!token1 || !token2) return false;
    return (
      (token1 === mainnetAddresses.usds && token2 === mainnetAddresses.dai) ||
      (token1 === mainnetAddresses.dai && token2 === mainnetAddresses.usds) ||
      (token1 === mainnetAddresses.sky && token2 === mainnetAddresses.mkr) ||
      (token1 === mainnetAddresses.mkr && token2 === mainnetAddresses.sky)
    );
  }

  export function getConversionFunction(
    fromToken: string,
    toToken: string,
  ): ConversionFunction {
    if (fromToken === mainnetAddresses.usds && toToken === mainnetAddresses.dai)
      return "usdsToDai";
    if (fromToken === mainnetAddresses.dai && toToken === mainnetAddresses.usds)
      return "daiToUsds";
    if (fromToken === mainnetAddresses.sky && toToken === mainnetAddresses.mkr)
      return "skyToMkr";
    if (fromToken === mainnetAddresses.mkr && toToken === mainnetAddresses.sky)
      return "mkrToSky";
    throw new Error("Unsupported token conversion");
  }
}
