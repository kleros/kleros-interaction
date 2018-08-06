/**
 *  @title Multiple Arbitrable Transaction
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */


pragma solidity ^0.4.15;
import "./Arbitrator.sol";

/** @title Multiple Arbitrable Transaction
 *  This is a a contract for multiple arbitrated transactions which can be reversed by an arbitrator.
 *  This can be used for buying goods, services and for paying freelancers.
 *  Parties are identified as "seller" and "buyer".
 */
 contract MultipleArbitrableTransaction {
    string constant RULING_OPTIONS = "Reimburse buyer;Pay seller";
    uint8 constant AMOUNT_OF_CHOICES = 2;
    uint8 constant BUYER_WINS = 1;
    uint8 constant SELLER_WINS = 2;

    enum Party {Seller, Buyer}

    enum Status {NoDispute, WaitingSeller, WaitingBuyer, DisputeCreated, Resolved}

    struct Transaction {
        address seller;
        address buyer;
        uint256 amount;
        uint256 timeout; // Time in seconds a party can take before being considered unresponding and lose the dispute.
        uint disputeId;
        Arbitrator arbitrator;
        bytes arbitratorExtraData;
        uint sellerFee; // Total fees paid by the seller.
        uint buyerFee; // Total fees paid by the buyer.
        uint lastInteraction; // Last interaction for the dispute procedure.
        Status status;
    }

    Transaction[] public transactions;

    mapping (bytes32 => uint) public disputeTxMap;

    /** @dev Constructor.
     */
    constructor() public {
    }

    /** @dev To be raised when a dispute is created. The main purpose of this event is to let the arbitrator know the meaning ruling IDs.
     *  @param _transactionId The index of the transaction in dispute.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _rulingOptions Map ruling IDs to short description of the ruling in a CSV format using ";" as a delimiter. Note that ruling IDs start a 1. For example "Send funds to buyer;Send funds to seller", means that ruling 1 will make the contract send funds to the buyer and 2 to the seller.
     */
    event Dispute(uint indexed _transactionId, Arbitrator indexed _arbitrator, uint indexed _disputeID, string _rulingOptions);

    /** @dev To be raised when a ruling is given.
     *  @param _transactionId The index of the transaction in dispute.
     *  @param _arbitrator The arbitrator giving the ruling.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling The ruling which was given.
     */
    event Ruling(uint indexed _transactionId, Arbitrator indexed _arbitrator, uint indexed _disputeID, uint _ruling);

    /** @dev To be emmited when meta-evidence is submitted.
     *  @param _transactionId The index of the transaction.
     *  @param _evidence A link to the meta-evidence JSON.
     */
    event MetaEvidence(uint indexed _transactionId, string _evidence);

    /** @dev To be emmited when a dispute is created to link the correct meta-evidence to the disputeID.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _transactionId The index of the transaction.
     */
    event Dispute(Arbitrator indexed _arbitrator, uint indexed _disputeID, uint _transactionId);

    /** @dev To be raised when evidence are submitted. Should point to the ressource (evidences are not to be stored on chain due to gas considerations).
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _party The address of the party submiting the evidence. Note that 0 is kept for evidences not submitted by any party.
     *  @param _evidence A link to evidence or if it is short the evidence itself. Can be web link ("http://X"), IPFS ("ipfs:/X") or another storing service (using the URI, see https://en.wikipedia.org/wiki/Uniform_Resource_Identifier ). One usecase of short evidence is to include the hash of the plain English contract.
     */
    event Evidence(Arbitrator indexed _arbitrator, uint indexed _disputeID, address _party, string _evidence);

    /** @dev Indicate that a party has to pay a fee or would otherwise be considered as loosing.
     *  @param _transactionId The index of the transaction.
     *  @param _party The party who has to pay.
     */
    event HasToPayFee(uint indexed _transactionId, Party _party);

    /** @dev Give a ruling for a dispute. Must be called by the arbitrator.
     *  The purpose of this function is to ensure that the address calling it has the right to rule on the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function rule(uint _disputeID, uint _ruling) public {
        uint transactionId = disputeTxMap[keccak256(msg.sender,_disputeID)];
        Transaction storage transaction = transactions[transactionId];
        require(msg.sender==address(transaction.arbitrator));

        emit Ruling(transactionId, Arbitrator(msg.sender),_disputeID,_ruling);

        executeRuling(_disputeID,_ruling);
    }

    /** @dev Pay the arbitration fee to raise a dispute. To be called by the seller. UNTRUSTED.
     *  Note that the arbitrator can have createDispute throw, which will make this function throw and therefore lead to a party being timed-out.
     *  This is not a vulnerability as the arbitrator can rule in favor of one party anyway.
     *  @param _transactionId The index of the transaction.
     */
    function payArbitrationFeeBySeller(uint _transactionId) public payable {
        Transaction storage transaction = transactions[_transactionId];
        require(msg.sender == transaction.seller);


        uint arbitrationCost = transaction.arbitrator.arbitrationCost(transaction.arbitratorExtraData);
        transaction.sellerFee += msg.value;
        require(transaction.sellerFee >= arbitrationCost); // Require that the total pay at least the arbitration cost.
        require(transaction.status < Status.DisputeCreated); // Make sure a dispute has not been created yet.

        transaction.lastInteraction = now;
        if (transaction.buyerFee < arbitrationCost) { // The partyB still has to pay. This can also happens if he has paid, but arbitrationCost has increased.
            transaction.status = Status.WaitingBuyer;
            emit HasToPayFee(_transactionId, Party.Buyer);
        } else { // The partyB has also paid the fee. We create the dispute
            raiseDispute(_transactionId, arbitrationCost);
        }
    }

    /** @dev Pay the arbitration fee to raise a dispute. To be called by the buyer. UNTRUSTED.
     *  Note that this function mirror payArbitrationFeeBySeller.
     *  @param _transactionId The index of the transaction.
     */
    function payArbitrationFeeByBuyer(uint _transactionId) public payable {
        Transaction storage transaction = transactions[_transactionId];
        require(msg.sender == transaction.buyer);

        uint arbitrationCost = transaction.arbitrator.arbitrationCost(transaction.arbitratorExtraData);
        transaction.buyerFee += msg.value;
        require(transaction.buyerFee >= arbitrationCost); // Require that the total pay at least the arbitration cost.
        require(transaction.status < Status.DisputeCreated); // Make sure a dispute has not been created yet.

        transaction.lastInteraction = now;
        if (transaction.sellerFee < arbitrationCost) { // The partyA still has to pay. This can also happens if he has paid, but arbitrationCost has increased.
            transaction.status = Status.WaitingSeller;
            emit HasToPayFee(_transactionId, Party.Seller);
        } else { // The partyA has also paid the fee. We create the dispute
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
        transaction.disputeId = transaction.arbitrator.createDispute.value(_arbitrationCost)(AMOUNT_OF_CHOICES,transaction.arbitratorExtraData);
        disputeTxMap[keccak256(transaction.arbitrator, transaction.disputeId)] = _transactionId;
        emit Dispute(transaction.arbitrator, transaction.disputeId, _transactionId);
    }

    /** @dev Reimburse partyA if partyB fails to pay the fee.
     *  @param _transactionId The index of the transaction.
     */
    function timeOutBySeller(uint _transactionId) public {
        Transaction storage transaction = transactions[_transactionId];
        require(msg.sender == transaction.seller);


        require(transaction.status == Status.WaitingBuyer);
        require(now >= transaction.lastInteraction+transaction.timeout);

        executeRuling(transaction.disputeId, SELLER_WINS);
    }

    /** @dev Pay partyB if partyA fails to pay the fee.
     *  @param _transactionId The index of the transaction.
     */
    function timeOutByBuyer(uint _transactionId) public {
        Transaction storage transaction = transactions[_transactionId];
        require(msg.sender == transaction.buyer);


        require(transaction.status == Status.WaitingSeller);
        require(now >= transaction.lastInteraction+transaction.timeout);

        executeRuling(transaction.disputeId, BUYER_WINS);
    }

    /** @dev Submit a reference to evidence. EVENT.
     *  @param _transactionId The index of the transaction.
     *  @param _evidence A link to an evidence using its URI.
     */
    function submitEvidence(uint _transactionId, string _evidence) public {
        Transaction storage transaction = transactions[_transactionId];
        require(msg.sender==transaction.buyer || msg.sender==transaction.seller);

        require(transaction.status >= Status.DisputeCreated);
        emit Evidence(transaction.arbitrator, transaction.disputeId, msg.sender, _evidence);
    }

    /** @dev Appeal an appealable ruling.
     *  Transfer the funds to the arbitrator.
     *  Note that no checks are required as the checks are done by the arbitrator.
     *  @param _transactionId The index of the transaction.
     *  @param _extraData Extra data for the arbitrator appeal procedure.
     */
    function appeal(uint _transactionId, bytes _extraData) payable public {
        Transaction storage transaction = transactions[_transactionId];
        require(msg.sender==transaction.buyer || msg.sender==transaction.seller);

        transaction.arbitrator.appeal.value(msg.value)(transaction.disputeId, _extraData);
    }

    /** @dev Create a transaction.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _timeout Time after which a party automatically loose a dispute.
     *  @param _seller The recipient of the transaction.
     *  @param _arbitratorExtraData Extra data for the arbitrator.
     *  @param _metaEvidence Link to the meta-evidence.
     */
    function createTransaction(Arbitrator _arbitrator, uint _timeout, address _seller, bytes _arbitratorExtraData, string _metaEvidence) payable public returns (uint transactionIndex) {
        transactions.push(Transaction({
            seller: _seller,
            buyer: msg.sender,
            amount: msg.value,
            timeout: _timeout,
            arbitrator: _arbitrator,
            arbitratorExtraData: _arbitratorExtraData,
            disputeId: 0,
            sellerFee: 0,
            buyerFee: 0,
            lastInteraction: now,
            status: Status.NoDispute
        }));
        emit MetaEvidence(transactions.length - 1, _metaEvidence);
        return transactions.length - 1;
    }


    /** @dev Transfer the transaction's amount to the seller if the timeout has passed
     *  @param _transactionId The index of the transaction.
     */
    function withdraw(uint _transactionId) public {
        Transaction storage transaction = transactions[_transactionId];
        require(msg.sender == transaction.seller);
        require(now >= transaction.lastInteraction+transaction.timeout);
        require(transaction.status == Status.NoDispute);

        transaction.seller.send(transaction.amount);
        transaction.amount = 0;

        transaction.status = Status.Resolved;
    }

    /** @dev Pay party B. To be called if the good or service is provided.
     *  @param _transactionId The index of the transaction.
     *  @param _amount Amount to pay in wei.
     */
    function pay(uint _transactionId, uint _amount) public {
        Transaction storage transaction = transactions[_transactionId];
        require(transaction.buyer == msg.sender);
        require(_amount <= transaction.amount);

        transaction.seller.transfer(_amount);
        transaction.amount -= _amount;
    }

    /** @dev Reimburse party A. To be called if the good or service can't be fully provided.
     *  @param _transactionId The index of the transaction.
     *  @param _amountReimbursed Amount to reimburse in wei.
     */
    function reimburse(uint _transactionId, uint _amountReimbursed) public {
        Transaction storage transaction = transactions[_transactionId];
        require(transaction.seller == msg.sender);
        require(_amountReimbursed <= transaction.amount);

        transaction.buyer.transfer(_amountReimbursed);
        transaction.amount -= _amountReimbursed;
    }

    /** @dev Execute a ruling of a dispute. It reimburse the fee to the winning party.
     *  This need to be extended by contract inheriting from it.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. 1 : Reimburse the partyA. 2 : Pay the partyB.
     */
    function executeRuling(uint _disputeID, uint _ruling) internal {
        uint transactionId = disputeTxMap[keccak256(msg.sender, _disputeID)];
        Transaction storage transaction = transactions[transactionId];

        require(_disputeID == transaction.disputeId);
        require(_ruling <= AMOUNT_OF_CHOICES);

        // Give the arbitration fee back.
        // Note that we use send to prevent a party from blocking the execution.
        if (_ruling == SELLER_WINS) {
            transaction.seller.send(transaction.sellerFee > transaction.buyerFee ? transaction.sellerFee : transaction.buyerFee); // In both cases sends the highest amount paid to avoid ETH to be stuck in the contract if the arbitrator lowers its fee.
            transaction.seller.send(transaction.amount);
        } else if (_ruling == BUYER_WINS) {
            transaction.buyer.send(transaction.sellerFee > transaction.buyerFee ? transaction.sellerFee : transaction.buyerFee);
            transaction.buyer.send(transaction.amount);
        }

        transaction.amount = 0;
        transaction.status = Status.Resolved;
    }
}
