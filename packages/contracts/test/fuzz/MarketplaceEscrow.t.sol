// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Marketplace} from "../../src/core/Marketplace.sol";
import {NftFactoryRegistry} from "../../src/core/NftFactoryRegistry.sol";
import {Mock721V2} from "../Marketplace.t.sol";
contract EscrowHandler is Test {
    Marketplace public market;
    Mock721V2 public nft;
    address public seller = address(0xCAFE);
    uint256 public outstanding;
    uint256[] public ids;
    mapping(uint256 => uint256) public deposits;
    constructor(Marketplace m, Mock721V2 n) { market=m; nft=n; vm.prank(seller); nft.setApprovalForAll(address(m),true); }
    receive() external payable {}
    function open(uint96 raw) external {
        uint256 price=bound(uint256(raw),1,10 ether);
        vm.deal(address(this),address(this).balance+price);
        uint256 id=market.nextOfferId();
        nft.mint(seller,id);
        market.createOffer{value:price}(address(nft),id,1,"ERC721",address(0),price,7);
        deposits[id]=price; ids.push(id); outstanding+=price;
    }
    function cancel(uint256 seed) external {
        if(ids.length==0)return;
        uint256 id=ids[seed%ids.length];uint256 price=deposits[id];if(price==0)return;
        uint256 beforeBalance=address(this).balance;
        market.cancelOffer(id);
        assertEq(address(this).balance-beforeBalance,price);
        outstanding-=price;deposits[id]=0;
    }
    function accept(uint256 seed) external {
        if(ids.length==0)return;
        uint256 id=ids[seed%ids.length];uint256 price=deposits[id];if(price==0)return;
        vm.prank(seller);market.acceptOffer(id);
        assertEq(nft.ownerOf(id),address(this));
        outstanding-=price;deposits[id]=0;
    }
    function advance(uint32 secondsForward) external { vm.warp(block.timestamp+bound(secondsForward,0,1 days)); }
}
contract MarketplaceEscrowInvariant is StdInvariant, Test {
    Marketplace market; EscrowHandler handler;
    function setUp() external {
        NftFactoryRegistry registry=new NftFactoryRegistry(address(this),address(0xBEEF));
        registry.setProtocolFeeBps(250);
        market=new Marketplace(address(this),address(registry));
        handler=new EscrowHandler(market,new Mock721V2());
        bytes4[] memory selectors=new bytes4[](3);
        selectors[0]=handler.open.selector;selectors[1]=handler.cancel.selector;selectors[2]=handler.accept.selector;
        targetSelector(FuzzSelector({addr:address(handler),selectors:selectors}));targetContract(address(handler));
    }
    function invariant_nativeEscrowCoversEveryOutstandingOffer() external view { assertEq(address(market).balance,handler.outstanding()); }
}
