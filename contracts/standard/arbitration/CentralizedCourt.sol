/**
 *  @title Arbitration Standard
 *  @author Gabriel Oliveira Mendanha - <gabrielmendanha@icloud.com>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */


pragma solidity ^0.4.15;

import "./Arbitrator.sol";

/** @title Centralized Court
 *  This is a centralized court deciding the result of disputes.
 *  No appeals are possible.
 */

contract CentralizedCourt is Arbitrator {

    address public owner = msg.sender;
    uint arbitrationPrice; // Not public because arbitrationCost already acts as an accessor.
    uint constant NOT_PAYABLE_VALUE = (2**256-2)/2; // High value to be sure that the appeal is too expensive.

    struct VoteCounter {
        uint winningChoice; // The choice which currently has the highest amount of votes. Is 0 in case of a tie.
        uint winningCount;  // The number of votes for winningChoice. Or for the choices which are tied.
    }

    struct Vote {
        address account; // The juror who casted the vote.
        uint ruling;     // The ruling which was given.
    }

    struct Dispute {
        Arbitrable arbitrated;
        uint choices;
        uint fee;
        DisputeStatus status;
        mapping (address => bool) hasVoted;
        mapping (address => bool) canCollectFee;
        mapping (uint => uint) voteCount; // voteCount[choice] is the number of votes for choice.
        VoteCounter voteCounter;
        Vote[] votes;
        uint deadline;
    }

    modifier onlyOwner {
        require(msg.sender==owner);
        _;
    }

    Dispute[] public disputes;
    address[] public members;
    mapping (address => bool) public isMember;

    uint constant public MAX_MEMBER_COUNT = 50;

    modifier onlyCourtMember() {
        require(isMember[msg.sender]);
        _;
    }

    modifier whoHasNotVoted(uint _disputeID) {
        require(!disputes[_disputeID].hasVoted[msg.sender]);
        _;
    }

    modifier beforeDeadline(uint _disputeID) {
        require(now < disputes[_disputeID].deadline);
        _;
    }


    /** @dev Constructor. Set the initial arbitration price.
     *  @param _arbitrationPrice Amount to be paid for arbitration.
     *  @param _members Array of addresses allowed to rule.
     */
    constructor (uint _arbitrationPrice, address[] _members) public {
        require(_members.length <= MAX_MEMBER_COUNT);
        for(uint8 i = 0; i < _members.length; i++){
            require(!isMember[_members[i]] && _members[i] != address(0));
            isMember[_members[i]] = true;
        }
        arbitrationPrice = _arbitrationPrice;
        members = _members;
    }


    /** @dev Create a dispute. Must be called by the arbitrable contract.
     *  Must be paid at least arbitrationCost().
     *  @param _choices Amount of choices the arbitrator can make in this dispute. When ruling ruling<=choices.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return disputeID ID of the dispute created.
     */
    function createDispute(uint _choices, bytes _extraData) public payable returns(uint disputeID)  {
        require(msg.value >= arbitrationPrice);

        disputeID = disputes.length++;
        Dispute storage dispute = disputes[disputeID];
        dispute.deadline = now + 3 days;
        dispute.choices = _choices;
        dispute.arbitrated = Arbitrable(msg.sender);
        dispute.fee = msg.value;


        emit DisputeCreation(disputeID, Arbitrable( msg.sender));
        return disputeID;
    }

    /** @dev Give a ruling. UNTRUSTED.
     *  @param _disputeID ID of the dispute to rule.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 means "Not able/wanting to make a decision".
     */
    function voteRuling(uint _disputeID, uint _ruling) public onlyCourtMember whoHasNotVoted(_disputeID) beforeDeadline(_disputeID) {
        Dispute storage dispute = disputes[_disputeID];
        require(_ruling<=dispute.choices && _ruling != 0);
        require(dispute.status == DisputeStatus.Waiting);

        dispute.hasVoted[msg.sender] = true;
        dispute.voteCount[_ruling] += 1;

        dispute.votes.push(
            Vote({
                account: msg.sender,
                ruling: _ruling
            })
        );

        VoteCounter storage voteCounter = dispute.voteCounter;
        if(dispute.voteCount[_ruling] > voteCounter.winningCount){
            voteCounter.winningCount = dispute.voteCount[_ruling];
            voteCounter.winningChoice = _ruling;
        }  else if (voteCounter.winningCount == dispute.voteCount[_ruling]) {
            voteCounter.winningChoice = 0; // It's currently a tie.
        }

        if(dispute.voteCount[_ruling] >= (members.length/2)+1) { // We have got the will of the majority
            for(uint8 i = 0; i < members.length; i++){
                dispute.canCollectFee[members[i]] = true;
            }
            executeRuling(_disputeID);
        }
    }

    /** @dev Do all the internal work and executes the rule function
    *   @param _disputeID ID of the dispute to rule
    */
    function executeRuling(uint _disputeID) internal {
        Dispute storage dispute = disputes[_disputeID];
        VoteCounter storage voteCounter = dispute.voteCounter;
        Arbitrable arbitrated = dispute.arbitrated;
        dispute.arbitrated = Arbitrable(0x0); // Clean up to get gas back and prevent calling it again.
        dispute.status = DisputeStatus.Solved;

        arbitrated.rule(_disputeID, voteCounter.winningChoice);
    }

    /** @dev Calculates and tranfers the fee to the court member
    *   @param _disputeID ID of the dispute to rule 
    */
    function withdraw(uint _disputeID) public onlyCourtMember {
        Dispute storage dispute = disputes[_disputeID];
        require(dispute.canCollectFee[msg.sender]);

        dispute.canCollectFee[msg.sender] = false;
        uint feeInWei;

        if(dispute.votes.length == members.length) {
            feeInWei = dispute.fee/members.length;
        } else {
            feeInWei = dispute.fee/dispute.votes.length;
        }
        msg.sender.transfer(feeInWei);
    }

    /** @dev Forces a decision by timeout, fee is splited between court members who voted
    *   @param _disputeID ID of the dispute to rule
    */
    function timeoutDecision(uint _disputeID) public {
        Dispute storage dispute = disputes[_disputeID];
        require(now >= dispute.deadline);
        require(dispute.status == DisputeStatus.Waiting);
       
        for(uint8 i = 0; i < dispute.votes.length; i++){
            dispute.canCollectFee[dispute.votes[i].account] = true;
        }

        executeRuling(_disputeID);
    }

    /** @dev Return the status of a dispute.
     *  @param _disputeID ID of the dispute to rule.
     *  @return status The status of the dispute.
     */
    function disputeStatus(uint _disputeID) public view returns(DisputeStatus status) {
        return disputes[_disputeID].status;
    }

    /** @dev Return the ruling of a dispute.
     *  @param _disputeID ID of the dispute to rule.
     *  @return ruling The ruling which would or has been given.
     */
    function currentRuling(uint _disputeID) public view returns(uint ruling) {
        Dispute storage dispute = disputes[_disputeID];
        VoteCounter storage voteCounter = dispute.voteCounter;
        return voteCounter.winningChoice;
    }

    /** @dev Cost of appeal. Since it is not possible, it's a high value which can never be paid.
     *  @param _disputeID ID of the dispute to be appealed. Not used by this contract.
     *  @param _extraData Not used by this contract.
     *  @return fee Amount to be paid.
     */
    function appealCost(uint _disputeID, bytes _extraData) public view returns(uint fee) {
        return NOT_PAYABLE_VALUE;
    }

    /** @dev Set the arbitration price. Only callable by the owner.
     *  @param _arbitrationPrice Amount to be paid for arbitration.
     */
    function setArbitrationPrice(uint _arbitrationPrice) public onlyOwner {
        arbitrationPrice = _arbitrationPrice;
    }

    /** @dev Cost of arbitration. Accessor to arbitrationPrice.
     *  @param _extraData Not used by this contract.
     *  @return fee Amount to be paid.
     */
    function arbitrationCost(bytes _extraData) public constant returns(uint fee) {
        return arbitrationPrice;
    }
}