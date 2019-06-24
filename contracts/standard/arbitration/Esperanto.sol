/**
 *  @authors: [@unknownunknown1]
 *  @reviewers: [@ferittuncer*]
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

/* solium-disable security/no-block-members */
/* solium-disable max-len*/
pragma solidity ^0.4.24;

import "./Arbitrable.sol";
import "../../libraries/CappedMath.sol";

contract Esperanto is Arbitrable {

    using CappedMath for uint;

    /* *** Contract variables *** */
    uint public constant MULTIPLIER_DIVISOR = 10000; // Divisor parameter for multipliers.
    uint constant NOT_PAYABLE_VALUE = (2**256-2)/2; // A value depositor won't be able to pay.

    enum Status {Created, Assigned, AwaitingReview, DisputeCreated, Resolved}


    enum Party {
        Requester, // The one requesting the translation.
        Translator, // The one performing translation task.
        Challenger // The one challenging translated text in the review period.
    }

    struct Task {
        uint submissionTimeout; // Time in seconds allotted for submitting a translation. The end of this period is considered a deadline.
        uint minPrice; // Minimal price for the translation. When the task is created it has minimal price that gradually increases until it reaches maximal price at deadline.
        uint maxPrice; // Maximal price for the translation and also value that must be deposited by the one requesting the translation.
        Status status; // Status of the task.
        uint lastInteraction; // The time of the last action performed on the task.
        address[3] parties; // Requester, translator and challenger of the task, respectively.
        uint[3] deposits; // Deposits of requester, translator and challenger.
        uint disputeID; // The ID of the dispute created in arbitrator contract.
        Round[] rounds; // Tracks each appeal round of a dispute.
        uint ruling; // Ruling given to the dispute of the task by the arbitrator.
    }

    struct Round {
        uint[3] paidFees; // Tracks the fees paid by each side on this round.
        bool[3] hasPaid; // True when the side has fully paid its fee. False otherwise.
        uint feeRewards; // Sum of reimbursable fees and stake rewards available to the parties that made contributions to the side that ultimately wins a dispute.
        mapping(address => uint[3]) contributions; // Maps contributors to their contributions for each side.
        uint successfullyPaid; // Sum of all successfully paid fees paid by all sides.
    }

    address public governor; // The governor of the contract.
    uint public reviewTimeout; // Time in seconds, during which the submitted translation can be challenged.

    uint public translationMultiplier; // Multiplier for calculating the value of the deposit translator must pay to self-assign a task.
    uint public challengeMultiplier; // Multiplier for calculating the value of the deposit challenger must pay to challenge a translation.
    uint public sharedStakeMultiplier; // Multiplier for calculating the appeal fee that must be paid by submitter in the case where there isn't a winner and loser (e.g. when the arbitrator ruled "refused to rule"/"could not rule").
    uint public winnerStakeMultiplier; // Multiplier for calculating the appeal fee of the party that won the previous round.
    uint public loserStakeMultiplier; // Multiplier for calculating the appeal fee of the party that lost the previous round.

    Task[] public tasks; // Stores all created tasks.

    mapping (uint => uint) public disputeIDtoTaskID; // Maps a dispute to its respective task.

    /* *** Events *** */

    /** @dev To be emitted when translation is submitted.
     *  @param _taskID The ID of the respective task.
     *  @param _translator The address that performed the translation.
     *  @param _translatedText A link to the translated text.
    */
    event TranslationSubmitted(uint indexed _taskID, address indexed _translator, string _translatedText);

    /* *** Modifiers *** */
    modifier onlyGovernor() {require(msg.sender == governor, "Only governor is allowed to perform this"); _;}

    /** @dev Constructor.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _arbitratorExtraData Extra data for the arbitrator.
     *  @param _reviewTimeout Time in seconds during which a translation can be challenged.
     *  @param _translationMultiplier Multiplier for calculating translator's deposit. In basis points
     *  @param _challengeMultiplier Multiplier for calculating challenger's deposit. In basis points
     *  @param _sharedStakeMultiplier Multiplier of the appeal cost that submitter must pay for a round when there is no winner/loser in the previous round. In basis points.
     *  @param _winnerStakeMultiplier Multiplier of the appeal cost that the winner has to pay for a round. In basis points.
     *  @param _loserStakeMultiplier Multiplier of the appeal cost that the loser has to pay for a round. In basis points.
    */
    constructor(
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        uint _reviewTimeout,
        uint _translationMultiplier,
        uint _challengeMultiplier,
        uint _sharedStakeMultiplier,
        uint _winnerStakeMultiplier,
        uint _loserStakeMultiplier
    ) public Arbitrable(_arbitrator, _arbitratorExtraData){
        governor = msg.sender;
        reviewTimeout = _reviewTimeout;
        translationMultiplier = _translationMultiplier;
        challengeMultiplier = _challengeMultiplier;
        sharedStakeMultiplier = _sharedStakeMultiplier;
        winnerStakeMultiplier = _winnerStakeMultiplier;
        loserStakeMultiplier = _loserStakeMultiplier;
    }

    // ******************** //
    // *    Governance    * //
    // ******************** //


    /** @dev Changes the governor of this contract.
     *  @param _governor A new governor.
    */
    function changeGovernor(address _governor) public onlyGovernor {
        governor = _governor;
    }

    /** @dev Changes the time allocated for review phase.
     *  @param _reviewTimeout A new value of 'reviewTimeout' storage variable.
    */
    function changeReviewTimeout(uint _reviewTimeout) public onlyGovernor {
        reviewTimeout = _reviewTimeout;
    }

    /** @dev Changes the multiplier for translator's deposit.
     *  @param _translationMultiplier A new value of 'translationMultiplier' storage variable.
    */
    function changeTranslationMultiplier(uint _translationMultiplier) public onlyGovernor {
        translationMultiplier = _translationMultiplier;
    }

    /** @dev Changes the multiplier for challenger's deposit.
     *  @param _challengeMultiplier A new value of 'challengeMultiplier' storage variable.
    */
    function changeChallengeMultiplier(uint _challengeMultiplier) public onlyGovernor {
        challengeMultiplier = _challengeMultiplier;
    }

    /** @dev Changes the percentage of arbitration fees that must be paid by party if there was no winner and loser in previous round.
     *  @param _sharedStakeMultiplier A new value of 'sharedStakeMultiplier' storage variable.
     */
    function changeSharedStakeMultiplier(uint _sharedStakeMultiplier) public onlyGovernor {
        sharedStakeMultiplier = _sharedStakeMultiplier;
    }

    /** @dev Changes the percentage of arbitration fees that must be paid by party that won the previous round.
     *  @param _winnerStakeMultiplier A new value of 'winnerStakeMultiplier' storage variable.
     */
    function changeWinnerStakeMultiplier(uint _winnerStakeMultiplier) public onlyGovernor {
        winnerStakeMultiplier = _winnerStakeMultiplier;
    }

    /** @dev Changes the percentage of arbitration fees that must be paid by party that lost the previous round.
     *  @param _loserStakeMultiplier A new value of 'loserStakeMultiplier' storage variable.
     */
    function changeLoserStakeMultiplier(uint _loserStakeMultiplier) public onlyGovernor {
        loserStakeMultiplier = _loserStakeMultiplier;
    }

    // **************************** //
    // *    Arbitrable functions  * //
    // *    Modifying the state   * //
    // **************************** //

    /** @dev Creates a task based on provided details. Requires a value of maximal price to be deposited.
     *  @param _submissionTimeout Time allotted for submitting a translation.
     *  @param _minPrice A minimal price of the translation. In wei.
     *  @param _maxPrice A maximal price of the translation. In wei.
     *  @param _metaEvidence A URI of meta-evidence object for task submission.
     *  @return taskID The ID of the created task.
    */
    function createTask(
        uint _submissionTimeout,
        uint _minPrice,
        uint _maxPrice,
        string _metaEvidence
    ) public payable returns (uint taskID){
        require(msg.value >= _maxPrice, "The value of max price must be depositted");
        require(_maxPrice > _minPrice, "Max price should be greater than min price");

        tasks.length++;
        taskID = tasks.length - 1;
        Task storage task = tasks[tasks.length - 1];
        task.submissionTimeout = _submissionTimeout;
        task.minPrice = _minPrice;
        task.maxPrice = _maxPrice;
        task.status = Status.Created;
        task.lastInteraction = now;
        task.parties[uint(Party.Requester)] = msg.sender;
        task.deposits[uint(Party.Requester)] = _maxPrice;

        uint remainder = msg.value - _maxPrice;
        msg.sender.send(remainder);

        emit MetaEvidence(taskID, _metaEvidence);
    }

    /** @dev Assigns a specific task to the sender. Requires a translator's deposit.
     *  @param _taskID The ID of the task.
    */
    function assignTask(uint _taskID) public payable{
        Task storage task = tasks[_taskID];

        uint price = getTaskPrice(_taskID, 0);
        uint deposit = getMinimumDepositValue(_taskID);

        require(task.status == Status.Created, "Task has already been assigned or reimbursed");
        require(now - task.lastInteraction <= task.submissionTimeout, "The deadline has already passed");
        require(msg.value >= deposit, "Not enough ETH to reach the required deposit value");

        task.parties[uint(Party.Translator)] = msg.sender;
        task.status = Status.Assigned;

        uint remainder = task.maxPrice - price;
        task.parties[uint(Party.Requester)].send(remainder);
        // Update requester's deposit since we reimbursed him the difference between maximal and actual price.
        task.deposits[uint(Party.Requester)] = price;
        task.deposits[uint(Party.Translator)] = deposit;

        remainder = msg.value - deposit;
        msg.sender.send(remainder);
    }

    /** @dev Submits translated text for a specific task.
     *  @param _taskID The ID of the task.
     *  @param _translation A link to the translated text.
    */
    function submitTranslation(uint _taskID, string _translation) public {
        Task storage task = tasks[_taskID];
        require(task.status == Status.Assigned, "The task is either not assigned or translation has already been submitted");
        require(now - task.lastInteraction <= task.submissionTimeout, "The deadline has already passed");
        require(msg.sender == task.parties[uint(Party.Translator)], "Can't submit translation to the task that wasn't assigned to you");
        task.status = Status.AwaitingReview;
        task.lastInteraction = now;

        emit TranslationSubmitted(_taskID, msg.sender, _translation);
    }

    /** @dev Reimburses the requester if no one picked the task or the translator failed to submit the translation before deadline.
     *  @param _taskID The ID of the task.
    */
    function reimburseRequester(uint _taskID) public {
        Task storage task = tasks[_taskID];
        require(task.status < Status.AwaitingReview, "Can't reimburse if translation was submitted");
        require(now - task.lastInteraction > task.submissionTimeout, "Can't reimburse if the deadline hasn't passed yet");
        task.status = Status.Resolved;
        // Requester gets his deposit back and also the deposit of the translator, if there was one.
        uint amount = task.deposits[uint(Party.Requester)] + task.deposits[uint(Party.Translator)];
        task.parties[uint(Party.Requester)].send(amount);

        task.deposits[uint(Party.Requester)] = 0;
        task.deposits[uint(Party.Translator)] = 0;
    }

    /** @dev Pays the translator for completed task if no one challenged the translation during review period.
     *  @param _taskID The ID of the task.
    */
    function acceptTranslation(uint _taskID) public {
        Task storage task = tasks[_taskID];
        require(task.status == Status.AwaitingReview, "The task is in the wrong status");
        require(now - task.lastInteraction > reviewTimeout, "The review phase hasn't passed yet");
        task.status = Status.Resolved;
        // Translator gets the price of the task and his deposit back.
        uint amount = task.deposits[uint(Party.Requester)] + task.deposits[uint(Party.Translator)];
        task.parties[uint(Party.Translator)].send(amount);

        task.deposits[uint(Party.Requester)] = 0;
        task.deposits[uint(Party.Translator)] = 0;
    }

    /** @dev Challenges the translation of a specific task. Requires challenger's deposit.
     *  @param _taskID The ID of the task.
    */
    function challengeTranslation(uint _taskID) public payable {
        Task storage task = tasks[_taskID];

        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        uint challengeDeposit = arbitrationCost.addCap((challengeMultiplier.mulCap(task.deposits[uint(Party.Requester)])) / MULTIPLIER_DIVISOR);

        require(task.status == Status.AwaitingReview, "The task is in the wrong status");
        require(now - task.lastInteraction <= reviewTimeout, "The review phase has already passed");
        require(msg.value >= challengeDeposit, "Not enough ETH to cover challenge deposit");

        task.status = Status.DisputeCreated;
        task.parties[uint(Party.Challenger)] = msg.sender;

        task.disputeID = arbitrator.createDispute.value(arbitrationCost)(2, arbitratorExtraData);
        disputeIDtoTaskID[task.disputeID] = _taskID;
        task.rounds.length++;
        task.deposits[uint(Party.Challenger)] = challengeDeposit.subCap(arbitrationCost);

        uint remainder = msg.value - challengeDeposit;
        msg.sender.send(remainder);

        emit Dispute(arbitrator, task.disputeID, _taskID, _taskID);
    }

    /** @dev Takes up to the total amount required to fund a side of an appeal. Reimburses the rest. Creates an appeal if all sides are fully funded.
     *  @param _taskID The ID of challenged task.
     *  @param _side The party that pays the appeal fee.
    */
    function fundAppeal(uint _taskID, Party _side) public payable {
        Task storage task = tasks[_taskID];
        require(_side == Party.Translator || _side == Party.Challenger, "Recipient must be either the translator or challenger.");
        require(task.status == Status.DisputeCreated, "No dispute to appeal");

        require(arbitrator.disputeStatus(task.disputeID) == Arbitrator.DisputeStatus.Appealable, "Dispute is not appealable.");

        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(task.disputeID);
        require(now >= appealPeriodStart && now < appealPeriodEnd, "Funding must be made within the appeal period.");

        bool winner;
        uint multiplier;
        if (arbitrator.currentRuling(task.disputeID) == uint(_side)){
            winner = true;
            multiplier = winnerStakeMultiplier;
        } else if (arbitrator.currentRuling(task.disputeID) == 0){
            multiplier = sharedStakeMultiplier;
        } else {
            multiplier = loserStakeMultiplier;
        }

        require(winner || (now - appealPeriodStart < (appealPeriodEnd - appealPeriodStart) / 2), "The loser must pay during the first half of the appeal period.");
        Round storage round = task.rounds[task.rounds.length - 1];
        require(!round.hasPaid[uint(_side)], "Appeal fee has already been paid");

        uint appealCost = arbitrator.appealCost(task.disputeID, arbitratorExtraData);
        uint totalCost = appealCost.addCap((appealCost.mulCap(multiplier)) / MULTIPLIER_DIVISOR);

        contribute(round, _side, msg.sender, msg.value, totalCost);

        // Create an appeal if each side is funded.
        if (round.hasPaid[uint(Party.Translator)] && round.hasPaid[uint(Party.Challenger)]) {
            arbitrator.appeal.value(appealCost)(task.disputeID, arbitratorExtraData);
            task.rounds.length++;
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

    /** @dev Make a fee contribution.
     *  @param _round The round to contribute.
     *  @param _side The side for which to contribute.
     *  @param _contributor The contributor.
     *  @param _amount The amount contributed.
     *  @param _totalRequired The total amount required for this side.
     */
    function contribute(Round storage _round, Party _side, address _contributor, uint _amount, uint _totalRequired) internal {
        // Take up to the amount necessary to fund the current round at the current costs.
        uint contribution; // Amount contributed.
        uint remainingETH; // Remaining ETH to send back.
        (contribution, remainingETH) = calculateContribution(_amount, _totalRequired.subCap(_round.paidFees[uint(_side)]));
        _round.contributions[_contributor][uint(_side)] += contribution;
        _round.paidFees[uint(_side)] += contribution;
        // Add contribution to reward when the fee funding is successful, otherwise it can be withdrawn later.
        if (_round.paidFees[uint(_side)] >= _totalRequired) {
            _round.hasPaid[uint(_side)] = true;
            _round.feeRewards += _round.paidFees[uint(_side)];
            _round.successfullyPaid += _round.paidFees[uint(_side)];
        }

        // Reimburse leftover ETH.
        _contributor.send(remainingETH); // Deliberate use of send in order to not block the contract in case of reverting fallback.
    }
    function withdrawFeesAndRewards(address _beneficiary, uint _taskID, uint _round) public {
        Task storage task = tasks[_taskID];
        Round storage round = task.rounds[_round];
        // The task must be resolved and there can be no disputes pending resolution.
        require(task.status == Status.Resolved, "The task should be resolved");
        uint reward;
        // Skip 0 party because it can't be funded.
        for (uint i = 1; i < task.parties.length; i++){
            // Allow to reimburse if funding was unsuccessful.
            if (!round.hasPaid[i]) {
                reward += round.contributions[_beneficiary][i];
                round.contributions[_beneficiary][i] = 0;
            } else {
                // Reimburse unspent fees proportionally if there is no winner and loser.
                if (task.ruling == 0) {
                    uint partyReward = round.successfullyPaid > 0
                        ? (round.contributions[_beneficiary][i] * round.feeRewards) / round.successfullyPaid
                        : 0;
                    reward += partyReward;
                    round.contributions[_beneficiary][i] = 0;
                } else if (task.ruling == i) {
                    // Reward the winner.
                    reward += round.paidFees[i] > 0
                    ? (round.contributions[_beneficiary][i] * round.feeRewards) / round.paidFees[i]
                    : 0;
                    round.contributions[_beneficiary][i] = 0;
                }
            }
        }

        _beneficiary.send(reward); // It is the user responsibility to accept ETH.
    }


    /** @dev Gives a ruling for a dispute. Must be called by the arbitrator.
     *  The purpose of this function is to ensure that the address calling it has the right to rule on the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function rule(uint _disputeID, uint _ruling) public {
        Party resultRuling = Party(_ruling);
        uint taskID = disputeIDtoTaskID[_disputeID];
        Task storage task = tasks[taskID];
        Round storage round = task.rounds[task.rounds.length - 1];
        require(msg.sender == address(arbitrator), "Must be called by the arbitrator");
        require(task.status == Status.DisputeCreated, "The dispute has already been resolved");

        // The ruling is inverted if the loser paid its fees.
        if (round.hasPaid[uint(Party.Translator)] == true)
            resultRuling = Party.Translator;
        else if (round.hasPaid[uint(Party.Challenger)] == true)
            resultRuling = Party.Challenger;

        emit Ruling(Arbitrator(msg.sender), _disputeID, uint(resultRuling));
        executeRuling(_disputeID, uint(resultRuling));
    }


    /** @dev Executes a ruling of a dispute.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function executeRuling(uint _disputeID, uint _ruling) internal{
        uint taskID = disputeIDtoTaskID[_disputeID];
        Task storage task = tasks[taskID];
        task.status = Status.Resolved;
        task.ruling = _ruling;
        uint amount;

        if(_ruling == 0){
            task.parties[uint(Party.Translator)].send(task.deposits[uint(Party.Translator)]);
            task.parties[uint(Party.Challenger)].send(task.deposits[uint(Party.Challenger)]);
            task.parties[uint(Party.Requester)].send(task.deposits[uint(Party.Requester)]);
        } else if (_ruling == uint(Party.Translator)) {
            amount = task.deposits[uint(Party.Requester)] + task.deposits[uint(Party.Translator)] + task.deposits[uint(Party.Challenger)];
            task.parties[_ruling].send(amount);
        } else {
            amount = task.deposits[uint(Party.Translator)] + task.deposits[uint(Party.Challenger)];
            task.parties[_ruling].send(amount);
            task.parties[uint(Party.Requester)].send(task.deposits[uint(Party.Requester)]);
        }

        task.deposits[uint(Party.Requester)] = 0;
        task.deposits[uint(Party.Translator)] = 0;
        task.deposits[uint(Party.Challenger)] = 0;
    }

    /** @dev Submit a reference to evidence. EVENT.
     *  @param _taskID A task evidence is submitted for.
     *  @param _evidence A link to evidence using its URI.
     */
    function submitEvidence(uint _taskID, string _evidence) public {
        Task storage task = tasks[_taskID];
        require(task.status != Status.Resolved, "The task must not already be resolved.");
        require(msg.sender == task.parties[uint(Party.Requester)] || msg.sender == task.parties[uint(Party.Translator)] || msg.sender == task.parties[uint(Party.Challenger)], "Third parties are not allowed to submit evidence.");
        emit Evidence(arbitrator, _taskID, msg.sender, _evidence);
    }

    // ******************** //
    // *      Getters     * //
    // ******************** //

    /** @dev Gets the minimum deposit that translator must pay in order to self-assign the task.
     *  @param _taskID The ID of the task.
     *  @return deposit The deposit without a surplus.
     */
    function getMinimumDepositValue(uint _taskID) public view returns (uint deposit) {
        return getDepositValue(_taskID, 0);
    }

    /** @dev Gets the deposit value that is little more than minimum that the translator must pay in order to self-assign the task.
     *  Note that this function is useful for user interfaces because it adds a surplus by calculating a price 20 blocks ahead and thus accounts for the issue of price increase between the time when the transaction is created and mined.
     *  Also note, depositing more than minimum is not a problem because the excess deposit will be refunded.
     *  @param _taskID The ID of the task.
     *  @return deposit The required deposit.
     */
    function getSafeDepositValue(uint _taskID) public view returns (uint deposit){
        return getDepositValue(_taskID, 300);
    }

    /** @dev Gets the minimum deposit value at (now + _timeOffset) seconds.
     *  @param _taskID The ID of the task.
     *  @param _timeOffset Offset by seconds, from now.
     *  @return deposit The required deposit.
     */
    function getDepositValue(uint _taskID, uint _timeOffset) public view returns (uint deposit) {
        Task storage task = tasks[_taskID];
        if (now - task.lastInteraction > task.submissionTimeout || task.submissionTimeout == 0){
            deposit = NOT_PAYABLE_VALUE;
        } else {
            uint price = getTaskPrice(_taskID, _timeOffset);
            uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
            deposit = arbitrationCost.addCap((translationMultiplier.mulCap(price)) / MULTIPLIER_DIVISOR);
        }
    }

    /** @dev Gets the current price of a specified task.
     *  @param _taskID The ID of the task.
     *  @param _extraTime Time in seconds added to the current time to calculate future price. Is needed to calculate required deposit. Set to 0 to get current price.
     *  @return price The price of the task at current point in time.
     */
    function getTaskPrice(uint _taskID, uint _extraTime) public view returns (uint price) {
        Task storage task = tasks[_taskID];
        if (now - task.lastInteraction > task.submissionTimeout || task.submissionTimeout == 0){
            price = 0;
        } else {
            price = task.minPrice + (task.maxPrice - task.minPrice) * ((now - task.lastInteraction).addCap(_extraTime)) / task.submissionTimeout;
        }
    }

    /** @dev Gets the contributions made by a party for a given round of task's appeal.
     *  @param _taskID The ID of the task.
     *  @param _round The position of the round.
     *  @param _contributor The address of the contributor.
     *  @return The contributions.
     */
    function getContributions(
        uint _taskID,
        uint _round,
        address _contributor
    ) public view returns(uint[3] contributions) {
        Task storage task = tasks[_taskID];
        Round storage round = task.rounds[_round];
        contributions = round.contributions[_contributor];
    }

    /** @dev Gets the non-primitive properties of a specified task.
     *  @param _taskID The ID of the task.
     *  @return The task's non-primitive properties.
     */
    function getTaskInfo(uint _taskID)
        public
        view
        returns (
            address[3] parties,
            uint[3] deposits
        )
    {
        Task storage task = tasks[_taskID];
        parties = task.parties;
        deposits = task.deposits;
    }

    /** @dev Gets the information on a round of a task.
     *  @param _taskID The ID of the task.
     *  @param _round The round to be queried.
     *  @return The round information.
     */
    function getRoundInfo(uint _taskID, uint _round)
        public
        view
        returns (
            uint[3] paidFees,
            bool[3] hasPaid,
            uint feeRewards,
            uint successfullyPaid
        )
    {
        Task storage task = tasks[_taskID];
        Round storage round = task.rounds[_round];
        return (
            round.paidFees,
            round.hasPaid,
            round.feeRewards,
            round.successfullyPaid
        );
    }
}
