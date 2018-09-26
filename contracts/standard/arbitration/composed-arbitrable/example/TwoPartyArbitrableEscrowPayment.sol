pragma solidity ^0.4.24;

import "../MultiPartyInsurableArbitrableAgreementsBase.sol";

/**
 *  @title TwoPartyArbitrableEscrowPayment
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Implementation of a two party arbitrable escrow service using the `MultiPartyInsurableArbitrableAgreementsBase` contract.
 */
contract TwoPartyArbitrableEscrowPayment is MultiPartyInsurableArbitrableAgreementsBase {
    /* Storage */

    mapping(bytes32 => uint) public timeOuts;

    /* Constructor */

    /** @dev Constructs the `TwoPartyArbitrableEscrowPayment` contract.
     *  @param _feeGovernor The fee governor of this contract.
     *  @param _stake The stake parameter for sharing fees.
     */
    constructor(address _feeGovernor, uint _stake) public MultiPartyInsurableArbitrableAgreementsBase(_feeGovernor, _stake) {}

    /* External */

    /** @dev Creates an escrowed payment.
     *  @param _paymentID The ID of the payment.
     *  @param _metaEvidence The meta evidence for the potential dispute.
     *  @param _to The receiver of the payment.
     *  @param _arbitrationFeesWaitingTime The maximum time to wait for arbitration fees if the dispute is raised.
     *  @param _arbitrator The arbitrator to use for the potential dispute.
     *  @param _timeOut The time to wait before executing the payment if the dispute is not raised.
     */
    function createPayment(
        bytes32 _paymentID,
        string _metaEvidence,
        address _to,
        uint _arbitrationFeesWaitingTime,
        Arbitrator _arbitrator,
        uint _timeOut
    ) external payable {
        address[] memory _parties = new address[](2);
        _parties[0] = msg.sender;
        _parties[1] = _to;
        createAgreement(
            _paymentID,
            _metaEvidence,
            _parties,
            2,
            new bytes(0),
            _arbitrationFeesWaitingTime,
            _arbitrator
        );
        timeOuts[_paymentID] = _timeOut;
    }

    /* Internal */

    /** @dev Executes the ruling on the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _ruling The ruling.
     */
    function executeAgreementRuling(bytes32 _agreementID, uint _ruling) internal {
    }
}
