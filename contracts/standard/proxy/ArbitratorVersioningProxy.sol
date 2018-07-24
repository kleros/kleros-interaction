pragma solidity ^0.4.15;

import "../arbitration/Arbitrator.sol";

import "./VersioningProxy.sol";

/**
 *  @title ArbitratorVersioningProxy
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @notice An Arbitrator proxy that only exposes methods in the Arbitrator spec.
 */
contract ArbitratorVersioningProxy is Arbitrator, VersioningProxy {
    /* Structs */

    struct Dispute {
        Arbitrator arbitrator;
        uint256 disputeID;
        uint256 choices;
    }

    /* Storage */

    Dispute[] public disputes;

    /* Constructor */

    /**
     * @notice Constructs the arbitrator versioning proxy with the first arbitrator contract version address and tags it v0.0.1.
     * @param _firstAddress The address of the first arbitrator contract version.
     */
    constructor(Arbitrator _firstAddress) VersioningProxy("0.0.1", _firstAddress) public {}

    /* Public */

    /** @notice Creates a dispute in the current `implementation` contract. Must be called by the arbitrable contract.
     *  @param _choices The amount of choices the arbitrator can make in this dispute.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return The ID of the created dispute in the context of this contract.
     */
    function createDispute(uint256 _choices, bytes _extraData) public payable returns(uint256 _disputeID) {
        uint256 _arbitratorDisputeID = Arbitrator(implementation).createDispute.value(msg.value)(_choices, _extraData);
        return disputes.push(
            Dispute({
                arbitrator: Arbitrator(implementation),
                disputeID: _arbitratorDisputeID,
                choices: _choices
            })
        );
    }

    /** @notice Appeals a ruling to the current `implementation` contract.
     *  @param _disputeID The ID of the dispute to be appealed.
     *  @param _extraData Can be used to give extra info on the appeal.
     */
    function appeal(uint256 _disputeID, bytes _extraData) public payable {
        if (disputes[_disputeID].arbitrator != implementation) { // Arbitrator has been upgraded, create a new dispute in the new arbitrator
            uint256 _choices = disputes[_disputeID].choices;
            uint256 _arbitratorDisputeID = Arbitrator(implementation).createDispute.value(msg.value)(_choices, _extraData);
            disputes[_disputeID] = Dispute({ arbitrator: Arbitrator(implementation), disputeID: _arbitratorDisputeID, choices: _choices });
        }

        Arbitrator(implementation).appeal.value(msg.value)(disputes[_disputeID].disputeID, _extraData);
    }

    /* Public Views */

    /** @notice Computes the cost of arbitration in the current `implementation` contract. It is recommended not to increase it often, as it can be highly time and gas consuming for the arbitrated contracts to cope with fee augmentation.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return _fee The arbitration cost.
     */
    function arbitrationCost(bytes _extraData) public view returns(uint256 _fee) {
        return Arbitrator(implementation).arbitrationCost(_extraData);
    }

    /** @notice Computes the cost of appealing to the current `implementation` contract. It is recommended not to increase it often, as it can be highly time and gas consuming for the arbitrated contracts to cope with fee augmentation.
     *  @param _disputeID The ID of the dispute to be appealed.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return _fee The appeal cost.
     */
    function appealCost(uint256 _disputeID, bytes _extraData) public view returns(uint256 _fee) {
        return Arbitrator(implementation).appealCost(disputes[_disputeID].disputeID, _extraData);
    }

    /** @notice Get the current ruling of a dispute. This is useful for parties to know if they should appeal.
     *  @param _disputeID The ID of the dispute.
     *  @return _ruling The current ruling which will be given if there is no appeal or which has been given.
     */
    function currentRuling(uint256 _disputeID) public view returns(uint256 _ruling) {
        return disputes[_disputeID].arbitrator.currentRuling(disputes[_disputeID].disputeID);
    }

    /** @notice Get the status of a dispute.
     *  @param _disputeID The ID of the dispute.
     *  @return _status The status of the dispute.
     */
    function disputeStatus(uint256 _disputeID) public view returns(Arbitrator.DisputeStatus _status) {
        return disputes[_disputeID].arbitrator.disputeStatus(disputes[_disputeID].disputeID);
    }
}
