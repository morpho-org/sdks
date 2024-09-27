import { BlueOperations } from "../../operations.js";
import { OperationHandler } from "../types.js";

export const handleBlueSetAuthorizationOperation: OperationHandler<
  BlueOperations["Blue_SetAuthorization"]
> = ({ args: { owner, isBundlerAuthorized } }, data) => {
  const ownerData = data.getUser(owner);

  ownerData.isBundlerAuthorized = isBundlerAuthorized;
};
