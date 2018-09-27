pragma solidity ^0.4.24;

import "../composed/MultiPartyInsurableArbitrableAgreementsBase.sol";

/**
 *  @title TwoPartyArbitrableEscrowPayment
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Implementation of a two party arbitrable escrow service using the `MultiPartyInsurableArbitrableAgreementsBase` contract.
 */
contract TwoPartyArbitrableEscrowPayment is MultiPartyInsurableArbitrableAgreementsBase {
    /* Structs */

    struct Payment {
        uint value;
        uint createdAt;
        uint timeOut;
    }

    /* Storage */

    mapping(bytes32 => Payment) public payments;

    /* Constructor */

    /** @dev Constructs the `TwoPartyArbitrableEscrowPayment` contract.
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
    ) public MultiPartyInsurableArbitrableAgreementsBase(_arbitrator, _arbitratorExtraData, _feeGovernor, _stake) {}

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
        require(msg.value > 0, "Payment must be more than zero.");
        address[] memory _parties = new address[](2);
        _parties[0] = msg.sender;
        _parties[1] = _to;
        _createAgreement(
            _paymentID,
            _metaEvidence,
            _parties,
            2,
            new bytes(0),
            _arbitrationFeesWaitingTime,
            _arbitrator
        );
        payments[_paymentID] = Payment({
            value: msg.value,
            createdAt: now,
            timeOut: _timeOut
        });
    }

    /** @dev Executes a payment that has already timed out and is not disputed.
     *  @param _paymentID The ID of the payment.
     */
    function executePayment(bytes32 _paymentID) external {
        Agreement storage agreement = agreements[_paymentID];
        Payment storage payment = payments[_paymentID];
        require(agreement.creator != address(0), "The specified payment does not exist.");
        require(!agreement.executed, "The specified payment has already been executed.");
        require(!agreement.disputed, "The specified payment is disputed.");
        require(now - payment.createdAt > payment.timeOut, "The specified payment has not timed out yet.");
        agreement.parties[1].send(payment.value); // Avoid blocking.
        agreement.executed = true;
    }

    /* Internal */

    /** @dev Executes the ruling on the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _ruling The ruling.
     */
    function executeAgreementRuling(bytes32 _agreementID, uint _ruling) internal {
        super.executeAgreementRuling(_agreementID, _ruling);
        Agreement storage agreement = agreements[_agreementID];
        PaidFees storage _paidFees = paidFees[_agreementID];
        Payment storage payment = payments[_agreementID];

        if (_paidFees.stake.length == 1) { // Failed to fund first round.
            // Send the value to whoever paid more.
            if (_paidFees.totalContributedPerSide[0][0] >= _paidFees.totalContributedPerSide[0][1])
                agreement.parties[0].send(payment.value); // Avoid blocking.
            else
                agreement.parties[1].send(payment.value); // Avoid blocking.
        } else { // Failed to fund a later round.
            // Respect the ruling unless the losing side funded the appeal and the winning side paid less than expected.
            if (
                _paidFees.loserFullyFunded[_paidFees.loserFullyFunded.length - 1] &&
                _paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][0] - _paidFees.stake[_paidFees.stake.length - 1] > _paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][1]
            )
                agreement.parties[_ruling == 0 ? 1 : 0].send(payment.value); // Avoid blocking.
            else
                agreement.parties[_ruling].send(payment.value); // Avoid blocking.
        }

        agreement.executed = true;
    }
}
