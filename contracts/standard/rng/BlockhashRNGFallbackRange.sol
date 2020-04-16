 /**
 *  @authors: [@remedcu]
 *  @reviewers: [@clesaege]
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.4.15;

import "./BlockhashRNG.sol";

/**
 *  @title Random Number Generator using blockhash with fallback from the last 256 blockhash mined.
 *  @author Shebin John - <admin@remedcu.com>
 *
 *  Random Number Generator returning the blockhash with a backup behaviour.
 *  This contract implements the RNG standard and gives parties incentives to save the blockhash to avoid it to become unreachable after 256 blocks.
 *  In case no one called it within the 256 blocks, it returns the blockhash from any one of the last mined 256 blocks.
 *  Thus allowing the contract to still return a value even after 256 blocks.
 *  Allows saving the random number for use in the future.
 *  The first party to call the save function gets the reward.
 *  This contract must be used when returning 0 is a worse failure mode than returning another blockhash.
 *  Note that if someone calls it within the timeframe, this contracts acts exactly as BlockHashRNG.
 */
contract BlockHashRNGFallback is BlockHashRNG {

    /** @dev Save the random number for this blockhash and give the reward to the caller.
     *  @param _block Block the random number is linked to.
     */
    function saveRN(uint _block) public {
        if (_block < block.number && randomNumber[_block] == 0) { // If the random number is not already set and can be.
            // Returns the blockhash of _block if accessible (one of the last 256 blocks).
            // If the blockhash hasn't been saved in time, return a blockhash of a block in range as a fallback.
            randomNumber[_block] = uint(blockhash((block.number-1) - (block.number-1-_block)%256));
        }

        if (randomNumber[_block] != 0) { // If the random number is set.
            uint rewardToSend = reward[_block];
            reward[_block] = 0;
            msg.sender.send(rewardToSend); // Note that the use of send is on purpose as we don't want to block in case the msg.sender has a fallback issue.
        }
    }

}
