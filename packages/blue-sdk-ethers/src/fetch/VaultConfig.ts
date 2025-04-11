import type { Provider } from "ethers";
import { MetaMorpho__factory } from "ethers-types";

import { type Address, VaultConfig } from "@morpho-org/blue-sdk";
import type { FetchOptions } from "../types";
import { fetchToken } from "./Token";

export async function fetchVaultConfig(
  address: Address,
  runner: { provider: Provider },
  options: FetchOptions = {},
) {
  options.chainId ??= Number((await runner.provider.getNetwork()).chainId);

  const mm = MetaMorpho__factory.connect(address, runner);

  const { overrides = {} } = options;

  const [token, asset, decimalsOffset] = await Promise.all([
    fetchToken(address, runner, options), // TODO: avoid fetching decimals
    mm.asset() as Promise<Address>,
    mm.DECIMALS_OFFSET(overrides),
  ]);

  return new VaultConfig({
    ...token,
    asset,
    decimalsOffset,
  });
}
