pragma solidity ^0.4.24;

import "./CentralizedArbitrator.sol";

/**
 *  @title BackedUpArbitrator
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev A centralized arbitrator that can be appealed when not responsive.
 */
contract BackedUpArbitrator is CentralizedArbitrator, Arbitrable {
    /* Storage */

    Arbitrator public backUp;
    uint public timeOut;
    mapping(uint => uint) public creationTimes;

    /* Constructor */

    /** @dev Constructs the BackedUpArbitrator contract.
     *  @param _arbitrationPrice The amount to be paid for arbitration.
     *  @param _backUp The back up arbitrator.
     *  @param _timeOut The time that needs to pass for a pending dispute to be appealable.
     */
    constructor(uint _arbitrationPrice, Arbitrator _backUp, uint _timeOut) public CentralizedArbitrator(_arbitrationPrice) {
        backUp = _backUp;
        timeOut = _timeOut;
    }

    /* External */

    /** @dev Changes the back up arbitrator.
     *  @param _backUp The new back up arbitrator.
     */
    function changeBackUp(Arbitrator _backUp) external onlyOwner {
        backUp = _backUp;
    }

    /** @dev Changes the time out.
     *  @param _timeOut The new time out.
     */
    function changeTimeOut(uint _timeOut) external onlyOwner {
        timeOut = _timeOut;
    }

    /* Public */

    /** @dev Creates a dispute.
     *  @param _choices The amount of choices in the dispute.
     *  @param _extraData Not used by this contract.
     *  @return The created dispute's ID.
     */
    function createDispute(uint _choices, bytes _extraData) public payable returns(uint disputeID)  {
        disputeID = super.createDispute(_choices, _extraData);
        creationTimes[disputeID] = now;
    }

    /** @dev Appeals a ruling.
     *  @param _disputeID The ID of the dispute.
     *  @param _extraData Additional info about the appeal.
     */
    function appeal(uint _disputeID, bytes _extraData) public payable requireAppealFee(_disputeID, _extraData) {
        super.appeal(_disputeID, _extraData);
        emit AppealDecision(backUp.createDispute(disputes[_disputeID].choices, _extraData), disputes[_disputeID].arbitrated);
    }

    /* Public Views */

    /** @dev Gets the cost of appeal for the specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _extraData Additional info about the appeal.
     *  @return The cost of appeal.
     */
    function appealCost(uint _disputeID, bytes _extraData) public view returns(uint cost) {
        if (now - creationTimes[_disputeID] > timeOut && disputes[_disputeID].ruling == 0) cost = backUp.arbitrationCost(_extraData);
        else cost = NOT_PAYABLE_VALUE;
    }
}
