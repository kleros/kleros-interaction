pragma solidity ^0.4.24;

import "../MultiPartyInsurableArbitrableAgreementsBase.sol";

/**
 *  @title TwoPartyArbitrableEscrowPayment
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @notice Implementation of a two party arbitrable escrow service using the `MultiPartyInsurableArbitrableAgreementsBase` contract.
 */
contract TwoPartyArbitrableEscrowPayment is MultiPartyInsurableArbitrableAgreementsBase {
    /* Constructor */

    /** @dev Constructs the `TwoPartyArbitrableEscrowPayment` contract.
     *  @param _feeGovernor The fee governor of this contract.
     *  @param _stake The stake parameter for sharing fees.
     */
    constructor(address _feeGovernor, uint _stake) public MultiPartyInsurableArbitrableAgreementsBase(_feeGovernor, _stake) {}

    /* Internal */

    /** @dev Executes the ruling on the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _ruling The ruling.
     */
    function executeAgreementRuling(bytes32 _agreementID, uint _ruling) internal {
    }
}
