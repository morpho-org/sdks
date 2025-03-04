import {
  AccrualPosition,
  Position,
  PreLiquidatablePosition,
} from "@morpho-org/blue-sdk";

import {
  fetchAccrualPosition,
  fetchPosition,
  fetchPreLiquidatablePosition,
} from "../fetch";

declare module "@morpho-org/blue-sdk" {
  namespace Position {
    let fetch: typeof fetchPosition;
  }

  namespace AccrualPosition {
    let fetch: typeof fetchAccrualPosition;
    let fetchPreLiquidatable: typeof fetchPreLiquidatablePosition;
  }
}

Position.fetch = fetchPosition;
AccrualPosition.fetch = fetchAccrualPosition;
AccrualPosition.fetchPreLiquidatable = fetchPreLiquidatablePosition;

export { Position, AccrualPosition, PreLiquidatablePosition };
