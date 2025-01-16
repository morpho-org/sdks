import type { MigratableSupplyPosition } from "./supply/index.js";

export { MigratableSupplyPosition } from "./supply/index.js";

export type MigratablePosition = MigratableSupplyPosition;
export namespace MigratablePosition {
  export type Args<T extends MigratablePosition> =
    T extends MigratableSupplyPosition ? MigratableSupplyPosition.Args : never;
}

export { MigratableBorrowPosition_Blue } from "./borrow/blue.borrow.js";
