import type { MigratableBorrowPosition } from "./borrow/MigratableBorrowPosition.js";
import type { MigratableSupplyPosition } from "./supply/index.js";

export { MigratableSupplyPosition } from "./supply/index.js";
export { MigratableBorrowPosition } from "./borrow/index.js";

export type MigratablePosition =
  | MigratableSupplyPosition
  | MigratableBorrowPosition;
export namespace MigratablePosition {
  export type Args<T extends MigratablePosition> =
    T extends MigratableSupplyPosition
      ? MigratableSupplyPosition.Args
      : T extends MigratableBorrowPosition
        ? MigratableBorrowPosition.Args
        : never;
}

export { MigratableBorrowPosition_Blue } from "./borrow/blue.borrow.js";
