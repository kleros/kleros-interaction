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
        uint value; // The value held by the agreement.
        uint numberOfChoices; // The number of choices in a dispute arising from the agreement.
        bytes extraData; // The extra data in a dispute arising from the agreement.
        uint arbitrationFeesWaitingTime; // The maximum time to wait for arbitration fees.
        uint appealFeesWaitingTime; // The maximum time to wait for appeal fees.
        Arbitrator arbitrator; // The arbitrator to use in a dispute arising from the agreement.
        uint disputeID; // The agreement's dispute ID, if disputed.
        bool disputed; // Wether the agreement is disputed or not.
        bool appealed; // Wether the agreement's dispute has been appealed or not.
    }

    /* Storage */

    mapping(bytes32 => Agreement) agreements;

    /* External */

    /** @dev Creates an agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _metaEvidence The meta evidence of the agreement.
     *  @param _parties The `parties` value of the agreement.
     *  @param _numberOfChoices The `numberOfChoices` value of the agreement.
     *  @param _extraData The `extraData` value of the agreement.
     *  @param _arbitrationFeesWaitingTime The `arbitrationFeesWaitingTime` value of the agreement.
     *  @param _appealFeesWaitingTime The `appealFeesWaitingTime` value of the agreement.
     *  @param _arbitrator The `arbitrator` value of the agreement.
     */
    function createAgreement(
        bytes32 _agreementID,
        string _metaEvidence,
        address[] _parties,
        uint _numberOfChoices,
        bytes _extraData,
        uint _arbitrationFeesWaitingTime,
        uint _appealFeesWaitingTime,
        Arbitrator _arbitrator
    ) external payable {
        require(agreements[_agreementID].creator == address(0), "The supplied agreement ID is already being used.");
        require(_parties.length <= 10, "There cannot be more than 10 parties.");
        agreements[_agreementID] = Agreement({
            creator: msg.sender,
            parties: _parties,
            value: msg.value,
            numberOfChoices: _numberOfChoices,
            extraData: _extraData,
            arbitrationFeesWaitingTime: _arbitrationFeesWaitingTime,
            appealFeesWaitingTime: _appealFeesWaitingTime,
            arbitrator: _arbitrator,
            disputeID: 0,
            disputed: false,
            appealed: false
        });
        emit MetaEvidence(uint(_agreementID), _metaEvidence);
    }
}
