import { AccrualPosition as BlueAccrualPosition } from "@morpho-org/blue-sdk";
import {
  fetchAccrualPosition,
  fetchPreLiquidationPosition,
} from "@morpho-org/blue-sdk-viem";

declare module "@morpho-org/blue-sdk" {
  namespace AccrualPosition {
    let fetch: typeof fetchAccrualPosition;
    let fetchPreLiquidation: typeof fetchPreLiquidationPosition;
  }
}

BlueAccrualPosition.fetch = fetchAccrualPosition;
BlueAccrualPosition.fetchPreLiquidation = fetchPreLiquidationPosition;

export { BlueAccrualPosition as AccrualPosition };
