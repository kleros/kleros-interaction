/**
 *  @authors: [@unknownunknown1]
 *  @reviewers: []
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

    enum Quality {
        CostEffective, // Basic quality of translation is expected. The conveyed meaning must be similar but it is acceptable to lose nuances.
        Standard, // The meaning must be almost identical. Occasional typos are acceptable.
        Perfect // The meaning must be almost identical and the translator must work to correctly reflect the style and nuance of the original text.
    }

    enum Party {
        Requester, // The one requesting the translation.
        Translator, // The one performing translation task.
        Challenger // The one challenging translated text in the review period.
    }

    struct Task {
        string title; // The title of the task.
        string textURI; // A link to the text which translation is requested. In plaintext.
        string sourceTextURI; // A link to the source where the text was taken from (optional, to allow translators to get context).
        uint submissionTimeout; // Time in seconds allotted for submitting a translation. The end of this period is considered a deadline.
        uint minPrice; // Minimal price for the translation. When the task is created it has minimal price that gradually increases until it reaches maximal price at deadline.
        uint maxPrice; // Maximal price for the translation and also value that must be deposited by the one requesting the translation.
        uint sourceLang; // The index of source language of translated text.
        uint[] targetLangs; // One or more languages the text should be translated in.
        Quality quality; // Expected quality of the translation.
        Status status; // Status of the task.
        uint lastInteraction; // The time of the last action performed on the task.
        address[3] parties; // Requester, translator and challenger of the task, respectively.
        uint[3] deposits; // Deposits of requester, translator and challenger.
        uint disputeID; // The ID of the dispute created in arbitrator contract.
        bool[3] appealFeePaid; // Tracks whether translator and challenger paid fee or not. The "0" index is not used but is needed to map the parties with dispute choice values.
    }

    address public governor; // The governor of the contract.
    uint public reviewTimeout; // Time in seconds, during which the submitted translation can be challenged.

    uint public translationMultiplier; // Multiplier for calculating the value of the deposit translator must pay to self-assign a task.
    uint public challengeMultiplier; // Multiplier for calculating the value of the deposit challenger must pay to challenge a translation.
    uint public sharedStakeMultiplier; // Multiplier for calculating the appeal fee that must be paid by submitter in the case where there isn't a winner and loser (e.g. when the arbitrator ruled "refused to rule"/"could not rule").
    uint public winnerStakeMultiplier; // Multiplier for calculating the appeal fee of the party that won the previous round.
    uint public loserStakeMultiplier; // Multiplier for calculating the appeal fee of the party that lost the previous round.

    Task[] public tasks; // Stores all created tasks.
    string[] public languages; // Stores all supported languages.

    mapping (uint => uint) public disputeIDtoTaskID; // Maps a dispute to its respective task.

    /* *** Events *** */

    /** @dev To be emitted when new task is created.
     *  @param _taskID The ID of newly created task.
     *  @param _requester The address that created the task.
     *  @param _textURI A link to the text translation of which is requested.
     *  @param _sourceTextURI A link to the source the text was taken from.
    */
    event TaskCreated(uint indexed _taskID, address indexed _requester, string _textURI, string _sourceTextURI);

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

    /** @dev Adds a language to the array of supported languages. Its array index is used to refer to it later.
     *  @param _lang Added language.
    */
    function addLanguage(string _lang) public onlyGovernor {
        languages.push(_lang);
    }

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
     *  @param _title The title of the task.
     *  @param _textURI A link to the text that requires translation.
     *  @param _sourceTextURI (Optional) A link to the source the text was taken from.
     *  @param _submissionTimeout Time allotted for submitting a translation.
     *  @param _minPrice A minimal price of the translation. In wei.
     *  @param _maxPrice A maximal price of the translation. In wei.
     *  @param _sourceLang The language of the provided text.
     *  @param _targetLangs Languages the provided text should be translated in.
     *  @param _quality Expected quality of the translation.
     *  @param _metaEvidence A URI of meta-evidence object for task submission.
     *  @return taskID The ID of the created task.
    */
    function createTask(
        string _title,
        string _textURI,
        string _sourceTextURI,
        uint _submissionTimeout,
        uint _minPrice,
        uint _maxPrice,
        uint _sourceLang,
        uint[] _targetLangs,
        Quality _quality,
        string _metaEvidence
    ) public payable returns (uint taskID){
        require(msg.value >= _maxPrice, "The value of max price must be depositted");
        require(_maxPrice > _minPrice, "Max price should be greater than min price");

        tasks.length++;
        taskID = tasks.length - 1;
        Task storage task = tasks[tasks.length - 1];
        task.title = _title;
        task.textURI = _textURI;
        task.sourceTextURI = _sourceTextURI;
        task.submissionTimeout = _submissionTimeout;
        task.minPrice = _minPrice;
        task.maxPrice = _maxPrice;
        task.sourceLang = _sourceLang;
        for (uint i = 0; i < _targetLangs.length; i++){
            task.targetLangs.push(_targetLangs[i]);
        }
        task.quality = _quality;
        task.status = Status.Created;
        task.lastInteraction = now;
        task.parties[uint(Party.Requester)] = msg.sender;
        task.deposits[uint(Party.Requester)] = _maxPrice;

        uint remainder = msg.value - _maxPrice;
        msg.sender.send(remainder);

        emit TaskCreated(taskID, msg.sender, _textURI, _sourceTextURI);
        emit MetaEvidence(taskID, _metaEvidence);
    }

    /** @dev Assigns a specific task to the sender. Requires a translator's deposit.
     *  @param _taskID The ID of the task.
    */
    function assignTask(uint _taskID) public payable{
        Task storage task = tasks[_taskID];

        uint price = getTaskPrice(_taskID, 0);
        uint deposit = getPureDepositValue(_taskID);

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

        task.deposits[uint(Party.Challenger)] = challengeDeposit.subCap(arbitrationCost);

        uint remainder = msg.value - challengeDeposit;
        msg.sender.send(remainder);

        emit Dispute(arbitrator, task.disputeID, _taskID, _taskID);
    }

    /** @dev Takes up to the total amount required to fund a side of an appeal. Reimburses the rest. Creates an appeal if all sides are fully funded..
     *  @param _taskID The ID of challenged task.
     *  @param _side The party that pays the appeal fee.
    */
    function fundAppeal(uint _taskID, Party _side) public payable {
        Task storage task = tasks[_taskID];
        require(_side == Party.Translator || _side == Party.Challenger, "Recipient must be either the translator or challenger.");
        require(task.status == Status.DisputeCreated, "No dispute to appeal");
        require(task.parties[uint(_side)] == msg.sender, "Should fund his own side");

        require(arbitrator.disputeStatus(task.disputeID) == Arbitrator.DisputeStatus.Appealable, "Dispute is not appealable.");

        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(task.disputeID);
        require(now >= appealPeriodStart && now < appealPeriodEnd, "Funding must be made within the appeal period.");

        require(!task.appealFeePaid[uint(_side)], "Appeal fee has already been paid");

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

        uint appealCost = arbitrator.appealCost(task.disputeID, arbitratorExtraData);
        uint totalCost = appealCost.addCap((appealCost.mulCap(multiplier)) / MULTIPLIER_DIVISOR);

        require(msg.value >= totalCost, "Not enough ETH to cover appeal cost");

        task.appealFeePaid[uint(_side)] = true;

        uint remainder = msg.value - totalCost;
        msg.sender.send(remainder);

        // Create an appeal if each side is funded.
        if(task.appealFeePaid[uint(Party.Translator)] && task.appealFeePaid[uint(Party.Challenger)]){
            arbitrator.appeal.value(appealCost)(task.disputeID, arbitratorExtraData);
            task.appealFeePaid[uint(Party.Translator)] = false;
            task.appealFeePaid[uint(Party.Challenger)] = false;
        }
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
        require(msg.sender == address(arbitrator), "Must be called by the arbitrator");
        require(task.status == Status.DisputeCreated, "The dispute has already been resolved");

        // The ruling is inverted if the loser paid its fees.
        if (task.appealFeePaid[uint(Party.Translator)] == true)
            resultRuling = Party.Translator;
        else if (task.appealFeePaid[uint(Party.Challenger)] == true)
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

    /** @dev Gets the deposit that translator must pay in order to self-assign the task.
     *  @param _taskID The ID of the task.
     *  @return deposit The deposit without a surplus.
     */
    function getPureDepositValue(uint _taskID) public view returns (uint deposit) {
        return getDepositValue(_taskID, 0);
    }


    function getRequiredDepositValue(uint _taskID) public view returns (uint deposit){
        return getDepositValue(_taskID, 300);
    }

    /** @dev Gets the required deposit value.
     *  Note that this function is needed because it adds a surplus by calculating a price 20 blocks ahead and thus accounts for the issue of price increase between the time when the transaction is created and mined.
     *  @param _taskID The ID of the task.
     *  @return deposit The required deposit.
     */
    function getDepositValue(uint _taskID, uint _extraTime) public view returns (uint deposit){
        Task storage task = tasks[_taskID];
        if (now - task.lastInteraction > task.submissionTimeout || task.submissionTimeout == 0){
            deposit = NOT_PAYABLE_VALUE;
        } else {
            uint price = getTaskPrice(_taskID, _extraTime);
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

    /** @dev Gets the non-primitive properties of a specified task.
     *  @param _taskID The ID of the task.
     *  @return The task's non-primitive properties.
     */
    function getTaskInfo(uint _taskID)
        public
        view
        returns (
            uint[] targetLanguages,
            address[3] parties,
            uint[3] deposits,
            bool[3] appealFeePaid
        )
    {
        Task storage task = tasks[_taskID];
        targetLanguages = task.targetLangs;
        parties = task.parties;
        deposits = task.deposits;
        appealFeePaid = task.appealFeePaid;
    }
}
