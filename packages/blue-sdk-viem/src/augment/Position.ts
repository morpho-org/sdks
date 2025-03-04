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
  }

  namespace PreLiquidatablePosition {
    let fetch: typeof fetchPreLiquidatablePosition;
  }
}

Position.fetch = fetchPosition;
AccrualPosition.fetch = fetchAccrualPosition;
PreLiquidatablePosition.fetch = fetchPreLiquidatablePosition;

export { Position, AccrualPosition, PreLiquidatablePosition };
