import { VaultV2 } from "@morpho-org/blue-sdk";

import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import type { VaultV2Operations } from "../../operations";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

export const handleVaultV2AccrueInterestOperation: OperationHandler<
  VaultV2Operations["VaultV2_AccrueInterest"]
> = ({ address }, data) => {
  const vaultV2 = data.getAccrualVaultV2(address);
  const {
    vault: newVaultV2,
    performanceFeeShares,
    managementFeeShares,
  } = vaultV2.accrueInterest(data.block.timestamp);

  data.vaultV2s[address] = new VaultV2(newVaultV2);

  // Mint performance fee shares.
  if (
    performanceFeeShares > 0n &&
    vaultV2.performanceFeeRecipient !== ZERO_ADDRESS
  ) {
    handleErc20Operation(
      {
        type: "Erc20_Transfer",
        sender: address,
        address,
        args: {
          amount: performanceFeeShares,
          from: ZERO_ADDRESS,
          to: vaultV2.performanceFeeRecipient,
        },
      },
      data,
    );
  }

  // Mint management fee shares.
  if (
    managementFeeShares > 0n &&
    vaultV2.managementFeeRecipient !== ZERO_ADDRESS
  ) {
    handleErc20Operation(
      {
        type: "Erc20_Transfer",
        sender: address,
        address,
        args: {
          amount: managementFeeShares,
          from: ZERO_ADDRESS,
          to: vaultV2.managementFeeRecipient,
        },
      },
      data,
    );
  }
};
