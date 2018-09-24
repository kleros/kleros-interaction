pragma solidity ^0.4.24;

import "../agreement/MultiPartyAgreements.sol";

/**
 *  @title MultiPartyInsurableFees
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Fee part of a composed arbitrable contract. Handles crowdinsured arbitration and appeal fees.
 */
contract MultiPartyInsurableFees is MultiPartyAgreements {
    /* Structs */

    struct Contribution {
        address _address; // The address that contributed.
        uint value; // The value contributed.
    }
    struct PaidFees {
        uint[] stake; // The stake required in each round.
        uint[] totalValue; // The current held value in each round.
        uint[2][] totalContributedPerSide; // The total amount contributed per side in each round.
        mapping(address => Contribution)[] contributions; // The contributions in each round.
    }

    /* Storage */

    uint public stake;
    mapping(bytes32 => PaidFees) internal paidFees;

    /* Constructor */

    /** @dev Constructs the `MultiPartyInsurableFees` contract.
     *  @param _stake The stake parameter for sharing fees.
     */
    constructor(uint _stake) public {
        stake = _stake;
    }

    /* External */



    /* External Views */



    /* Public */



    /* Public Views */



    /* Internal */



    /* Internal Views */



    /* Private */



    /* Private Views */



}
