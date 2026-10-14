// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IMidnightAdapter} from "./interfaces/IMidnightAdapter.sol";
import {IMidnightAdapterFactory} from "./interfaces/IMidnightAdapterFactory.sol";
import {VaultV2MidnightAdapterQuery, VaultV2MidnightAdapterResponse} from "./VaultV2MidnightAdapterQuery.sol";

error UnknownOfFactory(address factory, address adapter);

contract GetVaultV2MidnightAdapter {
    function query(IMidnightAdapter adapter, IMidnightAdapterFactory factory)
        external
        view
        returns (VaultV2MidnightAdapterResponse memory)
    {
        if (!factory.isMidnightAdapter(address(adapter))) {
            revert UnknownOfFactory(address(factory), address(adapter));
        }

        return VaultV2MidnightAdapterQuery.query(adapter);
    }
}
