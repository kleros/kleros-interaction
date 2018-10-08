pragma solidity ^0.4.24;
pragma experimental ABIEncoderV2;

import "../proxy/ArbitrableProxyUser.sol";

/**
 *  @title TwoPartyArbitrableEscrowPaymentProxyUser
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Implementation of a two party arbitrable escrow service using the `ArbitrableProxyUser` contract.
 */
contract TwoPartyArbitrableEscrowPaymentProxyUser is ArbitrableProxyUser {
    /* Structs */

    struct Payment {
        uint value;
        uint createdAt;
        uint timeOut;
        bool executed;
    }

    /* Events */

    /** @dev Emitted when a payment is executed.
     *  @param _paymentID The ID of the payment.
     *  @param _sender The address of the sender.
     *  @param _receiver The address of the receiver.
     *  @param _value The value of the payment.
     */
    event PaymentExecuted(bytes32 indexed _paymentID, address indexed _sender, address indexed _receiver, uint _value);

    /* Storage */

    mapping(bytes32 => Payment) public payments;

    /* Constructor */

    /** @dev Constructs the `TwoPartyArbitrableEscrowPaymentProxyUser` contract.
     *  @param _arbitrableProxy The arbitrable proxy to use.
     */
    constructor(ArbitrableProxy _arbitrableProxy) public ArbitrableProxyUser(_arbitrableProxy) {}

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
        arbitrableProxy.createAgreement(
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
            timeOut: _timeOut,
            executed: false
        });
    }

    /** @dev Executes a payment that has already timed out and is not disputed.
     *  @param _paymentID The ID of the payment.
     */
    function executePayment(bytes32 _paymentID) external {
        (
          address _creator,
          address[] memory _parties,
          ,
          ,
          ,
          ,
          ,
          bool _disputed,
          ,
          ,
        ) = arbitrableProxy.getAgreementInfo(_paymentID);
        Payment storage payment = payments[_paymentID];
        require(_creator != address(0), "The specified payment does not exist.");
        require(!payment.executed, "The specified payment has already been executed.");
        require(!_disputed, "The specified payment is disputed.");
        require(now - payment.createdAt > payment.timeOut, "The specified payment has not timed out yet.");
        _parties[1].send(payment.value); // Avoid blocking.
        payment.executed = true;
        emit PaymentExecuted(_paymentID, _parties[0], _parties[1], payment.value);
    }

    /* Public */

    /** @dev Executes the ruling on the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _ruling The ruling.
     */
    function executeAgreementRuling(bytes32 _agreementID, uint _ruling) public {
        super.executeAgreementRuling(_agreementID, _ruling);
        (
          ,
          address[] memory _parties,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
          ,
        ) = arbitrableProxy.getAgreementInfo(_agreementID);
        (
          ,
          uint[] memory _stake,
          ,
          uint[2][] memory _totalContributedPerSide,
          bool[] memory _loserFullyFunded
        ) = arbitrableProxy.getFeesInfo(_agreementID);
        Payment storage payment = payments[_agreementID];
        require(!payment.executed, "The specified agreement has already been executed.");

        address _receiver;
        if (_stake.length == 1) { // Failed to fund first round.
            // Send the value to whoever paid more.
            if (_totalContributedPerSide[0][0] >= _totalContributedPerSide[0][1])
                _receiver = _parties[0];
            else
                _receiver = _parties[1];
        } else { // Failed to fund a later round.
            // Respect the ruling unless the losing side funded the appeal and the winning side paid less than expected.
            if (
                _loserFullyFunded[_loserFullyFunded.length - 1] &&
                _totalContributedPerSide[_totalContributedPerSide.length - 1][0] - _stake[_stake.length - 1] > _totalContributedPerSide[_totalContributedPerSide.length - 1][1]
            )
                _receiver = _parties[_ruling == 2 ? 0 : 1];
            else
                _receiver = _parties[_ruling == 2 ? 1 : 0];
        }

        _receiver.send(payment.value); // Avoid blocking.
        payment.executed = true;
        emit PaymentExecuted(_agreementID, _parties[0], _receiver, payment.value);
    }
}
