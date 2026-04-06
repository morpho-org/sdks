import {
  AccrualPosition,
  Position,
  PreLiquidationPosition,
} from "@gfxlabs/blue-sdk";

import {
  fetchAccrualPosition,
  fetchPosition,
  fetchPreLiquidationPosition,
} from "../fetch/index.js";

declare module "@gfxlabs/blue-sdk" {
  namespace Position {
    let fetch: typeof fetchPosition;
  }

  namespace AccrualPosition {
    let fetch: typeof fetchAccrualPosition;
    let fetchPreLiquidation: typeof fetchPreLiquidationPosition;
  }
}

Position.fetch = fetchPosition;
AccrualPosition.fetch = fetchAccrualPosition;
AccrualPosition.fetchPreLiquidation = fetchPreLiquidationPosition;

export { Position, AccrualPosition, PreLiquidationPosition };
