import { MaxUint256, type Provider } from "ethers";
import {
  BackedWhitelistControllerAggregatorV2__factory,
  ERC20__factory,
  ERC2612__factory,
  PermissionedERC20Wrapper__factory,
  Permit2__factory,
  WrappedBackedToken__factory,
} from "ethers-types";

import {
  type Address,
  ChainUtils,
  ERC20_ALLOWANCE_RECIPIENTS,
  Holding,
  NATIVE_ADDRESS,
  PERMIT2_ALLOWANCE_RECIPIENTS,
  getChainAddresses,
  permissionedBackedTokens,
  permissionedWrapperTokens,
} from "@morpho-org/blue-sdk";
import { fromEntries } from "@morpho-org/morpho-ts";
import type { FetchOptions } from "../types.js";

export async function fetchHolding(
  user: Address,
  token: Address,
  runner: { provider: Provider },
  { chainId, overrides = {} }: FetchOptions = {},
) {
  chainId = ChainUtils.parseSupportedChainId(
    chainId ?? (await runner.provider.getNetwork()).chainId,
  );

  const chainAddresses = getChainAddresses(chainId);

  if (token === NATIVE_ADDRESS)
    return new Holding({
      user,
      token,
      erc20Allowances: fromEntries(
        ERC20_ALLOWANCE_RECIPIENTS.map((label) => [label, MaxUint256]),
      ),
      permit2Allowances: fromEntries(
        PERMIT2_ALLOWANCE_RECIPIENTS.map((label) => [
          label,
          {
            amount: 0n,
            expiration: 0n,
            nonce: 0n,
          },
        ]),
      ),
      balance: await runner.provider.getBalance(user, overrides.blockTag),
    });

  const erc20 = ERC20__factory.connect(
    token,
    // @ts-ignore incompatible commonjs type
    runner,
  );
  const permit2 = Permit2__factory.connect(
    chainAddresses.permit2,
    // @ts-ignore incompatible commonjs type
    runner,
  );
  const erc2612 = ERC2612__factory.connect(
    token,
    // @ts-ignore incompatible commonjs type
    runner,
  );

  const [
    balance,
    erc20Allowances,
    permit2Allowances,
    erc2612Nonce,
    whitelistControllerAggregator,
    hasErc20WrapperPermission,
  ] = await Promise.all([
    erc20.balanceOf(user, overrides),
    Promise.all(
      ERC20_ALLOWANCE_RECIPIENTS.map(
        async (label) =>
          [
            label,
            await erc20.allowance(user, chainAddresses[label], overrides),
          ] as const,
      ),
    ),
    Promise.all(
      PERMIT2_ALLOWANCE_RECIPIENTS.map(
        async (label) =>
          [
            label,
            await permit2
              .allowance(user, token, chainAddresses[label], overrides)
              .then(({ amount, nonce, expiration }) => ({
                amount,
                expiration,
                nonce,
              })),
          ] as const,
      ),
    ),
    erc2612.nonces(user, overrides).catch(() => undefined),
    permissionedBackedTokens[chainId].has(token)
      ? WrappedBackedToken__factory.connect(
          token,
          // @ts-ignore incompatible commonjs type
          runner,
        ).whitelistControllerAggregator(overrides)
      : undefined,
    PermissionedERC20Wrapper__factory.connect(
      token,
      // @ts-ignore incompatible commonjs type
      runner,
    )
      .hasPermission(user, overrides)
      .catch(() => !permissionedWrapperTokens[chainId].has(token)),
  ]);

  const holding = new Holding({
    user,
    token,
    erc20Allowances: fromEntries(erc20Allowances),
    permit2Allowances: fromEntries(permit2Allowances),
    erc2612Nonce,
    balance,
    canTransfer: hasErc20WrapperPermission,
  });

  if (whitelistControllerAggregator)
    holding.canTransfer =
      await BackedWhitelistControllerAggregatorV2__factory.connect(
        whitelistControllerAggregator,
        // @ts-ignore incompatible commonjs type
        runner,
      )
        .isWhitelisted(user, overrides)
        .catch(() => undefined);

  return holding;
}
