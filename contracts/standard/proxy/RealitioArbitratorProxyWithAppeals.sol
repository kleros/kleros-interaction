/**
 *  @authors: [@unknownunknown1]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

/* solium-disable security/no-block-members */
/* solium-disable max-len */
/* solium-disable security/no-send */

pragma solidity ^0.4.24;

import { Arbitrable, Arbitrator } from "../arbitration/Arbitrable.sol";
import "../../libraries/CappedMath.sol";

interface RealitioInterface {

    /// @notice Notify the contract that the arbitrator has been paid for a question, freezing it pending their decision.
    /// @dev The arbitrator contract is trusted to only call this if they've been paid, and tell us who paid them.
    /// @param question_id The ID of the question.
    /// @param requester The account that requested arbitration.
    /// @param max_previous If specified, reverts if a bond higher than this was submitted after you sent your transaction.
    function notifyOfArbitrationRequest(bytes32 question_id, address requester, uint256 max_previous) external;

    /// @notice Submit the answer for a question, for use by the arbitrator.
    /// @dev Doesn't require (or allow) a bond.
    /// If the current final answer is correct, the account should be whoever submitted it.
    /// If the current final answer is wrong, the account should be whoever paid for arbitration.
    /// However, the answerer stipulations are not enforced by the contract.
    /// @param question_id The ID of the question.
    /// @param answer The answer, encoded into bytes32.
    /// @param answerer The account credited with this answer for the purpose of bond claims.
    function submitAnswerByArbitrator(bytes32 question_id, bytes32 answer, address answerer) external;

    /// @notice Returns the history hash of the question.
    /// @param question_id The ID of the question.
    /// @dev Updated on each answer, then rewound as each is claimed.
    function getHistoryHash(bytes32 question_id) external returns(bytes32);

    /// @notice Returns the commitment info by its id.
    /// @param commitment_id The ID of the commitment.
    /// @return Time after which the committed answer can be revealed.
    /// @return Whether the commitment has already been revealed or not.
    /// @return The committed answer, encoded as bytes32.
    function commitments(bytes32 commitment_id) external returns(uint32, bool, bytes32);
}

/**
 *  @title RealitioArbitratorProxy
 *  @dev A Realitio arbitrator that is just a proxy for an ERC792 arbitrator.
 *  This version of the contract supports the appeal crowdfunding and evidence submission.
 *  NOTE: This contract trusts that the Arbitrator is honest and will not reenter or modify its costs during a call.
 *  The arbitrator must support appeal period.
 */
