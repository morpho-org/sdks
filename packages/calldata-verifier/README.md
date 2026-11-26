# Calldata verifier

Verify Morpho Actions API calls against the user's original intent before signing. Supports Vault V1/V2, Morpho Blue and Midnight market actions.

## Scope

`verifyCalldata` is a static check, not an execution verifier. It uses only calldata, intent, and the local chain registry to check targets and selectors, vault or market, requested amounts where comparable, encoded owners and recipients, and encoded referral fees against `max_fee_bps`. Unknown, malformed, or unexpected calls are rejected.

When a referral fee is requested, the verifier checks its recipient and caps the encoded fee at the lower of `referral_fee.bps` and `max_fee_bps`.

Use [`@morpho-org/evm-simulation`](../evm-simulation) for execution-dependent checks. Outside the static scope:

- Whether Vault share-price bounds match `slippage_bps`. Regardless of whether it is supplied, the verifier rejects Vault V1/V2 deposit ceilings of zero or `maxUint256` and exact-asset Vault V2 force-withdraw floors of zero. To enforce the tolerance, derive a RAY-scaled bound from trusted vault data at a pinned block. For deposits, take the projection deadline from your original request or local policy, not the API response, and reject decoded `args[6]` if it is later than that deadline. Follow the [SDK calculation](../morpho-sdk/src/helpers/slippage.ts): deduct any referral fee, use the lower of the current and deadline-accrued share previews (both rounded down), and require decoded `args[2]` to be at most the resulting ceiling. A raw share-price ratio can be too strict, especially at zero slippage.
- For exact-asset Vault V2 force withdrawals, use the public Morpho SDK's `client.morpho.vaultV2(vault, chainId).forceWithdraw(...).buildTx()` to derive an independent floor without signing or sending anything. Use pinned vault data, the block timestamp as `now`, and the exit amount, signer, slippage tolerance, and deadline from your request or local policy. To rely on this floor comparison, set `slippage_bps` explicitly in your request instead of relying on a default. Pass `BigInt(slippage_bps) * 10n ** 14n` as the SDK's WAD-scaled `slippageTolerance`. Compare decoded `args[3]` with `tx.action.args.minSharePriceE27` and reject a lower floor or a later decoded deadline (`args[7]`). The SDK's internal quote accounts for deallocation penalties and net shares burned: fee shares minted to the signer as a management or performance fee recipient offset shares burned. The public `computeVaultV2ForceWithdrawFeeSharesMinted` helper projects those mints to the trusted deadline but does not compute the floor. The bundle skips its onchain floor check when `totalSharesBurnt == 0`; do not rely on the floor if the SDK rejects the projection because fee mints can erase the burn.
- Vault V2 penalty rates and whether they meet `max_penalty_bps`.
- For `vault_v2.redeem_in_kind`, the verifier does not check the optional `max_penalty_bps` cap, and `@morpho-org/evm-simulation` rejects `quote.penalty` for in-kind redemption. If `max_penalty_bps !== undefined`, read the vault's WAD-scaled `forceDeallocatePenalty(adapter)` at a pinned block before signing and require `penalty <= BigInt(max_penalty_bps) * 10n ** 14n`. An omitted cap skips this comparison; a cap of `0` requires zero penalty. This read checks the rate only at that block: the calldata carries no penalty limit, so the vault charges the rate in effect when the transaction executes. If you need the cap to hold at execution, also watch for pending penalty changes or limit how long a signed transaction can wait before inclusion. Separately, use minimum `quote.positions` (Blue supply shares) or `quote.assetsReceived` (idle assets paid to the wallet), accounting for simulation tolerance, to bound proceeds; these bounds do not verify the penalty rate.
- For `vault_v2.force_withdraw` with `amount.unit: "all"`, the verifier checks that `forceDeallocate` legs are well-formed, use the requested account, and encode positive amounts. To check the rate cap before signing, read the vault's WAD-scaled `forceDeallocatePenalty(adapter)` at a pinned block for each adapter in the verified legs and require `penalty <= BigInt(max_penalty_bps) * 10n ** 14n`. This read checks the rate only at that block: the calldata carries no penalty limit, so the vault charges the rate in effect when the transaction executes. If you need the cap to hold at execution, also watch for pending penalty changes or limit how long a signed transaction can wait before inclusion. Separately, simulation's `quote.penalty` bounds total penalty assets and `quote.deallocations` bounds amounts by observed Blue market, accounting for simulation tolerance; neither checks the penalty rate. If a leg emits no matching Blue `Withdraw` event (for example, a Vault V1 adapter or a non-Blue leg with empty adapter data), simulation fails closed when `quote.deallocations` is supplied; use `quote.penalty` to bound the penalty cost across all legs, or derive your own per-leg limits.
- Actual balances and amounts derived for `amount.unit: "all"`.
- Whether the caller-supplied Vault `asset` matches the actual `vault.asset()`. Read `vault.asset()` at the pinned block and compare it with `asset`. For deposits and standard withdrawals or redemptions, typed-input simulation can establish an exact match if you pass a canonical ERC-20 address as the token override (`assetPaid` for deposits, `assetReceived` for exits). Simulation also accepts `ethAddress` for a vault whose asset is the chain's wrapped-native token, so use the pinned read if your source might supply a native alias. Force withdrawals, force redemptions, and in-kind redemptions do not support typed inputs; use the pinned read for those. Quote-only limits can accept a token override without comparing it with `vault.asset()`.
- Whether existing onchain allowances suffice and whether a call succeeds or reverts.
- Blue ERC-20 repay by shares or for all debt: before signing, compare the decoded `maxRepayAssets`, which is `args[3]` of the verified `blueBundlesV1RepayAndWithdrawCollateral` call, against an independently chosen funding cap. Apply this check whenever that call's `value` is zero, including for requests that allowed native funding, because such requests don't have to use it. Simulating net spend does not bound the upfront pull because unused funds can be refunded.
- Blue public-allocator reallocations: the verifier checks zero penalty, the destination market and loan token, positive amounts, and route structure and uniqueness. Simulation checks whether a reallocation is needed and whether its source and amount are appropriate.
- Blue embedded Morpho authorizations: the verifier checks signature structure. The bundle supplies the transaction sender and its own address as the authorizer and authorized spender; signature validity, nonce and expiry are execution checks.
- Midnight full direct repays, and units-target lends, market repays and `midnight.take_lend` takes: compare the decoded `maxBuyerAssets` against an independently chosen upfront funding cap before signing. For full direct repays, this applies to ERC-20, native, and auto funding: when ETH is sent, the bundle wraps it to the signer's balance and then pulls the encoded `maxBuyerAssets` from that wrapped-native balance. `max_native_assets` caps only the ETH sent, not the token pull. For the units-target cases, you can instead set a `max_assets` guard to enforce the upfront funding cap. Simulation's `assetsPaid` measures net spend after refunds, not the upfront pull.
- Midnight buy bundles for lend, market repay, and `midnight.take_lend`: the verifier does not bound the encoded `maxContinuousFee`. Compare it with an independently chosen ceiling. To check the market's actual fee against that ceiling, read Midnight's `continuousFee(marketId)` at the simulation block or use a simulation `assertBefore` view call.
- Midnight fill prices under a `slippage` guard: the secondary bound and offer ticks depend on the onchain price. Check the resulting fill price in simulation.
- Midnight borrow takes withdraw available existing credit first and may succeed without filling the requested offer. If a fill is required, verify it in simulation.
- Midnight offer ratification: the verifier does not check roots, proofs, or ratifier data. Midnight checks ratification at execution.

