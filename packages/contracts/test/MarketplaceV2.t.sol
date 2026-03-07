// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NftFactoryRegistry} from "../src/core/NftFactoryRegistry.sol";
import {MarketplaceV2} from "../src/core/MarketplaceV2.sol";

contract Mock721V2 {
    mapping(uint256 => address) public ownerOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    function mint(address to, uint256 tokenId) external {
        ownerOf[tokenId] = to;
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "NOT_OWNER");
        require(msg.sender == from || isApprovedForAll[from][msg.sender], "NOT_APPROVED");
        ownerOf[tokenId] = to;
    }
}

contract Mock1155V2 {
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => mapping(address => uint256)) internal _balanceOf;

    function mint(address to, uint256 id, uint256 amount) external {
        _balanceOf[id][to] += amount;
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
    }

    function balanceOf(address account, uint256 id) external view returns (uint256) {
        return _balanceOf[id][account];
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata) external {
        require(msg.sender == from || isApprovedForAll[from][msg.sender], "NOT_APPROVED");
        require(_balanceOf[id][from] >= amount, "INSUFFICIENT");
        _balanceOf[id][from] -= amount;
        _balanceOf[id][to] += amount;
    }
}

contract MockERC20V2 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "INSUFFICIENT_BALANCE");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "INSUFFICIENT_BALANCE");
        require(allowance[from][msg.sender] >= amount, "INSUFFICIENT_ALLOWANCE");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MarketplaceV2Test is Test {
    NftFactoryRegistry internal registry;
    MarketplaceV2 internal marketplace;
    Mock721V2 internal nft721;
    Mock1155V2 internal nft1155;
    MockERC20V2 internal erc20;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0xBEEF);
    address internal seller = address(0xCAFE);
    address internal buyer = address(0xBAAD);

    function setUp() external {
        vm.prank(admin);
        registry = new NftFactoryRegistry(admin, treasury);
        vm.prank(admin);
        marketplace = new MarketplaceV2(admin, address(registry));

        nft721 = new Mock721V2();
        nft1155 = new Mock1155V2();
        erc20 = new MockERC20V2();

        vm.deal(buyer, 10 ether);
    }

    function testCreateOfferEscrowsEthAndCancelRefunds() external {
        uint256 buyerBalanceBefore = buyer.balance;

        vm.prank(buyer);
        marketplace.createOffer{value: 1 ether}(address(nft721), 1, 1, "ERC721", address(0), 1 ether, 7);

        assertEq(address(marketplace).balance, 1 ether);
        assertEq(buyer.balance, buyerBalanceBefore - 1 ether);

        vm.prank(buyer);
        marketplace.cancelOffer(0);

        assertEq(address(marketplace).balance, 0);
        assertEq(buyer.balance, buyerBalanceBefore);
    }

    function testCreateOfferRevertsForSelfOfferOn721() external {
        vm.prank(buyer);
        nft721.mint(buyer, 1);

        vm.prank(buyer);
        vm.expectRevert(MarketplaceV2.SelfOffer.selector);
        marketplace.createOffer{value: 1 ether}(address(nft721), 1, 1, "ERC721", address(0), 1 ether, 7);
    }

    function testAcceptOfferSplitsProtocolFeeForEthSales() external {
        vm.prank(admin);
        registry.setProtocolFeeBps(500);

        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        vm.stopPrank();

        vm.prank(buyer);
        marketplace.createOffer{value: 1 ether}(address(nft721), 1, 1, "ERC721", address(0), 1 ether, 7);

        uint256 sellerBalanceBefore = seller.balance;
        uint256 treasuryBalanceBefore = treasury.balance;

        vm.prank(seller);
        marketplace.acceptOffer(0);

        assertEq(treasury.balance - treasuryBalanceBefore, 0.05 ether);
        assertEq(seller.balance - sellerBalanceBefore, 0.95 ether);
        assertEq(address(marketplace).balance, 0);
        assertEq(nft721.ownerOf(1), buyer);
    }

    function testCreateListingRevertsWhenActiveListingAlreadyExists() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.1 ether, 7);
        vm.expectRevert(MarketplaceV2.ExistingActiveListing.selector);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.2 ether, 7);
        vm.stopPrank();
    }

    function testAcceptOfferCancelsActiveListingAndAllowsRelistForRemaining1155() external {
        vm.startPrank(seller);
        nft1155.mint(seller, 7, 5);
        nft1155.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft1155), 7, 5, "ERC1155", address(0), 1 ether, 7);
        vm.stopPrank();

        vm.prank(buyer);
        marketplace.createOffer{value: 0.5 ether}(address(nft1155), 7, 2, "ERC1155", address(0), 0.5 ether, 7);

        vm.prank(seller);
        marketplace.acceptOffer(0);

        (,,,,,,,, bool active) = marketplace.listings(0);
        assertFalse(active);
        assertEq(nft1155.balanceOf(seller, 7), 3);
        assertEq(nft1155.balanceOf(buyer, 7), 2);

        vm.startPrank(seller);
        marketplace.createListing(address(nft1155), 7, 3, "ERC1155", address(0), 0.75 ether, 7);
        vm.stopPrank();

        (,,, uint256 relistedAmount,,,,, bool relistedActive) = marketplace.listings(1);
        assertEq(relistedAmount, 3);
        assertTrue(relistedActive);
    }

    function testAcceptOfferPaysOutEscrowedErc20() external {
        vm.prank(admin);
        registry.setProtocolFeeBps(500);

        vm.startPrank(seller);
        nft1155.mint(seller, 9, 3);
        nft1155.setApprovalForAll(address(marketplace), true);
        vm.stopPrank();

        erc20.mint(buyer, 500);
        vm.prank(buyer);
        erc20.approve(address(marketplace), 200);

        vm.prank(buyer);
        marketplace.createOffer(address(nft1155), 9, 2, "ERC1155", address(erc20), 200, 7);

        vm.prank(seller);
        marketplace.acceptOffer(0);

        assertEq(erc20.balanceOf(treasury), 10);
        assertEq(erc20.balanceOf(seller), 190);
        assertEq(erc20.balanceOf(address(marketplace)), 0);
        assertEq(erc20.balanceOf(buyer), 300);
        assertEq(nft1155.balanceOf(buyer, 9), 2);
    }

    function testAcceptOfferRevertsWhenCollectionBlocked() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        vm.stopPrank();

        vm.prank(buyer);
        marketplace.createOffer{value: 1 ether}(address(nft721), 1, 1, "ERC721", address(0), 1 ether, 7);

        vm.prank(admin);
        marketplace.setBlockedCollection(address(nft721), true);

        vm.prank(seller);
        vm.expectRevert(MarketplaceV2.Sanctioned.selector);
        marketplace.acceptOffer(0);
    }
}
