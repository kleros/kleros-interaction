/**
 *  @authors: [@eburgos, @n1c01a5]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.4.23;

import "./Arbitrator.sol";

contract MultipleArbitrableTransaction {

    // **************************** //
    // *    Contract variables    * //
    // **************************** //

    uint8 constant AMOUNT_OF_CHOICES = 2;
    uint8 constant BUYER_WINS = 1;
    uint8 constant SELLER_WINS = 2;

    enum Party {Seller, Buyer}
    enum Status {NoDispute, WaitingSeller, WaitingBuyer, DisputeCreated, Resolved}
    enum RulingOptions {NoRuling, Buyer_Wins, Seller_Wins}

    struct Transaction {
        address seller;
        address buyer;
        uint256 amount;
        uint256 timeoutPayment; // Time in seconds a party can take before being considered unresponding and lose the dispute.
        uint disputeId;
        uint sellerFee; // Total fees paid by the seller.
        uint buyerFee; // Total fees paid by the buyer.
        uint lastInteraction; // Last interaction for the dispute procedure.
        Status status;
        uint arbitrationCost;
    }

    Transaction[] public transactions;

    bytes arbitratorExtraData;

    Arbitrator arbitrator;

    uint timeoutFee;

    mapping (bytes32 => uint) public disputeTxMap;

    // **************************** //
    // *          Events          * //
    // **************************** //

    /** @dev To be emmited when meta-evidence is submitted.
     *  @param _metaEvidenceID Unique identifier of meta-evidence. Should be the transactionId.
     *  @param _evidence A link to the meta-evidence JSON.
     */
    event MetaEvidence(uint indexed _metaEvidenceID, string _evidence);

    /** @dev Indicate that a party has to pay a fee or would otherwise be considered as losing.
     *  @param _transactionId The index of the transaction.
     *  @param _party The party who has to pay.
     */
    event HasToPayFee(uint indexed _transactionId, Party _party);

    /** @dev To be raised when evidence are submitted. Should point to the ressource (evidences are not to be stored on chain due to gas considerations).
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _party The address of the party submiting the evidence. Note that 0 is kept for evidences not submitted by any party.
     *  @param _evidence A link to evidence or if it is short the evidence itself. Can be web link ("http://X"), IPFS ("ipfs:/X") or another storing service (using the URI, see https://en.wikipedia.org/wiki/Uniform_Resource_Identifier ). One usecase of short evidence is to include the hash of the plain English contract.
     */
    event Evidence(Arbitrator indexed _arbitrator, uint indexed _disputeID, address _party, string _evidence);

    /** @dev To be emmited when a dispute is created to link the correct meta-evidence to the disputeID.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _metaEvidenceID Unique identifier of meta-evidence. Should be the transactionId.
     */
    event Dispute(Arbitrator indexed _arbitrator, uint indexed _disputeID, uint _metaEvidenceID);

    /** @dev To be raised when a ruling is given.
     *  @param _transactionId The index of the transaction in dispute.
     *  @param _arbitrator The arbitrator giving the ruling.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling The ruling which was given.
     */
    event Ruling(uint indexed _transactionId, Arbitrator indexed _arbitrator, uint indexed _disputeID, uint _ruling);

    // **************************** //
    // *    Arbitrable functions  * //
    // *    Modifying the state   * //
    // **************************** //

    /** @dev Constructor.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _arbitratorExtraData Extra data for the arbitrator.
     */
    constructor (
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        uint _timeoutFee
    ) public {
        arbitrator = _arbitrator;
        arbitratorExtraData = _arbitratorExtraData;
        timeoutFee = _timeoutFee;
    }

    /** @dev Create a transaction.
     *  @param _timeoutPayment Time after which a party automatically loses the dispute.
     *  @param _seller The recipient of the transaction.
     *  @param _metaEvidence Link to the meta-evidence.
     *  @return The index of the transaction.
     */
    function createTransaction(
        uint _timeoutPayment,
        address _seller,
        string _metaEvidence
    ) public payable returns (uint transactionIndex) {
        transactions.push(Transaction({
            seller: _seller,
            buyer: msg.sender,
            amount: msg.value,
            timeoutPayment: _timeoutPayment,
            disputeId: 0,
            sellerFee: 0,
            buyerFee: 0,
            lastInteraction: now,
            status: Status.NoDispute,
            arbitrationCost: 0
        }));
        emit MetaEvidence(transactions.length - 1, _metaEvidence);
        return transactions.length - 1;
    }

    /** @dev Pay seller. To be called if the good or service is provided.
     *  @param _transactionId The index of the transaction.
     *  @param _amount Amount to pay in wei.
     */
    function pay(uint _transactionId, uint _amount) public {
        Transaction storage transaction = transactions[_transactionId];
        require(transaction.buyer == msg.sender, "The caller must be the buyer.");
        require(transaction.status == Status.NoDispute, "The transaction can't be disputed.");
        require(_amount <= transaction.amount, "The amount paid has to be less than the transaction.");

        transaction.seller.transfer(_amount);
        transaction.amount -= _amount;
    }

    /** @dev Reimburse buyer. To be called if the good or service can't be fully provided.
     *  @param _transactionId The index of the transaction.
     *  @param _amountReimbursed Amount to reimburse in wei.
     */
    function reimburse(uint _transactionId, uint _amountReimbursed) public {
        Transaction storage transaction = transactions[_transactionId];
        require(transaction.seller == msg.sender, "The caller must be the seller.");
        require(transaction.status == Status.NoDispute, "The transaction can't be disputed.");
        require(_amountReimbursed <= transaction.amount, "The amount reimbursed has to be less than the transaction.");

        transaction.buyer.transfer(_amountReimbursed);
        transaction.amount -= _amountReimbursed;
    }

    /** @dev Transfer the transaction's amount to the seller if the timeout has passed.
     *  @param _transactionId The index of the transaction.
     */
    function executeTransaction(uint _transactionId) public {
        Transaction storage transaction = transactions[_transactionId];
        require(now - transaction.lastInteraction >= transaction.timeoutPayment, "The timeout has not passed yet.");
        require(transaction.status == Status.NoDispute, "The transaction can't be disputed.");

        transaction.seller.transfer(transaction.amount);
        transaction.amount = 0;

        transaction.status = Status.Resolved;
    }

    /** @dev Pay seller if buyer fails to pay the fee.
     *  @param _transactionId The index of the transaction.
     */
    function timeOutByBuyer(uint _transactionId) public {
        Transaction storage transaction = transactions[_transactionId];

        require(transaction.status == Status.WaitingSeller, "The transaction is not waiting on the seller.");
        require(now - transaction.lastInteraction >= + timeoutFee, "Timeout time has not passed yet.");

        executeRuling(_transactionId, BUYER_WINS);
    }

    /** @dev Reimburse buyer if seller fails to pay the fee.
     *  @param _transactionId The index of the transaction.
     */
    function timeOutBySeller(uint _transactionId) public {
        Transaction storage transaction = transactions[_transactionId];

        require(transaction.status == Status.WaitingBuyer, "The transaction is not waiting on the buyer.");
        require(now - transaction.lastInteraction >= timeoutFee, "Timeout time has not passed yet.");

        executeRuling(_transactionId, SELLER_WINS);
    }

    /** @dev Pay the arbitration fee to raise a dispute. To be called by the buyer. UNTRUSTED.
     *  Note that this function mirror payArbitrationFeeBySeller.
     *  @param _transactionId The index of the transaction.
     */
    function payArbitrationFeeByBuyer(uint _transactionId) public payable {
        Transaction storage transaction = transactions[_transactionId];
        require(transaction.status < Status.DisputeCreated, "Dispute has already been created.");
        require(msg.sender == transaction.buyer, "The caller must be the buyer.");

        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        transaction.buyerFee += msg.value;
        // Require that the total paid to be at least the arbitration cost.
        require(transaction.buyerFee >= arbitrationCost, "The buyer fee must cover arbitration costs.");

        transaction.lastInteraction = now;
        // The seller still has to pay. This can also happens if he has paid, but arbitrationCost has increased.
        if (transaction.sellerFee < arbitrationCost) {
            transaction.status = Status.WaitingSeller;
            emit HasToPayFee(_transactionId, Party.Seller);
        } else { // The buyer has also paid the fee. We create the dispute
            raiseDispute(_transactionId, arbitrationCost);
        }
    }

    /** @dev Pay the arbitration fee to raise a dispute. To be called by the seller. UNTRUSTED.
     *  Note that the arbitrator can have createDispute throw, which will make this function throw and therefore lead to a party being timed-out.
     *  This is not a vulnerability as the arbitrator can rule in favor of one party anyway.
     *  @param _transactionId The index of the transaction.
     */
    function payArbitrationFeeBySeller(uint _transactionId) public payable {
        Transaction storage transaction = transactions[_transactionId];
        require(transaction.status < Status.DisputeCreated, "Dispute has already been created.");
        require(msg.sender == transaction.seller, "The caller must be the seller.");

        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        transaction.sellerFee += msg.value;
        // Require that the total pay at least the arbitration cost.
        require(transaction.sellerFee >= arbitrationCost, "The seller fee must cover arbitration costs.");

        transaction.lastInteraction = now;
        // The buyer still has to pay. This can also happens if he has paid, but arbitrationCost has increased.
        if (transaction.buyerFee < arbitrationCost) {
            transaction.status = Status.WaitingBuyer;
            emit HasToPayFee(_transactionId, Party.Buyer);
        } else { // The seller has also paid the fee. We create the dispute
            raiseDispute(_transactionId, arbitrationCost);
        }
    }

    /** @dev Create a dispute. UNTRUSTED.
     *  @param _transactionId The index of the transaction.
     *  @param _arbitrationCost Amount to pay the arbitrator.
     */
    function raiseDispute(uint _transactionId, uint _arbitrationCost) internal {
        Transaction storage transaction = transactions[_transactionId];
        transaction.status = Status.DisputeCreated;
        transaction.disputeId = arbitrator.createDispute.value(_arbitrationCost)(AMOUNT_OF_CHOICES, arbitratorExtraData);
        transaction.arbitrationCost = _arbitrationCost;
        disputeTxMap[keccak256(arbitrator, transaction.disputeId)] = _transactionId;
        emit Dispute(arbitrator, transaction.disputeId, _transactionId);
    }

    /** @dev Submit a reference to evidence. EVENT.
     *  @param _transactionId The index of the transaction.
     *  @param _evidence A link to an evidence using its URI.
     */
    function submitEvidence(uint _transactionId, string _evidence) public {
        Transaction storage transaction = transactions[_transactionId];
        require(msg.sender == transaction.buyer || msg.sender == transaction.seller, "The caller must be the buyer or the seller.");

        require(transaction.status >= Status.DisputeCreated, "The dispute has not been created yet.");
        emit Evidence(arbitrator, transaction.disputeId, msg.sender, _evidence);
    }

    /** @dev Appeal an appealable ruling.
     *  Transfer the funds to the arbitrator.
     *  Note that no checks are required as the checks are done by the arbitrator.
     *  @param _transactionId The index of the transaction.
     */
    function appeal(uint _transactionId) public payable {
        Transaction storage transaction = transactions[_transactionId];

        arbitrator.appeal.value(msg.value)(transaction.disputeId, arbitratorExtraData);
    }

    /** @dev Give a ruling for a dispute. Must be called by the arbitrator.
     *  The purpose of this function is to ensure that the address calling it has the right to rule on the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function rule(uint _disputeID, uint _ruling) public {
        uint transactionId = disputeTxMap[keccak256(msg.sender, _disputeID)];
        Transaction storage transaction = transactions[transactionId];
        require(msg.sender == address(arbitrator), "The caller must be the arbitrator.");
        require(transaction.status < Status.Resolved, "The dispute has already been resolved.");

        emit Ruling(transactionId, Arbitrator(msg.sender), _disputeID, _ruling);

        executeRuling(transactionId, _ruling);
    }

    /** @dev Execute a ruling of a dispute. It reimburses the fee to the winning party.
     *  @param _transactionId The index of the transaction.
     *  @param _ruling Ruling given by the arbitrator. 1 : Reimburse the buyer. 2 : Pay the seller.
     */
    function executeRuling(uint _transactionId, uint _ruling) internal {
        Transaction storage transaction = transactions[_transactionId];
        require(_ruling <= AMOUNT_OF_CHOICES, "Invalid ruling.");

        // Give the arbitration fee back.
        // Note that we use send to prevent a party from blocking the execution.
        if (_ruling == SELLER_WINS) {
            transaction.seller.send(transaction.sellerFee + transaction.amount);
            // Refund buyer if they overpaid
            if (transaction.buyerFee > transaction.arbitrationCost) // It should be impossible for aritrationCost to be greater than fee but extra check here to prevent underflow.
                transaction.buyer.send(transaction.buyerFee - transaction.arbitrationCost);
        } else if (_ruling == BUYER_WINS) {
            transaction.buyer.send(transaction.buyerFee + transaction.amount);
            // Refund seller if they overpaid
            if (transaction.sellerFee > transaction.arbitrationCost) // It should be impossible for aritrationCost to be greater than fee but extra check here to prevent underflow.
                transaction.seller.send(transaction.sellerFee - transaction.arbitrationCost);
        } else {
            uint split_amount = (transaction.sellerFee + transaction.buyerFee - transaction.arbitrationCost + transaction.amount) / 2;
            transaction.buyer.send(split_amount);
            transaction.seller.send(split_amount);
        }

        transaction.amount = 0;
        transaction.sellerFee = 0;
        transaction.buyerFee = 0;
        transaction.status = Status.Resolved;
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

    /** @dev Get IDs for transactions where the specified address is the buyer and/or the seller.
     *  @param _address The specified address.
     *  @return transactionIDs The transaction IDs.
     */
    function getTransactionIDsByAddress(address _address) public view returns (uint[] transactionIDs) {
        uint[] memory transactionIDsBigArr = new uint[](transactions.length);
        uint count = 0;
        for (uint i = 0; i < transactions.length; i++) {
            if (transactions[i].seller == _address || transactions[i].buyer == _address)
                transactionIDsBigArr[count++] = i;
        }

        transactionIDs = new uint[](count);
        for (uint j = 0; j < count; j++) transactionIDs[j] = transactionIDsBigArr[j];
    }
}
