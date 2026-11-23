# Paired-emitter identity and ledger evidence

The registry is directional, chain-scoped, and deliberately skips every paired
outflow when the primary is spendable. It does not match events or amounts.
These are two views of one ledger, not independently held wrapper balances.

## Published identities

- Ethereum legacy EURe `0x3231Cb76718CDeF2155FC47b5286d82e6eDA273f`:
  [Monerium's published token list, GET /tokens response](https://docs.monerium.com/api/#tag/Tokens).
  EURe v2 `0x39b8B6385416f4cA36a20319F70D28621895279D`:
  [Monerium's official EURe address list](https://monerium.com/eure/).
  [Monerium's migration explanation](https://help.monerium.com/article/10-v2-contracts)
  explains why both interfaces coexist.
- HyperEVM wstHYPE `0x94e8396e0869c9F2200760aF0621aFd240E1CF38` and
  stHYPE `0xfFaa4a3D97fE9107Cef8a3F48c069F577Ff76cC1`:
  [StakedHYPE's mainnet deployment list](https://docs.valantis.xyz/stakedhype/integrate/contract-addresses).
  [The issuer's dual-interface specification](https://docs.valantis.xyz/stakedhype/integrate/wsthype)
  explains that wstHYPE reads stHYPE's shares and transfers the same ledger.
- Arc mainnet USDC `0x3600000000000000000000000000000000000000` and native
  emitter `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE`:
  [Arc's USDC system-event specification](https://docs.arc.io/arc/references/usdc-system-events).
  It specifies both addresses, 6/18 decimals and the two events from ERC-20 calls,
  and states that mainnet has emitted the system Transfer since genesis.
  [Arc's EVM specification](https://docs.arc.io/arc/references/evm-differences)
  specifies one native/ERC-20 balance, with the ERC-20 view truncating at 6 decimals.

### Recorded issuer excerpts

Retrieved **2026-11-20**. The following short excerpts are verbatim page text
(the API excerpt is from the rendered JSON response example). Address casing in
these quotes is the source's casing, not a change to the registry.

[Monerium API, GET /tokens response example](https://docs.monerium.com/api/#tag/Tokens):

> "symbol": "EURe","chain": "ethereum","address": "0x3231cb76718cdef2155fc47b5286d82e6eda273f"

[Monerium EURe page](https://monerium.com/eure/), Ethereum address field:

> The official EURe token contract addresses are listed below. Always verify the contract address before interacting with EURe.

> Address`0x39b8B6385416f4cA36a20319F70D28621895279D`

[Monerium migration explanation](https://help.monerium.com/article/10-v2-contracts):

> Monerium has released a new version (v2) of its EURe smart contracts to align with modern standards and support upgradability. While v2 is now live, some liquidity providers still rely on the original v1 contracts, so both versions will coexist for now.

That migration page contains no addresses; it supports coexistence only. The two
address-bearing Monerium excerpts above establish the Ethereum identities.

[StakedHYPE deployment list](https://docs.valantis.xyz/stakedhype/integrate/contract-addresses):

> | Contract | Proxy |
> | --- | --- |
> | stHYPE | 0xfFaa4a3D97fE9107Cef8a3F48c069F577Ff76cC1 |
> | OverseerV1 | 0xB96f07367e69e86d6e9C3F29215885104813eeAE |
> | wstHYPE proxy | 0x94e8396e0869c9F2200760aF0621aFd240E1CF38 |

[StakedHYPE interface specification](https://docs.valantis.xyz/stakedhype/integrate/wsthype):

> on HyperEVM, user's hold both tokens (no wrapping required) and can chose to interact with either interface. This is a novel token mechanism and should be reviewed carefully.

> ## wstHYPE Contract Address
>
> https://hyperevmscan.io/token/0x94e8396e0869c9f2200760af0621afd240e1cf38

[Arc USDC system-event specification](https://docs.arc.io/arc/references/usdc-system-events):

> | Source | Emitter address | Events | Decimals |
> | --- | --- | --- | --- |
> | Native USDC (system, EIP-7708) | `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` | `Transfer` | 18 |
> | ERC-20 USDC (NativeFiatToken) | `0x3600000000000000000000000000000000000000` | `Transfer` | 6 |

[Arc EVM specification](https://docs.arc.io/arc/references/evm-differences):

> USDC uses 18 decimals natively (not 6), the system emitter `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` logs all USDC Transfer events

### Corroboration on merged main branches

Searched the fetched `origin/main` snapshots below on **2026-11-20**, not the
feature branches. Searches were case-insensitive, for the complete `0x` address
followed by a non-hex character or end of line; binary files and longer hex values
were excluded. This avoids mistaking embedded bytecode for an address constant.
These repository occurrences corroborate identities and chain assignments;
they do not replace issuer evidence or prove the shared-ledger behavior.

| Snapshot | Repository | Commit on `main` used for every path below |
| --- | --- | --- |
| SDK | This repository | `47a45e1ff68895dbf861008ff9a3a81ad661364e` |
| Apps | `morpho-apps` | `e3e30038883b0c78755f18d82bf01d5acbb849a1` |
| Backend | `backend` | `7adfded3d318f499d4f8cfb18e25af64c28f4c34` |

The Backend anchor for all six addresses is
`services/actions-attestor/package/src/simulation/simulation.adapter.ts` at the
Backend snapshot above. Its chain-keyed definitions are `_MIRRORED_TOKEN_EVENTS`
(Ethereum/HyperEVM) and `_NATIVE_ASSET_ALIASES` / `_NATIVE_ASSET_SENTINEL` (Arc).

| Address | SDK main | Apps main reviewed anchor | Backend main anchor (same file above) |
| --- | --- | --- | --- |
| Legacy EURe `0x3231Cb76718CDeF2155FC47b5286d82e6eDA273f` | None found | None found | Line 200, chain 1 `token` |
| EURe v2 `0x39b8B6385416f4cA36a20319F70D28621895279D` | None found | None found | Line 201, chain 1 `mirror` |
| wstHYPE `0x94e8396e0869c9F2200760aF0621aFd240E1CF38` | None found | `apps/documentation-v3-app/components/MarketIdGenerator.tsx:22` | Line 193, chain 999 `token` |
| stHYPE `0xfFaa4a3D97fE9107Cef8a3F48c069F577Ff76cC1` | None found | None found | Line 194, chain 999 `mirror` |
| Arc USDC `0x3600000000000000000000000000000000000000` | None found | `packages/web3/src/configs/chains/arc.ts:29` (`gasToken`, 6 decimals) | Line 178, chain 5042 `token` |
| Arc native emitter `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` | None found | None found | Line 173, `_NATIVE_ASSET_SENTINEL` |

Review provenance was checked separately from presence on main:

- Backend PR **#7172** introduced the EURe/HyperEVM definitions in
  `e7bac8cf059e5ab26412c509d3c6e78734a7c146` (2026-11-02).
  Its automated review returned `APPROVED` at the final PR head
  `cb93d7622815ced4f640255ba27b8aaaff28a0b5` on 2026-11-02.
- Backend PR **#6353** introduced the Arc definitions in
  `e6b97f1219d052b498bb0ae51419be0f70ff1d7a` (2026-10-21).
  Its automated review returned `APPROVED` at the final PR head
  `f66c033621d6c06d6947fdf31d7b38067ad84bae` on 2026-10-21.
  Both Backend PRs merged into `dev`; both introducing commits are ancestors of
  the recorded `main` snapshot. No human approval is asserted for these PRs.
- Apps PR **#8648**, commit `71b3bdcc80e607b3bd0ceb0af39455908a9bb2bb`,
  contains the checksummed wstHYPE anchor. `0xbulma` approved its final head
  `304ccc6ee1998ee86b8af65d879d818416735e25` on 2026-10-27.
- Apps PR **#6881**, commit `be299656e0f65c4c42cc09aa4988a227b8943aea`,
  introduced the Arc `gasToken` anchor. `haydenshively` approved its final head
  `94081ee9510ea82fa00b9f7cdb6be0ff94eecf3b` on 2026-10-07.
  Both Apps PRs merged directly into `main`.

Thus **all six have merged, independently reviewed Backend corroboration**;
**two also have reviewed Apps corroboration**. None has an occurrence on SDK
main. Across the three repositories, **none of the six lacks corroboration**.
The Backend approvals are automated review evidence, not issuer attestations.

#### Other exact main-branch hits

For completeness, the remaining textual hits are listed below. Every Backend
path uses the Backend commit above; every Apps path uses the Apps commit above.
These extra occurrences were not individually review-audited; the reviewed
anchors above are the review evidence. Repeated occurrences in one file share
one path entry.

Backend:

- `apps/actions-api/test/fork/blue-supply.fork.spec.ts:58` — legacy EURe.
- `apps/actions-api/test/fork/blue-withdraw.fork.spec.ts:102` — legacy EURe.
- `apps/actions-api/test/fork/fork-harness.ts:55,57,59` — wstHYPE, legacy EURe, EURe v2.
- `services/actions-attestor/package/test/simulation.adapter.spec.ts:83-89,1635-1636,1698` — all six.

Apps, wstHYPE:

- `tests/e2e-vaults/tests/upstream/actionPanelEntities.ts:165`
- `tests/e2e-vaults/tests/upstream/core-handlers/tokens.ts:277,308,523`
- `tests/e2e-vaults/tests/upstream/recordings/bridge/vaults-app-api/v1_tokens_tokens_999_3A0x94e8396e0869c9f2200760af0621afd240e1cf38--f0469437.json:2,9`
- `tests/e2e-vaults/tests/upstream/recordings/core/markets/v0_blue_markets_chain_id_999_limit_100_market_id_0xcac72237bf1391fd999e993cb8824--9ea65ed8.json:11`
- `tests/e2e-vaults/tests/upstream/recordings/core/markets/v0_blue_markets_chain_id_999_limit_100_market_id_0xf5d30dcdafb1c03369a7a269edf12--d74d3601.json:11`
- `tests/e2e-vaults/tests/upstream/vaultV1PageCalls.ts:210`

Apps, Arc USDC:

- `apps/markets-app/lib/modules/p2p/transforms/rcf-threshold.spec.ts:27,143`
- `apps/markets-app/scripts/lib/blue-markets.ts:114`
- `apps/markets-app/test/api-proxy/synthesizers/index.ts:90`
- `apps/markets-app/test/api-proxy/synthesizers/tokens.ts:192`
- `apps/vaults-app/packages/vaults-core/src/config/__tests__/chain.test.ts:143`
- `apps/vaults-app/src/components/VaultPage/VaultV1/hooks/__tests__/useVaultV1DepositLogic.test.tsx:19`
- `apps/vaults-app/src/components/VaultPage/VaultV2/hooks/__tests__/useVaultV2DepositLogic.test.tsx:22`
- `apps/vaults-app/src/hooks/__tests__/useSpendableBalance.test.ts:13`
- `apps/vaults-app/src/hooks/operation/market/__tests__/useMarketRepayNativeWrap.test.ts:31`
- `tests/e2e-markets/src/constants.ts:679`
- `tests/e2e-vaults/tests/config/fixtures/mocks.json:4920,4922,4923,34998,34999`
- `tests/e2e-vaults/tests/upstream/recordings/bridge/vaults-app-api/v1_tokens_5042_0x3600000000000000000000000000000000000000_price_history_daily_li--3f1fc434.json:2,6`
- `tests/e2e-vaults/tests/upstream/recordings/bridge/vaults-app-api/v1_tokens_5042_0x3600000000000000000000000000000000000000_price_history_lookback--d5461d60.json:2,6`
- `tests/e2e-vaults/tests/upstream/recordings/bridge/vaults-app-api/v1_tokens_chain_ids_5042_is_vault_asset_true_listed_true--97ab6c5f.json:24`
- `tests/e2e-vaults/tests/upstream/recordings/bridge/vaults-app-api/v1_tokens_tokens_5042_3A0x3600000000000000000000000000000000000000--4d344519.json:2,9`
- `tests/e2e-vaults/tests/upstream/recordings/core/markets/v0_blue_markets_chain_id_5042_limit_100_market_id_0xc2db905f174e5defcce01d321b09--7e551c62.json:10`
- `tests/e2e-vaults/tests/upstream/recordings/core/tokens/v0_tokens_5042_0x3600000000000000000000000000000000000000_price--3a276444.json:2,8`
- `tests/e2e-vaults/tests/upstream/vaults-app-api-handlers/index.ts:256,2028`

## Pinned code reads

`eth_getCode(address, block)` was read on each entry's own chain. The JSON below
records byte lengths and Keccak-256 hashes of the returned runtime code, including
the empty-code hash for Arc's event-only system emitter. Code presence alone is
not identity evidence; the published identities above establish the addresses.

| Chain | Block | Primary bytes | Paired bytes |
| --- | --- | --- | --- |
| Ethereum (1) | 26456605 | 6318 | 170 |
| HyperEVM (999) | 51773096 | 1115 | 1115 |
| Arc (5042) | 32229724 | 1798 | **0** |

Hashes: [`paired-emitter-code.json`](./paired-emitter-code.json).
The integration tests recheck these hashes at the same pins, then exercise the
paired interface, rather than relying on names, copied fixtures or co-emitted logs.

An executed verification is available in PR #1114's fork CI job
`136469188014` (run `44788369787`), at commit
`d74b79ce9b2b2abeb943ca747be8beb2af2ff357`. Its `Require ERPC_SECRET`
step succeeded, and its test log records:

```text
✓ evm-simulation-fork packages/evm-simulation/test/simulate/paired-emitters.integration.test.ts (4 tests) 2910ms
Test Files  16 passed (16) | 1 skipped (1)
Tests  145 passed (145) | 3 skipped (3)
```

Those four tests executed all six pinned code-hash assertions, the two Anvil
ledger checks, the Arc native/ERC-20 ledger check and the trace-enabled public
`simulate()` Arc case described below. Other files had skips; this file did not.

## HyperEVM proxy and ledger wiring at block 51773096

Read on **2026-11-21** at the same HyperEVM pin as the fixture, using
`eth_getStorageAt`, `eth_getCode` and `eth_call`. These are distinct
TransparentUpgradeableProxy deployments with distinct implementations, not two
proxies delegating to the same implementation or sharing proxy storage.

The EIP-1967 slots (`keccak256(label) - 1`) are:

| Label | Slot |
| --- | --- |
| `eip1967.proxy.implementation` | `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc` |
| `eip1967.proxy.admin` | `0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103` |
| `eip1967.proxy.beacon` | `0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50` |

Exact 32-byte storage words at that block:

| Proxy | Implementation | Admin | Beacon |
| --- | --- | --- | --- |
| wstHYPE `0x94e8396e0869c9F2200760aF0621aFd240E1CF38` | `0x000000000000000000000000104324863cfb2220756c60384efa9bb67a57aaf7` | `0x000000000000000000000000a29a2043b2fcbc9189beb9e6efcb2ba48bb3d586` | `0x0000000000000000000000000000000000000000000000000000000000000000` |
| stHYPE `0xfFaa4a3D97fE9107Cef8a3F48c069F577Ff76cC1` | `0x000000000000000000000000e71caf5c1fe56d8897c7b604295d23968049e057` | `0x000000000000000000000000e7b0f26e8e20e109441f0ad1c885fffbb27125dc` | `0x0000000000000000000000000000000000000000000000000000000000000000` |

The implementation runtimes are pinned too, rather than only the proxy code:

| Implementation | Bytes | Runtime Keccak-256 |
| --- | --- | --- |
| wstHYPE `0x104324863cfb2220756c60384efa9bb67a57aaf7` | 7379 | `0x3bca1426a75e04a4fb628558e756735e1d9061cf1c4ea131998ff769ef617f3b` |
| stHYPE `0xe71caf5c1fe56d8897c7b604295d23968049e057` | 14447 | `0xeb084a00a96688e2139c5a80963e48c3fdbf29ab3ed5fad0317658d1b898b98a` |

### Issuer deployment-record cross-check

Retrieved again on **2026-11-21**: the issuer's
[Mainnet deployment record](https://docs.valantis.xyz/stakedhype/integrate/contract-addresses)
lists exactly the two proxy addresses above (verbatim rows quoted earlier).
It does not publish their implementation/admin slot values; those values above
are pinned chain reads, not an issuer assertion. The issuer's
[roles registry](https://docs.valantis.xyz/stakedhype/roles-and-controls-registry)
lists the ProxyAdmin owner as `0xc5DEd4F7F53919c714059a17d31371aE847E23D2`.
Both admin contracts' `owner()` return that address at the pin; the fork test
asserts this too. This verifies owner identity, not the timelock's delay policy.

The explorer marks the implementations' source as verified exact matches:
[wstHYPE implementation](https://hyperevmscan.io/address/0x104324863cfb2220756c60384efa9bb67a57aaf7#code),
[stHYPE implementation](https://hyperevmscan.io/address/0xe71caf5c1fe56d8897c7b604295d23968049e057#code).
The chain reads and fork assertions pin the implementations; an explorer's
current proxy label alone is not used as historical implementation evidence.

### Ledger reference and reads/writes

The storage direction matters: **the share ledger lives in paired stHYPE**;
primary wstHYPE reads and writes that ledger rather than holding an independent
wrapped balance. At the pin:

- wstHYPE's `sthype()` returns `0xfFaa4a3D97fE9107Cef8a3F48c069F577Ff76cC1`.
  Its raw storage slot `0` is
  `0x000000000000000000000000ffaa4a3d97fe9107cef8a3f48c069f577ff76cc1`.
- `stHYPE.hasRole(stHYPE.WRAPPER_ROLE(), wstHYPE)` returns `true`.
- `wstHYPE.balanceToShareDecimals()` returns `1000000`.
- Fixture holder `0x075267ffca613e8a86cb8eca03655281a0e2137b` has
  `stHYPE.sharesOf(holder) = 469006677765104662` and
  `wstHYPE.balanceOf(holder) = 469006677765`, exactly shares / `1000000` rounded down.

The verified `src/wstHYPE.sol` reads the same address reference in its balance
view and transfer implementation (short verbatim excerpts, retrieved 2026-11-21):

```solidity
stHYPE public sthype;
function balanceOf(address who) external view returns (uint256) {
    return sthype.sharesOf(who) / balanceToShareDecimals;
}
```

Its `_transfer` calls:

```solidity
sthype.transferShares(from, to, amount * balanceToShareDecimals);
```

In verified `src/stHYPE.sol`, `transfer` calls `_transfer(msg.sender, to, value)`;
`_transfer` converts the amount with `_balanceToShares` and calls
`_transferVotingUnits(from, to, shares)`. `sharesOf(who)` returns
`super.getVotes(who)`, the latest share checkpoint. Thus transferring via paired
stHYPE updates precisely the shares that the primary's balance view reads.

The new fork case **"pins HyperEVM proxy wiring and both transfer interfaces to
the stHYPE share ledger"** asserts all six EIP-1967 words, both implementation
hashes, admin ownership, the raw ledger-reference slot, getter, role and scale.
It then simulates a transfer through **each** interface, reading sender and
recipient `stHYPE.sharesOf` and `wstHYPE.balanceOf` before and after in the same
simulated block. The rebasing `balanceToShares(amount)` conversion is also read
inside that block, not at the preceding block's timestamp. For stHYPE, the sender loses and recipient gains exactly
`balanceToShares(amount)` shares; for wstHYPE, exactly `amount * 1000000` shares.
Both primary balances equal their respective share balances / `1000000` before
and after, including integer rounding. Every call must succeed. This is a
state-transition check, not an inference from co-emitted events or equal names.
No code/balance overrides or broadcast transactions are used.

These results establish wiring only at the pin; the distinct admin contracts
can upgrade implementations later. The historical four-test CI excerpt above
predates this additional wiring case and is not evidence that it executed.

Executed locally on **2026-11-21** with the configured Alchemy endpoints (no
skips), using the reproduction command below with `--reporter verbose`:

```text
✓ |evm-simulation-fork| packages/evm-simulation/test/simulate/paired-emitters.integration.test.ts > shared ledger: wstHYPE / stHYPE > pins HyperEVM proxy wiring and both transfer interfaces to the stHYPE share ledger 421ms
Test Files  1 passed (1)
Tests  5 passed (5)
```

The public HyperEVM endpoint supplied the metadata reads, but its Anvil fork
reverted on `balanceToShares`, including in the unchanged existing test. The
successful full run above used the configured endpoints instead. The first new
share-delta assertion also exposed timestamp-dependent rebasing: calculating the
conversion in the parent block differed by 631 shares from the simulated block.
Reading the conversion inside the simulated block makes the exact assertion
valid without adding a tolerance or changing fork balances/time.

EURe's existing pinned transfer proof is unchanged; the new wiring assertions
focus on HyperEVM.

## Reproducing the ledger checks

```sh
bun run test run --project evm-simulation-fork paired-emitters.integration.test.ts
```

`test/simulate/paired-emitters.integration.test.ts` uses `createViemTest` Anvil
forks for Ethereum and HyperEVM. It calls only the paired token's `transfer`,
then checks the primary balance decrease. EURe is equal-unit; stHYPE uses its
own `balanceToShares`, `sharesOf` and `balanceToShareDecimals` with integer
rounding to predict the wstHYPE balance exactly.

Arc's native ledger and system events are implemented outside ordinary EVM
bytecode. Standard Anvil cannot reproduce them; see Arc's EVM specification
above. The Arc case is therefore explicitly a **pinned live-RPC simulation**,
not an Anvil proof. It checks native balance / 10^12 equals ERC-20 balance
(allowing the documented native remainder), simulates a native send to exercise
the paired interface, and then an ERC-20 transfer. Both reduce the primary view;
the native send emits the system event and the ERC-20 transfer emits both events.
No transaction is broadcast and no balances or code are overridden.

A second Arc case calls public `simulate()` against that same pinned live state,
using its normal `traceTransfers: true` path. It approves and supplies real USDC
to an existing Blue market, accepts the mirrored spend, then checks that adding
an undeclared native send produces `UNEXPECTED_TOKEN_TRANSFER` for the native
sentinel. The market's loan token is checked onchain before the simulation.
Live-RPC clients use a test transport that withholds endpoint details from
errors, including nested causes; authenticated URLs are not printed on failure.

All cases skip without RPC credentials. `ERPC_SECRET` uses the usual Morpho eRPC
endpoint. `ALCHEMY_KEY` is an alternative for these three chains. The same pins
and real holders are recorded in `src/test-helpers/paired-emitter-*.json`.
