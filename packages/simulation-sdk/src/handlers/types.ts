import type { Draft } from "mutative";

import type { SimulationState } from "../SimulationState.js";
import type { Operation } from "../operations.js";

export type MaybeDraft<T> = T | Draft<T>;

export type OperationHandler<O extends Operation> = (
  operation: O,
  data: MaybeDraft<SimulationState>,
) => void;
