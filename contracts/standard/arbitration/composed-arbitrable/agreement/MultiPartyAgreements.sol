pragma solidity ^0.4.24;

import "../../Arbitrator.sol";

/**
 *  @title MultiPartyAgreements
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Agreement part of a composed arbitrable contract. Handles multi-party, multi-choice dispute agreements.
 */
contract MultiPartyAgreements {
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
    }

    /* Events */



    /* Storage */



    /* Modifiers */



    /* Constructor */



    /* Fallback */



    /* External */



    /* External Views */



    /* Public */



    /* Public Views */



    /* Internal */



    /* Internal Views */



    /* Private */



    /* Private Views */



}