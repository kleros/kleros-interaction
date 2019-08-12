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

/** @title Esperanto
 *  Esperanto is a decentralized platform where anyone can submit a document for translation and have it translated by freelancers.
 *  It has no platform fees and disputes about translation quality are handled by Kleros jurors.
 */
contract Esperanto is Arbitrable {

    using CappedMath for uint;

    /* *** Contract variables *** */
    uint public constant MULTIPLIER_DIVISOR = 10000; // Divisor parameter for multipliers.
    uint constant NOT_PAYABLE_VALUE = (2**256-2)/2; // A value depositor won't be able to pay.

    enum Status {Created, Assigned, AwaitingReview, DisputeCreated, Resolved}

    enum Party {
        None, // Party that is mapped with 0 dispute ruling.
        Translator, // The one performing translation task.
        Challenger // The one challenging translated text in the review period.
    }

    // Arrays below have 3 elements to map parties with dispute choices. Index "0" is not used, "1" is reserved for translator and "2" for challenger.
    struct Task {
        uint submissionTimeout; // Time in seconds allotted for submitting a translation. The end of this period is considered a deadline.
        uint minPrice; // Minimal price for the translation. When the task is created it has minimal price that gradually increases until it reaches maximal price at deadline.
        uint maxPrice; // Maximal price for the translation and also value that must be deposited by the one requesting the translation.
        Status status; // Status of the task.
        uint lastInteraction; // The time of the last action performed on the task.
        address requester; // The one requesting the translation.
        uint requesterDeposit; // The deposit requester makes when creating the task. Once a task is assigned this deposit will be partially reimbursed and its value replaced by task price.
        address[3] parties; // Translator and challenger of the task.
        uint[3] deposits; // Deposits of translator and challenger.
        uint disputeID; // The ID of the dispute created in arbitrator contract.
        Round[] rounds; // Tracks each appeal round of a dispute.
        uint ruling; // Ruling given to the dispute of the task by the arbitrator.
    }

    struct Round {
        uint[3] paidFees; // Tracks the fees paid by each side in this round.
        bool[3] hasPaid; // True when the side has fully paid its fee. False otherwise.
        uint feeRewards; // Sum of reimbursable fees and stake rewards available to the parties that made contributions to the side that ultimately wins a dispute.
        mapping(address => uint[3]) contributions; // Maps contributors to their contributions for each side.
    }

    address public governor; // The governor of the contract.
    uint public reviewTimeout; // Time in seconds, during which the submitted translation can be challenged.
    // All multipliers below are in basis points.
    uint public translationMultiplier; // Multiplier for calculating the value of the deposit translator must pay to self-assign a task.
    uint public challengeMultiplier; // Multiplier for calculating the value of the deposit challenger must pay to challenge a translation.
    uint public sharedStakeMultiplier; // Multiplier for calculating the appeal fee that must be paid by submitter in the case where there isn't a winner and loser (e.g. when the arbitrator ruled "refuse to arbitrate").
    uint public winnerStakeMultiplier; // Multiplier for calculating the appeal fee of the party that won the previous round.
    uint public loserStakeMultiplier; // Multiplier for calculating the appeal fee of the party that lost the previous round.

    Task[] public tasks; // Stores all created tasks.

    mapping (uint => uint) public disputeIDtoTaskID; // Maps a disputeID to its respective task.

    /* *** Events *** */

    /** @dev To be emitted when a translation is submitted.
     *  @param _taskID The ID of the respective task.
     *  @param _translator The address that performed the translation.
     *  @param _translatedText A link to the translated text.
    */
    event TranslationSubmitted(uint indexed _taskID, address indexed _translator, string _translatedText);

    /** @dev To be emitted when one of the parties successfully paid its appeal fees.
     *  @param _taskID The ID of the respective task.
     *  @param _party The party that paid appeal fees.
    */
    event HasPaidAppealFee(uint indexed _taskID, Party _party);

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

    /** @dev Changes the percentage of arbitration fees that must be paid by parties if there was no winner and loser in previous round.
     *  @param _sharedStakeMultiplier A new value of 'sharedStakeMultiplier' storage variable.
     */
    function changeSharedStakeMultiplier(uint _sharedStakeMultiplier) public onlyGovernor {
        sharedStakeMultiplier = _sharedStakeMultiplier;
    }

    /** @dev Changes the percentage of arbitration fees that must be paid by the party that won the previous round.
     *  @param _winnerStakeMultiplier A new value of 'winnerStakeMultiplier' storage variable.
     */
    function changeWinnerStakeMultiplier(uint _winnerStakeMultiplier) public onlyGovernor {
        winnerStakeMultiplier = _winnerStakeMultiplier;
    }

    /** @dev Changes the percentage of arbitration fees that must be paid by the party that lost the previous round.
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
    ) external payable returns (uint taskID){
        require(msg.value >= _maxPrice, "The value of max price must be depositted");
        require(_maxPrice >= _minPrice, "Max price should be greater or equal the min price");
        require(_submissionTimeout > 0, "Submission timeout should not be 0");

        tasks.length++;
        taskID = tasks.length - 1;
        Task storage task = tasks[taskID];
        task.submissionTimeout = _submissionTimeout;
        task.minPrice = _minPrice;
        task.maxPrice = _maxPrice;
        task.lastInteraction = now;
        task.requester = msg.sender;
        task.requesterDeposit = _maxPrice;

        uint remainder = msg.value - _maxPrice;
        msg.sender.send(remainder);

        emit MetaEvidence(taskID, _metaEvidence);
    }

    /** @dev Assigns a specific task to the sender. Requires a translator's deposit.
     *  @param _taskID The ID of the task.
    */
    function assignTask(uint _taskID) external payable {
        Task storage task = tasks[_taskID];
        require(now - task.lastInteraction <= task.submissionTimeout, "The deadline has already passed");

        uint price = task.minPrice + (task.maxPrice - task.minPrice) * (now - task.lastInteraction) / task.submissionTimeout;
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        uint deposit = arbitrationCost.addCap((translationMultiplier.mulCap(price)) / MULTIPLIER_DIVISOR);

        require(task.status == Status.Created, "Task has already been assigned or reimbursed");
        require(msg.value >= deposit, "Not enough ETH to reach the required deposit value");

        task.parties[uint(Party.Translator)] = msg.sender;
        task.status = Status.Assigned;

        uint remainder = task.maxPrice - price;
        task.requester.send(remainder);
        // Update requester's deposit since we reimbursed him the difference between maximal and actual price.
        task.requesterDeposit = price;
        task.deposits[uint(Party.Translator)] = deposit;

        remainder = msg.value - deposit;
        msg.sender.send(remainder);
    }

    /** @dev Submits translated text for a specific task.
     *  @param _taskID The ID of the task.
     *  @param _translation A link to the translated text.
    */
    function submitTranslation(uint _taskID, string _translation) external {
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
    function reimburseRequester(uint _taskID) external {
        Task storage task = tasks[_taskID];
        require(task.status < Status.AwaitingReview, "Can't reimburse if translation was submitted");
        require(now - task.lastInteraction > task.submissionTimeout, "Can't reimburse if the deadline hasn't passed yet");
        task.status = Status.Resolved;
        // Requester gets his deposit back and also the deposit of the translator, if there was one.
        uint amount = task.requesterDeposit + task.deposits[uint(Party.Translator)];
        task.requester.send(amount);

        task.requesterDeposit = 0;
        task.deposits[uint(Party.Translator)] = 0;
    }

    /** @dev Pays the translator for completed task if no one challenged the translation during review period.
     *  @param _taskID The ID of the task.
    */
    function acceptTranslation(uint _taskID) external {
        Task storage task = tasks[_taskID];
        require(task.status == Status.AwaitingReview, "The task is in the wrong status");
        require(now - task.lastInteraction > reviewTimeout, "The review phase hasn't passed yet");
        task.status = Status.Resolved;
        // Translator gets the price of the task and his deposit back.
        uint amount = task.requesterDeposit + task.deposits[uint(Party.Translator)];
        task.parties[uint(Party.Translator)].send(amount);

        task.requesterDeposit = 0;
        task.deposits[uint(Party.Translator)] = 0;
    }

    /** @dev Challenges the translation of a specific task. Requires challenger's deposit.
     *  @param _taskID The ID of the task.
    */
    function challengeTranslation(uint _taskID) external payable {
        Task storage task = tasks[_taskID];

        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        uint challengeDeposit = arbitrationCost.addCap((challengeMultiplier.mulCap(task.requesterDeposit)) / MULTIPLIER_DIVISOR);

        require(task.status == Status.AwaitingReview, "The task is in the wrong status");
        require(now - task.lastInteraction <= reviewTimeout, "The review phase has already passed");
        require(msg.value >= challengeDeposit, "Not enough ETH to cover challenge deposit");

        task.status = Status.DisputeCreated;
        task.parties[uint(Party.Challenger)] = msg.sender;

        task.disputeID = arbitrator.createDispute.value(arbitrationCost)(2, arbitratorExtraData);
        disputeIDtoTaskID[task.disputeID] = _taskID;
        task.rounds.length++;
        // Payment of arbitration fees is shared among parties.
        task.deposits[uint(Party.Challenger)] = challengeDeposit.subCap(arbitrationCost / 2);
        task.deposits[uint(Party.Translator)] = task.deposits[uint(Party.Translator)].subCap(arbitrationCost / 2);

        uint remainder = msg.value - challengeDeposit;
        msg.sender.send(remainder);

        emit Dispute(arbitrator, task.disputeID, _taskID, _taskID);
    }

    /** @dev Takes up to the total amount required to fund a side of an appeal. Reimburses the rest. Creates an appeal if all sides are fully funded.
     *  @param _taskID The ID of challenged task.
     *  @param _side The party that pays the appeal fee.
    */
    function fundAppeal(uint _taskID, Party _side) external payable {
        Task storage task = tasks[_taskID];
        require(_side == Party.Translator || _side == Party.Challenger, "Recipient must be either the translator or challenger.");
        require(task.status == Status.DisputeCreated, "No dispute to appeal");

        require(arbitrator.disputeStatus(task.disputeID) == Arbitrator.DisputeStatus.Appealable, "Dispute is not appealable.");

        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(task.disputeID);
        require(now >= appealPeriodStart && now < appealPeriodEnd, "Funding must be made within the appeal period.");

        uint winner = arbitrator.currentRuling(task.disputeID);
        uint multiplier;
        if (winner == uint(_side)){
            multiplier = winnerStakeMultiplier;
        } else if (winner == 0){
            multiplier = sharedStakeMultiplier;
        } else {
            require(now - appealPeriodStart < (appealPeriodEnd - appealPeriodStart)/2, "The loser must pay during the first half of the appeal period.");
            multiplier = loserStakeMultiplier;
        }

        Round storage round = task.rounds[task.rounds.length - 1];

        uint appealCost = arbitrator.appealCost(task.disputeID, arbitratorExtraData);
        uint totalCost = appealCost.addCap((appealCost.mulCap(multiplier)) / MULTIPLIER_DIVISOR);

        contribute(_taskID, round, _side, msg.sender, msg.value, totalCost);

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
     *  @param _taskID The ID of the task.
     *  @param _round The round to contribute.
     *  @param _side The side for which to contribute.
     *  @param _contributor The contributor.
     *  @param _amount The amount contributed.
     *  @param _totalRequired The total amount required for this side.
     */
    function contribute(uint _taskID, Round storage _round, Party _side, address _contributor, uint _amount, uint _totalRequired) internal {
        require(!_round.hasPaid[uint(_side)], "Appeal fee has already been paid");
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
            emit HasPaidAppealFee(_taskID, _side);
        }

        // Reimburse leftover ETH.
        _contributor.send(remainingETH); // Deliberate use of send in order to not block the contract in case of reverting fallback.
    }
    function withdrawFeesAndRewards(address _beneficiary, uint _taskID, uint _round) external {
        Task storage task = tasks[_taskID];
        Round storage round = task.rounds[_round];
        require(task.status == Status.Resolved, "The task should be resolved");
        uint reward;
        if (!round.hasPaid[uint(Party.Translator)] || !round.hasPaid[uint(Party.Challenger)]) {
            // Allow to reimburse if funding was unsuccessful.
            reward = round.contributions[_beneficiary][uint(Party.Translator)] + round.contributions[_beneficiary][uint(Party.Challenger)];
            round.contributions[_beneficiary][uint(Party.Translator)] = 0;
            round.contributions[_beneficiary][uint(Party.Challenger)] = 0;
        } else if (task.ruling == uint(Party.None)) {
            // Reimburse unspent fees proportionally if there is no winner and loser.
            uint rewardTranslator = round.paidFees[uint(Party.Translator)] > 0
                ? (round.contributions[_beneficiary][uint(Party.Translator)] * round.feeRewards) / (round.paidFees[uint(Party.Translator)] + round.paidFees[uint(Party.Challenger)])
                : 0;
            uint rewardChallenger = round.paidFees[uint(Party.Challenger)] > 0
                ? (round.contributions[_beneficiary][uint(Party.Challenger)] * round.feeRewards) / (round.paidFees[uint(Party.Translator)] + round.paidFees[uint(Party.Challenger)])
                : 0;

            reward = rewardTranslator + rewardChallenger;
            round.contributions[_beneficiary][uint(Party.Translator)] = 0;
            round.contributions[_beneficiary][uint(Party.Challenger)] = 0;
        } else {
            // Reward the winner.
            reward = round.paidFees[task.ruling] > 0
                ? (round.contributions[_beneficiary][task.ruling] * round.feeRewards) / round.paidFees[task.ruling]
                : 0;
            round.contributions[_beneficiary][task.ruling] = 0;
        }

        _beneficiary.send(reward); // It is the user responsibility to accept ETH.
    }


    /** @dev Gives a ruling for a dispute. Must be called by the arbitrator.
     *  The purpose of this function is to ensure that the address calling it has the right to rule on the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Refuse to arbitrate".
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
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Refuse to arbitrate".
     */
    function executeRuling(uint _disputeID, uint _ruling) internal {
        uint taskID = disputeIDtoTaskID[_disputeID];
        Task storage task = tasks[taskID];
        task.status = Status.Resolved;
        task.ruling = _ruling;
        uint amount;

        if(_ruling == uint(Party.None)){
            task.requester.send(task.requesterDeposit);
            task.parties[uint(Party.Translator)].send(task.deposits[uint(Party.Translator)]);
            task.parties[uint(Party.Challenger)].send(task.deposits[uint(Party.Challenger)]);
        } else if (_ruling == uint(Party.Translator)) {
            amount = task.requesterDeposit + task.deposits[uint(Party.Translator)] + task.deposits[uint(Party.Challenger)];
            task.parties[uint(Party.Translator)].send(amount);
        } else {
            amount = task.deposits[uint(Party.Translator)] + task.deposits[uint(Party.Challenger)];
            task.parties[uint(Party.Challenger)].send(amount);
            task.requester.send(task.requesterDeposit);
        }

        task.requesterDeposit = 0;
        task.deposits[uint(Party.Translator)] = 0;
        task.deposits[uint(Party.Challenger)] = 0;
    }

    /** @dev Submit a reference to evidence. EVENT.
     *  @param _taskID A task evidence is submitted for.
     *  @param _evidence A link to evidence using its URI.
     */
    function submitEvidence(uint _taskID, string _evidence) external {
        Task storage task = tasks[_taskID];
        require(task.status != Status.Resolved, "The task must not already be resolved.");
        emit Evidence(arbitrator, _taskID, msg.sender, _evidence);
    }

    // ******************** //
    // *      Getters     * //
    // ******************** //

    /** @dev Gets the deposit required for self-assigning the task.
     *  @param _taskID The ID of the task.
     *  @return deposit The translator's deposit.
     */
    function getDepositValue(uint _taskID) public view returns (uint deposit) {
        Task storage task = tasks[_taskID];
        require(task.status == Status.Created, "The task can't be assigned");
        if (now - task.lastInteraction > task.submissionTimeout){
            deposit = NOT_PAYABLE_VALUE;
        } else {
            uint price = task.minPrice + (task.maxPrice - task.minPrice) * (now - task.lastInteraction) / task.submissionTimeout;
            uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
            deposit = arbitrationCost.addCap((translationMultiplier.mulCap(price)) / MULTIPLIER_DIVISOR);
        }
    }

    /** @dev Gets the current price of a specified task.
     *  @param _taskID The ID of the task.
     *  @return price The price of the task.
     */
    function getTaskPrice(uint _taskID) public view returns (uint price) {
        Task storage task = tasks[_taskID];
        require(task.status == Status.Created, "The task can't be assigned");
        if (now - task.lastInteraction > task.submissionTimeout){
            price = 0;
        } else {
            price = task.minPrice + (task.maxPrice - task.minPrice) * (now - task.lastInteraction) / task.submissionTimeout;
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
            uint feeRewards
        )
    {
        Task storage task = tasks[_taskID];
        Round storage round = task.rounds[_round];
        return (
            round.paidFees,
            round.hasPaid,
            round.feeRewards
        );
    }
}