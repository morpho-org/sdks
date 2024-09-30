import { makeCreator } from "mutative";

import { SimulationState } from "../SimulationState.js";
import { SimulationErrors } from "../errors.js";
import {
  Operation,
  isBlueOperation,
  isErc20Operation,
  isMetaMorphoOperation,
} from "../operations.js";

import { handleBlueOperation } from "./blue/index.js";
import { handleErc20Operation } from "./erc20/index.js";
import { handleMetaMorphoOperation } from "./metamorpho/index.js";
import { MaybeDraft } from "./types.js";

export type SimulationResult = [
  MaybeDraft<SimulationState>,
  ...MaybeDraft<SimulationState>[],
];

export const produceImmutable = makeCreator({
  mark: () => "immutable",
  strict: true,
});

export const handleOperation = (
  operation: Operation,
  data: MaybeDraft<SimulationState>,
  index = 0,
) => {
  try {
    if (isBlueOperation(operation)) handleBlueOperation(operation, data);
    else if (isMetaMorphoOperation(operation))
      handleMetaMorphoOperation(operation, data);
    else if (isErc20Operation(operation)) handleErc20Operation(operation, data);

    return data;
  } catch (error: any) {
    // `error` may be SimulationErrors.Simulation because of a failing callback handle.
    throw new SimulationErrors.Simulation(error, index, operation);
  }
};

export function handleOperations<Operation>(
  operations: Operation[],
  startData: MaybeDraft<SimulationState>,
): SimulationResult;
export function handleOperations<O>(
  operations: O[],
  startData: MaybeDraft<SimulationState>,
  customOperationHandle: (
    operation: O,
    data: MaybeDraft<SimulationState>,
    index: number,
  ) => MaybeDraft<SimulationState>,
): SimulationResult;
export function handleOperations(
  operations: Operation[],
  startData: MaybeDraft<SimulationState>,
  customOperationHandle: (
    operation: Operation,
    data: MaybeDraft<SimulationState>,
    index: number,
  ) => MaybeDraft<SimulationState> = handleOperation,
) {
  const results: SimulationResult = [startData];

  for (let index = 0; index < operations.length; ++index) {
    results.push(
      customOperationHandle(operations[index]!, results[index]!, index),
    );
  }

  return results;
}

export const simulateOperation = (
  operation: Operation,
  data: MaybeDraft<SimulationState>,
  index = 0,
) =>
  produceImmutable(data, (draft) => {
    handleOperation(operation, draft, index);
  });

export const simulateOperations = (
  operations: Operation[],
  startData: SimulationState,
) =>
  handleOperations(
    operations,
    produceImmutable(startData, () => {}),
    simulateOperation,
  );
