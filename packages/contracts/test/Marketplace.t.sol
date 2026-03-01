// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NftFactoryRegistry} from "../src/core/NftFactoryRegistry.sol";
import {Marketplace} from "../src/core/Marketplace.sol";

contract Mock721 {
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

contract Mock1155 {
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

contract ReentrantERC20 {
    Marketplace public marketplace;
    uint256 public targetListing;
    bool public reenterOnTransferFrom;

    constructor(address marketplaceAddress) {
        marketplace = Marketplace(marketplaceAddress);
    }

    function setReentry(uint256 listingId, bool enabled) external {
        targetListing = listingId;
        reenterOnTransferFrom = enabled;
    }

    function transferFrom(address, address, uint256) external returns (bool) {
        if (reenterOnTransferFrom) {
            reenterOnTransferFrom = false;
            try marketplace.buy(targetListing) {} catch {}
        }
        return true;
    }
}

contract MarketplaceTest is Test {
    NftFactoryRegistry internal registry;
    Marketplace internal marketplace;
    Mock721 internal nft721;
    Mock1155 internal nft1155;
    ReentrantERC20 internal reentrantToken;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0xBEEF);
    address internal seller = address(0xCAFE);
    address internal buyer = address(0xBAAD);

    function setUp() external {
        vm.prank(admin);
        registry = new NftFactoryRegistry(admin, treasury);
        vm.prank(admin);
        marketplace = new Marketplace(admin, address(registry));

        nft721 = new Mock721();
        nft1155 = new Mock1155();
        reentrantToken = new ReentrantERC20(address(marketplace));

        vm.deal(buyer, 10 ether);
    }

    function testCreateListingRevertsWithoutApproval721() external {
        vm.prank(seller);
        nft721.mint(seller, 1);

        vm.prank(seller);
        vm.expectRevert(Marketplace.NotApproved.selector);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.1 ether, 7);
    }

    function testCreateListingRevertsWithoutApproval1155() external {
        vm.prank(seller);
        nft1155.mint(seller, 7, 3);

        vm.prank(seller);
        vm.expectRevert(Marketplace.NotApproved.selector);
        marketplace.createListing(address(nft1155), 7, 2, "ERC1155", address(0), 0.1 ether, 7);
    }

    function testCreateListingRevertsWithZeroPrice() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        vm.expectRevert(Marketplace.InvalidPrice.selector);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0, 7);
        vm.stopPrank();
    }

    function testCreateListingRevertsWithZeroDuration() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        vm.expectRevert(Marketplace.InvalidDuration.selector);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.1 ether, 0);
        vm.stopPrank();
    }

    function testCreateListingRevertsWhenDurationExceedsMaximum() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        vm.expectRevert(Marketplace.InvalidDuration.selector);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.1 ether, 366);
        vm.stopPrank();
    }

    function testBuyRevertsWhenApprovalRevoked() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.1 ether, 7);
        nft721.setApprovalForAll(address(marketplace), false);
        vm.stopPrank();

        vm.prank(buyer);
        vm.expectRevert(Marketplace.NotApproved.selector);
        marketplace.buy{value: 0.1 ether}(0);

        (,,,,,,,, bool active) = marketplace.listings(0);
        assertTrue(active);
    }

    function testBuyRevertsAfterListingExpiry() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.1 ether, 1);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(buyer);
        vm.expectRevert(Marketplace.Expired.selector);
        marketplace.buy{value: 0.1 ether}(0);
    }

    function testCreateListingNormalizesStandard() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.1 ether, 7);
        vm.stopPrank();

        (,,,, string memory standard,,,,) = marketplace.listings(0);
        assertEq(standard, "ERC721");
    }

    function testCreateListingRevertsForInvalidStandard() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        vm.expectRevert(Marketplace.UnsupportedStandard.selector);
        marketplace.createListing(address(nft721), 1, 1, "erc721", address(0), 0.1 ether, 7);
        vm.stopPrank();
    }

    function testBuySplitsProtocolFeeForEthSales() external {
        vm.prank(admin);
        registry.setProtocolFeeBps(500);

        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 1 ether, 7);
        vm.stopPrank();

        uint256 sellerBalanceBefore = seller.balance;
        uint256 treasuryBalanceBefore = treasury.balance;

        vm.prank(buyer);
        marketplace.buy{value: 1 ether}(0);

        assertEq(treasury.balance - treasuryBalanceBefore, 0.05 ether);
        assertEq(seller.balance - sellerBalanceBefore, 0.95 ether);
        assertEq(nft721.ownerOf(1), buyer);
    }

    function testNonReentrantBuyBlocksNestedBuy() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.mint(seller, 2);
        nft721.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(reentrantToken), 1, 7);
        marketplace.createListing(address(nft721), 2, 1, "ERC721", address(reentrantToken), 1, 7);
        vm.stopPrank();

        reentrantToken.setReentry(1, true);

        vm.prank(buyer);
        marketplace.buy(0);

        assertEq(nft721.ownerOf(1), buyer);
        assertEq(nft721.ownerOf(2), seller);
        (,,,,,,,, bool firstActive) = marketplace.listings(0);
        (,,,,,,,, bool secondActive) = marketplace.listings(1);
        assertFalse(firstActive);
        assertTrue(secondActive);
    }
}
