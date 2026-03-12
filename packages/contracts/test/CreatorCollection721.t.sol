// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreatorCollection721} from "../src/token/CreatorCollection721.sol";

contract CreatorCollection721Test is Test {
    CreatorCollection721 internal collection;

    address internal creator = address(0xCAFE);
    address internal holder = address(0xBEEF);
    address internal nextOwner = address(0xA11CE);

    function setUp() external {
        collection = new CreatorCollection721();
        collection.initialize(creator, "Creator 721", "C721", "studio", creator, 500);
    }

    function testPublishMintsSequentialToken() external {
        vm.prank(creator);
        uint256 tokenId = collection.publish(holder, "ipfs://one", true);

        assertEq(tokenId, 1);
        assertEq(collection.ownerOf(tokenId), holder);
        assertEq(collection.tokenURI(tokenId), "ipfs://one");
        assertTrue(collection.metadataLocked(tokenId));
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
