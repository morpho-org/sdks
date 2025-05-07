import { makeCreator } from "mutative";

import type { SimulationState } from "../SimulationState.js";
import { SimulationErrors } from "../errors.js";
import {
  type Operation,
  isBlueOperation,
  isErc20Operation,
  isMetaMorphoOperation,
  isParaswapOperation,
} from "../operations.js";

import { handleBlueOperation } from "./blue/index.js";
import { handleErc20Operation } from "./erc20/index.js";
import { handleMetaMorphoOperation } from "./metamorpho/index.js";
import { handleParaswapOperation } from "./paraswap/index.js";
import type { MaybeDraft } from "./types.js";

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
    else if (isParaswapOperation(operation))
      handleParaswapOperation(operation, data);

    return data;
  } catch (error) {
    if (!(error instanceof Error)) throw error;

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
  startData: MaybeDraft<SimulationState>,
) =>
  handleOperations(
    operations,
    produceImmutable(startData, () => {}),
    simulateOperation,
  );
