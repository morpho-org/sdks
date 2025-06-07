import { BlueErrors, getChainAddresses } from "@morpho-org/blue-sdk";
import type { BlueOperations } from "../../operations.js";
import type { OperationHandler } from "../types.js";

export const handleBlueSetAuthorizationOperation: OperationHandler<
  BlueOperations["Blue_SetAuthorization"]
> = ({ args: { owner, authorized, isAuthorized, deadline } }, data) => {
  if (deadline != null && deadline < data.block.timestamp)
    throw new BlueErrors.ExpiredSignature(deadline);

  const ownerData = data.getUser(owner);

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(data.chainId);

  if (authorized === generalAdapter1) {
    if (ownerData.isBundlerAuthorized === isAuthorized)
      throw new BlueErrors.AlreadySet(
        "isBundlerAuthorized",
        isAuthorized.toString(),
      );

    ownerData.isBundlerAuthorized = isAuthorized;
  }
};
