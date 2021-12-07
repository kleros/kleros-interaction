 /**
 *  @authors: [@shalzz]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.4.15;

import "./RNG.sol";

/**
 *  @title Random Number Generator using beacon chain random opcode
 */
contract BeaconRNG is RNG {

    /**
     * @dev Since we don't really need to incentivise requesting the beacon chain randomness,
     * this is a stub implementation required for backwards compatibility with the
     * RNG interface.
     * @notice All the ETH sent here will be lost forever.
     * @param _block Block the random number is linked to.
     */
    function contribute(uint _block) public payable {}


    /** @dev Return the random number from the PoS randomness beacon.
     *  @param _block Block the random number is linked to.
     *  @return RN Random Number. If the PoS upgrade defined by EIP-3675
     *          has not yet executed 0 instead.
     */
    function getRN(uint _block) public returns (uint RN) {
        if (block.difficulty <= 2**64)
            return 0;
        return block.difficulty;
    }
}
