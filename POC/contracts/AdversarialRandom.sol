pragma solidity ^0.4.5;

contract AdversarialRandom{
    address public creator;
    address public opponent;
    bytes32 public hashedValue;
    uint256 public opponentValue;
    uint256 public randomValue; // Random value when it is known, 0 otherwise.
    
   function AdversarialRandom(bytes32 _hashedValue, address _opponent){
        creator=msg.sender;
        hashedValue=_hashedValue;
        opponent=_opponent;
    }
    
    function setOpponentValue(uint256 _opponentValue){
        if (opponentValue!=0 || msg.sender!=opponent)
            throw;
        opponentValue=_opponentValue;
    }
    
    function revealCreatorValue(uint256 creatorValue){
        if (sha3(creatorValue) != hashedValue || msg.sender!=creator)
            throw;
        randomValue=creatorValue^opponentValue;
    }
    
    
}

// Note that this contract is not need, it is just provided as a way to make tests using only smart contracts
contract hasher{
    function hash(uint256 value) constant returns(bytes32) {return sha3(value); }
}