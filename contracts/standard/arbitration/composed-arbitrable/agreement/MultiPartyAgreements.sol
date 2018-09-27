pragma solidity ^0.4.24;

import "../../Arbitrable.sol";

/**
 *  @title MultiPartyAgreements
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Agreement part of a composed arbitrable contract. Handles multi-party, multi-choice dispute agreements.
 */
contract MultiPartyAgreements is Arbitrable {
    /* Structs */

    struct Agreement {
        address creator; // The agreement's creator.
        address[] parties; // The involved parties.
        uint numberOfChoices; // The number of choices in a dispute arising from the agreement.
        bytes extraData; // The extra data in a dispute arising from the agreement.
        uint arbitrationFeesWaitingTime; // The maximum time to wait for arbitration fees.
        Arbitrator arbitrator; // The arbitrator to use in a dispute arising from the agreement.
        uint disputeID; // The agreement's dispute ID, if disputed.
        bool disputed; // Wether the agreement is disputed or not.
        bool appealed; // Wether the agreement's dispute has been appealed or not.
        uint ruling; // The final ruling for the agreement's dispute.
        bool executed; // Wether the agreement has been executed or not.
    }

    /* Storage */

    mapping(bytes32 => Agreement) public agreements;
    mapping(address => mapping(uint => bytes32)) public arbitratorAndDisputeIDToAgreementID;

    /* Constructor */

    /** @dev Constructs the `MultiPartyAgreements` contract.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _arbitratorExtraData Extra data for the arbitrator.
     */
    constructor(Arbitrator _arbitrator, bytes _arbitratorExtraData) public Arbitrable(_arbitrator, _arbitratorExtraData) {}

    /* Public */

    /** @dev Executes the ruling on the specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _ruling The ruling.
     */
    function rule(uint _disputeID, uint _ruling) public {
        require(
            agreements[arbitratorAndDisputeIDToAgreementID[msg.sender][_disputeID]].arbitrator == Arbitrator(msg.sender),
            "A dispute can only be ruled on by its arbitrator."
        );
        emit Ruling(Arbitrator(msg.sender), _disputeID, _ruling);
        executeRuling(_disputeID, _ruling);
    }

    /* Internal */

    /** @dev Creates an agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _metaEvidence The meta evidence of the agreement.
     *  @param _parties The `parties` value of the agreement.
     *  @param _numberOfChoices The `numberOfChoices` value of the agreement.
     *  @param _extraData The `extraData` value of the agreement.
     *  @param _arbitrationFeesWaitingTime The `arbitrationFeesWaitingTime` value of the agreement.
     *  @param _arbitrator The `arbitrator` value of the agreement.
     */
    function _createAgreement(
        bytes32 _agreementID,
        string _metaEvidence,
        address[] _parties,
        uint _numberOfChoices,
        bytes _extraData,
        uint _arbitrationFeesWaitingTime,
        Arbitrator _arbitrator
    ) internal {
        require(agreements[_agreementID].creator == address(0), "The supplied agreement ID is already being used.");
        require(_parties.length <= 10, "There cannot be more than 10 parties.");
        agreements[_agreementID] = Agreement({
            creator: msg.sender,
            parties: _parties,
            numberOfChoices: _numberOfChoices,
            extraData: _extraData,
            arbitrationFeesWaitingTime: _arbitrationFeesWaitingTime,
            arbitrator: _arbitrator,
            disputeID: 0,
            disputed: false,
            appealed: false,
            ruling: 0,
            executed: false
        });
        emit MetaEvidence(uint(_agreementID), _metaEvidence);
    }

    /** @dev Executes the ruling on the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _ruling The ruling.
     */
    function executeAgreementRuling(bytes32 _agreementID, uint _ruling) internal;

    /** @dev Executes the ruling on the specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _ruling The ruling.
     */
    function executeRuling(uint _disputeID, uint _ruling) internal {
        bytes32 _agreementID = arbitratorAndDisputeIDToAgreementID[msg.sender][_disputeID];
        Agreement storage agreement = agreements[_agreementID];
        require(agreement.creator != address(0), "The specified agreement does not exist.");
        require(!agreement.executed, "The specified agreement has already been executed.");

        agreement.ruling = _ruling;
        executeAgreementRuling(_agreementID, _ruling);
        agreement.executed = true;
    }

    /* External Views */

    /** @dev Gets the info on the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @return The info.
     */
    function getAgreementInfo(bytes32 _agreementID) external view returns(
        address creator,
        address[] parties,
        uint numberOfChoices,
        bytes extraData,
        uint arbitrationFeesWaitingTime,
        Arbitrator arbitrator,
        uint disputeID,
        bool disputed,
        bool appealed,
        uint ruling,
        bool executed
    ) {
        creator = agreements[_agreementID].creator;
        parties = agreements[_agreementID].parties;
        numberOfChoices = agreements[_agreementID].numberOfChoices;
        extraData = agreements[_agreementID].extraData;
        arbitrationFeesWaitingTime = agreements[_agreementID].arbitrationFeesWaitingTime;
        arbitrator = agreements[_agreementID].arbitrator;
        disputeID = agreements[_agreementID].disputeID;
        disputed = agreements[_agreementID].disputed;
        appealed = agreements[_agreementID].appealed;
        ruling = agreements[_agreementID].ruling;
        executed = agreements[_agreementID].executed;
    }
}
