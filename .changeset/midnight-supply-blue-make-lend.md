---
"@morpho-org/morpho-sdk": minor
"@morpho-org/midnight-sdk": minor
---

Add `client.morpho.midnight(chainId).supplyBlueMakeLend`: one MidnightBundlesV2 transaction parks loan assets in a Morpho Blue market for the maker's `BlueBuyCallback` and publishes lend offers funded by it, optionally cancelling replaced groups. Offers must use the derived callback and `abi.encode(blueMarket)` as callback data; Blue markets with no supply are rejected. `midnightCancelAndMake` accepts `publication.blueSupply`. New exports: `blueBuyCallbackFactoryAbi` (`midnightBlueBuyCallbackFactoryAbi` from `@morpho-org/morpho-sdk`), `MidnightSupplyBlueMakeLendParams`, `MidnightBlueSupply`, `MidnightOfferCallbackMismatchError`, `MidnightOfferCallbackDataMismatchError`, `EmptyBlueParkingMarketError`.
