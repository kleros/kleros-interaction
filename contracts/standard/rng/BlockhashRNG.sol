/**
 *  @title Random Number Generator usign blockhash
 *  @author Clément Lesaege - <clement@lesaege.com>
 *
 *  This contract implements the RNG standard and gives parties incentives to save the blockhash to avoid it to become unreachable after 256 blocks.
 *
 */
pragma solidity ^0.4.15;

import "./RNG.sol";

/** Simple Random Number Generator returning the blockhash.
 *  Allows saving the random number for use in the future.
 *  It allows the contract to still access the blockhash even after 256 blocks.
 *  The first party to call the save function gets the reward.
 */
contract BlockHashRNG is RNG {

    mapping (uint => uint) public randomNumber; // randomNumber[block] is the random number for this block, 0 otherwise.
    mapping (uint => uint) public reward; // reward[block] is the amount to be paid to the party w.



    /** @dev Contribute to the reward of a random number.
     *  @param _block Block the random number is linked to.
     */
    function contribute(uint _block) public payable { reward[_block]+=msg.value; }


    /** @dev Return the random number. If it has not been saved and is still computable compute it.
     *  @param _block Block the random number is linked to.
     *  @return RN Random Number. If the number is not ready or has not been requested 0 instead.
     */
    function getRN(uint _block) public returns (uint RN) {
        RN=randomNumber[_block];
        if (RN==0){
            saveRN(_block);
            return randomNumber[_block];
        }
        else
            return RN;
    }

    /** @dev Save the random number for this blockhash and give the reward to the caller.
     *  @param _block Block the random number is linked to.
     */
    function saveRN(uint _block) public {
        if (blockhash(_block) != 0x0)
            randomNumber[_block] = uint(blockhash(_block));
        if (randomNumber[_block] != 0) { // If the number is set.
            uint rewardToSend = reward[_block];
            reward[_block] = 0;
            msg.sender.send(rewardToSend); // Note that the use of send is on purpose as we don't want to block in case msg.sender has a fallback issue.
        }
    }

}
