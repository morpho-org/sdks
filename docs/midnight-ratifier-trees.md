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
taker and its own type hash. Group normalization and padding retain their existing
route-specific semantics, so existing roots and proofs remain unchanged.

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

## Existing integrations

`Tree.create(entries)` remains supported, but is deprecated. It returns an
untagged `Tree<undefined>` accepted by both Ecrecover and Setter. Replace it with
`Tree.create({ type: "ecrecover", entries })` or the Setter equivalent when the
route is known. There is no silent default to either route.

Existing Price/Rate descriptors, `buildDescriptor` methods, and raw ratifier
inputs remain supported. New descriptor types are available through
`@morpho-org/morpho-sdk/midnight/entities`; the `/entities` facade exports them with
`Midnight`-qualified names, including `MidnightAnyTree` and `MidnightTreeSnapshot`.

The original `TreeLike`, `TreeInput`, and `RatifierTreeInput` types remain untagged.
Existing wrappers accepting these types can still call either standard ratifier.
`TypedRatifierTreeInput<K>` adds the matching tagged-tree alternative while keeping
legacy inputs valid. Price/Rate descriptor interfaces also retain their original
untagged shapes; their input unions accept the corresponding tagged snapshots.

An explicit annotation with a legacy type erases compile-time route information.
For new route-aware wrappers, retain `Tree<"setter">` or
`TypedRatifierTreeInput<"setter">` (and the Ecrecover equivalent). Ratifier utilities
check runtime tags even when a legacy annotation has erased their static type.

## Ratifier names

Use `EcrecoverRatifier`, `SetterRatifier`, `PriceRatifierV1`, `RateRatifierV1`, and
`Ratifier` from `@morpho-org/midnight-sdk` or
`@morpho-org/morpho-sdk/midnight/utils`. The general `/utils` facade exposes the
corresponding `Midnight`-prefixed names, such as `MidnightRateRatifierV1`.

The previous `*Utils` exports remain available as deprecated aliases to the same
namespace objects. Existing imports and calls continue to work; changing the
import name is optional. Implementation filenames now match the canonical names.
