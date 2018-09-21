pragma solidity ^0.4.24;

import "./CentralizedArbitrator.sol";

/**
 *  @title AppealableArbitrator
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev A centralized arbitrator that can be appealed.
 */
contract AppealableArbitrator is CentralizedArbitrator, Arbitrable {
    /* Structs */

    struct AppealDispute {
        uint rulingTime;
        uint appealDisputeID;
        bool appealed;
    }

    /* Storage */

    uint public timeOut;
    mapping(uint => AppealDispute) public appealDisputes;

    /* Constructor */

    /** @dev Constructs the AppealableArbitrator contract.
     *  @param _arbitrationPrice The amount to be paid for arbitration.
     *  @param _arbitrator The back up arbitrator.
     *  @param _arbitratorExtraData Not used by this contract.
     *  @param _timeOut The time out for the appeal period.
     */
    constructor(
        uint _arbitrationPrice,
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        uint _timeOut
    ) public CentralizedArbitrator(_arbitrationPrice) Arbitrable(_arbitrator, _arbitratorExtraData) {
        timeOut = _timeOut;
    }

    /* External */
    
    /** @dev Changes the time out.
     *  @param _timeOut The new time out.
     */
    function changeTimeOut(uint _timeOut) external onlyOwner {
        timeOut = _timeOut;
    }

    /* Public */

    /** @dev Appeals a ruling.
     *  @param _disputeID The ID of the dispute.
     *  @param _extraData Additional info about the appeal.
     */
    function appeal(uint _disputeID, bytes _extraData) public payable requireAppealFee(_disputeID, _extraData) {
        super.appeal(_disputeID, _extraData);
        appealDisputes[_disputeID].appealDisputeID = arbitrator.createDispute(disputes[_disputeID].choices, _extraData);
        appealDisputes[_disputeID].appealed = true;
    }

    /** @dev Gives a ruling.
     *  @param _disputeID The ID of the dispute.
     *  @param _ruling The ruling.
     */
    function giveRuling(uint _disputeID, uint _ruling) public {
        require(
            // solium-disable-next-line indentation
            (!appealDisputes[_disputeID].appealed && msg.sender == owner) || (appealDisputes[_disputeID].appealed && Arbitrator(msg.sender) == arbitrator),
            "Appealed disputes must be ruled by the back up arbitrator."
        );
        if (!appealDisputes[_disputeID].appealed) {
            if (disputes[_disputeID].status == DisputeStatus.Appealable) {
                if (now - appealDisputes[_disputeID].rulingTime > timeOut)
                    super.giveRuling(_disputeID, _ruling);
                else revert("Time out time has not passed yet.");
            }
            else {
                disputes[_disputeID].ruling = _ruling;
                disputes[_disputeID].status = DisputeStatus.Appealable;
                appealDisputes[_disputeID].rulingTime = now;
                emit AppealPossible(_disputeID, disputes[_disputeID].arbitrated);
            }
        }
        else super.giveRuling(_disputeID, _ruling);
    }

    /* Public Views */

    /** @dev Gets the cost of appeal for the specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _extraData Additional info about the appeal.
     *  @return The cost of the appeal.
     */
    function appealCost(uint _disputeID, bytes _extraData) public view returns(uint cost) {
        if (disputes[_disputeID].status == DisputeStatus.Appealable && !appealDisputes[_disputeID].appealed)
            cost = arbitrator.arbitrationCost(_extraData);
        else cost = NOT_PAYABLE_VALUE;
    }

    /* Internal */

    /** @dev Executes the ruling of the specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _ruling The ruling.
     */
    function executeRuling(uint _disputeID, uint _ruling) internal {
        giveRuling(appealDisputes[_disputeID].appealDisputeID, _ruling);
    }
}
