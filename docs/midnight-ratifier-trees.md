# Typed Midnight ratifier trees

`Tree` supports four explicitly tagged ratifier routes. The route determines the
construction inputs, normalized entries, and accepted authorization options.

```ts
import { Tree, type IOffer } from "@morpho-org/midnight-sdk";

function prepare(offer: IOffer) {
  return Tree.create({
    type: "rateV1",
    entries: [{ offer, rate: 100n }],
  });
}

// prepare(offer) returns Tree<"rateV1">.
// tree.entries[0]?.rate is bigint | undefined.
```

Use offers addressed to the intended ratifier deployment. The route tag selects
SDK behavior; it is not evidence of an onchain deployment's identity or approval.

| Route | Input entries | Normalized entries | Root authorization |
| --- | --- | --- | --- |
| `ecrecover` | Standard offers or groups | `OfferStruct` | Ecrecover signature |
| `setter` | Standard offers or groups | `OfferStruct` | Setter approval |
| `priceV1` | `{ offer, allowedTaker? }` | `PriceRatifierV1LeafStruct` | Price V1 approval |
| `rateV1` | `{ offer, rate, allowedTaker? }` | `RateRatifierV1LeafStruct` | Rate V1 approval |

All trees expose `root`, `height`, `leaves`, `offers`, `entries`, `paddedOffers`,
`proof(index)`, and `mempoolValidate(options)`. `entries` includes padding and the
complete leaf commitments. `offers` excludes padding. `paddedOffers` projects just
the underlying offers; it omits the additional Price/Rate commitment fields.

Ecrecover and Setter share leaf hashing. Price adds the allowed taker under its
own type hash. Rate commits to the rate instead of the tick, also with an allowed
taker and its own type hash. Ecrecover and Setter group normalization, padding,
roots and proofs are unchanged. Price and Rate derive an omitted `group` from
their scheme leaf hash with `group = 0` (Price commits `tick` + `allowedTaker`,
Rate commits `rate` + `allowedTaker`), matching the router's `group_identity`
rule; omitted-group V1 roots therefore differ from the earlier protocol-hash
derivation. Explicit groups are committed as-is.

## Ratification

Pass a typed tree to its matching namespace:

```ts
import {
  RateRatifierV1,
  type Tree,
} from "@morpho-org/midnight-sdk";

function publishItems(tree: Tree<"rateV1">) {
  // Call after the maker's root approval has completed onchain.
  return RateRatifierV1.ratify({ tree });
}
```

Cross-route trees are rejected by TypeScript and checked again at runtime.
`mempoolValidate` without ratification checks offers with empty ratifier data.
For final Price/Rate payload validation, pass `{ ratification: { type: "priceV1" } }`
or `{ ratification: { type: "rateV1" } }` respectively, after root approval.
Ecrecover retains its signature/client options; Setter uses `{ type: "setter" }`.
API validation performs an HTTP request and does not submit approvals.

## Transport and route narrowing

`tree.toDescriptor()` returns plain data containing bigint quantities. Use a
bigint-aware transport. After decoding, `Tree.fromDescriptor(snapshot)` validates
height, visible offers, padding, leaf hashes, and root before constructing a tree.
Descriptors are revalidated when passed directly to ratifier utilities as well.
Neither form claims the root has been authorized.

Use `AnyTree` or `AnyTreeSnapshot` when the route is only known at runtime. These
are discriminated unions: checking `type === "rateV1"` narrows the entries to Rate
leaves. They preserve more information than `Tree<RatifierKind>`.

`TreeUtils.buildDescriptor({ type, entries })` offers the same construction as
plain data for integrations that do not need a class instance.

## New and deprecated construction interfaces

Ecrecover and Setter each have a named creation request in the new API:

