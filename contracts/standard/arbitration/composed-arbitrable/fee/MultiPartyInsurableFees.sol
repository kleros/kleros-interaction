pragma solidity ^0.4.24;

import "../agreement/MultiPartyAgreements.sol";

/**
 *  @title MultiPartyInsurableFees
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Fee part of a composed arbitrable contract. Handles crowdinsured arbitration and appeal fees.
 */
contract MultiPartyInsurableFees is MultiPartyAgreements {
    /* Structs */

    struct PaidFees {
        uint[] stake; // The stake required in each round.
        uint[] totalValue; // The current held value in each round.
        uint[2][] totalContributedPerSide; // The total amount contributed per side in each round.
        mapping(address => uint)[] contributions; // The contributions in each round.
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

    /** @dev Gets the info on fees paid for the specified round.
     *  @param _agreementID The ID of the agreement.
     *  @param _round The round.
     */
    function getRoundInfo(
        bytes32 _agreementID,
        uint _round
    ) external view returns(uint roundStake, uint roundTotalValue, uint[2] roundTotalContributedPerSide) {
        roundStake = paidFees[_agreementID].stake[_round];
        roundTotalValue = paidFees[_agreementID].totalValue[_round];
        roundTotalContributedPerSide = paidFees[_agreementID].totalContributedPerSide[_round];
    }

    /* Public */



    /* Public Views */



    /* Internal */



    /* Internal Views */



    /* Private */



    /* Private Views */



}
