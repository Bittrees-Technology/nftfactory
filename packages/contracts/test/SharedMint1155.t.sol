// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SharedMint1155} from "../src/token/SharedMint1155.sol";
import {SubnameRegistrar} from "../src/core/SubnameRegistrar.sol";

contract SharedMint1155Test is Test {
    SharedMint1155 internal nft;
    SubnameRegistrar internal registrar;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0xBEEF);
    address internal creator = address(0xCAFE);
    address internal other = address(0xBAAD);

    function setUp() external {
        vm.startPrank(admin);
        registrar = new SubnameRegistrar(admin, treasury);
        nft = new SharedMint1155(admin, address(registrar), "SharedMulti", "SM");
        registrar.setAuthorizedMinter(address(nft), true);
        vm.stopPrank();

        vm.deal(creator, 1 ether);
    }

    function testPublishMints() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", 10, "ipfs://test");

        assertEq(tokenId, 1);
        assertEq(nft.balanceOf(tokenId, creator), 10);
        assertEq(nft.tokenURI(tokenId), "ipfs://test");
    }

    function testPublishIncrementsNextTokenId() external {
        assertEq(nft.nextTokenId(), 0);

        vm.prank(creator);
        nft.publish("", 5, "ipfs://1");
        assertEq(nft.nextTokenId(), 1);

        vm.prank(creator);
        nft.publish("", 3, "ipfs://2");
        assertEq(nft.nextTokenId(), 2);
    }

    function testTransfer() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", 10, "ipfs://test");

        vm.prank(creator);
        nft.safeTransferFrom(creator, other, tokenId, 4, "");

        assertEq(nft.balanceOf(tokenId, creator), 6);
        assertEq(nft.balanceOf(tokenId, other), 4);
    }

    function testTransferRevertsIfNotSender() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", 10, "ipfs://test");

        vm.prank(other);
        vm.expectRevert(SharedMint1155.Unauthorized.selector);
        nft.safeTransferFrom(creator, other, tokenId, 1, "");
    }

    function testApprovedOperatorCanTransfer() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", 10, "ipfs://test");

        vm.prank(creator);
        nft.setApprovalForAll(other, true);

        vm.prank(other);
        nft.safeTransferFrom(creator, other, tokenId, 4, "");

        assertEq(nft.balanceOf(tokenId, creator), 6);
        assertEq(nft.balanceOf(tokenId, other), 4);
    }

    function testTransferToZeroAddressReverts() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", 10, "ipfs://test");

        vm.prank(creator);
        vm.expectRevert(SharedMint1155.InvalidRecipient.selector);
        nft.safeTransferFrom(creator, address(0), tokenId, 1, "");
    }

    function testTransferInsufficientBalanceReverts() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", 5, "ipfs://test");

        vm.prank(creator);
        vm.expectRevert(SharedMint1155.InsufficientBalance.selector);
        nft.safeTransferFrom(creator, other, tokenId, 6, "");
    }

    function testPublishWithSubnameRecordsMint() external {
        vm.prank(creator);
        registrar.registerSubname{value: 0.001 ether}("bob");

        vm.prank(creator);
        nft.publish("bob", 5, "ipfs://test");

        bytes32 key = keccak256(bytes("bob"));
        (,, uint256 mintedCount,) = registrar.subnames(key);
        assertEq(mintedCount, 1);
    }

    function testNameAndSymbol() external view {
        assertEq(nft.name(), "SharedMulti");
        assertEq(nft.symbol(), "SM");
    }
}
