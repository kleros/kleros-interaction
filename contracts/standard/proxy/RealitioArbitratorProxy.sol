/**
 *  https://contributing.kleros.io/smart-contract-workflow
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.4.24;

import { Arbitrable, Arbitrator } from "../arbitration/Arbitrable.sol";
import { Realitio } from "@realitio/realitio-contracts/truffle/contracts/Realitio.sol";

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

    Realitio public realitio;
    mapping(uint => bytes32) public disputeIDToQuestionID;
    mapping(bytes32 => address) public questionIDToDisputer;
    mapping(bytes32 => bytes32) public questionIDToAnswer;
    mapping(bytes32 => bool) public questionIDToRuled;

    /* Constructor */

    /** @dev Constructs the RealitioArbitratorProxy contract.
     *  @param _arbitrator The address of the ERC792 arbitrator.
     *  @param _arbitratorExtraData The extra data used to raise a dispute in the ERC792 arbitrator.
     *  @param _realitio The address of the Realitio contract.
     *  @param _metaEvidence The URI of the meta evidence file.
     */
    constructor(
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        Realitio _realitio,
        string _metaEvidence
    ) Arbitrable(_arbitrator, _arbitratorExtraData) public {
        realitio = _realitio;
        emit MetaEvidence(0, _metaEvidence);
    }

    /* External */

    /** @dev Raise a dispute from a specified question.
     *  @param _questionID The ID of the question.
     *  @param _maxPrevious If specified, reverts if a bond higher than this was submitted after you sent your transaction.
     */
    function requestArbitration(bytes32 _questionID, uint _maxPrevious) external payable {
        uint disputeID = arbitrator.createDispute.value(msg.value)((2 ** 128) - 1, arbitratorExtraData);
        disputeIDToQuestionID[disputeID] = _questionID;
        questionIDToDisputer[_questionID] = msg.sender;
        realitio.notifyOfArbitrationRequest(_questionID, msg.sender, _maxPrevious);
        emit Dispute(arbitrator, disputeID, 0, 0);
        emit DisputeIDToQuestionID(disputeID, _questionID);
    }

    /** @dev Report the answer to a specified question from the ERC792 arbitrator to the Realitio contract.
     *  @param _questionID The ID of the question.
     *  @param _lastHistoryHash The history hash given with the last answer to the question in the Realitio contract.
     *  @param _lastAnswerOrCommitmentID The last answer given, or its commitment ID if it was a commitment, to the question in the Realitio contract.
     *  @param _lastBond The bond paid for the last answer to the question in the Realitio contract.
     *  @param _lastAnswerer The last answerer to the question in the Realitio contract.
     *  @param _isCommitment Wether the last answer to the question in the Realitio contract used commit or reveal or not. True if it did, false otherwise.
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

    /** @dev Get the fee for a dispute from a specified question.
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

    /** @dev Computes the Realitio answerer, of a specified question, that should win. This function is needed to avoid the "stack too deep error".
     *  @param _questionID The ID of the question.
     *  @param _lastAnswerOrCommitmentID The last answer given, or its commitment ID if it was a commitment, to the question in the Realitio contract.
     *  @param _lastBond The bond paid for the last answer to the question in the Realitio contract.
     *  @param _lastAnswerer The last answerer to the question in the Realitio contract.
     *  @param _isCommitment Wether the last answer to the question in the Realitio contract used commit or reveal or not. True if it did, false otherwise.
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
                require(revealTS < uint32(now), "Arbitration cannot be done until the last answerer has had time to reveal its commitment.");
                isAnswered = false;
            }
        } else {
            lastAnswer = _lastAnswerOrCommitmentID;
            isAnswered = true;
        }

        return isAnswered && lastAnswer == questionIDToAnswer[_questionID] ? _lastAnswerer : questionIDToDisputer[_questionID];
    }
}
