import type { BlueOperations } from "../../operations.js";
import type { OperationHandler } from "../types.js";

export const handleBlueSetAuthorizationOperation: OperationHandler<
  BlueOperations["Blue_SetAuthorization"]
> = ({ args: { owner, isBundlerAuthorized } }, data) => {
  const ownerData = data.getUser(owner);

  ownerData.isBundlerAuthorized = isBundlerAuthorized;
};
