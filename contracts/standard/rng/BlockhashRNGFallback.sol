 /**
 *  @authors: [@clesaege]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.4.15;

import "./BlockhashRNG.sol";

/**
 *  @title Random Number Generator using blockhash with fallback.
 *  @author Clément Lesaege - <clement@lesaege.com>
 *
 *  This contract implements the RNG standard and gives parties incentives to save the blockhash to avoid it to become unreachable after 256 blocks.
 *  In case no one called it within the 256 blocks, it returns the previous blockhash.
 *  This contract must be used when returning 0 is a worse failure mode than returning another blockhash.
 *  Note that if someone calls it within the timeframe, this contracts acts exactly as BlockHashRNG.
 *
 *  Random Number Generator returning the blockhash with a backup behaviour.
 *  Allows saving the random number for use in the future.
 *  It allows the contract to still access the blockhash even after 256 blocks.
 *  The first party to call the save function gets the reward.
 *  If no one calls the contract within 256 blocks, the contract fallback in returning the blockhash of a block in range.
 */
contract BlockHashRNGFallback is BlockHashRNG {

    /** @dev Fallback by returning a blockhash in range.
     *  @param _block Block the random number is linked to.
     */
    function getFallbackRN(uint _block) internal view returns (uint) {
        if (_block >= block.number) {
            return 0x0;
        }
        return uint(blockhash((block.number - 1) - (block.number - 1 - _block)%256));
    }
}
