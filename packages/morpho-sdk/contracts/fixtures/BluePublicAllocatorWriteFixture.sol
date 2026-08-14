// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Morpho Association
pragma solidity ^0.8.0;

struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

struct VaultData {
    bool canPullFromIdle;
    uint64 penalty;
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 assets) external returns (bool);
}

interface IVaultV2 {
    function isAllocator(address account) external view returns (bool);
    function allocation(bytes32 id) external view returns (uint256);
    function allocate(address adapter, bytes memory data, uint256 assets) external;
    function deallocate(address adapter, bytes memory data, uint256 assets) external;
}

/// @dev Test-only fixture pinned to the BluePublicAllocator write ordering and checks.
contract BluePublicAllocatorWriteFixture {
    uint256 internal constant WAD = 1e18;

    mapping(address vault => mapping(bytes32 id => uint256)) public absoluteCap;
    mapping(address vault => mapping(bytes32 id => bool)) public canPullFromMarket;
    mapping(address vault => mapping(address adapter => bool)) public isActiveAdapter;
    mapping(address vault => VaultData) public vaultData;

    function setIsActiveAdapter(address vault, address adapter, bool value) external {
        require(IVaultV2(vault).isAllocator(msg.sender), "unauthorized");
        isActiveAdapter[vault][adapter] = value;
    }

    function setAbsoluteCap(address vault, address adapter, MarketParams calldata marketParams, uint256 value)
        external
    {
        require(IVaultV2(vault).isAllocator(msg.sender), "unauthorized");
        absoluteCap[vault][vaultBlueId(adapter, marketParams)] = value;
    }

    function setCanPullFromMarket(address vault, address adapter, MarketParams calldata marketParams, bool value)
        external
    {
        require(IVaultV2(vault).isAllocator(msg.sender), "unauthorized");
        canPullFromMarket[vault][vaultBlueId(adapter, marketParams)] = value;
    }

    function setCanPullFromIdle(address vault, bool value) external {
        require(IVaultV2(vault).isAllocator(msg.sender), "unauthorized");
        vaultData[vault].canPullFromIdle = value;
    }

    function setPenalty(address vault, uint64 value) external {
        require(IVaultV2(vault).isAllocator(msg.sender), "unauthorized");
        require(value <= WAD, "penalty too high");
        vaultData[vault].penalty = value;
    }

    function reallocate(
        address vault,
        address deallocateAdapter,
        MarketParams calldata deallocateMarketParams,
        address allocateAdapter,
        MarketParams calldata allocateMarketParams,
        uint128 assets,
        uint64 penalty
    ) external {
        require(vaultData[vault].penalty == penalty, "incorrect penalty");
        transferPenalty(allocateMarketParams.loanToken, msg.sender, vault, assets, penalty);
        require(isActiveAdapter[vault][deallocateAdapter], "inactive source adapter");
        require(isActiveAdapter[vault][allocateAdapter], "inactive target adapter");

        bytes32 deallocateId = vaultBlueId(deallocateAdapter, deallocateMarketParams);
        require(canPullFromMarket[vault][deallocateId], "cannot pull from market");
        bytes32 allocateId = vaultBlueId(allocateAdapter, allocateMarketParams);
        require(absoluteCap[vault][allocateId] > 0, "zero absolute cap");

        IVaultV2(vault).deallocate(deallocateAdapter, abi.encode(deallocateMarketParams), assets);
        IVaultV2(vault).allocate(allocateAdapter, abi.encode(allocateMarketParams), assets);

        require(IVaultV2(vault).allocation(allocateId) <= absoluteCap[vault][allocateId], "absolute cap exceeded");
    }

    function allocateFromIdle(
        address vault,
        address adapter,
        MarketParams calldata marketParams,
        uint128 assets,
        uint64 penalty
    ) external {
        require(vaultData[vault].penalty == penalty, "incorrect penalty");
        transferPenalty(marketParams.loanToken, msg.sender, vault, assets, penalty);
        require(isActiveAdapter[vault][adapter], "inactive adapter");
        require(vaultData[vault].canPullFromIdle, "cannot pull from idle");

        bytes32 allocateId = vaultBlueId(adapter, marketParams);
        require(absoluteCap[vault][allocateId] > 0, "zero absolute cap");
        IVaultV2(vault).allocate(adapter, abi.encode(marketParams), assets);
        require(IVaultV2(vault).allocation(allocateId) <= absoluteCap[vault][allocateId], "absolute cap exceeded");
    }

    function transferPenalty(address token, address from, address vault, uint256 assets, uint256 penalty) internal {
        uint256 penaltyAssets = assets * penalty == 0 ? 0 : (assets * penalty - 1) / WAD + 1;
        if (penaltyAssets == 0) return;

        (bool success, bytes memory returnData) =
            token.call(abi.encodeCall(IERC20.transferFrom, (from, vault, penaltyAssets)));
        require(success && (returnData.length == 0 || abi.decode(returnData, (bool))), "transfer failed");
    }

    function vaultBlueId(address adapter, MarketParams calldata marketParams) internal pure returns (bytes32) {
        return keccak256(abi.encode("this/marketParams", adapter, marketParams));
    }
}