## Usage

```ts
import { verifyCalldata } from "@morpho-org/calldata-verifier";

verifyCalldata(
  {
    ...requestBody,
    action: "vault_v2.deposit",
    chain_id: 8453,
    vault,
    asset,
    max_fee_bps: 0,
  },
  response.data.calls,
);
```

Pass the original request body, not values copied from the response. A successful check returns the decoded calls; a mismatch throws.

Every Vault intent requires `asset`, the underlying token address from a source independent of the calldata response. The verifier checks it against deposit approvals (including zero resets), the chain's wrapped native token for native deposits, and any encoded Blue market loan token in in-kind redemptions and force-redeem deallocation legs. Standard withdrawals, exact-asset force withdrawals, and empty adapter data do not encode the underlying token. Deposit bundle arguments and ERC-2612 or Permit2 payloads do not encode a token address either; the bundle reads `vault.asset()` at execution.

For Blue and Midnight, pass the market ID as `market` and the chain separately as `chain_id`. Keep the API's chain-qualified `destination_market` in the Blue refinance request body.

- Submit only the verified calls, in order, from `account` on `chain_id`. Calldata does not identify the signer or the network; some Vault calls pay the caller directly.
- For `amount.unit: "all"`, the owner and every recipient (including any referral recipient) must be `account`. The verifier does not compare a concrete share or asset amount, so a withdrawal may return less than the full balance.
- An approval's spender must match the main call's target. A positive approval included in the response must cover the encoded pull where the amount is available: at least the encoded assets on Vault deposits, or at least the encoded shares on share-unit and `"all"` Vault withdrawals. An unlimited approval is accepted. A zero reset must immediately precede a positive approval for the same token and spender.
- Nonzero native value must be authorized by the request's `funding.max_native_assets`. The verifier does not require a native-capable request to use native funds.
- Blue reallocations with a nonzero penalty are rejected.
- Midnight accepts `slippage` or no guard, and checks explicit `min_units`/`max_assets` on buys and `max_units`/`min_assets` on sells and direct withdrawals. Unknown and wrong-side guards throw `CalldataUnsupportedError`.
- For Midnight, an approval, if included, must cover the encoded loan-token or collateral pull.
- Midnight `min_rate` and `max_rate` guards throw `CalldataUnsupportedError`: the rate is not encoded directly in the bundle, and its conversion depends on the quote and execution context.
- Midnight core withdrawals transfer one loan asset per unit withdrawn after the contract updates the account's credit for losses. The verifier accepts exact asset and exact unit requests for this route.
- The verifier does not check slippage, expiry or attribution tags, or verify typed-data signing requests.

