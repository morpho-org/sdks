import type { MarketParams } from "@morpho-org/blue-sdk";
import { type Address, isAddressEqual } from "viem";
import {
  AccrualPositionUserMismatchError,
  MarketIdMismatchError,
} from "../../types/index.js";
import {
  type BlueMarketSnapshot,
  type BluePositionSnapshot,
  validateBlueMarketSnapshot,
} from "./prepare.js";

/** @internal Checks the destination snapshots before quoting the migration. */
export function validateBlueRefinanceDestination({
  chainId,
  account,
  marketId,
  marketData,
  positionData,
}: {
  readonly chainId: number;
  readonly account: Address;
  readonly marketId: MarketParams["id"];
  readonly marketData: BlueMarketSnapshot;
  readonly positionData: BluePositionSnapshot;
}): void {
  const { position } = positionData;
  const expected = { chainId, marketId };
  // Check both supplied market tuples against the destination identity.
  validateBlueMarketSnapshot(marketData, expected);
  validateBlueMarketSnapshot(
    { chainId: positionData.chainId, market: position.market },
    expected,
  );
  if (position.marketId.toLowerCase() !== marketId.toLowerCase()) {
    throw new MarketIdMismatchError(position.marketId, marketId);
  }
  if (!isAddressEqual(position.user, account)) {
    throw new AccrualPositionUserMismatchError(position.user, account);
  }
}
