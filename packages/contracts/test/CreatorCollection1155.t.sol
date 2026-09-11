import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreatorCollection1155} from "../src/token/CreatorCollection1155.sol";

contract CreatorCollection1155Test is Test {
    CreatorCollection1155 internal collection;

    address internal creator = address(0xCAFE);
    address internal holder = address(0xBEEF);
    address internal nextOwner = address(0xA11CE);

    function setUp() external {
        collection = CreatorCollection1155(address(new ERC1967Proxy(address(new CreatorCollection1155()), "")));
        collection.initialize(creator, "Creator Multi", "CM", "studio", creator, 500);
    }

    function testPublishMintsNewTokenId() external {
        vm.prank(creator);
        collection.publish(holder, 1, 3, "ipfs://one", true);

        assertEq(collection.balanceOf(holder, 1), 3);
        assertEq(collection.uri(1), "ipfs://one");
        assertTrue(collection.tokenExists(1));
        assertTrue(collection.metadataLocked(1));
    }

    function testPublishRevertsForZeroAmount() external {
        vm.prank(creator);
        vm.expectRevert(CreatorCollection1155.InvalidAmount.selector);
        collection.publish(holder, 1, 0, "ipfs://one", false);
    }

    function testPublishRevertsWhenTokenIdAlreadyMinted() external {
        vm.prank(creator);
        collection.publish(holder, 7, 2, "ipfs://one", true);

        vm.prank(creator);
        vm.expectRevert(CreatorCollection1155.TokenAlreadyMinted.selector);
        collection.publish(holder, 7, 1, "ipfs://two", false);
    }

    function testTransferOwnershipRequiresAcceptance() external {
        vm.prank(creator);
        collection.transferOwnership(nextOwner);

        assertEq(collection.owner(), creator);
        assertEq(collection.pendingOwner(), nextOwner);

        vm.prank(nextOwner);
        collection.acceptOwnership();

        assertEq(collection.owner(), nextOwner);
        assertEq(collection.pendingOwner(), address(0));
    }

    function testOnlyPendingOwnerCanAcceptOwnership() external {
        vm.prank(creator);
        collection.transferOwnership(nextOwner);

        vm.prank(holder);
        vm.expectRevert();
        collection.acceptOwnership();
    }

    function testOwnerCanCancelPendingTransfer() external {
        vm.prank(creator);
        collection.transferOwnership(nextOwner);

        vm.prank(creator);
        collection.transferOwnership(address(0));

        assertEq(collection.owner(), creator);
        assertEq(collection.pendingOwner(), address(0));
    }
}
