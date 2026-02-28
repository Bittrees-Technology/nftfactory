// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC1155Lite {
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function isApprovedForAll(address account, address operator) external view returns (bool);
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
}