### Authenticate an Actions API response

Pass `{ proof }` as the optional third argument to require a valid `Morpho-Action-Proof` header. Fetch the JWKS yourself from `/.well-known/morpho-actions-jwks.json` on your independently trusted Actions origin. The verifier never fetches keys. The expected issuer defaults to `https://api.morpho.org/v0/actions`; override it only for a different trusted environment.

Follow Morpho's [response verification guide](https://docs.morpho.org/api/actions/verify-responses/): send requests to your keyed origin without following redirects, cache its JWKS for at most 60 seconds, and refetch on an unknown `kid`. The wallet integration must check the action's `expires_at` separately from the proof expiry. This verifier does not handle signature-required continuations or typed-data signatures.

Retain the exact request body bytes as sent and the response body bytes after HTTP decompression, before parsing JSON. Do not reserialize either body. Pass the exact request path and content type, response status and content type, response `X-Request-Id`, and the current time in Unix seconds as `now`. The verifier does not read the clock. For example, given your original `intent`, sent `request`, received `response`, and `trustedJwks`:

```ts
const responseBytes = new Uint8Array(await response.arrayBuffer());
const { data } = JSON.parse(new TextDecoder().decode(responseBytes));
const verified = verifyCalldata(intent, data.calls, {
  proof: {
    header: response.headers.get("Morpho-Action-Proof") ?? "",
    jwks: trustedJwks,
    now: Math.floor(Date.now() / 1000),
    request, // { method, path, contentType, body: Uint8Array }
    response: {
      status: response.status,
      contentType: response.headers.get("Content-Type") ?? "",
      requestId: response.headers.get("X-Request-Id") ?? "",
      body: responseBytes,
    },
  },
});
```

Verification stays synchronous and throws `CalldataProofError` if the signature, freshness, exchange, or supplied calls do not match, or if the signed response is not prepared with a successful simulation and an approved decision. The signed response must include a `chain_id` matching the intent. A valid proof authenticates the bytes as attested by Morpho; it does not bind the host or prevent replay within the proof's short validity window. It does not establish transaction safety or current chain state. Proof mode still runs the static checks; use simulation and independent state-dependent bounds before signing.

### Midnight offers

- For takes, pass `group` from the original path and `market_id` from the request. Group IDs are scoped to a maker: without `maker`, the group alone does not identify the offer, and the verifier only checks that all fills use one maker. Takes without a caller-known market ID or with a reduce-only maker fill throw `CalldataUnsupportedError`. Use an explicit amount guard to enforce a minimum or maximum on the other side of the trade.
- Funding withdrawals must pay `account` from the original `funding_address` and `funding_market`. The request has no amount: the verifier checks for a positive share withdrawal, not that it empties the position.
- The four `midnight.make_*` actions throw `CalldataUnsupportedError` in v1. Verifying them would require decoding the compressed offer payload and checking its commitment against the root the call activates.
