import type { Provider } from "ethers";
import { ERC20__factory, MetaMorpho__factory } from "ethers-types";

import {
  type Address,
  ChainUtils,
  type VaultConfig,
  VaultUser,
} from "@morpho-org/blue-sdk";
import type { FetchOptions } from "../types";
import { fetchVaultConfig } from "./VaultConfig";

export async function fetchVaultUser(
  vault: Address,
  user: Address,
  runner: { provider: Provider },
  options: FetchOptions = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const config = await fetchVaultConfig(vault, runner, options);

  return fetchVaultUserFromConfig(config, user, runner, options);
}

export async function fetchVaultUserFromConfig(
  config: VaultConfig,
  user: Address,
  runner: { provider: Provider },
  options: FetchOptions = {},
) {
  options.chainId = ChainUtils.parseSupportedChainId(
    options.chainId ?? (await runner.provider.getNetwork()).chainId,
  );
  options.overrides ??= {};

  const mm = MetaMorpho__factory.connect(config.address, runner);
  const erc20 = ERC20__factory.connect(config.asset, runner);

  const [allowance, isAllocator] = await Promise.all([
    erc20.allowance(user, config.address, options.overrides),
    mm.isAllocator(user, options.overrides),
  ]);

  return new VaultUser({
    vault: config.address,
    user,
    isAllocator,
    allowance,
  });
}
