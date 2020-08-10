/**
 *  @authors: [@unknownunknown1]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 */

pragma solidity ^0.4.24;

import "./Arbitrator.sol";
import "./IArbitrable.sol";
import "../../libraries/CappedMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

/** @title Multiple Arbitrable ERC20 Token Transaction
 *  This is a contract for multiple arbitrated token transactions which can be reversed by an arbitrator.
 *  This can be used for buying goods, services and for paying freelancers.
 *  Parties are identified as "sender" and "receiver".
 *  This version of the contract supports appeal crowdfunding.
 */
contract MultipleArbitrableTokenTransactionWithAppeals is IArbitrable {
    
    using CappedMath for uint;

    // **************************** //
    // *    Contract variables    * //
    // **************************** //

    uint8 constant AMOUNT_OF_CHOICES = 2;
    uint public constant MULTIPLIER_DIVISOR = 10000; // Divisor parameter for multipliers.

    enum Party {None, Sender, Receiver}
    enum Status {NoDispute, WaitingSender, WaitingReceiver, DisputeCreated, Resolved}
    
    struct Transaction {
        address sender;
        address receiver;
        uint amount;
        ERC20 token;
        uint timeoutPayment; // Time in seconds after which the transaction can be automatically executed if not disputed.
        uint disputeId; // If dispute exists, the ID of the dispute.
        uint senderFee; // Total fees paid by the sender.
        uint receiverFee; // Total fees paid by the receiver.
        uint lastInteraction; // Last interaction for the dispute procedure.
        Status status;
        Round[] rounds; // Tracks each appeal round of a dispute.
        uint ruling; // The ruling of the dispute, if any.
    }
    
    struct Round {
        uint[3] paidFees; // Tracks the fees paid by each side in this round.
        bool[3] hasPaid; // True when the side has fully paid its fee. False otherwise.
        uint feeRewards; // Sum of reimbursable fees and stake rewards available to the parties that made contributions to the side that ultimately wins a dispute.
        mapping(address => uint[3]) contributions; // Maps contributors to their contributions for each side.
    }

    Transaction[] public transactions;
    Arbitrator public arbitrator; // Address of the arbitrator contract.
    bytes public arbitratorExtraData; // Extra data to set up the arbitration.
    uint public feeTimeout; // Time in seconds a party can take to pay arbitration fees before being considered unresponding and lose the dispute.
    
    uint public sharedStakeMultiplier; // Multiplier for calculating the appeal fee that must be paid by submitter in the case where there is no winner or loser (e.g. when the arbitrator ruled "refuse to arbitrate").
    uint public winnerStakeMultiplier; // Multiplier for calculating the appeal fee of the party that won the previous round.
    uint public loserStakeMultiplier; // Multiplier for calculating the appeal fee of the party that lost the previous round.

    mapping (uint => uint) public disputeIDtoTransactionID;

    // **************************** //
    // *          Events          * //
    // **************************** //

    /** @dev To be emitted when a party pays or reimburses the other.
     *  @param _transactionID The index of the transaction.
     *  @param _amount The amount paid.
     *  @param _party The party that paid.
     */
    event Payment(uint indexed _transactionID, uint _amount, address _party);

    /** @dev Indicate that a party has to pay a fee or would otherwise be considered as losing.
     *  @param _transactionID The index of the transaction.
     *  @param _party The party who has to pay.
     */
    event HasToPayFee(uint indexed _transactionID, Party _party);

    /** @dev Emitted when the final ruling of a dispute is given by the arbitrator.
     *  @param _arbitrator The arbitrator giving the ruling.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling The ruling which was given.
     */
    event Ruling(Arbitrator indexed _arbitrator, uint indexed _disputeID, uint _ruling);

    /** @dev Emitted when a transaction is created.
     *  @param _transactionID The index of the transaction.
     *  @param _sender The address of the sender.
     *  @param _receiver The address of the receiver.
     *  @param _token The token address.
     *  @param _amount The initial amount of the token.
     */
    event TransactionCreated(uint _transactionID, address indexed _sender, address indexed _receiver, ERC20 _token, uint _amount);
    
    /** @dev To be emitted when the appeal fees of one of the parties are fully funded.
     *  @param _transactionID The ID of the respective transaction.
     *  @param _party The party that is fully funded.
     */
    event HasPaidAppealFee(uint indexed _transactionID, Party _party);

    // **************************** //
    // *    Arbitrable functions  * //
    // *    Modifying the state   * //
    // **************************** //

    /** @dev Constructor.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _arbitratorExtraData Extra data for the arbitrator.
     *  @param _feeTimeout Arbitration fee timeout for the parties.
     *  @param _sharedStakeMultiplier Multiplier of the appeal cost that submitter must pay for a round when there is no winner/loser in the previous round. In basis points.
     *  @param _winnerStakeMultiplier Multiplier of the appeal cost that the winner has to pay for a round. In basis points.
     *  @param _loserStakeMultiplier Multiplier of the appeal cost that the loser has to pay for a round. In basis points.
     */
    constructor (
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        uint _feeTimeout,
        uint _sharedStakeMultiplier,
        uint _winnerStakeMultiplier,
        uint _loserStakeMultiplier
    ) public {
        arbitrator = _arbitrator;
        arbitratorExtraData = _arbitratorExtraData;
        feeTimeout = _feeTimeout;
        sharedStakeMultiplier = _sharedStakeMultiplier;
        winnerStakeMultiplier = _winnerStakeMultiplier;
        loserStakeMultiplier = _loserStakeMultiplier;
    }

    /** @dev Create a transaction. UNTRUSTED.
     *  @param _amount The amount of tokens in this transaction.
     *  @param _token The ERC20 token contract.
     *  @param _timeoutPayment Time after which a party automatically loses a dispute.
     *  @param _receiver The recipient of the transaction.
     *  @param _metaEvidence Link to the meta-evidence.
     *  @return The index of the transaction.
     */
    function createTransaction(
        uint _amount,
        ERC20 _token,
        uint _timeoutPayment,
        address _receiver,
        string _metaEvidence
    ) public returns (uint transactionIndex) {
        // Transfers token from sender wallet to contract.
        require(_token.transferFrom(msg.sender, address(this), _amount), "Sender does not have enough approved funds.");
        
        transactionIndex = transactions.length++;
        Transaction storage transaction = transactions[transactionIndex];
        transaction.sender = msg.sender;
        transaction.receiver = _receiver;
        transaction.amount = _amount;
        transaction.token = _token;
        transaction.timeoutPayment = _timeoutPayment;
        transaction.lastInteraction = now;

        emit MetaEvidence(transactionIndex, _metaEvidence);
        emit TransactionCreated(transactionIndex, msg.sender, _receiver, _token, _amount);
    }

    /** @dev Pay receiver. To be called if the good or service is provided. UNTRUSTED.
     *  @param _transactionID The index of the transaction.
     *  @param _amount Amount to pay in tokens.
     */
    function pay(uint _transactionID, uint _amount) public {
        Transaction storage transaction = transactions[_transactionID];
        require(transaction.sender == msg.sender, "The caller must be the sender.");
        require(transaction.status == Status.NoDispute, "The transaction shouldn't be disputed.");
        require(_amount <= transaction.amount, "The amount paid has to be less or equal than the transaction.");

        transaction.amount -= _amount;
        require(transaction.token.transfer(transaction.receiver, _amount), "The `transfer` function must not fail.");
        emit Payment(_transactionID, _amount, msg.sender);
    }

    /** @dev Reimburse sender. To be called if the good or service can't be fully provided. UNTRUSTED.
     *  @param _transactionID The index of the transaction.
     *  @param _amountReimbursed Amount to reimburse in tokens.
     */
    function reimburse(uint _transactionID, uint _amountReimbursed) public {
        Transaction storage transaction = transactions[_transactionID];
        require(transaction.receiver == msg.sender, "The caller must be the receiver.");
        require(transaction.status == Status.NoDispute, "The transaction shouldn't be disputed.");
        require(_amountReimbursed <= transaction.amount, "The amount reimbursed has to be less or equal than the transaction.");

        transaction.amount -= _amountReimbursed;
        require(transaction.token.transfer(transaction.sender, _amountReimbursed), "The `transfer` function must not fail.");
        emit Payment(_transactionID, _amountReimbursed, msg.sender);
    }

    /** @dev Transfer the transaction's amount to the receiver if the timeout has passed. UNTRUSTED.
     *  @param _transactionID The index of the transaction.
     */
    function executeTransaction(uint _transactionID) public {
        Transaction storage transaction = transactions[_transactionID];
        require(now - transaction.lastInteraction >= transaction.timeoutPayment, "The timeout has not passed yet.");
        require(transaction.status == Status.NoDispute, "The transaction shouldn't be disputed.");

        uint amount = transaction.amount;
        transaction.amount = 0;

        transaction.status = Status.Resolved;

        require(transaction.token.transfer(transaction.receiver, amount), "The `transfer` function must not fail.");
    }

    /** @dev Reimburse sender if receiver fails to pay the fee. UNTRUSTED.
     *  @param _transactionID The index of the transaction.
     */
    function timeOutBySender(uint _transactionID) public {
        Transaction storage transaction = transactions[_transactionID];
        require(transaction.status == Status.WaitingReceiver, "The transaction is not waiting on the receiver.");
        require(now - transaction.lastInteraction >= feeTimeout, "Timeout time has not passed yet.");

        if (transaction.receiverFee != 0) {
            transaction.receiver.send(transaction.receiverFee);
            transaction.receiverFee = 0;
        }
        executeRuling(_transactionID, uint(Party.Sender));
    }

    /** @dev Pay receiver if sender fails to pay the fee. UNTRUSTED.
     *  @param _transactionID The index of the transaction.
     */
    function timeOutByReceiver(uint _transactionID) public {
        Transaction storage transaction = transactions[_transactionID];
        require(transaction.status == Status.WaitingSender, "The transaction is not waiting on the sender.");
        require(now - transaction.lastInteraction >= feeTimeout, "Timeout time has not passed yet.");

        if (transaction.senderFee != 0) {
            transaction.sender.send(transaction.senderFee);
            transaction.senderFee = 0;
        }
        executeRuling(_transactionID, uint(Party.Receiver));
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
        } else { // The receiver has also paid the fee. We create the dispute.
            raiseDispute(_transactionID, arbitrationCost);
        }
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
        transaction.disputeId = arbitrator.createDispute.value(_arbitrationCost)(AMOUNT_OF_CHOICES, arbitratorExtraData);
        disputeIDtoTransactionID[transaction.disputeId] = _transactionID;
        transaction.rounds.length++;
        emit Dispute(arbitrator, transaction.disputeId, _transactionID, _transactionID);

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
        require(
            msg.sender == transaction.receiver || msg.sender == transaction.sender,
            "The caller must be the receiver or the sender."
        );
        require(
            transaction.status < Status.Resolved,
            "Must not send evidence if the dispute is resolved."
        );

        emit Evidence(arbitrator, _transactionID, msg.sender, _evidence);
    }

    /** @dev Takes up to the total amount required to fund a side of an appeal. Reimburses the rest. Creates an appeal if both sides are fully funded.
     *  @param _transactionID The ID of the disputed transaction.
     *  @param _side The party that pays the appeal fee.
     */
    function fundAppeal(uint _transactionID, Party _side) public payable {
        Transaction storage transaction = transactions[_transactionID];
        require(_side == Party.Sender || _side == Party.Receiver, "Wrong party.");
        require(transaction.status == Status.DisputeCreated, "No dispute to appeal");
        require(arbitrator.disputeStatus(transaction.disputeId) == Arbitrator.DisputeStatus.Appealable, "Dispute is not appealable.");

        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(transaction.disputeId);
        require(now >= appealPeriodStart && now < appealPeriodEnd, "Funding must be made within the appeal period.");

        uint winner = arbitrator.currentRuling(transaction.disputeId);
        uint multiplier;
        if (winner == uint(_side)){
            multiplier = winnerStakeMultiplier;
        } else if (winner == 0){
            multiplier = sharedStakeMultiplier;
        } else {
            require(now - appealPeriodStart < (appealPeriodEnd - appealPeriodStart)/2, "The loser must pay during the first half of the appeal period.");
            multiplier = loserStakeMultiplier;
        }

        Round storage round = transaction.rounds[transaction.rounds.length - 1];
        require(!round.hasPaid[uint(_side)], "Appeal fee has already been paid.");

        uint appealCost = arbitrator.appealCost(transaction.disputeId, arbitratorExtraData);
        uint totalCost = appealCost.addCap((appealCost.mulCap(multiplier)) / MULTIPLIER_DIVISOR);

        // Take up to the amount necessary to fund the current round at the current costs.
        uint contribution; // Amount contributed.
        uint remainingETH; // Remaining ETH to send back.
        (contribution, remainingETH) = calculateContribution(msg.value, totalCost.subCap(round.paidFees[uint(_side)]));
        round.contributions[msg.sender][uint(_side)] += contribution;
        round.paidFees[uint(_side)] += contribution;
        round.feeRewards += contribution;
        
        if (round.paidFees[uint(_side)] >= totalCost) {
            round.hasPaid[uint(_side)] = true;
            emit HasPaidAppealFee(_transactionID, _side);
        }

        // Reimburse leftover ETH.
        msg.sender.send(remainingETH); // Deliberate use of send in order to not block the contract in case of reverting fallback.

        // Create an appeal if each side is funded.
        if (round.hasPaid[uint(Party.Sender)] && round.hasPaid[uint(Party.Receiver)]) {
            arbitrator.appeal.value(appealCost)(transaction.disputeId, arbitratorExtraData);
            transaction.rounds.length++;
            round.feeRewards = round.feeRewards.subCap(appealCost);
        }
    }
    
    /** @dev Returns the contribution value and remainder from available ETH and required amount.
     *  @param _available The amount of ETH available for the contribution.
     *  @param _requiredAmount The amount of ETH required for the contribution.
     *  @return taken The amount of ETH taken.
     *  @return remainder The amount of ETH left from the contribution.
     */
    function calculateContribution(uint _available, uint _requiredAmount)
        internal
        pure
        returns(uint taken, uint remainder)
    {
        if (_requiredAmount > _available)
            return (_available, 0); // Take whatever is available, return 0 as leftover ETH.

        remainder = _available - _requiredAmount;
        return (_requiredAmount, remainder);
    }
    
    /** @dev Witdraws contributions of appeal rounds. Reimburses contributions if the appeal was not fully funded. If the appeal was fully funded, sends the fee stake rewards and reimbursements proportional to the contributions made to the winner of a dispute.
     *  @param _beneficiary The address that made contributions.
     *  @param _transactionID The ID of the associated transaction.
     *  @param _round The round from which to withdraw.
     */
    function withdrawFeesAndRewards(address _beneficiary, uint _transactionID, uint _round) public {
        Transaction storage transaction = transactions[_transactionID];
        Round storage round = transaction.rounds[_round];
        require(transaction.status == Status.Resolved, "The transaction should be resolved.");
        uint reward;
        if (!round.hasPaid[uint(Party.Sender)] || !round.hasPaid[uint(Party.Receiver)]) {
            // Allow to reimburse if funding was unsuccessful.
            reward = round.contributions[_beneficiary][uint(Party.Sender)] + round.contributions[_beneficiary][uint(Party.Receiver)];
        } else if (transaction.ruling == uint(Party.None)) {
            // Reimburse unspent fees proportionally if there is no winner and loser.
            uint rewardSender = round.paidFees[uint(Party.Sender)] > 0
                ? (round.contributions[_beneficiary][uint(Party.Sender)] * round.feeRewards) / (round.paidFees[uint(Party.Sender)] + round.paidFees[uint(Party.Receiver)])
                : 0;
            uint rewardReceiver = round.paidFees[uint(Party.Receiver)] > 0
                ? (round.contributions[_beneficiary][uint(Party.Receiver)] * round.feeRewards) / (round.paidFees[uint(Party.Sender)] + round.paidFees[uint(Party.Receiver)])
                : 0;

            reward = rewardSender + rewardReceiver;
        } else {
            // Reward the winner.
            reward = round.paidFees[transaction.ruling] > 0
                ? (round.contributions[_beneficiary][transaction.ruling] * round.feeRewards) / round.paidFees[transaction.ruling]
                : 0;
        }
        round.contributions[_beneficiary][uint(Party.Sender)] = 0;
        round.contributions[_beneficiary][uint(Party.Receiver)] = 0;
        
        _beneficiary.send(reward); // It is the user responsibility to accept ETH.
    }

    /** @dev Withdraws contributions of multiple appeal rounds at once. This function is O(n) where n is the number of rounds. This could exceed the gas limit, therefore this function should be used only as a utility and not be relied upon by other contracts.
     *  @param _beneficiary The address that made contributions.
     *  @param _transactionID The ID of the associated transaction.
     *  @param _cursor The round from where to start withdrawing.
     *  @param _count The number of rounds to iterate. If set to 0 or a value larger than the number of rounds, iterates until the last round.
     */
    function batchRoundWithdraw(address _beneficiary, uint _transactionID, uint _cursor, uint _count) public {
        Transaction storage transaction = transactions[_transactionID];
        for (uint i = _cursor; i<transaction.rounds.length && (_count==0 || i<_cursor+_count); i++)
            withdrawFeesAndRewards(_beneficiary, _transactionID, i);
    }

    /** @dev Give a ruling for a dispute. Must be called by the arbitrator to enforce the final ruling.
     *  The purpose of this function is to ensure that the address calling it has the right to rule on the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function rule(uint _disputeID, uint _ruling) public {
        Party resultRuling = Party(_ruling);
        uint transactionID = disputeIDtoTransactionID[_disputeID];
        Transaction storage transaction = transactions[transactionID];
        Round storage round = transaction.rounds[transaction.rounds.length - 1];
        require(msg.sender == address(arbitrator), "The caller must be the arbitrator.");
        require(transaction.status == Status.DisputeCreated, "The dispute has already been resolved.");
        
        // If only one side paid its fees we assume the ruling to be in its favor.
        if (round.hasPaid[uint(Party.Sender)] == true)
            resultRuling = Party.Sender;
        else if (round.hasPaid[uint(Party.Receiver)] == true)
            resultRuling = Party.Receiver;

        emit Ruling(Arbitrator(msg.sender), _disputeID, uint(resultRuling));

        executeRuling(transactionID, uint(resultRuling));
    }

    /** @dev Execute a ruling of a dispute. It reimburses the fee to the winning party.
     *  @param _transactionID The index of the transaction.
     *  @param _ruling Ruling given by the arbitrator.
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
        transaction.ruling = _ruling;

        // Give the arbitration fee back.
        // Note that we use `send` to prevent a party from blocking the execution.
        if (_ruling == uint(Party.Sender)) {
            transaction.sender.send(senderFee);
            require(transaction.token.transfer(transaction.sender, amount), "The `transfer` function must not fail.");
        } else if (_ruling == uint(Party.Receiver)) {
            transaction.receiver.send(receiverFee);
            require(transaction.token.transfer(transaction.receiver, amount), "The `transfer` function must not fail.");
        } else {
            // `senderFee` and `receiverFee` are equal to the arbitration cost.
            uint splitArbitrationFee = senderFee / 2;
            transaction.receiver.send(splitArbitrationFee);
            transaction.sender.send(splitArbitrationFee);
            // Tokens should not reenter or allow recipients to refuse the transfer.
            // In the case of an uneven token amount, one basic token unit can be burnt.
            require(transaction.token.transfer(transaction.receiver, amount / 2), "The `transfer` function must not fail.");
            require(transaction.token.transfer(transaction.sender, amount / 2), "The `transfer` function must not fail.");
        }
    }

    // **************************** //
    // *     Constant getters     * //
    // **************************** //
    
    /** @dev Returns the sum of withdrawable wei from appeal rounds. This function is O(n), where n is the number of rounds of the transaction. This could exceed the gas limit, therefore this function should only be used for interface display and not by other contracts.
     *  @param _transactionID The index of the transaction.
     *  @param _beneficiary The contributor for which to query.
     *  @return The total amount of wei available to withdraw.
     */
    function amountWithdrawable(uint _transactionID, address _beneficiary) public view returns (uint total){
        Transaction storage transaction = transactions[_transactionID];
        if (transaction.status != Status.Resolved) return total;

        for (uint i = 0; i < transaction.rounds.length; i++) {
            Round storage round = transaction.rounds[i];
            if (!round.hasPaid[uint(Party.Sender)] || !round.hasPaid[uint(Party.Receiver)]) {
                total += round.contributions[_beneficiary][uint(Party.Sender)] + round.contributions[_beneficiary][uint(Party.Receiver)];
            } else if (transaction.ruling == uint(Party.None)) {
                uint rewardSender = round.paidFees[uint(Party.Sender)] > 0
                    ? (round.contributions[_beneficiary][uint(Party.Sender)] * round.feeRewards) / (round.paidFees[uint(Party.Sender)] + round.paidFees[uint(Party.Receiver)])
                    : 0;
                uint rewardReceiver = round.paidFees[uint(Party.Receiver)] > 0
                    ? (round.contributions[_beneficiary][uint(Party.Receiver)] * round.feeRewards) / (round.paidFees[uint(Party.Sender)] + round.paidFees[uint(Party.Receiver)])
                    : 0;

                total += rewardSender + rewardReceiver;
            } else {
                total += round.paidFees[uint(transaction.ruling)] > 0
                    ? (round.contributions[_beneficiary][uint(transaction.ruling)] * round.feeRewards) / round.paidFees[uint(transaction.ruling)]
                    : 0;
            }
        } 

        return total;
    }

    /** @dev Getter to know the count of transactions.
     *  @return countTransactions The count of transactions.
     */
    function getCountTransactions() public view returns (uint countTransactions) {
        return transactions.length;
    }

    /** @dev Gets the number of rounds of the specific transaction.
     *  @param _transactionID The ID of the transaction.
     *  @return The number of rounds.
     */
    function getNumberOfRounds(uint _transactionID) public view returns (uint) {
        Transaction storage transaction = transactions[_transactionID];
        return transaction.rounds.length;
    }

    /** @dev Gets the contributions made by a party for a given round of the appeal.
     *  @param _transactionID The ID of the transaction.
     *  @param _round The position of the round.
     *  @param _contributor The address of the contributor.
     *  @return The contributions.
     */
    function getContributions(
        uint _transactionID,
        uint _round,
        address _contributor
    ) public view returns(uint[3] contributions) {
        Transaction storage transaction = transactions[_transactionID];
        Round storage round = transaction.rounds[_round];
        contributions = round.contributions[_contributor];
    }

    /** @dev Gets the information on a round of a transaction.
     *  @param _transactionID The ID of the transaction.
     *  @param _round The round to query.
     *  @return The round information.
     */
    function getRoundInfo(uint _transactionID, uint _round)
        public
        view
        returns (
            uint[3] paidFees,
            bool[3] hasPaid,
            uint feeRewards
        )
    {
        Transaction storage transaction = transactions[_transactionID];
        Round storage round = transaction.rounds[_round];
        return (
            round.paidFees,
            round.hasPaid,
            round.feeRewards
        );
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