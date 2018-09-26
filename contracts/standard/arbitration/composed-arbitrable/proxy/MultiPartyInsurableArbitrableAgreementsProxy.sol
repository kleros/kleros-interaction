pragma solidity ^0.4.24;

import "../composed/MultiPartyInsurableArbitrableAgreementsBase.sol";

import "./ArbitrableProxy.sol";
import "./ArbitrableProxyUser.sol";

/**
 *  @title MultiPartyInsurableArbitrableAgreementsProxy
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Proxy implementation of `MultiPartyInsurableArbitrableAgreementsBase`.
 */
contract MultiPartyInsurableArbitrableAgreementsProxy is MultiPartyInsurableArbitrableAgreementsBase, ArbitrableProxy {
    /* Constructor */

    /** @dev Constructs the `MultiPartyInsurableArbitrableAgreementsProxy` contract.
     *  @param _feeGovernor The fee governor of this contract.
     *  @param _stake The stake parameter for sharing fees.
     */
    constructor(address _feeGovernor, uint _stake) public MultiPartyInsurableArbitrableAgreementsBase(_feeGovernor, _stake) {}

    /* External */

    /** @dev Creates an agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _metaEvidence The meta evidence of the agreement.
     *  @param _parties The `parties` value of the agreement.
     *  @param _numberOfChoices The `numberOfChoices` value of the agreement.
     *  @param _extraData The `extraData` value of the agreement.
     *  @param _arbitrationFeesWaitingTime The `arbitrationFeesWaitingTime` value of the agreement.
     *  @param _arbitrator The `arbitrator` value of the agreement.
     */
    function createAgreement(
        bytes32 _agreementID,
        string _metaEvidence,
        address[] _parties,
        uint _numberOfChoices,
        bytes _extraData,
        uint _arbitrationFeesWaitingTime,
        Arbitrator _arbitrator
    ) external {
        return _createAgreement(
            _agreementID,
            _metaEvidence,
            _parties,
            _numberOfChoices,
            _extraData,
            _arbitrationFeesWaitingTime,
            _arbitrator
        );
    }

    /* Internal */

    /** @dev Executes the ruling on the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _ruling The ruling.
     */
    function executeAgreementRuling(bytes32 _agreementID, uint _ruling) internal {
        ArbitrableProxyUser(
            agreements[_agreementID].creator
        ).executeAgreementRuling(_agreementID, _ruling);
    }
}
