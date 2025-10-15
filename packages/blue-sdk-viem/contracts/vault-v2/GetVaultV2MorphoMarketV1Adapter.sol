// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMorphoMarketV1Adapter} from "./interfaces/IMorphoMarketV1Adapter.sol";

struct VaultV2MorphoMarketV1AdapterResponse {
    address morpho;
    address parentVault;
    bytes32 adapterId;
    address skimRecipient;
}

contract GetVaultV2MorphoMarketV1Adapter {
    function query(IMorphoMarketV1Adapter adapter)
        external
        view
        returns (VaultV2MorphoMarketV1AdapterResponse memory res)
    {
        res.morpho = adapter.morpho();
        res.parentVault = adapter.parentVault();
        res.adapterId = adapter.adapterId();
        res.skimRecipient = adapter.skimRecipient();
    }
}
