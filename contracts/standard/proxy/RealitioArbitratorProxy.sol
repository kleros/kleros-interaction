/**
 *  https://contributing.kleros.io/smart-contract-workflow
 *  @reviewers: [@clesaege, @unknownunknown1]
 *  @auditors: [@remedcu]
 *  @bounties: [{ duration: 128 days, link: https://github.com/kleros/kleros-interaction/issues/244, maxPayout: 50 ETH }]
 *  @deployments: [ https://etherscan.io/address/0xd47f72a2d1d0e91b0ec5e5f5d02b2dc26d00a14d ]
 *  @tools: [MythX]
 */

pragma solidity ^0.4.24;

import { Arbitrable, Arbitrator } from "../arbitration/Arbitrable.sol";

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
 *  @author Enrique Piqueras - <enrique@kleros.io>
 *  @dev A Realitio arbitrator that is just a proxy for an ERC792 arbitrator.
 */
contract RealitioArbitratorProxy is Arbitrable {
    /* Events */

    /** @dev Emitted when arbitration is requested, to link dispute ID to question ID for UIs.
     *  @param _disputeID The ID of the dispute in the ERC792 arbitrator.
     *  @param _questionID The ID of the question.
     */
    event DisputeIDToQuestionID(uint indexed _disputeID, bytes32 _questionID);

    /* Storage */

    uint public constant NUMBER_OF_CHOICES_FOR_ARBITRATOR = (2 ** 256) - 2; // The number of choices for the ERC792 arbitrator.
    address public deployer; // The address of the deployer of the contract.
    RealitioInterface public realitio; // The address of the Realitio contract.
    mapping(uint => bytes32) public disputeIDToQuestionID; // A mapping from disputes to questions.
    mapping(bytes32 => address) public questionIDToDisputer; // A mapping from questions to the addresses that requested arbitration for them.
    mapping(bytes32 => bytes32) public questionIDToAnswer; // A mapping from questions to the answers the arbitrator gave for them.
    // A mapping from questions to bools that are true if the arbitrator has answered the question and false otherwise.
    mapping(bytes32 => bool) public questionIDToRuled;

    /* Constructor */

    /** @dev Constructs the RealitioArbitratorProxy contract.
     *  @param _arbitrator The address of the ERC792 arbitrator.
     *  @param _arbitratorExtraData The extra data used to raise a dispute in the ERC792 arbitrator.
     *  @param _realitio The address of the Realitio contract.
     */
    constructor(
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        RealitioInterface _realitio
    ) Arbitrable(_arbitrator, _arbitratorExtraData) public {
        deployer = msg.sender;
        realitio = _realitio;
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

    /** @dev Raise a dispute from a specified question. UNTRUSTED.
     *  @param _questionID The ID of the question.
     *  @param _maxPrevious If specified, reverts if a bond higher than this was submitted after you sent your transaction.
     */
    function requestArbitration(bytes32 _questionID, uint _maxPrevious) external payable {
        uint disputeID = arbitrator.createDispute.value(msg.value)(NUMBER_OF_CHOICES_FOR_ARBITRATOR, arbitratorExtraData);
        disputeIDToQuestionID[disputeID] = _questionID;
        questionIDToDisputer[_questionID] = msg.sender;
        realitio.notifyOfArbitrationRequest(_questionID, msg.sender, _maxPrevious);
        emit Dispute(arbitrator, disputeID, 0, 0);
        emit DisputeIDToQuestionID(disputeID, _questionID);
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
        require(
            realitio.getHistoryHash(_questionID) == keccak256(_lastHistoryHash, _lastAnswerOrCommitmentID, _lastBond, _lastAnswerer, _isCommitment),
            "The hash of the history parameters supplied does not match the one stored in the Realitio contract."
        );
        require(questionIDToRuled[_questionID], "The arbitrator has not ruled yet.");

        realitio.submitAnswerByArbitrator(
            _questionID,
            questionIDToAnswer[_questionID],
            computeWinner(_questionID, _lastAnswerOrCommitmentID, _lastBond, _lastAnswerer, _isCommitment)
        );

        delete questionIDToDisputer[_questionID];
        delete questionIDToAnswer[_questionID];
        delete questionIDToRuled[_questionID];
    }

    /* External Views */

    /** @dev Get the fee for a dispute from a specified question. UNTRUSTED.
     *  @param _questionID The ID of the question.
     *  @return fee The dispute's fee.
     */
    function getDisputeFee(bytes32 _questionID) external view returns (uint fee) {
        return arbitrator.arbitrationCost(arbitratorExtraData);
    }

    /* Internal */

    /** @dev Execute the ruling of a specified dispute.
     *  @param _disputeID The ID of the dispute in the ERC792 arbitrator.
     *  @param _ruling The ruling given by the ERC792 arbitrator. Note that 0 is reserved for "Unable/refused to arbitrate" and we map it to `bytes32(-1)` which has a similar connotation in Realitio.
     */
    function executeRuling(uint _disputeID, uint _ruling) internal {
        questionIDToAnswer[disputeIDToQuestionID[_disputeID]] = bytes32(_ruling == 0 ? uint(-1) : _ruling - 1);
        questionIDToRuled[disputeIDToQuestionID[_disputeID]] = true;
        delete disputeIDToQuestionID[_disputeID];
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

        return isAnswered && lastAnswer == questionIDToAnswer[_questionID] ? _lastAnswerer : questionIDToDisputer[_questionID];
    }
}
