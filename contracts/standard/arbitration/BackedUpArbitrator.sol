pragma solidity ^0.4.24;

import "./CentralizedArbitrator.sol";

/**
 *  @title BackedUpArbitrator
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev A centralized arbitrator that can be appealed when not responsive.
 */
contract BackedUpArbitrator is CentralizedArbitrator, Arbitrable {
    /* Storage */

    uint public timeOut;
    mapping(uint => uint) public creationTimes;
    mapping(uint => uint) public disputeIDMap;

    /* Constructor */

    /** @dev Constructs the BackedUpArbitrator contract.
     *  @param _arbitrationPrice The amount to be paid for arbitration.
     *  @param _arbitrator The back up arbitrator.
     *  @param _arbitratorExtraData Not used by this contract.
     *  @param _timeOut The time that needs to pass for a pending dispute to be appealable.
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
        disputeIDMap[_disputeID] = arbitrator.createDispute(disputes[_disputeID].choices, _extraData);
    }

    /* Public Views */

    /** @dev Gets the cost of appeal for the specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _extraData Additional info about the appeal.
     *  @return The cost of appeal.
     */
    function appealCost(uint _disputeID, bytes _extraData) public view returns(uint cost) {
        if (now - creationTimes[_disputeID] > timeOut && disputes[_disputeID].ruling == 0) cost = arbitrator.arbitrationCost(_extraData);
        else cost = NOT_PAYABLE_VALUE;
    }

    /* Internal */

    /** @dev Executes the ruling of the specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _ruling The ruling.
     */
    function executeRuling(uint _disputeID, uint _ruling) internal {
        disputes[disputeIDMap[_disputeID]].arbitrated.rule(_disputeID, _ruling);
    }
}
