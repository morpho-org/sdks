import { BlueOperations } from "../../operations";
import { OperationHandler } from "../types";

export const handleBlueSetAuthorizationOperation: OperationHandler<
  BlueOperations["Blue_SetAuthorization"]
> = ({ args: { owner, isBundlerAuthorized } }, data) => {
  const ownerData = data.getUser(owner);

  ownerData.isBundlerAuthorized = isBundlerAuthorized;
};
