import { mainnetAddresses } from "@morpho-org/liquidation-sdk-viem";
import type { Address } from "viem";

export namespace Sky {
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

  export function isSkyToken(token: Address): boolean {
    return [
      mainnetAddresses.mkr,
      mainnetAddresses.sky,
      mainnetAddresses.usds,
      mainnetAddresses.dai,
    ].includes(token);
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
