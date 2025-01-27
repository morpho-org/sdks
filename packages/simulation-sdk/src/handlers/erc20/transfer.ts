import { MathLib, getChainAddresses } from "@morpho-org/blue-sdk";

import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import { Erc20Errors } from "../../errors.js";
import type { Erc20Operations } from "../../operations.js";
import type { OperationHandler } from "../types.js";

export const handleErc20TransferOperation: OperationHandler<
  Erc20Operations["Erc20_Transfer"]
> = ({ args: { amount, from, to }, sender, address }, data) => {
  const {
    morpho,
    bundler3: { generalAdapter1 },
    permit2,
  } = getChainAddresses(data.chainId);

  if (from !== ZERO_ADDRESS && from !== morpho) {
    const fromHolding = data.getHolding(from, address);

    if (fromHolding.canTransfer === false)
      throw new Erc20Errors.UnauthorizedTransfer(address, from);

    // Simulate the bundler's behavior on output transfers.
    if (
      sender === from &&
      from === generalAdapter1 &&
      amount === MathLib.MAX_UINT_256
    )
      amount = MathLib.min(amount, fromHolding.balance);

    if (fromHolding.balance < amount)
      throw new Erc20Errors.InsufficientBalance(address, from);

    if (sender !== from && from !== generalAdapter1) {
      // Check allowance for approval recipients (except for the bundler which doesn't need it).
      const contract =
        sender === morpho
          ? "morpho"
          : sender === generalAdapter1
            ? "bundler3.generalAdapter1"
            : sender === permit2
              ? "permit2"
              : undefined;

      if (contract != null) {
        if (fromHolding.erc20Allowances[contract] < amount)
          throw new Erc20Errors.InsufficientAllowance(address, from, sender);

        fromHolding.erc20Allowances[contract] -= amount;
      } else {
        // Check allowance of MetaMorpho vaults on the underlying asset.
        const vault = data.tryGetVault(sender);
        const vaultFromData = data.tryGetVaultUser(sender, from);

        if (vault?.asset === address && vaultFromData != null) {
          if (vaultFromData.allowance < amount)
            throw new Erc20Errors.InsufficientAllowance(address, from, sender);

          vaultFromData.allowance -= amount;
        }
      }
    }

    fromHolding.balance -= amount;
  }

  const toHolding = data.tryGetHolding(to, address);

  if (toHolding != null) toHolding.balance += amount;
};
