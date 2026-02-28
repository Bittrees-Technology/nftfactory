// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SharedMint721} from "../src/token/SharedMint721.sol";
import {IERC721Receiver} from "../src/token/SharedMint721.sol";
import {SubnameRegistrar} from "../src/core/SubnameRegistrar.sol";

/// @dev A minimal ERC-721 receiver that accepts all tokens.
contract ERC721ReceiverOk {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}

/// @dev A contract that explicitly rejects ERC-721 tokens.
contract ERC721ReceiverReject {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return bytes4(0xdeadbeef);
    }
}

/// @dev A contract that has no ERC-721 receiver hook (simulates a naive contract wallet).
contract ERC721ReceiverNone {}

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

    // ── ERC-165 ───────────────────────────────────────────────────────────────

    function testSupportsInterfaceERC165() external view {
        assertTrue(nft.supportsInterface(0x01ffc9a7));
    }

    function testSupportsInterfaceERC721() external view {
        assertTrue(nft.supportsInterface(0x80ac58cd));
    }

    function testSupportsInterfaceERC721Metadata() external view {
        assertTrue(nft.supportsInterface(0x5b5e139f));
    }

    function testSupportsInterfaceReturnsFalseForUnknown() external view {
        assertFalse(nft.supportsInterface(0xdeadbeef));
    }

    // ── Publish / Mint ────────────────────────────────────────────────────────

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

    function testPublishEmitsTransferFromZero() external {
        vm.prank(creator);
        vm.expectEmit(true, true, true, true);
        emit SharedMint721.Transfer(address(0), creator, 1);
        nft.publish("", "ipfs://test");
    }

    // ── ownerOf ───────────────────────────────────────────────────────────────

    function testOwnerOfRevertsForNonexistentToken() external {
        vm.expectRevert(SharedMint721.NonexistentToken.selector);
        nft.ownerOf(999);
    }

    // ── approve / getApproved ─────────────────────────────────────────────────

    function testApproveGrantsSingleTokenApproval() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(creator);
        nft.approve(other, tokenId);

        assertEq(nft.getApproved(tokenId), other);
    }

    function testApproveEmitsApprovalEvent() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(creator);
        vm.expectEmit(true, true, true, true);
        emit SharedMint721.Approval(creator, other, tokenId);
        nft.approve(other, tokenId);
    }

    function testApproveRevertsIfCallerIsNotOwnerOrOperator() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(other);
        vm.expectRevert(SharedMint721.Unauthorized.selector);
        nft.approve(other, tokenId);
    }

    function testApprovedOperatorCanSetApprovalOnBehalfOfOwner() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(creator);
        nft.setApprovalForAll(other, true);

        address thirdParty = address(0x1234);
        vm.prank(other);
        nft.approve(thirdParty, tokenId);

        assertEq(nft.getApproved(tokenId), thirdParty);
    }

    function testApprovalClearedOnTransfer() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(creator);
        nft.approve(other, tokenId);
        assertEq(nft.getApproved(tokenId), other);

        vm.prank(creator);
        nft.transferFrom(creator, other, tokenId);

        assertEq(nft.getApproved(tokenId), address(0));
    }

    // ── transferFrom ─────────────────────────────────────────────────────────

    function testTransferFrom() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(creator);
        nft.transferFrom(creator, other, tokenId);

        assertEq(nft.ownerOf(tokenId), other);
        assertEq(nft.balanceOf(creator), 0);
        assertEq(nft.balanceOf(other), 1);
    }

    function testTransferFromByApprovedAddress() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(creator);
        nft.approve(other, tokenId);

        vm.prank(other);
        nft.transferFrom(creator, other, tokenId);

        assertEq(nft.ownerOf(tokenId), other);
    }

    function testTransferFromRevertsIfCallerUnauthorized() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(other);
        vm.expectRevert(SharedMint721.Unauthorized.selector);
        nft.transferFrom(creator, other, tokenId);
    }

    // ── safeTransferFrom ──────────────────────────────────────────────────────

    function testSafeTransferFromToEOA() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(creator);
        nft.safeTransferFrom(creator, other, tokenId);

        assertEq(nft.ownerOf(tokenId), other);
        assertEq(nft.balanceOf(creator), 0);
        assertEq(nft.balanceOf(other), 1);
    }

    function testSafeTransferFromToReceiverContract() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        ERC721ReceiverOk receiver = new ERC721ReceiverOk();
        vm.prank(creator);
        nft.safeTransferFrom(creator, address(receiver), tokenId);

        assertEq(nft.ownerOf(tokenId), address(receiver));
    }

    function testSafeTransferFromRevertsIfContractRejectsToken() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        ERC721ReceiverReject rejecter = new ERC721ReceiverReject();
        vm.prank(creator);
        vm.expectRevert(SharedMint721.InvalidRecipient.selector);
        nft.safeTransferFrom(creator, address(rejecter), tokenId);
    }

    function testSafeTransferFromRevertsIfContractHasNoHook() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        ERC721ReceiverNone noHook = new ERC721ReceiverNone();
        vm.prank(creator);
        vm.expectRevert(SharedMint721.InvalidRecipient.selector);
        nft.safeTransferFrom(creator, address(noHook), tokenId);
    }

    function testSafeTransferFromWithDataToReceiverContract() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        ERC721ReceiverOk receiver = new ERC721ReceiverOk();
        vm.prank(creator);
        nft.safeTransferFrom(creator, address(receiver), tokenId, "extra data");

        assertEq(nft.ownerOf(tokenId), address(receiver));
    }

    function testTransferRevertsIfNotOwner() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(other);
        vm.expectRevert(SharedMint721.Unauthorized.selector);
        nft.safeTransferFrom(creator, other, tokenId);
    }

    function testApprovedOperatorCanTransfer() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(creator);
        nft.setApprovalForAll(other, true);

        vm.prank(other);
        nft.safeTransferFrom(creator, other, tokenId);

        assertEq(nft.ownerOf(tokenId), other);
        assertEq(nft.balanceOf(creator), 0);
        assertEq(nft.balanceOf(other), 1);
    }

    function testTransferToZeroAddressReverts() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", "ipfs://test");

        vm.prank(creator);
        vm.expectRevert(SharedMint721.InvalidRecipient.selector);
        nft.safeTransferFrom(creator, address(0), tokenId);
    }

    // ── setApprovalForAll ─────────────────────────────────────────────────────

    function testSetApprovalForAll() external {
        vm.prank(creator);
        nft.setApprovalForAll(other, true);
        assertTrue(nft.isApprovedForAll(creator, other));

        vm.prank(creator);
        nft.setApprovalForAll(other, false);
        assertFalse(nft.isApprovedForAll(creator, other));
    }

    // ── ENS subname integration ───────────────────────────────────────────────

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

    // ── Metadata ──────────────────────────────────────────────────────────────

    function testNameAndSymbol() external view {
        assertEq(nft.name(), "SharedNFT");
        assertEq(nft.symbol(), "SNFT");
    }
}
