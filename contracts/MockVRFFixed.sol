// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICasino {
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external;
}

/// @notice Drop-in replacement for MockVRF (same ABI + `fulfill`).
/// The original MockVRF calls back into the casino INSIDE requestRandomWords,
/// before the casino has stored the bet, so every bet reverts with "Invalid bet".
/// This version only records the request; anyone (testnet keeper / the player)
/// calls `fulfill(requestId)` in a later transaction to settle it.
contract MockVRFFixed {
    address public owner;
    address public casino;
    uint256 public requestIdCounter;
    mapping(uint256 => uint256) public seeds;
    mapping(uint256 => bool) public fulfilled;

    event RandomnessRequested(uint256 indexed requestId, address indexed requester);
    event RandomnessFulfilled(uint256 indexed requestId, uint256 randomWord);

    modifier onlyOwner() { require(msg.sender == owner, "Only owner"); _; }

    constructor() { owner = msg.sender; }

    function setCasino(address _casino) external onlyOwner { casino = _casino; }
    function transferOwnership(address newOwner) external onlyOwner { require(newOwner != address(0), "Zero"); owner = newOwner; }

    function requestRandomWords(uint32, uint256 userSeed) external returns (uint256 requestId) {
        require(msg.sender == casino, "Only casino can request");
        requestId = ++requestIdCounter;
        seeds[requestId] = userSeed;
        emit RandomnessRequested(requestId, tx.origin);
    }

    function fulfill(uint256 requestId) external {
        require(requestId != 0 && requestId <= requestIdCounter, "Unknown request");
        require(!fulfilled[requestId], "Already fulfilled");
        require(block.number > 0, "");
        fulfilled[requestId] = true;
        uint256[] memory words = new uint256[](1);
        words[0] = uint256(keccak256(abi.encode(seeds[requestId], blockhash(block.number - 1), requestId, block.prevrandao)));
        emit RandomnessFulfilled(requestId, words[0]);
        ICasino(casino).fulfillRandomWords(requestId, words);
    }
}