```ts
import {
  Tree,
  type EcrecoverTreeCreateRequest,
  type SetterTreeCreateRequest,
  type GroupInput,
} from "@morpho-org/midnight-sdk";

function prepare(entries: readonly GroupInput[]) {
  const ecrecover: EcrecoverTreeCreateRequest = { type: "ecrecover", entries };
  const setter: SetterTreeCreateRequest = { type: "setter", entries };
  return {
    ecrecover: Tree.create(ecrecover), // Tree<"ecrecover">
    setter: Tree.create(setter),       // Tree<"setter">
  };
}
```

`TreeCreateRequest` is the explicit union of these two interfaces plus
`PriceRatifierV1TreeCreateRequest` and `RateRatifierV1TreeCreateRequest`. The new
interfaces own their entry shapes; none depends on the deprecated
`TreeCreateParams` type. `Tree.from(request)` and
`TreeUtils.buildDescriptor(request)` accept the same new interface.

The old array-based `TreeCreateParams`, `Tree.create(entries)`,
`Tree.from(legacyInput)`, and `TreeUtils.buildDescriptor(entries)` are deprecated
but remain available. Existing Ecrecover and Setter integrations can keep using
them without changing their roots, proofs, or payloads. Their removal requires a
future major release after the deprecation period; they are not removed in this PR.

An untagged `Tree<undefined>` is still accepted by both deprecated `*Utils` APIs.
The original `TreeLike`, `TreeInput`, and `RatifierTreeInput` types retain their
untagged shapes, so existing wrapper functions continue to compile.
`TypedRatifierTreeInput<K>` is retained as a deprecated compatibility type.
The new ratifier requests require a tagged `TreeSnapshot<K>` (also satisfied by
`Tree<K>`), so erasing the route to a legacy annotation cannot bypass their static
checks. Both APIs continue to check route tags at runtime.

Existing Price/Rate descriptors, `buildDescriptor` methods, and raw ratifier
inputs remain supported. New request types are available through
`@morpho-org/morpho-sdk/midnight/entities`; the `/entities` facade exports them with
`Midnight`-qualified names, such as `MidnightEcrecoverTreeCreateRequest`.

## Ratifier names

Use `EcrecoverRatifier`, `SetterRatifier`, `PriceRatifierV1`, `RateRatifierV1`, and
`Ratifier` from `@morpho-org/midnight-sdk` or
`@morpho-org/morpho-sdk/midnight/utils`. The general `/utils` facade exposes the
corresponding `Midnight`-prefixed names, such as `MidnightRateRatifierV1`.

`PriceRatifierV1Utils`, `RateRatifierV1Utils`, and `RatifierUtils` remain deprecated
aliases to their canonical namespaces.

Ecrecover and Setter maintain two APIs side by side:

| API | Accepted tree input | Status |
| --- | --- | --- |
| `EcrecoverRatifierUtils` / `SetterRatifierUtils` | Legacy offers, groups, untagged trees and descriptors | Deprecated, preserved |
| `EcrecoverRatifier` / `SetterRatifier` | Matching tagged tree or `TreeSnapshot` | New API |

The tree-consuming methods (`typedData`, `digest`, `sign`, `ratifierData`, and
`ratify`, as applicable) have independent `*Request` types in the new API. The
original `*Params` types remain available for legacy integrations. Stateless
codecs and proof-verification methods that do not consume a tree are shared.
The APIs share their signing and encoding implementation, so migration does not
change signature or payload bytes.

```ts
import {
  Tree, SetterRatifier, SetterRatifierUtils, type GroupInput,
} from "@morpho-org/midnight-sdk";

function publish(entries: readonly GroupInput[]) {
  // Legacy path remains valid after its root is approved onchain.
  const legacyItems = SetterRatifierUtils.ratify({ tree: Tree.create(entries) });
  // New path requires an explicitly tagged tree, with the same approved root.
  const tree = Tree.create({ type: "setter", entries });
  const items = SetterRatifier.ratify({ tree });
  return { legacyItems, items };
}
```

Changing an Ecrecover or Setter import also requires moving to a matching tagged
tree. Their new request types are exported through the `/midnight/types` facade
and with `Midnight` prefixes through `/types`.
