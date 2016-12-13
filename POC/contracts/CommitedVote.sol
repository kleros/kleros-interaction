/*
This contract shows how to commit to a vote before revealing it as described in the WP.
The salt must be drawn at random.
In a first phase, voter post a commitment of their votes. This commitment is givent by sha3(vote,salt) where vote is a boolean and salt a random int256.
In a second phase, parties reveal their votes by revealing (vote,salt).
If someone can reveal the (vote,salt) of another party before him, the vote is invalided. This ensure that if someone shows a proof of his ballot, every party given this proof can invalide the ballot.
*/

pragma solidity ^0.4.5;

contract CommitedVote{
    struct Voter {
        address voter; // Voter address
        bytes32 hiddenVote; // Hash of the vote: sha3(vote,salt)
        bool hasRevealed; // True after a vote is revealed
    }
    Voter[] public voters;
    bool    public isClosed; 
    uint256 public yesCount;
    uint256 public noCount;
    address public owner;
    
    function CommitedVote(address[] _voters){
        for (uint i = 0; i < _voters.length; i++) 
            voters.push(Voter(_voters[i], 0, false)); 
        owner=msg.sender;
    }
    
    function commitVote(uint256 voterID,bytes32 hiddenVote){
        if (msg.sender != voters[voterID].voter || voters[voterID].hiddenVote!=0 || isClosed) // Verify it is the corresponding voter, the user hasn't voted yet and the vote is open.
            throw;
        voters[voterID].hiddenVote=hiddenVote;
    }
    
    function closeVote(){
        if (msg.sender!=owner)
            throw;
        isClosed=true;
    }
    
    function revealVote(uint256 voterID, bool vote, uint256 salt){
        if(msg.sender != voters[voterID].voter || voters[voterID].hasRevealed || !isClosed) // Verify it is the corresponding voter, the vote has not been revealed yet and the vote is closed
            throw;
        if(sha3(salt,vote) != voters[voterID].hiddenVote) // Verify the correspondance with the commitment
            throw;
            
        voters[voterID].hasRevealed=true;
        if (vote)
            yesCount++;
        else
            noCount++;
    }
    
    // If some salt is revealed before the vote is revealed by the owner, allows anyone to invalidate the vote
    function invalidateVote(uint256 voterID, bool vote, uint256 salt){
        if (voters[voterID].hasRevealed)
            throw;
        if(sha3(salt,vote) != voters[voterID].hiddenVote)
            throw;
            
        voters[voterID].hasRevealed=true;
    }
    
    // Note that this function is not needed for the smart contract to execute but is provided there in order to make tests using only the smart contract.
    function getHiddenVote(bool vote, uint256 salt) constant returns(bytes32) {
        return sha3(salt,vote);
    }
    
}


