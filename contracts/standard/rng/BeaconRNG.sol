 /**
 *  @authors: [@shalzz, @unknownunknown1]
 *  @reviewers: [@jaybuidl*, @geaxed*]
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.4.15;

import "./RNG.sol";

/**
 *  @title Random Number Generator using beacon chain random opcode
 */
contract BeaconRNG {
    
    uint public constant LOOKAHEAD = 132; // Number of blocks that has to pass before obtaining the random number. 4 epochs + 4 slots, according to EIP-4399.
    uint public constant ERROR = 32; // Number of blocks after which the lookahead gets reset, so eligible blocks after lookahead don't go long distance, to avoid a possiblity for manipulation.

    RNG public blockhashRNG; // Address of blockhashRNG to fall back on.

    /** @dev Constructor.
     * @param _blockhashRNG The blockhash RNG deployed contract address.
     */
    constructor(RNG _blockhashRNG) public {
        blockhashRNG = _blockhashRNG;
    }

    /**
     * @dev Request a random number. It is not used by this contract and only exists for backward compatibility.
     */
    function requestRN(uint /*_block*/) public pure {}

    /**
     * @dev Get aт uncorrelated random number.
     * @param _block Block the random number is linked to.
     * @return RN Random Number. If the number is not ready or has not been required 0 instead.
     */
    function getUncorrelatedRN(uint _block) public returns (uint) {
        // Pre-Merge.
        if (block.difficulty <= 2**64) {
            uint baseRN = blockhashRNG.getRN(_block);
            if (baseRN == 0) {
                return 0;
            } else {
                return uint(keccak256(abi.encodePacked(msg.sender, baseRN)));
            }
        // Post-Merge.
        } else {
            if (block.number > _block && (block.number - _block) % (LOOKAHEAD + ERROR) > LOOKAHEAD) {
                // Eligible block number should exceed LOOKAHEAD but shouldn't be higher than LOOKAHEAD + ERROR.
                // In case of the latter LOOKAHEAD gets reset.  
                return uint(keccak256(abi.encodePacked(msg.sender, block.difficulty)));
            } else {
                return 0;
            }
        }
    }
}
