pragma solidity ^0.4.24;

import "../agreement/MultiPartyAgreements.sol";
import "../fee/MultiPartyInsurableFees.sol";
import "../evidence/MultiPartyEvidence.sol";

/**
 *  @title MultiPartyInsurableArbitrableAgreementsBase
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Base composed arbitrable contract. Handles multi-party, multi-choice dispute agreements with party evidence and crowdinsured arbitration and appeal fees.
 */
contract MultiPartyInsurableArbitrableAgreementsBase is MultiPartyAgreements, MultiPartyInsurableFees, MultiPartyEvidence {
    /* Constructor */

    /** @dev Constructs the `MultiPartyInsurableArbitrableAgreementsBase` contract.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _arbitratorExtraData Extra data for the arbitrator.
     *  @param _feeGovernor The fee governor of this contract.
     *  @param _stake The stake parameter for sharing fees.
     */
    constructor(
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        address _feeGovernor,
        uint _stake
    ) public MultiPartyAgreements(_arbitrator, _arbitratorExtraData) MultiPartyInsurableFees(_feeGovernor, _stake) {}
}
