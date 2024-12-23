import { AccrualPosition, Position } from "@morpho-org/blue-sdk";

import { fetchAccrualPosition, fetchPosition } from "../fetch";

declare module "@morpho-org/blue-sdk" {
  namespace Position {
    let fetch: typeof fetchPosition;
  }

  namespace AccrualPosition {
    let fetch: typeof fetchAccrualPosition;
  }
}

Position.fetch = fetchPosition;
AccrualPosition.fetch = fetchAccrualPosition;

export { Position, AccrualPosition };
