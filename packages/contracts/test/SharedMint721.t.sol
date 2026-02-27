// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SharedMint721} from "../src/token/SharedMint721.sol";
import {SubnameRegistrar} from "../src/core/SubnameRegistrar.sol";

contract SharedMint721Test is Test {
    SharedMint721 internal nft;
    SubnameRegistrar internal registrar;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0xBEEF);
    address internal creator = address(0xCAFE);
    address internal other = address(0xBAAD);

    function setUp() external {
        vm.startPrank(admin);
        registrar = new SubnameRegistrar(admin, treasury);
        nft = new SharedMint721(admin, address(registrar), "SharedNFT", "SNFT");
        registrar.setAuthorizedMinter(address(nft), true);
        vm.stopPrank();

        vm.deal(creator, 1 ether);
    }

    function testPublishMintsToken() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        assertEq(tokenId, 1);
        assertEq(nft.ownerOf(tokenId), creator);
        assertEq(nft.balanceOf(creator), 1);
        assertEq(nft.tokenURI(tokenId), "ipfs://test");
    }

    function testPublishIncrementsTotalSupply() external {
        assertEq(nft.totalSupply(), 0);

        vm.prank(creator);
        nft.publish("", "ipfs://1");
        assertEq(nft.totalSupply(), 1);

        vm.prank(creator);
        nft.publish("", "ipfs://2");
        assertEq(nft.totalSupply(), 2);
    }

    function testTransfer() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(creator);
        nft.safeTransferFrom(creator, other, tokenId);

        assertEq(nft.ownerOf(tokenId), other);
        assertEq(nft.balanceOf(creator), 0);
        assertEq(nft.balanceOf(other), 1);
    }

    function testTransferRevertsIfNotOwner() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(other);
        vm.expectRevert(SharedMint721.Unauthorized.selector);
        nft.safeTransferFrom(creator, other, tokenId);
    }

    function testTransferToZeroAddressReverts() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(creator);
        vm.expectRevert(SharedMint721.InvalidRecipient.selector);
        nft.safeTransferFrom(creator, address(0), tokenId);
    }

    function testPublishWithSubnameRecordsMint() external {
        vm.prank(creator);
        registrar.registerSubname{value: 0.001 ether}("alice");

        vm.prank(creator);
        nft.publish("alice", "ipfs://test");

        bytes32 key = keccak256(bytes("alice"));
        (,, uint256 mintedCount,) = registrar.subnames(key);
        assertEq(mintedCount, 1);
    }

    function testPublishWithInvalidSubnameStillSucceeds() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("nonexistent", "ipfs://test");

        assertEq(nft.ownerOf(tokenId), creator);
    }

    function testNameAndSymbol() external view {
        assertEq(nft.name(), "SharedNFT");
        assertEq(nft.symbol(), "SNFT");
    }
}
