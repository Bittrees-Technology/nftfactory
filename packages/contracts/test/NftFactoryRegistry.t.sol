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
    address internal otherCreator = address(0xCAFF);

    function setUp() external {
        vm.prank(admin);
        registry = new NftFactoryRegistry(admin, treasury);
    }

    function testConstructorRevertsForZeroTreasury() external {
        vm.prank(admin);
        vm.expectRevert(NftFactoryRegistry.InvalidTreasury.selector);
        new NftFactoryRegistry(admin, address(0));
    }

    function testSetTreasuryRevertsForZeroAddress() external {
        vm.prank(admin);
        vm.expectRevert(NftFactoryRegistry.InvalidTreasury.selector);
        registry.setTreasury(address(0));
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

    function testDuplicateCreatorContractRegistrationReverts() external {
        vm.prank(admin);
        registry.setFactoryAuthorization(factory, true);

        vm.prank(factory);
        registry.registerCreatorContract(creator, address(0x1111), "alice", "ERC721", true);

        vm.prank(factory);
        vm.expectRevert(NftFactoryRegistry.CreatorContractAlreadyRegistered.selector);
        registry.registerCreatorContract(creator, address(0x1111), "alice", "ERC721", true);
    }

    function testRegisterCreatorContractRevertsForZeroCreator() external {
        vm.prank(admin);
        registry.setFactoryAuthorization(factory, true);

        vm.prank(factory);
        vm.expectRevert(NftFactoryRegistry.InvalidCreator.selector);
        registry.registerCreatorContract(address(0), address(0x1111), "alice", "ERC721", true);
    }

    function testRegisterCreatorContractRevertsForZeroContract() external {
        vm.prank(admin);
        registry.setFactoryAuthorization(factory, true);

        vm.prank(factory);
        vm.expectRevert(NftFactoryRegistry.InvalidCreatorContract.selector);
        registry.registerCreatorContract(creator, address(0), "alice", "ERC721", true);
    }

    function testRegisterCreatorContractRevertsForInvalidStandard() external {
        vm.prank(admin);
        registry.setFactoryAuthorization(factory, true);

        vm.prank(factory);
        vm.expectRevert(NftFactoryRegistry.InvalidStandard.selector);
        registry.registerCreatorContract(creator, address(0x1111), "alice", "erc721", true);
    }

    function testRegisterCreatorContractRevertsForDifferentCreatorOnSameContract() external {
        vm.prank(admin);
        registry.setFactoryAuthorization(factory, true);

        vm.prank(factory);
        registry.registerCreatorContract(creator, address(0x1111), "alice", "ERC721", true);

        vm.prank(factory);
        vm.expectRevert(NftFactoryRegistry.CreatorContractAssignedToDifferentCreator.selector);
        registry.registerCreatorContract(otherCreator, address(0x1111), "bob", "ERC721", true);
    }
}
