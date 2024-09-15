import { Draft } from "mutative";

import { SimulationState } from "../SimulationState.js";
import { Operation } from "../operations.js";

export type MaybeDraft<T> = T | Draft<T>;

export interface OperationHandler<O extends Operation> {
  (operation: O, data: MaybeDraft<SimulationState>): void;
}
