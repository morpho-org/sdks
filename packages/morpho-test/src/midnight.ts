/** Shared Midnight fork fixtures; requires the optional midnight-sdk peer. */
export {
  createE2eMidnightMarket,
  E2E_MIDNIGHT_WALLETS,
  type E2eMidnightMarket,
  E2eMidnightMarketRequiredError,
  type E2eMidnightWallet,
  type E2eTakeableOffer,
  fundE2eMidnightWallets,
  getE2eTakeableOffers,
  postE2eSetterTree,
} from "./e2e/midnight.js";
