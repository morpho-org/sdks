import { AccrualPosition, Position } from "@morpho-org/blue-sdk";

import "./Market";
import {
  fetchAccrualPosition,
  fetchAccrualPositionFromConfig,
  fetchPosition,
} from "../fetch";

declare module "@morpho-org/blue-sdk" {
  namespace Position {
    let fetch: typeof fetchPosition;
  }

  namespace AccrualPosition {
    let fetch: typeof fetchAccrualPosition;
    let fetchFromConfig: typeof fetchAccrualPositionFromConfig;
  }
}

Position.fetch = fetchPosition;
AccrualPosition.fetch = fetchAccrualPosition;
AccrualPosition.fetchFromConfig = fetchAccrualPositionFromConfig;
