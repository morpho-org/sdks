import { Draft } from "mutative";

import { SimulationState } from "../SimulationState";
import { Operation } from "../operations";

export type MaybeDraft<T> = T | Draft<T>;

export interface OperationHandler<O extends Operation> {
  (operation: O, data: MaybeDraft<SimulationState>): void;
}
