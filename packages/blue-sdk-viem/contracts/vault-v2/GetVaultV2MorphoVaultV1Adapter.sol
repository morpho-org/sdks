// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMorphoVaultV1Adapter} from "./interfaces/IMorphoVaultV1Adapter.sol";
import {IMorphoVaultV1AdapterFactory} from "./interfaces/IMorphoVaultV1AdapterFactory.sol";

struct VaultV2MorphoVaultV1AdapterResponse {
    address morphoVaultV1;
    address parentVault;
    address skimRecipient;
}

error UnknownOfFactory(address factory, address adapter);

contract GetVaultV2MorphoVaultV1Adapter {
    function query(IMorphoVaultV1Adapter adapter, IMorphoVaultV1AdapterFactory factory)
        external
        view
        returns (VaultV2MorphoVaultV1AdapterResponse memory res)
    {
        if (!factory.isMorphoVaultV1Adapter(address(adapter))) {
            revert UnknownOfFactory(address(factory), address(adapter));
        }

        res.morphoVaultV1 = adapter.morphoVaultV1();
        res.parentVault = adapter.parentVault();
        res.skimRecipient = adapter.skimRecipient();
    }
}
