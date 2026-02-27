// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC721Lite {
    function ownerOf(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}
