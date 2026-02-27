// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NftFactoryRegistry} from "../src/core/NftFactoryRegistry.sol";
import {CreatorFactory} from "../src/core/CreatorFactory.sol";
import {CreatorCollection721} from "../src/token/CreatorCollection721.sol";
import {CreatorCollection1155} from "../src/token/CreatorCollection1155.sol";

contract CreatorFactoryTest is Test {
    NftFactoryRegistry internal registry;
    CreatorFactory internal factory;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0xBEEF);
    address internal creator = address(0xCAFE);

    function setUp() external {
        vm.startPrank(admin);
        registry = new NftFactoryRegistry(admin, treasury);
        factory = new CreatorFactory(admin, address(registry));
        registry.setFactoryAuthorization(address(factory), true);

        // Deploy implementation contracts
        CreatorCollection721 impl721 = new CreatorCollection721();
        CreatorCollection1155 impl1155 = new CreatorCollection1155();
        factory.setImplementations(address(impl721), address(impl1155));
        vm.stopPrank();
    }

    function testDeploy721Collection() external {
        vm.prank(creator);
        address deployed = factory.deployCollection(
            CreatorFactory.DeployRequest({
                standard: "ERC721",
                creator: creator,
                tokenName: "MyNFT",
                tokenSymbol: "MNFT",
                ensSubname: "alice",
                defaultRoyaltyReceiver: creator,
                defaultRoyaltyBps: 500
            })
        );

        assertTrue(deployed != address(0));

        // Verify registered in registry
        NftFactoryRegistry.CreatorRecord[] memory records = registry.creatorContracts(creator);
        assertEq(records.length, 1);
        assertEq(records[0].contractAddress, deployed);
        assertEq(records[0].standard, "ERC721");
        assertEq(records[0].ensSubname, "alice");
    }

    function testDeploy1155Collection() external {
        vm.prank(creator);
        address deployed = factory.deployCollection(
            CreatorFactory.DeployRequest({
                standard: "ERC1155",
                creator: creator,
                tokenName: "MultiNFT",
                tokenSymbol: "MULTI",
                ensSubname: "bob",
                defaultRoyaltyReceiver: creator,
                defaultRoyaltyBps: 250
            })
        );

        assertTrue(deployed != address(0));

        NftFactoryRegistry.CreatorRecord[] memory records = registry.creatorContracts(creator);
        assertEq(records.length, 1);
        assertEq(records[0].standard, "ERC1155");
    }

    function testUnknownStandardReverts() external {
        vm.prank(creator);
        vm.expectRevert(CreatorFactory.UnknownStandard.selector);
        factory.deployCollection(
            CreatorFactory.DeployRequest({
                standard: "ERC999",
                creator: creator,
                tokenName: "Bad",
                tokenSymbol: "BAD",
                ensSubname: "",
                defaultRoyaltyReceiver: creator,
                defaultRoyaltyBps: 0
            })
        );
    }

    function testUnauthorizedDeployerReverts() external {
        address other = address(0xBAAD);
        vm.prank(other);
        vm.expectRevert("UNAUTHORIZED_DEPLOYER");
        factory.deployCollection(
            CreatorFactory.DeployRequest({
                standard: "ERC721",
                creator: creator,
                tokenName: "Test",
                tokenSymbol: "TST",
                ensSubname: "",
                defaultRoyaltyReceiver: creator,
                defaultRoyaltyBps: 0
            })
        );
    }

    function testAdminCanDeployOnBehalfOfCreator() external {
        vm.prank(admin);
        address deployed = factory.deployCollection(
            CreatorFactory.DeployRequest({
                standard: "ERC721",
                creator: creator,
                tokenName: "AdminDeploy",
                tokenSymbol: "AD",
                ensSubname: "admin-deploy",
                defaultRoyaltyReceiver: creator,
                defaultRoyaltyBps: 100
            })
        );

        assertTrue(deployed != address(0));
    }

    function testMissingImplementationReverts() external {
        vm.prank(admin);
        factory.setImplementations(address(0), address(0));

        vm.prank(creator);
        vm.expectRevert(CreatorFactory.MissingImplementation.selector);
        factory.deployCollection(
            CreatorFactory.DeployRequest({
                standard: "ERC721",
                creator: creator,
                tokenName: "Test",
                tokenSymbol: "TST",
                ensSubname: "",
                defaultRoyaltyReceiver: creator,
                defaultRoyaltyBps: 0
            })
        );
    }

    function testDeployedCollectionIsOwnedByCreator() external {
        vm.prank(creator);
        address deployed = factory.deployCollection(
            CreatorFactory.DeployRequest({
                standard: "ERC721",
                creator: creator,
                tokenName: "OwnedNFT",
                tokenSymbol: "OWN",
                ensSubname: "",
                defaultRoyaltyReceiver: creator,
                defaultRoyaltyBps: 0
            })
        );

        assertEq(CreatorCollection721(deployed).owner(), creator);
    }
}
