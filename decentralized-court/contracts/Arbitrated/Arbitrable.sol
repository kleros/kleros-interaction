pragma solidity ^0.4.6;

// TODO Refactor all the time logic of those contracts.

/*
Virtual Contract to be arbitrated by the court.
*/
contract Arbitrable {
    Court court;
    function Arbitrable(Court _court){
        court=_court;
    }
    
    modifier onlyCourt {if (msg.sender!=address(court)) throw; _;}
    
    /** Function the court will call to execute ruling A.
     *  In most cases, this function should have the modifier onlyCourt.
     */
    function ruleA(uint256 disputeID);
    
    /** Function the court will call to execute ruling B.
     *  In most cases, this function should have the modifier onlyCourt.
     */
    function ruleB(uint256 disputeID);
    
}

contract TwoPartyArbitrable is Arbitrable {
    
    // Varaibles set during contract construction //
    address public partyA;
    address public partyB;
    uint256 public timeToReac; // Must be way lower than timeForAppeal/2
    
    bytes32 public hashRandom;
    uint256 public secondRandom;
    address public requestCreator; // Creator of the dispute request or appeal request
    uint256 public disputeID;
    uint256 public nextAppeals; // Number next appeal will be.
    
    uint256 public lastAction;
    
    /// Can only be called by a party of the contract
    modifier onlyParty(){
        if (msg.sender != partyA && msg.sender != partyB)
            throw;
        _;
    }
    
    /// Cannot be called by account
    modifier notAccount(address account){
        if (account==msg.sender)
            throw;
        _;
    }
    
    modifier onlyAccount(address account){
        if (account!=msg.sender)
            throw;
        _;
    }
    
    /** Contract with two parties to be arbitrated. The party A is the contract creator.
     *  @param _court Address of the court.
     *  @param _partyB Party B.
     *  @param _timeToReac Reaction time of the other party.
     */
    function TwoPartyArbitrable(Court _court, address _partyB, uint256 _timeToReac) Arbitrable(_court) {
        partyA=msg.sender;
        partyB=_partyB;
        timeToReac=_timeToReac;
    }
    
    function ruleA(uint256 disputeID) onlyCourt { executeRulingA(disputeID); }
    function ruleB(uint256 disputeID) onlyCourt { executeRulingB(disputeID); }
    
    /// Set the state at ruledA. The court call this function if A is ruled.
    function executeRulingA(uint256 _disputeID) private {
        if (_disputeID!=disputeID) // Not arbitrating the current dispute.
            throw;
        actionA(_disputeID);
        clean();
    }
    
    /// Set the state at ruledB. The court call this function if B is ruled.
    function executeRulingB(uint256 _disputeID) private { 
        if (_disputeID!=disputeID) // Not arbitrating the current dispute.
            throw;
        actionB(_disputeID);
        clean();
    }
    
    function actionA(uint256 _disputeID) private;
    function actionB(uint256 _disputeID) private;
    
    /** Clean everything after a ruling is executed..
     */
    function clean() private {
        hashRandom=0;
        secondRandom=0;
        requestCreator=0;
        disputeID=0;
        nextAppeals=0; 
    }
    
    /** Create an internal request for ruling.
     *  @param _hashRandom Hash of the random number of the requesting party.
     */
    function request(bytes32 _hashRandom) onlyParty {
        if (hashRandom!=0 // A request has already been made.
            || disputeID!=0) // The dispute is already submitted.
            throw;
        hashRandom=_hashRandom;
        requestCreator=msg.sender;
        lastAction=now;
    }
    
    /** Make a counter request.
     *  @param _secondRandom Random number of the counter-requesting party
     */
    function counterRequest(uint256 _secondRandom) onlyParty notAccount(requestCreator) {
        if (hashRandom==0 // No request 
            || secondRandom!=0 // Counter-request already done.
            || disputeID!=0)  // The dispute is already submitted.
            throw;
        secondRandom=_secondRandom;
        lastAction=now;
    }
    
    /** Create the dispute.
     *  Can only be called after a counter-request.
     *  @param firstRandom Random number of the counter-requesting party
     */
    function createDispute(uint256 firstRandom) onlyAccount(requestCreator) {
        if (sha3(firstRandom)!=hashRandom // Value not corresponding to the commitment.
            || secondRandom==0 // Lack of counter request.
            || disputeID!=0) // The dispute has already been created.
            throw;
        disputeID=court.createDispute(firstRandom ^ secondRandom); // Create a dispute with a random number being a XOR of both of them
        nextAppeals=1; // Next appeal will be the first.
        hashRandom=0;
        secondRandom=0;
        requestCreator=0;
        lastAction=now;
    }
    
    // Note that this function is not needed for the smart contract to execute but is provided there in order to make tests using only the smart contract.
    function hash(uint256 n) constant returns(bytes32) {return sha3(n);}
    
    /** Set the state in the absence of reaction of the other party.
     *  @param executeA True if A to be executed. False if B to be executed.
     */
    function executeDueToInactivity(bool executeA) onlyParty {
        if (now - lastAction < timeToReac) // Reaction time to reached.
            throw;
        if ((msg.sender==requestCreator && secondRandom==0) // The requesting party can set the state if the other one has not given its random number
            || (msg.sender!=requestCreator && secondRandom!=0 && disputeID==0 && court.voteOpen()) // The counter-requesting party can set the state if the requesting party has not called createDispute in times.
            ||  msg.sender!=requestCreator && disputeID!=0 && !court.appealOpen()){ // The party making the appeal failed to submit the appeal in time.
            if (executeA)
                executeRulingA(disputeID);
            else
                executeRulingB(disputeID);
        } 
        else
            throw;
    }
    

    /** Appeal a ruling.
     *  Notice that you must do it early enought as there will be timeToReac for the other party before the dispute is completed.
     *  @param _hashRandom Hash of the random number of the requesting party.
     */
    function appeal(bytes32 _hashRandom) onlyParty{
        if (hashRandom!=0 // An appeal request has already been made.
            || court.getAppeals(disputeID) + 1 != nextAppeals) // There is already an appeal submitted.
            throw;
        hashRandom=_hashRandom;
        requestCreator=msg.sender;
        lastAction=now;
    }
    
    /** Make a counter appeal.
     *  @param _secondRandom Random number of the counter-requesting party
     */
    function counterAppeal(uint256 _secondRandom) onlyParty notAccount(requestCreator) {
        if (hashRandom==0 // No appeal
            || secondRandom!=0 // Counter-appeal already done.
            || court.getAppeals(disputeID) + 1 != nextAppeals)  // There is already an appeal submitted.
            throw;
        secondRandom=_secondRandom;
        lastAction=now;
    }
    
    /** Launch the appeal request
     * 
     *  @param firstRandom Random number of the counter-requesting party
     */
    function createAppeal(uint256 firstRandom) onlyAccount(requestCreator) {
        if (sha3(firstRandom)!=hashRandom // Value not corresponding to the commitment.
            || secondRandom==0 // Lack of counter appeal.
            || court.getAppeals(disputeID) + 1 != nextAppeals) // The dispute is already submitted.
            throw;
        court.appealRuling(disputeID,firstRandom ^ secondRandom); // Create an appeal with a random number being a XOR of both of them.
        nextAppeals+=1;
        
        hashRandom=0;
        secondRandom=0;
        requestCreator=0;
        lastAction=now;
    }
    
}