contract RealitioArbitratorProxyWithAppeals is Arbitrable {
    using CappedMath for uint;

    /* Events */

    /** @dev Emitted when arbitration is requested, to link dispute ID to question ID for UIs.
     *  @param _disputeID The ID of the dispute in the ERC792 arbitrator.
     *  @param _questionID The ID of the question.
     */
    event DisputeIDToQuestionID(uint indexed _disputeID, bytes32 _questionID);

    /* Storage */

    struct Question {
        uint disputeID; // The ID of the dispute raised in the arbitrator contract.
        bool disputed; // Whether the answer to the question was disputed or not.
        address disputer; // The address that requested the arbitration.
        bytes32 answer; // The answer given by the arbitrator converted to bytes32.
        uint ruling; // The answer given by the arbitrator but in the default uint type.
        bool ruled; // Whether the ruling has already been given or not.
        bool reported; // Whether the answer has been reported to Realitio or not.
        Round[] rounds; // Tracks each appeal round of a dispute.
        uint shadowWinner; // The first answer that has been funded in the last round. If it stays the only funded answer, it will win regardless of the final ruling.
    }

    // The answer is stored in the uint type to match the arbitrator's ruling.
    struct Round {
        mapping (uint => uint) paidFees; // Tracks the fees paid by each side in this round in the form paidFees[answer].
        mapping (uint => bool) hasPaid; // True if the fees for this particular answer has been fully paid in the form hasPaid[answer].
        uint feeRewards; // Sum of reimbursable fees and stake rewards available to the parties that made contributions to the side that ultimately wins a dispute.
        mapping(address => mapping (uint => uint)) contributions; // Maps contributors to their contributions for each answer in the form contributions[address][answer].
        uint successfullyPaid; // Sum of all successfully paid fees paid by all sides.
        uint[] fundedAnswers; // Stores the answers that received contributions in this round.
        mapping(uint => bool) answerAdded; // True if the answer has already been added to the fundedAnswers array.
    }

    address public deployer; // The address of the deployer of the contract.
    address public governor; // The address that can make governance changes.
    RealitioInterface public realitio; // The address of the Realitio contract.

    // In order to fund an appeal only two possible answers have to be funded. The answer has a uint type to match the arbitrator's ruling and is capped with 2**256 - 2.
    uint public constant NUMBER_OF_CHOICES_FOR_ARBITRATOR = (2 ** 256) - 2; // The number of choices for the ERC792 arbitrator.
    uint public constant NO_SHADOW_WINNER = uint(-1); // The value that indicates that no one has successfully paid appeal fees in a current round. It's the largest integer and not 0, because 0 can be a valid ruling.

    // Multipliers are in basis points.
    uint public sharedMultiplier; // Multiplier for calculating the appeal fee that must be paid by each side in the case where there is no winner/loser (e.g. when the arbitrator ruled "refuse to arbitrate").
    uint public winnerMultiplier; // Multiplier for calculating the appeal fee of the party that won the previous round.
    uint public loserMultiplier; // Multiplier for calculating the appeal fee of the party that lost the previous round.
    uint public constant MULTIPLIER_DIVISOR = 10000; // Divisor parameter for multipliers.

    mapping(uint => bytes32) public disputeIDToQuestionID; // Maps a dispute ID to the ID of the disputed question. disputeIDToQuestionID[disputeID].
    mapping (bytes32 => Question) public questions; // Maps a question ID to its data. questions[question].

    /* Constructor */

    /** @dev Constructs the RealitioArbitratorProxy contract.
     *  @param _arbitrator The address of the ERC792 arbitrator.
     *  @param _arbitratorExtraData The extra data used to raise a dispute in the ERC792 arbitrator.
     *  @param _realitio The address of the Realitio contract.
     *  @param _sharedMultiplier Multiplier of the arbitration cost that each party must pay as fee stake for a round when there is not winner or loser in the previous round. In basis points.
     *  @param _winnerMultiplier Multiplier of the arbitration cost that the winner has to pay as fee stake for a round in basis points.
     *  @param _loserMultiplier Multiplier of the arbitration cost that the loser has to pay as fee stake for a round in basis points.
     */
    constructor(
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        RealitioInterface _realitio,
        uint _sharedMultiplier,
        uint _winnerMultiplier,
        uint _loserMultiplier
    ) Arbitrable(_arbitrator, _arbitratorExtraData) public {
        deployer = msg.sender;
        governor = msg.sender;
        realitio = _realitio;
        sharedMultiplier = _sharedMultiplier;
        winnerMultiplier = _winnerMultiplier;
        loserMultiplier = _loserMultiplier;
    }

    /* External */

    /** @dev Sets the meta evidence. Can only be called once.
     *  @param _metaEvidence The URI of the meta evidence file.
     */
    function setMetaEvidence(string _metaEvidence) external {
        require(msg.sender == deployer, "Can only be called once by the deployer of the contract.");
        deployer = address(0);
        emit MetaEvidence(0, _metaEvidence);
    }

    /** @dev Changes the proportion of appeal fees that must be paid when there is no winner or loser.
     *  @param _sharedMultiplier The new shared multiplier value in basis points.
     */
    function changesharedMultiplier(uint _sharedMultiplier) external {
        require(msg.sender == governor, "Only the governor can execute this.");
        sharedMultiplier = _sharedMultiplier;
    }

    /** @dev Changes the proportion of appeal fees that must be added to appeal cost for the winning party.
     *  @param _winnerMultiplier The new winner multiplier value in basis points.
     */
    function changeWinnerMultiplier(uint _winnerMultiplier) external {
        require(msg.sender == governor, "Only the governor can execute this.");
        winnerMultiplier = _winnerMultiplier;
    }

    /** @dev Changes the proportion of appeal fees that must be added to appeal cost for the losing party.
     *  @param _loserMultiplier The new loser multiplier value in basis points.
     */
    function changeLoserMultiplier(uint _loserMultiplier) external {
        require(msg.sender == governor, "Only the governor can execute this.");
        loserMultiplier = _loserMultiplier;
    }

    /** @dev Raise a dispute from a specified question. UNTRUSTED.
     *  @param _questionID The ID of the question.
     *  @param _maxPrevious If specified, reverts if a bond higher than this was submitted after you sent your transaction.
     */
    function requestArbitration(bytes32 _questionID, uint _maxPrevious) external payable {
        Question storage question = questions[_questionID];
        require(question.disputer == address(0), "The arbitration has already been requested.");
        question.disputer = msg.sender;
        question.disputeID = arbitrator.createDispute.value(msg.value)(NUMBER_OF_CHOICES_FOR_ARBITRATOR, arbitratorExtraData);
        disputeIDToQuestionID[question.disputeID] = _questionID;
        question.disputed = true;
        question.shadowWinner = NO_SHADOW_WINNER;
        question.rounds.length++;

        realitio.notifyOfArbitrationRequest(_questionID, msg.sender, _maxPrevious);
        emit Dispute(arbitrator, question.disputeID, 0, 0);
        emit DisputeIDToQuestionID(question.disputeID, _questionID);
    }

    /** @dev Takes up to the total amount required to fund a side of an appeal. Reimburses the rest. Creates an appeal if at least two answers are funded. TRUSTED.
     *  @param _disputeID The ID of the dispute raised by the arbitrator for the particular question.
     *  @param _answer One of the possible rulings the arbitrator can give that the funder considers to be the correct answer to the question.
     */
    function fundAppeal(uint _disputeID, uint _answer) external payable {
        Question storage question = questions[disputeIDToQuestionID[_disputeID]];
        require(_answer != uint(-1), "The answer is out of bounds.");
        require(question.disputed, "No dispute to appeal.");
        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(question.disputeID);
        require(
            now >= appealPeriodStart && now < appealPeriodEnd,
            "Appeal fees must be paid within the appeal period."
        );

        uint winner = arbitrator.currentRuling(question.disputeID);
        uint multiplier;
        if (winner == _answer) {
            multiplier = winnerMultiplier;
        } else if (winner == 0) {
            multiplier = sharedMultiplier;
        } else {
            require(now - appealPeriodStart < (appealPeriodEnd - appealPeriodStart)/2, "The loser must pay during the first half of the appeal period.");
            multiplier = loserMultiplier;
        }

        Round storage round = question.rounds[question.rounds.length - 1];
        require(!round.hasPaid[_answer], "Appeal fee has already been paid.");
        uint appealCost = arbitrator.appealCost(question.disputeID, arbitratorExtraData);
        uint totalCost = appealCost.addCap((appealCost.mulCap(multiplier)) / MULTIPLIER_DIVISOR);

        // Take up to the amount necessary to fund the current round at the current costs.
        uint contribution; // Amount contributed.
        uint remainingETH; // Remaining ETH to send back.
        (contribution, remainingETH) = calculateContribution(msg.value, totalCost.subCap(round.paidFees[_answer]));
        round.contributions[msg.sender][_answer] += contribution;
        round.paidFees[_answer] += contribution;
        if (!round.answerAdded[_answer] && contribution > 0) {
            round.fundedAnswers.push(_answer);
            round.answerAdded[_answer] = true;
        }
        // Add contribution to reward when the fee funding is successful, otherwise it can be withdrawn later.
        if (round.paidFees[_answer] >= totalCost) {
            round.hasPaid[_answer] = true;
            if (question.shadowWinner == NO_SHADOW_WINNER)
                question.shadowWinner = _answer;

            round.feeRewards += round.paidFees[_answer];
            round.successfullyPaid += round.paidFees[_answer];
        }

        // Reimburse leftover ETH.
        msg.sender.send(remainingETH);

        if (question.shadowWinner != NO_SHADOW_WINNER && question.shadowWinner != _answer && round.hasPaid[_answer]) {
            // Two sides are fully funded.
            question.shadowWinner = NO_SHADOW_WINNER;
            arbitrator.appeal.value(appealCost)(question.disputeID, arbitratorExtraData);
            question.rounds.length++;
            round.feeRewards = round.feeRewards.subCap(appealCost);
        }
    }

    /** @dev Sends the fee stake rewards and reimbursements proportional to the contributions made to the winner of a dispute. Reimburses contributions if there is no winner.
     *  @param _disputeID The ID of the dispute raised by the arbitrator for the particular question.
     *  @param _beneficiary The address that made contributions.
     *  @param _round The round from which to withdraw.
     *  @param _answer The answer the beneficiary contributed to.
     */
    function withdrawFeesAndRewards(uint _disputeID, address _beneficiary, uint _round, uint _answer) public {
        Question storage question = questions[disputeIDToQuestionID[_disputeID]];
        Round storage round = question.rounds[_round];
        require(question.ruled, "The dispute for the question should be resolved.");
        uint reward;
        // Allow to reimburse if funding of the round was unsuccessful.
        if (!round.hasPaid[_answer]) {
            reward = round.contributions[_beneficiary][_answer];
        } else if (question.ruling == 0 || !round.hasPaid[question.ruling]) {
            // Reimburse unspent fees proportionally if there is no winner and loser. Also applies to the situation where the ultimate winner didn't pay appeal fees fully.
            reward = round.successfullyPaid > 0
                ? (round.contributions[_beneficiary][_answer] * round.feeRewards) / round.successfullyPaid
                : 0;
        } else if (question.ruling == _answer) {
            // Reward the winner.
            reward = round.paidFees[_answer] > 0
                ? (round.contributions[_beneficiary][_answer] * round.feeRewards) / round.paidFees[_answer]
                : 0;
        }
        round.contributions[_beneficiary][_answer] = 0;

        _beneficiary.send(reward); // It is the user responsibility to accept ETH.
    }

    /** @dev Report the answer to a specified question from the ERC792 arbitrator to the Realitio contract. TRUSTED.
     *  @param _questionID The ID of the question.
     *  @param _lastHistoryHash The history hash given with the last answer to the question in the Realitio contract.
     *  @param _lastAnswerOrCommitmentID The last answer given, or its commitment ID if it was a commitment, to the question in the Realitio contract.
     *  @param _lastBond The bond paid for the last answer to the question in the Realitio contract.
     *  @param _lastAnswerer The last answerer to the question in the Realitio contract.
     *  @param _isCommitment Whether the last answer to the question in the Realitio contract used commit or reveal or not. True if it did, false otherwise.
     */
    function reportAnswer(
        bytes32 _questionID,
        bytes32 _lastHistoryHash,
        bytes32 _lastAnswerOrCommitmentID,
        uint _lastBond,
        address _lastAnswerer,
        bool _isCommitment
    ) external {
        Question storage question = questions[_questionID];
        require(
            realitio.getHistoryHash(_questionID) == keccak256(_lastHistoryHash, _lastAnswerOrCommitmentID, _lastBond, _lastAnswerer, _isCommitment),
            "The hash of the history parameters supplied does not match the one stored in the Realitio contract."
        );
        require(!question.reported, "The answer has already been reported for this question.");
        require(question.ruled, "The arbitrator has not ruled yet.");

        question.reported = true;

        realitio.submitAnswerByArbitrator(
            _questionID,
            question.answer,
            computeWinner(_questionID, _lastAnswerOrCommitmentID, _lastBond, _lastAnswerer, _isCommitment)
        );
    }

    /** @dev Allows to submit evidence for a given dispute.
     *  @param _disputeID The ID of the dispute raised by the arbitrator for the particular question.
     *  @param _evidenceURI Link to evidence.
     */
    function submitEvidence(uint _disputeID, string _evidenceURI) external {
        bytes32 questionID = disputeIDToQuestionID[_disputeID];
        Question storage question = questions[questionID];
        require(question.disputer != address(0), "The arbitration for this question has not been requested.");
        require(question.ruled == false, "Cannot submit evidence to a resolved dispute.");

        emit Evidence(arbitrator, uint(questionID), msg.sender, _evidenceURI);
    }

    /** @dev Gives a ruling for a dispute. Must be called by the arbitrator.
     *  The purpose of this function is to ensure that the address calling it has the right to rule on the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Refuse to arbitrate".
     */
    function rule(uint _disputeID, uint _ruling) public {
        Question storage question = questions[disputeIDToQuestionID[_disputeID]];
        require(msg.sender == address(arbitrator), "Must be called by the arbitrator.");
        require(!question.ruled, "The dispute has already been resolved.");
        require(_ruling <= NUMBER_OF_CHOICES_FOR_ARBITRATOR, "Ruling is out of bounds.");

         // If one side paid its fees, the ruling is in its favor. Note that if the other side had also paid, an appeal would have been created.
        if (question.shadowWinner != NO_SHADOW_WINNER)
            executeRuling(_disputeID, question.shadowWinner);
        else
            executeRuling(_disputeID, _ruling);
    }

    /* External Views */

    /** @dev Get the fee for a dispute from a specified question. UNTRUSTED.
     *  @param _questionID The ID of the question.
     *  @return fee The dispute's fee.
     */
    function getDisputeFee(bytes32 _questionID) external view returns (uint fee) {
        return arbitrator.arbitrationCost(arbitratorExtraData);
    }

    /** @dev Gets the contributions made for a given round.
     *  Note that this function is O(n), where n is the total number of answers funded in the round. This could exceed the gas limit, therefore this function should only be used for interface display and not by other contracts.
     *  @param _disputeID ID of the dispute related to the queried question.
     *  @param _round The round to query.
     *  @param _contributor The address of the contributor.
     *  @return fundedAnswers The answers that were funded in this round.
     *  @return contributions The contributions.
     */
    function getContributions(
        uint _disputeID,
        uint _round,
        address _contributor
    ) public view returns(
        uint[] fundedAnswers,
        uint[] contributions
        )
    {
        Question storage question = questions[disputeIDToQuestionID[_disputeID]];
        Round storage round = question.rounds[_round];

        fundedAnswers = round.fundedAnswers;
        contributions = new uint[](round.fundedAnswers.length);
        for (uint i = 0; i < contributions.length; i++) {
            contributions[i] = round.contributions[_contributor][fundedAnswers[i]];
        }
    }

    /** @dev Gets the information on a round of a session.
     *  Note that this function is O(n), where n is the total number of answers funded in the round. This could exceed the gas limit, therefore this function should only be used for interface display and not by other contracts.
     *  @param _disputeID ID of the dispute related to the queried question.
     *  @param _round The round to query.
     *  @return The round information.
     */
    function getRoundInfo(uint _disputeID, uint _round)
        public
        view
        returns (
            uint[] paidFees,
            bool[] hasPaid,
            uint feeRewards,
            uint successfullyPaid
        )
    {
        Question storage question = questions[disputeIDToQuestionID[_disputeID]];
        Round storage round = question.rounds[_round];
        paidFees = new uint[](round.fundedAnswers.length);
        hasPaid = new bool[](round.fundedAnswers.length);

        for (uint i = 0; i < round.fundedAnswers.length; i++) {
            paidFees[i] = round.paidFees[round.fundedAnswers[i]];
            hasPaid[i] = round.hasPaid[round.fundedAnswers[i]];
        }

        feeRewards = round.feeRewards;
        successfullyPaid = round.successfullyPaid;
    }


    /* Internal */

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
            taken = _available;
        else {
            taken = _requiredAmount;
            remainder = _available - _requiredAmount;
        }
    }

    /** @dev Execute the ruling of a specified dispute.
     *  @param _disputeID The ID of the dispute in the ERC792 arbitrator.
     *  @param _ruling The ruling given by the ERC792 arbitrator. Note that 0 is reserved for "Unable/refused to arbitrate" and we map it to `bytes32(-1)` which has a similar connotation in Realitio.
     */
    function executeRuling(uint _disputeID, uint _ruling) internal {
        Question storage question = questions[disputeIDToQuestionID[_disputeID]];
        question.answer = bytes32(_ruling == 0 ? uint(-1) : _ruling - 1);
        question.ruling = _ruling;
        question.ruled = true;
    }

    /* Private Views */

    /** @dev Computes the Realitio answerer, of a specified question, that should win. This function is needed to avoid the "stack too deep error". TRUSTED.
     *  @param _questionID The ID of the question.
     *  @param _lastAnswerOrCommitmentID The last answer given, or its commitment ID if it was a commitment, to the question in the Realitio contract.
     *  @param _lastBond The bond paid for the last answer to the question in the Realitio contract.
     *  @param _lastAnswerer The last answerer to the question in the Realitio contract.
     *  @param _isCommitment Whether the last answer to the question in the Realitio contract used commit or reveal or not. True if it did, false otherwise.
     *  @return winner The computed winner.
     */
    function computeWinner(
        bytes32 _questionID,
        bytes32 _lastAnswerOrCommitmentID,
        uint _lastBond,
        address _lastAnswerer,
        bool _isCommitment
    ) private view returns(address winner) {
        bytes32 lastAnswer;
        bool isAnswered;
        Question storage question = questions[_questionID];
        if (_lastBond == 0) { // If the question hasn't been answered, nobody is ever right.
            isAnswered = false;
        } else if (_isCommitment) {
            (uint32 revealTS, bool isRevealed, bytes32 revealedAnswer) = realitio.commitments(_lastAnswerOrCommitmentID);
            if (isRevealed) {
                lastAnswer = revealedAnswer;
                isAnswered = true;
            } else {
                require(revealTS <= uint32(now), "Arbitration cannot be done until the last answerer has had time to reveal its commitment.");
                isAnswered = false;
            }
        } else {
            lastAnswer = _lastAnswerOrCommitmentID;
            isAnswered = true;
        }

        return isAnswered && lastAnswer == question.answer ? _lastAnswerer : question.disputer;
    }
}