# morpho-sdk Conventions

- Keep the SDK as a transaction-building abstraction for VaultV1, VaultV2, and MarketV1 operations.
- Preserve the layering: `src/client` fetches and exposes entities, entities delegate to `src/actions`, and actions stay pure tx builders.
- Never bypass the general adapter for deposits; it enforces `maxSharePrice` and protects against inflation attacks.
- Validate `chainId` before on-chain reads or transaction construction.
- Enforce builder equals signer: `userAddress` must match the connected viem account via `validateUserAddress`.
- Deep-freeze every returned `Transaction`; callers must not receive mutable transaction objects.
- Keep combined market actions below LLTV with the configured buffer, especially `supplyCollateralBorrow` and collateral withdrawals.
- Preserve `repayWithdrawCollateral` ordering: repay first, then withdraw collateral; it mixes explicit `onBehalf` with implicit initiator flows.
- Route shared-liquidity `reallocations` through `PublicAllocator.reallocateTo()` before borrow execution and accumulate fees in `tx.value`.
- Requirements code resolves approval, permit, permit2, and Morpho authorization needs; do not duplicate that logic in actions.
- Re-export public API through barrel `index.ts` files; avoid accidental deep-file public surfaces.
- Add JSDoc for exported functions and interfaces, and follow neighboring action/entity patterns before introducing abstractions.
