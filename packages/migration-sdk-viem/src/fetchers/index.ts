import type { Address } from "@morpho-org/blue-sdk";

import type { MigratablePosition } from "../positions/index.js";
import { MigratableProtocol } from "../types/index.js";

import { fetchAaveV2Positions } from "./aaveV2/aaveV2.fetchers.js";
import { fetchAaveV3Positions } from "./aaveV3/aaveV3.fetchers.js";
import { fetchAaveV3OptimizerPositions } from "./aaveV3Optimizer/aaveV3Optimizer.fetchers.js";
import { fetchCompoundV2Positions } from "./compoundV2/compoundV2.fetchers.js";
import { fetchCompoundV3Positions } from "./compoundV3/compoundV3.fetchers.js";
import type { DeploylessFetchParameters } from "@morpho-org/blue-sdk-viem";
import type { Client } from "viem";

export async function fetchMigratablePositions(
  user: Address,
  client: Client,
  parameters: DeploylessFetchParameters = {},
): Promise<{
  [protocol in MigratableProtocol]?: MigratablePosition[];
}> {
  return Promise.all([
    fetchAaveV3OptimizerPositions(user, client, parameters).then(
      (positions) => [MigratableProtocol.aaveV3Optimizer, positions] as const,
    ),
    fetchAaveV3Positions(user, client, parameters).then(
      (positions) => [MigratableProtocol.aaveV3, positions] as const,
    ),
    fetchAaveV2Positions(user, client, parameters).then(
      (positions) => [MigratableProtocol.aaveV2, positions] as const,
    ),
    fetchCompoundV3Positions(user, client, parameters).then(
      (positions) => [MigratableProtocol.compoundV3, positions] as const,
    ),
    fetchCompoundV2Positions(user, client, parameters).then(
      (positions) => [MigratableProtocol.compoundV2, positions] as const,
    ),
  ]).then(Object.fromEntries);
}
