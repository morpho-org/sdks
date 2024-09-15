import { MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import { maxUint256, zeroAddress } from "viem";
import { Erc20Errors } from "../../errors.js";
import { Erc20Operations } from "../../operations.js";
import { OperationHandler } from "../types.js";

export const handleErc20TransferOperation: OperationHandler<
  Erc20Operations["Erc20_Transfer"]
> = ({ args: { amount, from, to }, sender, address }, data) => {
  const { morpho, bundler, permit2 } = getChainAddresses(data.chainId);

  if (from !== zeroAddress && from !== morpho) {
    const fromTokenData = data.getHolding(from, address);

    if (fromTokenData.canTransfer === false)
      throw new Erc20Errors.UnauthorizedTransfer(address, from);

    // Simulate the bundler's behavior on output transfers.
    if (sender === bundler && from === bundler && amount === maxUint256)
      amount = MathLib.min(amount, fromTokenData.balance);

    if (fromTokenData.balance < amount)
      throw new Erc20Errors.InsufficientBalance(address, from);

    if (sender !== from && from !== bundler) {
      // Check allowance for approval recipients (except for the bundler which doesn't need it).
      const contract =
        sender === morpho
          ? "morpho"
          : sender === bundler
            ? "bundler"
            : sender === permit2
              ? "permit2"
              : undefined;

      if (contract != null) {
        if (fromTokenData.erc20Allowances[contract] < amount)
          throw new Erc20Errors.InsufficientAllowance(address, from, sender);

        fromTokenData.erc20Allowances[contract] -= amount;
      } else {
        // Check allowance of MetaMorpho vaults on the underlying asset.
        const vault = data.vaults[sender];
        const vaultFromData = data.vaultsUsersData[sender]?.[from];

        if (vault?.asset === address && vaultFromData != null) {
          if (vaultFromData.allowance < amount)
            throw new Erc20Errors.InsufficientAllowance(address, from, sender);

          vaultFromData.allowance -= amount;
        }
      }
    }

    fromTokenData.balance -= amount;
  }

  const toTokenData = data.holdings[to]?.[address];

  if (toTokenData != null) toTokenData.balance += amount;
};
