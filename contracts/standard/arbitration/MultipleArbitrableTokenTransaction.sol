/**
 *  @authors: [@n1c01a5, @hellwolf]
 *  @reviewers: [@ferittuncer*, @unknownunknown1]
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

/** @title Multiple Arbitrable ERC20 Token Transaction
 *  This is a contract for multiple arbitrated token transactions which can be reversed by an arbitrator.
 *  This can be used for buying goods, services and for paying freelancers.
 *  Parties are identified as "sender" and "receiver".
 */

pragma solidity ^0.4.24;

import "./Arbitrator.sol";

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

contract MultipleArbitrableTokenTransaction {

    // **************************** //
    // *    Contract variables    * //
    // **************************** //

    uint8 constant AMOUNT_OF_CHOICES = 2;

    enum Party {Sender, Receiver}
    enum Status {NoDispute, WaitingSender, WaitingReceiver, DisputeCreated, Resolved}
    enum RulingOptions {NoRuling, ReceiverWins, SenderWins}

    struct Transaction {
        address sender;
        address receiver;
        uint256 amount;
        uint256 timeoutPayment; // Time in seconds after which the transaction can be automatically executed if not disputed.
        uint disputeId; // If dispute exists, the ID of the dispute.
        uint senderFee; // Total fees paid by the sender.
        uint receiverFee; // Total fees paid by the receiver.
        uint lastInteraction; // Last interaction for the dispute procedure.
        Status status;
        uint arbitrationCost;
    }

    Transaction[] public transactions;
    Arbitrator arbitrator; // Address of the arbitrator contract.
    ERC20 token; // Address of the token contract.
    bytes arbitratorExtraData; // Extra data to set up the arbitration.
    uint feeTimeout; // Time in seconds a party can take to pay arbitration fees before being considered unresponding and lose the dispute.

    mapping (uint => uint) public disputeIDtoTransactionID;

    // **************************** //
    // *          Events          * //
    // **************************** //

    /** @dev To be emitted when meta-evidence is submitted.
     *  @param _metaEvidenceID Unique identifier of meta-evidence. Should be the `transactionID`.
     *  @param _evidence A link to the meta-evidence JSON.
     */
    event MetaEvidence(uint indexed _metaEvidenceID, string _evidence);

    /** @dev Indicate that a party has to pay a fee or would otherwise be considered as losing.
     *  @param _transactionID The index of the transaction.
     *  @param _party The party who has to pay.
     */
    event HasToPayFee(uint indexed _transactionID, Party _party);

    /** @dev To be raised when evidence is submitted. Should point to the resource (evidences are not to be stored on chain due to gas considerations).
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _party The address of the party submitting the evidence. Note that 0 is kept for evidences not submitted by any party.
     *  @param _evidence A link to an evidence JSON that follows the ERC 1497 Evidence standard (https://github.com/ethereum/EIPs/issues/1497).
     */
    event Evidence(Arbitrator indexed _arbitrator, uint indexed _disputeID, address indexed _party, string _evidence);

    /** @dev To be emitted when a dispute is created to link the correct meta-evidence to the disputeID.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _metaEvidenceID Unique identifier of meta-evidence. Should be the `transactionID`.
     */
    event Dispute(Arbitrator indexed _arbitrator, uint indexed _disputeID, uint _metaEvidenceID);

    /** @dev To be raised when a ruling is given.
     *  @param _arbitrator The arbitrator giving the ruling.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling The ruling which was given.
     */
    event Ruling(Arbitrator indexed _arbitrator, uint indexed _disputeID, uint _ruling);

    // **************************** //
    // *    Arbitrable functions  * //
    // *    Modifying the state   * //
    // **************************** //

    /** @dev Constructor.
     *  @param _token The address of the transacted token.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _arbitratorExtraData Extra data for the arbitrator.
     *  @param _feeTimeout Arbitration fee timeout for the parties.
     */
    constructor (
        ERC20 _token,
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        uint _feeTimeout
    ) public {
        token = _token;
        arbitrator = _arbitrator;
        arbitratorExtraData = _arbitratorExtraData;
        feeTimeout = _feeTimeout;
    }

    /** @dev Create a transaction. UNTRUSTED.
     *  @param _amount The amount of tokens in this transaction.
     *  @param _timeoutPayment Time after which a party automatically loses a dispute.
     *  @param _sender The recipient of the transaction.
     *  @param _metaEvidence Link to the meta-evidence.
     *  @return The index of the transaction.
     */
    function createTransaction(
        uint _amount,
        uint _timeoutPayment,
        address _sender,
        string _metaEvidence
    ) public returns (uint transactionIndex) {
        // Transfers token from sender wallet to contract.
        require(token.transferFrom(msg.sender, address(this), _amount), "Sender does not have enough funds.");

        transactions.push(Transaction({
            sender: _sender,
            receiver: msg.sender,
            amount: _amount,
            timeoutPayment: _timeoutPayment,
            disputeId: 0,
            senderFee: 0,
            receiverFee: 0,
            lastInteraction: now,
            status: Status.NoDispute,
            arbitrationCost: 0
        }));
        emit MetaEvidence(transactions.length - 1, _metaEvidence);

        return transactions.length - 1;
    }

    /** @dev Pay sender. To be called if the good or service is provided. UNTRUSTED.
     *  @param _transactionID The index of the transaction.
     *  @param _amount Amount to pay in tokens.
     */
    function pay(uint _transactionID, uint _amount) public {
        Transaction storage transaction = transactions[_transactionID];
        require(transaction.receiver == msg.sender, "The caller must be the receiver.");
        require(transaction.status == Status.NoDispute, "The transaction can't be disputed.");
        require(_amount <= transaction.amount, "The amount paid has to be less or equal than the transaction.");

        transaction.amount -= _amount;
        require(token.transfer(transaction.sender, _amount) != false, "The `transfer` function must not fail.");
    }

    /** @dev Reimburse receiver. To be called if the good or service can't be fully provided. UNTRUSTED.
     *  @param _transactionID The index of the transaction.
     *  @param _amountReimbursed Amount to reimburse in tokens.
     */
    function reimburse(uint _transactionID, uint _amountReimbursed) public {
        Transaction storage transaction = transactions[_transactionID];
        require(transaction.sender == msg.sender, "The caller must be the sender.");
        require(transaction.status == Status.NoDispute, "The transaction can't be disputed.");
        require(_amountReimbursed <= transaction.amount, "The amount reimbursed has to be less or equal than the transaction.");

        transaction.amount -= _amountReimbursed;
        require(token.transfer(transaction.receiver, _amountReimbursed) != false, "The `transfer` function must not fail.");
    }

    /** @dev Transfer the transaction's amount to the sender if the timeout has passed. UNTRUSTED.
     *  @param _transactionID The index of the transaction.
     */
    function executeTransaction(uint _transactionID) public {
        Transaction storage transaction = transactions[_transactionID];
        require(now - transaction.lastInteraction >= transaction.timeoutPayment, "The timeout has not passed yet.");
        require(transaction.status == Status.NoDispute, "The transaction can't be disputed.");

        uint amount = transaction.amount;
        transaction.amount = 0;

        transaction.status = Status.Resolved;

        require(token.transfer(transaction.sender, amount) != false, "The `transfer` function must not fail.");
    }

    /** @dev Reimburse receiver if sender fails to pay the fee. UNTRUSTED.
     *  @param _transactionID The index of the transaction.
     */
    function timeOutByReceiver(uint _transactionID) public {
        Transaction storage transaction = transactions[_transactionID];

        require(transaction.status == Status.WaitingSender, "The transaction is not waiting on the sender.");
        require(now - transaction.lastInteraction >= feeTimeout, "Timeout time has not passed yet.");

        executeRuling(_transactionID, uint(RulingOptions.ReceiverWins));
    }

    /** @dev Pay sender if receiver fails to pay the fee. UNTRUSTED.
     *  @param _transactionID The index of the transaction.
     */
    function timeOutBySender(uint _transactionID) public {
        Transaction storage transaction = transactions[_transactionID];

        require(transaction.status == Status.WaitingReceiver, "The transaction is not waiting on the receiver.");
        require(now - transaction.lastInteraction >= feeTimeout, "Timeout time has not passed yet.");

        executeRuling(_transactionID, uint(RulingOptions.SenderWins));
    }

    /** @dev Pay the arbitration fee to raise a dispute. To be called by the receiver. UNTRUSTED.
     *  Note that this function mirrors payArbitrationFeeBySender.
     *  @param _transactionID The index of the transaction.
     */
    function payArbitrationFeeByReceiver(uint _transactionID) public payable {
        Transaction storage transaction = transactions[_transactionID];
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        require(transaction.status < Status.DisputeCreated, "Dispute has already been created.");
        require(msg.sender == transaction.receiver, "The caller must be the receiver.");

        transaction.receiverFee += msg.value;
        // Require that the total paid to be at least the arbitration cost.
        require(transaction.receiverFee >= arbitrationCost, "The receiver fee must cover arbitration costs.");

        transaction.lastInteraction = now;
        // The sender still has to pay. This can also happen if he has paid, but arbitrationCost has increased.
        if (transaction.senderFee < arbitrationCost) {
            transaction.status = Status.WaitingSender;
            emit HasToPayFee(_transactionID, Party.Sender);
        } else { // The receiver has also paid the fee. We create the dispute.
            raiseDispute(_transactionID, arbitrationCost);
        }
    }

    /** @dev Pay the arbitration fee to raise a dispute. To be called by the sender. UNTRUSTED.
     *  Note that the arbitrator can have `createDispute` throw, which will make this function throw and therefore lead to a party being timed-out.
     *  This is not a vulnerability as the arbitrator can rule in favor of one party anyway.
     *  @param _transactionID The index of the transaction.
     */
    function payArbitrationFeeBySender(uint _transactionID) public payable {
        Transaction storage transaction = transactions[_transactionID];
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        require(transaction.status < Status.DisputeCreated, "Dispute has already been created.");
        require(msg.sender == transaction.sender, "The caller must be the sender.");

        transaction.senderFee += msg.value;
        // Require that the total paid to be at least the arbitration cost.
        require(transaction.senderFee >= arbitrationCost, "The sender fee must cover arbitration costs.");

        transaction.lastInteraction = now;
        // The receiver still has to pay. This can also happen if he has paid, but `arbitrationCost` has increased.
        if (transaction.receiverFee < arbitrationCost) {
            transaction.status = Status.WaitingReceiver;
            emit HasToPayFee(_transactionID, Party.Receiver);
        } else { // The sender has also paid the fee. We create the dispute.
            raiseDispute(_transactionID, arbitrationCost);
        }
    }

    /** @dev Create a dispute. UNTRUSTED.
     *  @param _transactionID The index of the transaction.
     *  @param _arbitrationCost Amount to pay the arbitrator.
     */
    function raiseDispute(uint _transactionID, uint _arbitrationCost) internal {
        Transaction storage transaction = transactions[_transactionID];
        transaction.status = Status.DisputeCreated;
        transaction.arbitrationCost = _arbitrationCost;
        transaction.disputeId = arbitrator.createDispute.value(_arbitrationCost)(AMOUNT_OF_CHOICES, arbitratorExtraData);
        disputeIDtoTransactionID[transaction.disputeId] = _transactionID;
        emit Dispute(arbitrator, transaction.disputeId, _transactionID);

        // Refund sender if it overpaid.
        if (transaction.senderFee > _arbitrationCost) {
            uint extraFeeSender = transaction.senderFee - _arbitrationCost;
            transaction.senderFee = _arbitrationCost;
            transaction.sender.send(extraFeeSender);
        }

        // Refund receiver if it overpaid.
        if (transaction.receiverFee > _arbitrationCost) {
            uint extraFeeReceiver = transaction.receiverFee - _arbitrationCost;
            transaction.receiverFee = _arbitrationCost;
            transaction.receiver.send(extraFeeReceiver);
        }
    }

    /** @dev Submit a reference to evidence. EVENT.
     *  @param _transactionID The index of the transaction.
     *  @param _evidence A link to an evidence using its URI.
     */
    function submitEvidence(uint _transactionID, string _evidence) public {
        Transaction storage transaction = transactions[_transactionID];
        require(msg.sender == transaction.receiver || msg.sender == transaction.sender, "The caller must be the receiver or the sender.");

        require(transaction.status >= Status.DisputeCreated, "The dispute has not been created yet.");
        emit Evidence(arbitrator, transaction.disputeId, msg.sender, _evidence);
    }

    /** @dev Appeal an appealable ruling. UNTRUSTED.
     *  Transfer the funds to the arbitrator.
     *  Note that no checks are required as the checks are done by the arbitrator.
     *  @param _transactionID The index of the transaction.
     */
    function appeal(uint _transactionID) public payable {
        Transaction storage transaction = transactions[_transactionID];

        arbitrator.appeal.value(msg.value)(transaction.disputeId, arbitratorExtraData);
    }

    /** @dev Give a ruling for a dispute. Must be called by the arbitrator.
     *  The purpose of this function is to ensure that the address calling it has the right to rule on the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function rule(uint _disputeID, uint _ruling) public {
        uint transactionID = disputeIDtoTransactionID[_disputeID];
        Transaction storage transaction = transactions[transactionID];
        require(msg.sender == address(arbitrator), "The caller must be the arbitrator.");
        require(transaction.status == Status.DisputeCreated, "The dispute has already been resolved.");

        emit Ruling(Arbitrator(msg.sender), _disputeID, _ruling);

        executeRuling(transactionID, _ruling);
    }

    /** @dev Execute a ruling of a dispute. It reimburses the fee to the winning party.
     *  @param _transactionID The index of the transaction.
     *  @param _ruling Ruling given by the arbitrator. 1: Reimburse the receiver. 2: Pay the sender.
     */
    function executeRuling(uint _transactionID, uint _ruling) internal {
        Transaction storage transaction = transactions[_transactionID];
        require(_ruling <= AMOUNT_OF_CHOICES, "Invalid ruling.");

        uint amount = transaction.amount;
        uint senderFee = transaction.senderFee;
        uint receiverFee = transaction.receiverFee;

        transaction.amount = 0;
        transaction.senderFee = 0;
        transaction.receiverFee = 0;
        transaction.status = Status.Resolved;

        // Give the arbitration fee back.
        // Note that we use `send` to prevent a party from blocking the execution.
        if (_ruling == uint(RulingOptions.SenderWins)) {
            transaction.sender.send(senderFee);
            require(token.transfer(transaction.sender, amount) != false, "The `transfer` function must not fail.");
        } else if (_ruling == uint(RulingOptions.ReceiverWins)) {
            transaction.receiver.send(receiverFee);
            require(token.transfer(transaction.receiver, amount) != false, "The `transfer` function must not fail.");
        } else {
            uint split_arbitration_fee = (senderFee + receiverFee - transaction.arbitrationCost) / 2;
            transaction.receiver.send(split_arbitration_fee);
            transaction.sender.send(split_arbitration_fee);
            // In the case of an uneven token amount, one token can be burnt.
            require(token.transfer(transaction.receiver, amount / 2) != false, "The `transfer` function must not fail.");
            require(token.transfer(transaction.sender, amount / 2) != false, "The `transfer` function must not fail.");
        }
    }

    // **************************** //
    // *     Constant getters     * //
    // **************************** //

    /** @dev Getter to know the count of transactions.
     *  @return countTransactions The count of transactions.
     */
    function getCountTransactions() public view returns (uint countTransactions) {
        return transactions.length;
    }

    /** @dev Get IDs for transactions where the specified address is the receiver and/or the sender.
     *  This function must be used by the UI and not by other smart contracts.
     *  Note that the complexity is O(t), where t is amount of arbitrable transactions.
     *  @param _address The specified address.
     *  @return transactionIDs The transaction IDs.
     */
    function getTransactionIDsByAddress(address _address) public view returns (uint[] transactionIDs) {
        uint count = 0;
        for (uint i = 0; i < transactions.length; i++) {
            if (transactions[i].sender == _address || transactions[i].receiver == _address)
                count++;
        }

        transactionIDs = new uint[](count);

        count = 0;

        for (uint j = 0; j < transactions.length; j++) {
            if (transactions[j].sender == _address || transactions[j].receiver == _address)
                transactionIDs[count++] = j;
        }
    }
}
