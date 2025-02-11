import type { Address } from "@morpho-org/blue-sdk";

import type { MigratablePosition } from "../positions/index.js";
import { MigratableProtocol } from "../types/index.js";

import type { FetchParameters } from "@morpho-org/blue-sdk-viem";
import { fromEntries } from "@morpho-org/morpho-ts";
import type { Client } from "viem";
import { fetchAaveV2Positions } from "./aaveV2/aaveV2.fetchers.js";
import { fetchAaveV3Positions } from "./aaveV3/aaveV3.fetchers.js";
import { fetchAaveV3OptimizerPositions } from "./aaveV3Optimizer/aaveV3Optimizer.fetchers.js";
import { fetchCompoundV2Positions } from "./compoundV2/compoundV2.fetchers.js";
import { fetchCompoundV3Positions } from "./compoundV3/compoundV3.fetchers.js";

const FETCHERS = {
  [MigratableProtocol.aaveV2]: fetchAaveV2Positions,
  [MigratableProtocol.aaveV3]: fetchAaveV3Positions,
  [MigratableProtocol.aaveV3Optimizer]: fetchAaveV3OptimizerPositions,
  [MigratableProtocol.compoundV2]: fetchCompoundV2Positions,
  [MigratableProtocol.compoundV3]: fetchCompoundV3Positions,
};

/**
 * Fetches migratable positions for a user across specified protocols.
 *
 * @param user - The address of the user whose positions need to be fetched.
 * @param client - The client instance to interact with the blockchain.
 * @param options - Additional parameters for the fetch operation.
 * @param options.parameters - Optional parameters for fetching positions.
 * @param options.protocols - List of protocols to fetch positions from.
 *                             Defaults to all supported protocols.
 *
 * @returns A promise resolving to a map of protocols to their respective migratable positions.
 *
 * @example
 * ```typescript
 * import { fetchMigratablePositions, MigratableProtocol } from "@morpho-org/migration-sdk-viem";
 * import { Client } from "viem";
 *
 * const user = "0x123...abc"; // Replace with the user's address
 * const client = new Client({}); // Replace with a properly configured client
 *
 * const positions = await fetchMigratablePositions(user, client, {
 *   protocols: [MigratableProtocol.aaveV2, MigratableProtocol.compoundV3],
 * });
 * console.log(positions);
 * ```
 */
export async function fetchMigratablePositions(
  user: Address,
  client: Client,
  {
    parameters = {},
    protocols = [
      MigratableProtocol.aaveV3Optimizer,
      MigratableProtocol.aaveV3,
      MigratableProtocol.aaveV2,
      MigratableProtocol.compoundV3,
      MigratableProtocol.compoundV2,
    ],
  }: {
    parameters?: FetchParameters;
    protocols?: MigratableProtocol[];
  } = {},
): Promise<{
  [protocol in MigratableProtocol]?: MigratablePosition[];
}> {
  return fromEntries(
    await Promise.all(
      protocols.map(
        async (protocol) =>
          [
            protocol,
            await FETCHERS[protocol](user, client, parameters),
          ] as const,
      ),
    ),
  );
}
