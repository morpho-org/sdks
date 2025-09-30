// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMorphoVaultV1Adapter} from "./interfaces/IMorphoVaultV1Adapter.sol";

struct VaultV2MorphoVaultV1AdapterResponse {
    address morphoVaultV1;
    address parentVault;
    bytes32 adapterId;
    address skimRecipient;
}

contract GetVaultV2MorphoVaultV1Adapter {
    function query(IMorphoVaultV1Adapter adapter)
        external
        view
        returns (VaultV2MorphoVaultV1AdapterResponse memory res)
    {
        res.morphoVaultV1 = adapter.morphoVaultV1();
        res.parentVault = adapter.parentVault();
        res.adapterId = adapter.adapterId();
        res.skimRecipient = adapter.skimRecipient();
    }
}
