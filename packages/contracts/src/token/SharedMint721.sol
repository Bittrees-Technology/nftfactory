// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "../utils/Owned.sol";
import {SubnameRegistrar} from "../core/SubnameRegistrar.sol";

contract SharedMint721 is Owned {
    string public name;
    string public symbol;

    uint256 public totalSupply;
    SubnameRegistrar public registrar;

    mapping(uint256 => address) private _ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => string) public tokenURI;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event Published(address indexed creator, uint256 indexed tokenId, string creatorSubname, string uri);

    error Unauthorized();
    error InvalidRecipient();

    constructor(address initialOwner, address registrarAddress, string memory tokenName, string memory tokenSymbol)
        Owned(initialOwner)
    {
        registrar = SubnameRegistrar(registrarAddress);
        name = tokenName;
        symbol = tokenSymbol;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _ownerOf[tokenId];
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        if (_ownerOf[tokenId] != from || (msg.sender != from && !isApprovedForAll[from][msg.sender])) revert Unauthorized();
        if (to == address(0)) revert InvalidRecipient();

        _ownerOf[tokenId] = to;
        balanceOf[from] -= 1;
        balanceOf[to] += 1;

        emit Transfer(from, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function publish(string calldata creatorSubname, string calldata uri) external returns (uint256 tokenId) {
        tokenId = ++totalSupply;

        _ownerOf[tokenId] = msg.sender;
        balanceOf[msg.sender] += 1;
        tokenURI[tokenId] = uri;

        if (bytes(creatorSubname).length != 0) {
            // Subname ownership is optional for shared minting.
            // If creatorSubname is provided but invalid/unregistered, mint still succeeds.
            try registrar.recordMint(creatorSubname) {} catch {}
        }

        emit Transfer(address(0), msg.sender, tokenId);
        emit Published(msg.sender, tokenId, creatorSubname, uri);
    }
}
