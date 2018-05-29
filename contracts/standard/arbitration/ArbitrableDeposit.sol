
/**
 *  @title ArbitrableDeposit
 *  @author Luke Hartman - <lhartman3@zagmail.gonzaga.edu>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */


pragma solidity ^0.4.15;
import "./TwoPartyArbitrable.sol";


/** @title Arbitrable Deposit
 *  This is a a contract for a deposit by the owner where a claimant can seek arbitration. 
 *  Party A is the owner and Party B is the claimant.
 */
contract ArbitrableDeposit is TwoPartyArbitrable {
    string constant RULING_OPTIONS = "Allow partyA deposit;Pay partyB";
    uint public amount; // Amount deposited by owner

    uint public claimAmount; // Amount claimed by claimant
    uint public claimRate; // Rate of a claim the claimant must deposit as an integer
    uint internal claimResponseAmount; // Amount the claimant is granted by the owner

    function ArbitrableDeposit (
        Arbitrator _arbitrator, bytes32 _hashContract, uint _timeout,
        address _partyB, bytes _arbitratorExtraData)
        TwoPartyArbitrable(_arbitrator,_hashContract,_timeout,_partyB,_arbitratorExtraData) public payable {
        amount += msg.value;
    }

    /** @dev Owner deposit to contract. To be called when the owner
     */
    function deposit() onlyPartyA {
        address(this).transfer(amount);
    }
    
    function claim(uint _claimValue) onlyPartyB {
        require(_claimValue >= 0 && _claimValue <= amount);
        claimAmount = _claimValue;
        address(this).transfer((_claimValue * claimRate)/100);
    }

    /** @dev Owner response to claimant. To be called when the owner initates a
     *  a response to the claimant. 
     *  @param 
     */
    function claimRespone(uint _responseAmount) onlyPartyA { 
        require(_responseAmount >= 0 && _responseAmount <= amount);
        if (_responseAmount == 0) 
            settleClaim();
        //else initiate dispute resolution through Arbitrator

        claimResponseAmount = _responseAmount;
    }

     /** @dev Settles claim and pays Party B. Transfers the owner's deposit to the claimant 
     */
    function settleClaim() private{
        partyB.transfer(amount);
        claimAmount = 0;
        amount = 0;
    }

    /** @dev Execute a ruling of a dispute. Pays parties respective amounts based on ruling.
     *  This needs to be extended by contract inheriting from it.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. 1 : Allow partyA deposit. 2 : Pay partyB.
     */
    function executeRuling(uint _disputeID, uint _ruling) internal {
        super.executeRuling(_disputeID,_ruling);
        if (_ruling==PARTY_A_WINS) {
            partyA.transfer(amount + claimAmount);
            partyB.transfer(claimResponseAmount);
        } else if (_ruling==PARTY_B_WINS)
            partyB.transfer(amount);
            
        amount = 0;
    }
}