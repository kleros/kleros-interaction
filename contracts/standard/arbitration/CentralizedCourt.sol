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

    enum PriceRequestStatus {Waiting, Solved}

    struct ArbitrationPriceRequest {
        PriceRequestStatus status;
        uint fee; // The new minimum fee to be paid for the arbitration service.
        uint deadline;
        mapping (address => bool) hasVoted;
        mapping (uint => uint) voteCount; // voteCount[choice] is the number of votes for choice.
        VoteCounter voteCounter;
        Vote[] votes;
    }

    struct Dispute {
        Arbitrable arbitrated;
        uint choices;
        uint fee;
        DisputeStatus status;
        mapping (address => bool) hasVoted;
        mapping (uint => uint) voteCount; // voteCount[choice] is the number of votes for choice.
        VoteCounter voteCounter;
        Vote[] votes;
        uint deadline;
    }

    /** @dev To be raised when an request to update the arbitration price is created.
     *  @param _requestID ID of the request.
     *  @param _requester The address that created the request.
     */
    event UpdatePriceRequestCreation(uint _requestID, address _requester);

    ArbitrationPriceRequest[] public requests;

    Dispute[] public disputes;
    address[] public members;
    uint public deadline;
    mapping (address => bool) public isMember;
    mapping (address => uint) public feeToCollect;

    uint constant public MAX_MEMBER_COUNT = 50;

    modifier onlyCourtMember() {
        require(isMember[msg.sender], "Address not authorized.");
        _;
    }

    modifier whoHasNotVoted(uint _disputeID) {
        require(!disputes[_disputeID].hasVoted[msg.sender], "Can only vote once.");
        _;
    }

    modifier beforeDeadline(uint _disputeID) {
        require(now < disputes[_disputeID].deadline, "Can only vote before deadline.");
        _;
    }


    /** @dev Constructor. Set the initial arbitration price.
     *  @param _arbitrationPrice Amount to be paid for arbitration.
     *  @param _members Array of addresses allowed to rule.
     *  @param _deadline Amount of time in seconds for deadline e.g: 1 day = 86400 seconds.
     */
    constructor (uint _arbitrationPrice, address[] _members, uint _deadline) public {
        require(_members.length <= MAX_MEMBER_COUNT, "Quantity of members is not supported.");
        for(uint8 i = 0; i < _members.length; i++){
            require(!isMember[_members[i]] && _members[i] != address(0), "Invalid court member address.");
            isMember[_members[i]] = true;
        }
        arbitrationPrice = _arbitrationPrice;
        members = _members;
        deadline = _deadline;
    }


    /** @dev Create a dispute. Must be called by the arbitrable contract.
     *  Must be paid at least arbitrationCost().
     *  @param _choices Amount of choices the arbitrator can make in this dispute. When ruling ruling<=choices.
     *  @param _extraData Not used by this contract.
     *  @return disputeID ID of the dispute created.
     */
    function createDispute(uint _choices, bytes _extraData) public payable returns(uint disputeID)  {
        require(msg.value >= arbitrationPrice, "Did not send enough ether.");

        disputeID = disputes.length++;
        Dispute storage dispute = disputes[disputeID];
        dispute.deadline = now + deadline;
        dispute.choices = _choices;
        dispute.arbitrated = Arbitrable(msg.sender);
        dispute.fee = msg.value;

        emit DisputeCreation(disputeID, Arbitrable(msg.sender));
        return disputeID;
    }

    /** @dev Give a ruling. UNTRUSTED. Only callabe by court members.
     *  @param _disputeID ID of the dispute to rule.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 means "Not able/wanting to make a decision".
     */
    function voteRuling(uint _disputeID, uint _ruling) public onlyCourtMember whoHasNotVoted(_disputeID) beforeDeadline(_disputeID) {
        Dispute storage dispute = disputes[_disputeID];
        require(_ruling<=dispute.choices, "Invalid ruling.");
        require(dispute.status == DisputeStatus.Waiting, "Can only vote for disputes not yet solved.");

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

        if(dispute.voteCount[_ruling] > (members.length/2)) { // We have got the will of the majority.
            uint feeInWei = dispute.fee/members.length;
            for(uint8 i = 0; i < members.length; i++){
                feeToCollect[members[i]] += feeInWei;
            }
            executeRuling(_disputeID);
        }
    }

    /** @dev Do all the internal work and executes the rule function.
     *  @param _disputeID ID of the dispute to rule.
     */
    function executeRuling(uint _disputeID) internal {
        Dispute storage dispute = disputes[_disputeID];
        VoteCounter storage voteCounter = dispute.voteCounter;
        Arbitrable arbitrated = dispute.arbitrated;
        dispute.arbitrated = Arbitrable(0x0); // Clean up to get gas back and prevent calling it again.
        dispute.status = DisputeStatus.Solved;

        arbitrated.rule(_disputeID, voteCounter.winningChoice);
    }

    /** @dev Tranfers any balance the court member has. Only callabe by court members. */
    function withdraw() public onlyCourtMember {
        uint feeInWei = feeToCollect[msg.sender];
        feeToCollect[msg.sender] = 0;
        msg.sender.transfer(feeInWei);
    }

    /** @dev Forces a decision by timeout, fee is splited between court members who voted.
     *  @param _disputeID ID of the dispute to rule.
     */
    function timeoutDecision(uint _disputeID) public {
        Dispute storage dispute = disputes[_disputeID];
        require(now >= dispute.deadline, "Can only timeout disputes after deadline.");
        require(dispute.status == DisputeStatus.Waiting, "Can only timeout disputes not resolved.");

        if(dispute.votes.length > 0){
            uint feeInWei = dispute.fee/dispute.votes.length;

            for(uint8 i = 0; i < dispute.votes.length; i++) {
                feeToCollect[dispute.votes[i].account] += feeInWei;
            }
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
     *  @param _disputeID ID of the dispute.
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

    /** @dev Return the status of an update price request.
     *  @param _requestID ID of the request.
     *  @return status The status of the request.
     */
    function requestStatus(uint _requestID) public view returns(PriceRequestStatus status) {
        return requests[_requestID].status;
    }

    /** @dev Return the ruling of an arbitration price update request.
     *  @param _requestID ID of the request.
     *  @return ruling The ruling which would or has been given.
     */
    function currentRequestRuling(uint _requestID) public view returns(uint ruling) {
        ArbitrationPriceRequest storage request = requests[_requestID];
        VoteCounter storage voteCounter = request.voteCounter;
        return voteCounter.winningChoice;
    }


    /** @dev Creates a request to update the arbitration price. Only callable by court members.
     *  @param _arbitrationPrice Amount to be paid for arbitration.
     *  @return requestID The id of the update price request created.
     */
    function createUpdatePriceRequest(uint _arbitrationPrice) public onlyCourtMember returns(uint requestID) {

        requestID = requests.length++;
        ArbitrationPriceRequest storage request = requests[requestID];
        request.deadline = now + deadline;
        request.fee = _arbitrationPrice;

        emit UpdatePriceRequestCreation(requestID, msg.sender);
        return requestID;
    }


    /** @dev Vote for a price update request. Vote 1 for 'YES', 2 for 'NO'. Only callabe by court members.
     *  @param _requestID ID of the dispute to rule.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 means "Not able/wanting to make a decision".
     */
    function voteUpdatePriceRequest(uint _requestID, uint _ruling) public onlyCourtMember {
        require(_ruling < 3, "Invalid option.");
        ArbitrationPriceRequest storage request = requests[_requestID];
        require(request.deadline > now, "Can only vote before deadline.");
        require(!request.hasVoted[msg.sender], "Can only vote once.");
        require(request.status == PriceRequestStatus.Waiting, "Can only vote on requests not yet decided.");

        request.hasVoted[msg.sender] = true;
        request.voteCount[_ruling] += 1;

        request.votes.push(
            Vote({
                account: msg.sender,
                ruling: _ruling
            })
        );

        VoteCounter storage voteCounter = request.voteCounter;
        if(request.voteCount[_ruling] > voteCounter.winningCount){
            voteCounter.winningCount = request.voteCount[_ruling];
            voteCounter.winningChoice = _ruling;
        }  else if (voteCounter.winningCount == request.voteCount[_ruling]) {
            voteCounter.winningChoice = 0; // It's currently a tie.
        }

        if(request.voteCount[_ruling] > (members.length/2)) { // We have got the will of the majority.
            request.status = PriceRequestStatus.Solved;
            if(voteCounter.winningChoice == 1) {
                arbitrationPrice = request.fee;
            }
        }
    }


    /** @dev Forces a decision by timeout, update the arbitration price if majority decide 'YES'.
     *  @param _requestID ID of the request to timeout.
     */
    function timeoutUpdatePriceRequest(uint _requestID) public {
        ArbitrationPriceRequest storage request = requests[_requestID];
        require(now >= request.deadline, "Can only timeout arbitration update price request after deadline.");
        require(request.status == PriceRequestStatus.Waiting, "Can only timeout arbitration update price request not resolved.");
        
        request.status = PriceRequestStatus.Solved;
        VoteCounter storage voteCounter = request.voteCounter;

        if(voteCounter.winningChoice == 1) {
            arbitrationPrice = request.fee;
        }
    }

    /** @dev Cost of arbitration. Accessor to arbitrationPrice.
     *  @param _extraData Not used by this contract.
     *  @return fee Amount to be paid.
     */
    function arbitrationCost(bytes _extraData) public view returns(uint fee) {
        return arbitrationPrice;
    }
}