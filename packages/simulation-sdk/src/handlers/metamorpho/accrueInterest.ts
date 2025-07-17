import { Vault } from "@morpho-org/blue-sdk";

import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import type { MetaMorphoOperations } from "../../operations.js";
import { handleErc20Operation } from "../erc20/index.js";
import type { OperationHandler } from "../types.js";

export const handleMetaMorphoAccrueInterestOperation: OperationHandler<
  MetaMorphoOperations["MetaMorpho_AccrueInterest"]
> = ({ address }, data) => {
  const vault = data.getAccrualVault(address, false);
  const newVault = vault.accrueInterest(data.block.timestamp);

  data.vaults[address] = new Vault(newVault);

  const feeShares = newVault.totalSupply - vault.totalSupply;

  // Mint fee shares.
  if (feeShares > 0n && vault.feeRecipient !== ZERO_ADDRESS) {
    handleErc20Operation(
      {
        type: "Erc20_Transfer",
        sender: address,
        address,
        args: {
          amount: feeShares,
          from: ZERO_ADDRESS,
          to: vault.feeRecipient,
        },
      },
      data,
    );
  }
};
