// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NftFactoryRegistry} from "../src/core/NftFactoryRegistry.sol";

contract NftFactoryRegistryTest is Test {
    NftFactoryRegistry internal registry;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0xBEEF);
    address internal factory = address(0xFAc7);
    address internal creator = address(0xCAFE);

    function setUp() external {
        vm.prank(admin);
        registry = new NftFactoryRegistry(admin, treasury);
    }

    function testAuthorizedFactoryCanRegisterCreator() external {
        vm.prank(admin);
        registry.setFactoryAuthorization(factory, true);

        vm.prank(factory);
        registry.registerCreatorContract(creator, address(0x1111), "alice", "ERC721", true);

        NftFactoryRegistry.CreatorRecord[] memory records = registry.creatorContracts(creator);
        assertEq(records.length, 1);
        assertEq(records[0].contractAddress, address(0x1111));
    }

    function testUnauthorizedFactoryReverts() external {
        vm.prank(address(0x4444));
        vm.expectRevert(NftFactoryRegistry.NotAuthorizedFactory.selector);
        registry.registerCreatorContract(creator, address(0x1111), "alice", "ERC721", true);
    }
}
