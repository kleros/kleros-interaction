pragma solidity ^0.4.24;

import "./MultiPartyInsurableArbitrableAgreementsBase.sol";
import "./ComposedArbitrableProxyUser.sol";

/**
 *  @title MultiPartyInsurableArbitrableAgreementsProxy
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @notice Proxy implementation of `MultiPartyInsurableArbitrableAgreementsBase`.
 */
contract MultiPartyInsurableArbitrableAgreementsProxy is MultiPartyInsurableArbitrableAgreementsBase {
    /* Constructor */

    /** @dev Constructs the `MultiPartyInsurableArbitrableAgreementsProxy` contract.
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
        ComposedArbitrableProxyUser(
            agreements[_agreementID].creator
        ).executeAgreementRuling.value(agreements[_agreementID].value)(_agreementID, _ruling);
    }
}
