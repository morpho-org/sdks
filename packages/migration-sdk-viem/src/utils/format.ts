import { ChainId } from "@morpho-org/blue-sdk";

import { MigratableProtocol } from "../types/index.js";

export const formatProtocol = (
  protocol: MigratableProtocol,
  chainId: ChainId,
): string => {
  switch (protocol) {
    case MigratableProtocol.aaveV3Optimizer:
      return "Morpho Aave V3";
    case MigratableProtocol.aaveV2:
      return "Aave V2";
    case MigratableProtocol.aaveV3:
      return "Aave V3";
    case MigratableProtocol.compoundV3:
      return "Compound III";
    case MigratableProtocol.compoundV2:
      return chainId === ChainId.BaseMainnet ? "Moonwell" : "Compound v2";
  }
};
