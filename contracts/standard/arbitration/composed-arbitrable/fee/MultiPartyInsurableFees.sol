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

    address feeGovernor;
    uint public stake;
    mapping(bytes32 => PaidFees) internal paidFees;

    /* Constructor */

    /** @dev Constructs the `MultiPartyInsurableFees` contract.
     *  @param _feeGovernor The governor of this contract.
     *  @param _stake The stake parameter for sharing fees.
     */
    constructor(address _feeGovernor, uint _stake) public {
        feeGovernor = _feeGovernor;
        stake = _stake;
    }

    /* External */

    /** @dev Changes the `feeGovernor` storage variable.
     *  @param _feeGovernor The new `feeGovernor` storage variable.
     */
    function changeFeeGovernor(address _feeGovernor) external {
        require(msg.sender == feeGovernor, "The caller is not the fee governor.");
        feeGovernor = _feeGovernor;
    }

    /** @dev Changes the `stake` storage variable.
     *  @param _stake The new `stake` storage variable.
     */
    function changeStake(uint _stake) external {
        require(msg.sender == feeGovernor, "The caller is not the fee governor.");
        stake = _stake;
    }

    /* External Views */



    /* Public */



    /* Public Views */



    /* Internal */



    /* Internal Views */



    /* Private */



    /* Private Views */



}
