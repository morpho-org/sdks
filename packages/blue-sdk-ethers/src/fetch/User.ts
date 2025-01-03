import type { Provider } from "ethers";

import {
  type Address,
  ChainUtils,
  User,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { MorphoBlue__factory } from "ethers-types";
import type { FetchOptions } from "../types";

export async function fetchUser(
  address: Address,
  runner: { provider: Provider },
  { chainId, overrides = {} }: FetchOptions = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const { morpho, bundler } = getChainAddresses(chainId);
  const blue = MorphoBlue__factory.connect(morpho, runner);

  const [isBundlerAuthorized, morphoNonce] = await Promise.all([
    blue.isAuthorized(address, bundler, overrides),
    blue.nonce(address, overrides),
  ]);

  return new User({
    address,
    isBundlerAuthorized,
    morphoNonce,
  });
}
