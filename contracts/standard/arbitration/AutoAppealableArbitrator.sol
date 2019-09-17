/**
 *  @authors: [@clesaege]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.4.24;

import "./Arbitrator.sol";
import "../../libraries/CappedMath.sol";

/** @title Auto Appealable Arbitrator
 *  @dev This is a centralized arbitrator which either gives direct rulings or provides a time and fee for appeal.
 */
contract AutoAppealableArbitrator is Arbitrator {
    using CappedMath for uint; // Operations bounded between 0 and 2**256 - 1.
    
    address public owner = msg.sender;
    uint arbitrationPrice; // Not public because arbitrationCost already acts as an accessor.
    uint constant NOT_PAYABLE_VALUE = (2**256 - 2) / 2; // High value to be sure that the appeal is too expensive.

    struct Dispute {
        Arbitrable arbitrated;  // The contract requiring arbitration.
        uint choices;           // The amount of possible choices, 0 excluded.
        uint fees;              // The total amount of fees collected by the arbitrator.
        uint ruling;            // The current ruling.
        DisputeStatus status;   // The status of the dispute.
        uint appealCost;        // The cost to appeal. 0 before it is appealable.
        uint appealPeriodStart; // The start of the appeal period. 0 before it is appealable.
        uint appealPeriodEnd;   // The end of the appeal Period. 0 before it is appealable.
    }

    modifier onlyOwner {require(msg.sender==owner, "Can only be called by the owner."); _;}

    Dispute[] public disputes;

    /** @dev Constructor. Set the initial arbitration price.
     *  @param _arbitrationPrice Amount to be paid for arbitration.
     */
    constructor(uint _arbitrationPrice) public {
        arbitrationPrice = _arbitrationPrice;
    }

    /** @dev Set the arbitration price. Only callable by the owner.
     *  @param _arbitrationPrice Amount to be paid for arbitration.
     */
    function setArbitrationPrice(uint _arbitrationPrice) external onlyOwner {
        arbitrationPrice = _arbitrationPrice;
    }

    /** @dev Cost of arbitration. Accessor to arbitrationPrice.
     *  @param _extraData Not used by this contract.
     *  @return fee Amount to be paid.
     */
    function arbitrationCost(bytes _extraData) public view returns(uint fee) {
        return arbitrationPrice;
    }

    /** @dev Cost of appeal. If appeal is not possible, it's a high value which can never be paid.
     *  @param _disputeID ID of the dispute to be appealed.
     *  @param _extraData Not used by this contract.
     *  @return fee Amount to be paid.
     */
    function appealCost(uint _disputeID, bytes _extraData) public view returns(uint fee) {
        Dispute storage dispute = disputes[_disputeID];
        if (dispute.status == DisputeStatus.Appealable)
            return dispute.appealCost;
        else
            return NOT_PAYABLE_VALUE;
    }

    /** @dev Create a dispute. Must be called by the arbitrable contract.
     *  Must be paid at least arbitrationCost().
     *  @param _choices Amount of choices the arbitrator can make in this dispute. When ruling <= choices.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return disputeID ID of the dispute created.
     */
    function createDispute(uint _choices, bytes _extraData) public payable returns(uint disputeID) {
        super.createDispute(_choices, _extraData);
        disputeID = disputes.push(Dispute({
            arbitrated: Arbitrable(msg.sender),
            choices: _choices,
            fees: msg.value,
            ruling: 0,
            status: DisputeStatus.Waiting,
            appealCost: 0,
            appealPeriodStart: 0,
            appealPeriodEnd: 0
            })) - 1; // Create the dispute and return its number.
        emit DisputeCreation(disputeID, Arbitrable(msg.sender));
    }
    
    /** @dev Give a ruling. UNTRUSTED.
     *  @param _disputeID ID of the dispute to rule.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 means "Not able/wanting to make a decision".
     */
    function giveRuling(uint _disputeID, uint _ruling) external onlyOwner {
        Dispute storage dispute = disputes[_disputeID];
        require(_ruling <= dispute.choices, "Invalid ruling.");
        require(dispute.status == DisputeStatus.Waiting, "The dispute must be waiting for arbitration.");

        dispute.ruling = _ruling;
        dispute.status = DisputeStatus.Solved;

        msg.sender.send(dispute.fees); // Avoid blocking.
        dispute.arbitrated.rule(_disputeID, _ruling);
    }
    
    /** @dev Give an appealable ruling.
     *  @param _disputeID ID of the dispute to rule.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 means "Not able/wanting to make a decision".
     *  @param _appealCost The cost of appeal.
     *  @param _timeToAppeal The time to appeal the ruling.
     */
    function giveAppealableRuling(uint _disputeID, uint _ruling, uint _appealCost, uint _timeToAppeal) external onlyOwner {
        Dispute storage dispute = disputes[_disputeID];
        require(_ruling <= dispute.choices, "Invalid ruling.");
        require(dispute.status == DisputeStatus.Waiting, "The dispute must be waiting for arbitration.");
        
        dispute.ruling = _ruling;
        dispute.status = DisputeStatus.Appealable;
        dispute.appealCost = _appealCost;
        dispute.appealPeriodStart = now;
        dispute.appealPeriodEnd = now.addCap(_timeToAppeal);
        
        emit AppealPossible(_disputeID, dispute.arbitrated);
    }
    
    
    /** @dev Change the appeal fee of a dispute.
     *  @param _disputeID The ID of the dispute to update.
     *  @param _appealCost The new cost to appeal this ruling.
     */
    function changeAppealFee(uint _disputeID, uint _appealCost) external onlyOwner {
        Dispute storage dispute = disputes[_disputeID];
        require(dispute.status == DisputeStatus.Appealable, "The dispute must be appealable.");
        
        dispute.appealCost = _appealCost;
    }
    
    /** @dev Appeal a ruling. Note that it has to be called before the arbitrator contract calls rule.
     *  @param _disputeID ID of the dispute to be appealed.
     *  @param _extraData Can be used to give extra info on the appeal.
     */
    function appeal(uint _disputeID, bytes _extraData) public requireAppealFee(_disputeID, _extraData) payable {
        Dispute storage dispute = disputes[_disputeID];
        require(dispute.status == DisputeStatus.Appealable, "The dispute must be appealable.");
        require(now < dispute.appealPeriodEnd, "The appeal must occur before the end of the appeal period.");
        
        dispute.fees += msg.value;
        dispute.status = DisputeStatus.Waiting;
        emit AppealDecision(_disputeID, Arbitrable(msg.sender));
    }
    
    /** @dev Execute the ruling of a dispute after the appeal period has passed. UNTRUSTED.
     *  @param _disputeID ID of the dispute to execute.
     */
    function executeRuling(uint _disputeID) external {
        Dispute storage dispute = disputes[_disputeID];
        require(dispute.status == DisputeStatus.Appealable, "The dispute must be appealable.");
        require(now >= dispute.appealPeriodEnd, "The dispute must be executed after its appeal period has ended.");
        
        dispute.status = DisputeStatus.Solved;
        msg.sender.send(dispute.fees); // Avoid blocking.
        dispute.arbitrated.rule(_disputeID, dispute.ruling);
    }

    /** @dev Return the status of a dispute (in the sense of ERC792, not the Dispute property).
     *  @param _disputeID ID of the dispute to rule.
     *  @return status The status of the dispute.
     */
    function disputeStatus(uint _disputeID) public view returns(DisputeStatus status) {
        Dispute storage dispute = disputes[_disputeID];
        if (disputes[_disputeID].status==DisputeStatus.Appealable && now>=dispute.appealPeriodEnd) // If the appeal period is over, consider it solved even if rule has not been called yet.
            return DisputeStatus.Solved;
        else
            return disputes[_disputeID].status;
    }

    /** @dev Return the ruling of a dispute.
     *  @param _disputeID ID of the dispute.
     *  @return ruling The ruling which have been given or which would be given if no appeals are raised.
     */
    function currentRuling(uint _disputeID) public view returns(uint ruling) {
        return disputes[_disputeID].ruling;
    }
    
    /** @dev Compute the start and end of the dispute's current or next appeal period, if possible.
     *  @param _disputeID ID of the dispute.
     *  @return The start and end of the period.
     */
    function appealPeriod(uint _disputeID) public view returns(uint start, uint end) {
        Dispute storage dispute = disputes[_disputeID];
        return (dispute.appealPeriodStart, dispute.appealPeriodEnd);
    }

}
