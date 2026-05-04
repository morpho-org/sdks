import {
  AccrualPosition,
  Position,
  PreLiquidationPosition,
} from "@morpho-org/blue-sdk";

import {
  fetchAccrualPosition,
  fetchPosition,
  fetchPreLiquidationPosition,
} from "../fetch/index.js";

declare module "@morpho-org/blue-sdk" {
  // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
  namespace Position {
    let fetch: typeof fetchPosition;
  }

  // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
  namespace AccrualPosition {
    let fetch: typeof fetchAccrualPosition;
    let fetchPreLiquidation: typeof fetchPreLiquidationPosition;
  }
}

Position.fetch = fetchPosition;
AccrualPosition.fetch = fetchAccrualPosition;
AccrualPosition.fetchPreLiquidation = fetchPreLiquidationPosition;

export { AccrualPosition, Position, PreLiquidationPosition };
