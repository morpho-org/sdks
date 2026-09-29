import { AccrualPosition as BlueAccrualPosition } from "@morpho-org/blue-sdk";
import {
  fetchAccrualPosition,
  fetchPreLiquidationPosition,
} from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace AccrualPosition {
    let fetch: typeof fetchAccrualPosition;
    /** @deprecated Pre-liquidation support is deprecated and will be removed in the next major. */
    let fetchPreLiquidation: typeof fetchPreLiquidationPosition;
  }
}

BlueAccrualPosition.fetch = fetchAccrualPosition;
BlueAccrualPosition.fetchPreLiquidation = fetchPreLiquidationPosition;

export { BlueAccrualPosition as AccrualPosition };
