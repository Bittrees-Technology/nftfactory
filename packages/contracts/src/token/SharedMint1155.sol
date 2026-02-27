// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "../utils/Owned.sol";
import {SubnameRegistrar} from "../core/SubnameRegistrar.sol";

contract SharedMint1155 is Owned {
    string public name;
    string public symbol;

    uint256 public nextTokenId;
    SubnameRegistrar public registrar;

    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => mapping(address => uint256)) public balanceOf;
    mapping(uint256 => string) public tokenURI;

    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event Published(address indexed creator, uint256 indexed tokenId, string creatorSubname, uint256 amount, string uri);

    error Unauthorized();
    error InvalidRecipient();
    error InsufficientBalance();

    constructor(address initialOwner, address registrarAddress, string memory tokenName, string memory tokenSymbol)
        Owned(initialOwner)
    {
        registrar = SubnameRegistrar(registrarAddress);
        name = tokenName;
        symbol = tokenSymbol;
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata) external {
        if (msg.sender != from && !isApprovedForAll[from][msg.sender]) revert Unauthorized();
        if (to == address(0)) revert InvalidRecipient();

        uint256 fromBal = balanceOf[id][from];
        if (fromBal < amount) revert InsufficientBalance();

        balanceOf[id][from] = fromBal - amount;
        balanceOf[id][to] += amount;

        emit TransferSingle(msg.sender, from, to, id, amount);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function publish(string calldata creatorSubname, uint256 amount, string calldata uri) external returns (uint256 tokenId) {
        tokenId = ++nextTokenId;
        balanceOf[tokenId][msg.sender] += amount;
        tokenURI[tokenId] = uri;

        if (bytes(creatorSubname).length != 0) {
            // Subname ownership is optional for shared minting.
            // If creatorSubname is provided but invalid/unregistered, mint still succeeds.
            try registrar.recordMint(creatorSubname) {} catch {}
        }

        emit TransferSingle(msg.sender, address(0), msg.sender, tokenId, amount);
        emit Published(msg.sender, tokenId, creatorSubname, amount, uri);
    }
}
