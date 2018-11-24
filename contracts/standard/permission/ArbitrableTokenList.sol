/**
 *  @title ArbitrableTokenList
 *  @author Matheus Alencar - <mtsalenc@gmail.com>
 *  This code hasn't undertaken bug bounty programs yet.
 */

pragma solidity ^0.4.24;

import "../arbitration/Arbitrable.sol";
import "./PermissionInterface.sol";
/**
 *  @title ArbitrableTokenList
 *  This is a T2CL for tokens. Tokens can be submitted and cleared with a time out for challenging.
 */
contract ArbitrableTokenList is PermissionInterface, Arbitrable {

    /* Enums */

    enum TokenStatus {
        Absent, // The token is not on the list.
        Registered, // The token is on the list.
        RegistrationRequested, // The token has a request to be added to the list.
        ClearingRequested // The token has a request to be removed from the list.
    }

    enum RulingOption {
        Other, // Arbitrator did not rule of refused to rule.
        Accept, // Execute request. Rule in favor of requester.
        Refuse // Refuse request. Rule in favor of challenger.
    }

    enum Party {
        None,
        Requester, // Party that placed a request to change a token status.
        Challenger // Party challenging a request.
    }

    /* Structs */

    // Arrays of parties and balances have 3 elements to map with the Party enum for better readability:
    // - 0 is unused, matches Party.None.
    // - 1 for Party.Requester
    // - 2 for Party.Challenger

    struct Token {
        TokenStatus status;
        string name;
        address addr;
        string ticker;
        uint lastAction; // Time of the last action.
        Request[] requests;
    }

    struct Request {
        bool disputed; // True if a dispute is taking place.
        uint disputeID; // ID of the dispute, if any.
        uint firstContributionTime; // The time the first contribution was made at.
        uint arbitrationFeesWaitingTime; // The waiting time for fees for each round.
        uint timeToChallenge; // The time to challenge for each round.
        uint challengeRewardBalance; // The amount of funds placed at stake for this token.
        uint challengeReward; // The challengeReward of the token for the round.
        address[3] parties; // Address of requester and challenger, if any.
        bool appealed; // True if an appeal was raised.
        Round[] rounds; // Tracks fees for each round of dispute and appeals.
    }

    struct Round {
        uint requiredFeeStake; // The required stake.
        uint[3] paidFees; // The amount of fees paid for each side, if any.
        bool loserFullyFunded; // True if there the loosing side of a dispute fully funded his side of an appeal.
        RulingOption ruling; // The ruling given by an arbitrator, if any.
        mapping(address => uint[3]) contributions; // Maps contributors to their contributions for each side, if any.
    }

    /* Modifiers */

    modifier onlyGovernor {require(msg.sender == governor, "The caller is not the governor."); _;}

    /* Events */

    /**
     *  @dev Called when the token's status changes or when it is challenged/resolved.
     *  @param requester Address of the requester.
     *  @param challenger Address of the challenger, if any.
     *  @param tokenID The tokenID of the token.
     *  @param status The status of the token.
     *  @param disputed Wether the token is being disputed.
     */
    event TokenStatusChange(
        address indexed requester,
        address indexed challenger,
        bytes32 indexed tokenID,
        TokenStatus status,
        bool disputed
    );

    /** @dev Emitted when a contribution is made.
     *  @param _tokenID The ID of the token that the contribution was made to.
     *  @param _contributor The address that sent the contribution.
     *  @param _value The value of the contribution.
     */
    event Contribution(bytes32 indexed _tokenID, address indexed _contributor, uint _value);

    /** @dev Emitted a deposit is made to challenge a request.
     *  @param _tokenID The ID of the token that the contribution was made to.
     *  @param _challenger The address that placed the deposit.
     */
    event ChallengeDepositPlaced(bytes32 indexed _tokenID, address indexed _challenger);

    /** @dev Emitted when a contribution reward is withdrawn.
     *  @param _tokenID The ID of the token that the contribution was made to.
     *  @param _round The round of the agreement that the contribution was made to.
     *  @param _contributor The address that sent the contribution.
     *  @param _value The value of the reward.
     */
    event RewardWithdrawal(bytes32 indexed _tokenID, uint indexed _round, address indexed _contributor, uint _value);

    /* Storage */

    // Settings
    uint public challengeReward; // The stake deposit required in addition to arbitration fees for challenging a request.
    uint public timeToChallenge; // The time before a request becomes executable if not challenged.
    uint public arbitrationFeesWaitingTime; // The maximum time to wait for arbitration fees if the dispute is raised.
    uint public stake; // The stake parameter for arbitration fees crowdfunding.
    address public governor; // The address that can update t2clGovernor, arbitrationFeesWaitingTime and challengeReward.

    // Tokens
    mapping(bytes32 => Token) public tokens;
    mapping(uint => bytes32) public disputeIDToTokenID;
    bytes32[] public tokensList;

    /* Constructor */

    /**
     *  @dev Constructs the arbitrable token list.
     *  @param _arbitrator The chosen arbitrator.
     *  @param _arbitratorExtraData Extra data for the arbitrator contract.
     *  @param _metaEvidence The URI of the meta evidence object.
     *  @param _governor The governor of this contract.
     *  @param _arbitrationFeesWaitingTime The maximum time to wait for arbitration fees if the dispute is raised.
     *  @param _challengeReward The amount in Weis of deposit required for a submission or a challenge in addition to the arbitration fees.
     *  @param _timeToChallenge The time in seconds, parties have to challenge.
     *  @param _stake The stake parameter for sharing fees.
     */
    constructor(
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        string _metaEvidence,
        address _governor,
        uint _arbitrationFeesWaitingTime,
        uint _challengeReward,
        uint _timeToChallenge,
        uint _stake
    ) Arbitrable(_arbitrator, _arbitratorExtraData) public {
        challengeReward = _challengeReward;
        timeToChallenge = _timeToChallenge;
        governor = _governor;
        arbitrationFeesWaitingTime = _arbitrationFeesWaitingTime;
        stake = _stake;
        emit MetaEvidence(0, _metaEvidence);
    }

    /* Public */

    // ************************ //
    // *       Requests       * //
    // ************************ //

    /** @dev Submits a request to change the token status.
     *  @param _tokenID The keccak hash of a JSON object with all of the token's properties and no insignificant whitespaces.
     *  @param _name The name of the token.
     *  @param _ticker The token ticker.
     *  @param _addr The token address.
     */
    function requestStatusChange(
        bytes32 _tokenID,
        string _name,
        string _ticker,
        address _addr
    ) external payable {
        require(msg.value == challengeReward, "Not enough ETH.");
        Token storage token = tokens[_tokenID];
        if(token.requests.length == 0) {
            // Initial token registration
            token.name = _name;
            token.ticker = _ticker;
            token.addr = _addr;
        } else
            require(
                !token.requests[token.requests.length - 1].disputed,
                "Token must not be disputed for submitting status change request"
            );

        // Update token status.
        if (token.status == TokenStatus.Absent)
            token.status = TokenStatus.RegistrationRequested;
        else if (token.status == TokenStatus.Registered)
            token.status = TokenStatus.ClearingRequested;
        else
            revert("Token in wrong status for request.");

        // Setup request.
        token.requests.length++;
        Request storage request = token.requests[token.requests.length - 1];
        request.arbitrationFeesWaitingTime = arbitrationFeesWaitingTime;
        request.timeToChallenge = timeToChallenge;
        request.parties[uint(Party.Requester)] = msg.sender;
        request.challengeReward = challengeReward;

        // Place deposit.
        request.challengeRewardBalance = challengeReward;

        // Setup first round.
        request.rounds.length++;
        Round storage round = request.rounds[request.rounds.length - 1];
        round.requiredFeeStake = stake;
        token.lastAction = now;

        emit TokenStatusChange(msg.sender, address(0), _tokenID, token.status, false);
    }

    /** @dev Challenge a request for a token.
     *  @param _tokenID The tokenID of the token with the request to execute.
     */
    function fundChallenger(bytes32 _tokenID) external payable {
        Token storage token = tokens[_tokenID];
        require(token.lastAction > 0, "The specified token was never submitted");
        require(
            token.status == TokenStatus.RegistrationRequested || token.status == TokenStatus.ClearingRequested,
            "Token does not have any pending requests"
        );
        Request storage request = token.requests[token.requests.length - 1];
        require(!request.disputed, "The token is already disputed");
        require(token.lastAction + request.timeToChallenge > now, "The time to challenge has already passed.");
        require(request.challengeRewardBalance >= request.challengeReward, "There isn't a pending request for this token.");

        Round storage round = request.rounds[request.rounds.length - 1];
        uint remainingETH = msg.value;

        // Check if caller is starting the challenge.
        if(request.challengeRewardBalance == request.challengeReward) { // This means the token only has the requester's deposit.
            // Caller is starting the challenge.
            require(msg.value >= request.challengeReward, "Not enough ETH. Party starting dispute must place a deposit.");

            // Take the deposit.
            request.parties[uint(Party.Challenger)] = msg.sender;
            (, remainingETH) = calculateContribution(remainingETH, request.challengeReward);
            request.challengeRewardBalance += request.challengeReward;

            emit ChallengeDepositPlaced(_tokenID, msg.sender);

            token.lastAction = now;
            request.firstContributionTime = now;
        }

        // Calculate the amount of fees required.
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        uint totalAmountRequired = arbitrationCost + round.requiredFeeStake;

        // Take contributions, if any.
        // Necessary to check that remainingETH > 0, otherwise caller can set lastAction without making a contribution.
        if(remainingETH > 0 && round.paidFees[uint(Party.Challenger)] < totalAmountRequired) {

            if(round.paidFees[uint(Party.Challenger)] == 0)
                request.firstContributionTime = now; // This is the first contribution.

            uint amountStillRequired = totalAmountRequired - round.paidFees[uint(Party.Challenger)];
            uint contribution;
            (contribution, remainingETH) = calculateContribution(remainingETH, amountStillRequired);
            round.paidFees[uint(Party.Challenger)] += contribution;
            round.contributions[msg.sender][uint(Party.Challenger)] += contribution;
            emit Contribution(_tokenID, msg.sender, contribution);

            // Refund remaining ETH.
            msg.sender.transfer(remainingETH);

            token.lastAction = now;
        }

        // Raise dispute if both sides are fully funded.
        if (round.paidFees[uint(Party.Requester)] >= totalAmountRequired && round.paidFees[uint(Party.Challenger)] >= totalAmountRequired) {
            request.disputeID = arbitrator.createDispute.value(arbitrationCost)(2, arbitratorExtraData);
            disputeIDToTokenID[request.disputeID] = _tokenID;
            request.disputed = true;
            emit TokenStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                _tokenID,
                token.status,
                request.disputed
            );

            //Prepare for next round.
            request.rounds.length++;
            request.rounds[request.rounds.length - 1].requiredFeeStake = stake;

            token.lastAction = now;
        }
    }

    /** @dev Fund the requester side of the dispute.
     *  @param _tokenID The tokenID of the token with the request to execute.
     */
    function fundRequester(bytes32 _tokenID) external payable {
        Token storage token = tokens[_tokenID];
        require(
            token.status == TokenStatus.RegistrationRequested || token.status == TokenStatus.ClearingRequested,
            "Token does not have any pending requests"
        );
        require(token.lastAction > 0, "The specified token was never submitted");
        Request storage request = token.requests[token.requests.length - 1];
        require(!request.disputed, "The token is already disputed");
        require(request.firstContributionTime + request.arbitrationFeesWaitingTime > now, "Arbitration fees timed out.");
        Round storage round = request.rounds[request.rounds.length - 1];

        // Calculate amount required.
        uint remainingETH = msg.value;
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        uint totalAmountRequired = arbitrationCost + round.requiredFeeStake;

        // Take contribution, if any.
        // Necessary to check that remainingETH > 0, otherwise caller can set lastAction without making a contribution.
        if(remainingETH > 0 && round.paidFees[uint(Party.Requester)] < totalAmountRequired) {
            uint amountStillRequired = totalAmountRequired - round.paidFees[uint(Party.Requester)];
            uint contribution;
            (contribution, remainingETH) = calculateContribution(remainingETH, amountStillRequired);
            round.paidFees[uint(Party.Requester)] += contribution;
            round.contributions[msg.sender][uint(Party.Requester)] += contribution;
            emit Contribution(_tokenID, msg.sender, contribution);

            // Refund remaining ETH.
            msg.sender.transfer(remainingETH);

            token.lastAction = now;
        }

        // Raise dispute if both sides are fully funded.
        if (round.paidFees[uint(Party.Requester)] >= totalAmountRequired && round.paidFees[uint(Party.Challenger)] >= totalAmountRequired) {
            request.disputeID = arbitrator.createDispute.value(arbitrationCost)(2, arbitratorExtraData);
            disputeIDToTokenID[request.disputeID] = _tokenID;
            request.disputed = true;
            emit TokenStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                _tokenID,
                token.status,
                request.disputed
            );

            //Prepare for next round.
            request.rounds.length++;
            request.rounds[request.rounds.length - 1].requiredFeeStake = stake;

            token.lastAction = now;
        }
    }

    /** @dev Fund the loosing side of the appeal. Callable only on the first half of the appeal period.
     *  @param _tokenID The tokenID of the token to fund.
     */
    function fundAppealLosingSide(bytes32 _tokenID) external payable {
        Token storage token = tokens[_tokenID];
        require(token.lastAction > 0, "The specified token was never submitted");
        Request storage request = token.requests[token.requests.length - 1];
        require(!request.appealed, "An appeal was already raised.");
        require(
            arbitrator.disputeStatus(request.disputeID) == Arbitrator.DisputeStatus.Appealable,
            "The ruling for the token is not appealable."
        );

        RulingOption currentRuling = RulingOption(arbitrator.currentRuling(request.disputeID));
        require(currentRuling != RulingOption.Other, "Cannot appeal a dispute on which the arbitrator refused to rule.");

        Party loser = currentRuling == RulingOption.Accept ? Party.Challenger : Party.Requester;

        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(request.disputeID);
        uint appealPeriodDuration = appealPeriodEnd - appealPeriodStart;
        require(now < appealPeriodStart + (appealPeriodDuration / 2), "Appeal period for funding the losing side ended.");

        // Calculate the amount required.
        uint remainingETH = msg.value;
        uint appealCost = arbitrator.appealCost(request.disputeID, arbitratorExtraData);
        Round storage round = request.rounds[request.rounds.length - 1];
        uint totalRequiredFees = appealCost + (2 * round.requiredFeeStake);

        //The the contribution, if any.
        // Necessary to check that remainingETH > 0, otherwise caller can set lastAction without making a contribution.
        if (remainingETH > 0 && totalRequiredFees > round.paidFees[uint(loser)]) {
            uint amountStillRequired = totalRequiredFees - round.paidFees[uint(loser)];
            uint amountKept;
            (amountKept, remainingETH) = calculateContribution(remainingETH, amountStillRequired);
            round.paidFees[uint(loser)] += amountKept;
            round.contributions[msg.sender][uint(loser)] += amountKept;
            emit Contribution(_tokenID, msg.sender, amountKept);

            if (round.paidFees[uint(loser)] >= totalRequiredFees)
                round.loserFullyFunded = true;

            if (remainingETH > 0) msg.sender.transfer(remainingETH);

            token.lastAction = now;
        }
    }

    /** @dev Fund the loosing side of the appeal. Callable only on the first half of the appeal period.
     *  @param _tokenID The tokenID of the token to fund.
     */
    function fundAppealWinningSide(bytes32 _tokenID) external payable {
        require(tokens[_tokenID].lastAction > 0, "The specified token was never submitted.");
        Request storage request = tokens[_tokenID].requests[tokens[_tokenID].requests.length - 1]; // Take the last request.
        require(
            arbitrator.disputeStatus(request.disputeID) == Arbitrator.DisputeStatus.Appealable,
            "The ruling for the token is not appealable."
        );
        require(!request.appealed, "An appeal was already raised.");
        Round storage round = request.rounds[request.rounds.length - 1];
        require(
            round.loserFullyFunded,
            "It is the winning side's turn to fund the appeal, only if the losing side already fully funded it."
        );
        require(
            RulingOption(arbitrator.currentRuling(request.disputeID)) != RulingOption.Other,
            "Cannot appeal a dispute on which the arbitrator refused to rule."
        );
        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(request.disputeID);
        uint appealPeriodDuration = appealPeriodEnd - appealPeriodStart;
        require(
            now > appealPeriodStart + (appealPeriodDuration / 2),
            "It's the losing side's turn to fund the appeal."
        );

        // Calculate the amount required.
        (Party winner, Party loser) = returnWinnerAndLoser(arbitrator.currentRuling(request.disputeID));
        uint totalRequiredFees = calculateWinnerRequiredFees(
            round.paidFees[uint(loser)],
            round.requiredFeeStake,
            arbitrator.appealCost(request.disputeID, arbitratorExtraData)
        );

        // Take the contribution, if any.
        // Necessary to check that msg.value > 0, otherwise caller can set lastAction without making a contribution.
        if (msg.value > 0 && totalRequiredFees > round.paidFees[uint(winner)]) {
            uint remainingETH = msg.value;
            uint amountStillRequired = totalRequiredFees - round.paidFees[uint(winner)];
            uint amountKept;
            (amountKept, remainingETH) = calculateContribution(remainingETH, amountStillRequired);
            round.paidFees[uint(winner)] += amountKept;
            round.contributions[msg.sender][uint(winner)] += amountKept;
            emit Contribution(_tokenID, msg.sender, amountKept);

            if (remainingETH > 0) msg.sender.transfer(remainingETH);
            tokens[_tokenID].lastAction = now;
        }

        // Raise appeal if both sides are fully funded.
        if (round.paidFees[uint(winner)] >= totalRequiredFees) {
            arbitrator.appeal.value(arbitrator.appealCost(request.disputeID, arbitratorExtraData))(request.disputeID, arbitratorExtraData);
            request.appealed = true;

            // Save the ruling. Used for reimbursing unused crowdfunding fees and withdrawing rewards.
            round.ruling = RulingOption(arbitrator.currentRuling(request.disputeID));

            // Prepare for next round.
            request.rounds.length++;
            request.rounds[request.rounds.length - 1].requiredFeeStake = stake;

            tokens[_tokenID].lastAction = now;
        }
    }


    /** @dev Reimburses unused fees or withdraws the caller's reward for funding the specified round of a challenge.
     *  @param _tokenID The ID of the token.
     *  @param _round The round.
     */
    function withdrawFeesAndRewards(bytes32 _tokenID, uint _round) external {
        Token storage token = tokens[_tokenID];
        require(token.lastAction > 0, "The specified token was never submitted.");
        Request storage request = token.requests[token.requests.length - 1];
        require(request.rounds.length > 0, "No attempt to raise a dispute was made.");
        require(_round < request.rounds.length, "The specified round does not exist.");
        Round storage round = request.rounds[_round];

        // Calculate reward.
        uint reward;
        uint contributionsToRequester = round.contributions[msg.sender][uint(Party.Requester)];
        uint contributionsToChallenger = round.contributions[msg.sender][uint(Party.Challenger)];
        if (_round == 0 || _round == request.rounds.length - 1) {
            // First or last round.
            require(
                _round != 0 || !request.disputed,
                "There is nothing to withdraw from the first round if the dispute was raised."
            );
            reward = contributionsToRequester + contributionsToChallenger;
        } else {
            // Appeal.
            Party winner = round.ruling == RulingOption.Accept ? Party.Requester : Party.Challenger;
            if (round.paidFees[uint(winner)] > 0) {
                uint totalContributed = contributionsToRequester + contributionsToChallenger;
                totalContributed * round.contributions[msg.sender][uint(winner)] / round.paidFees[uint(winner)];
            }
        }

        // Clear contributions.
        round.contributions[msg.sender] = [0, 0, 0];
        msg.sender.transfer(reward);
        emit RewardWithdrawal(_tokenID, _round, msg.sender, reward);
    }

    /** @dev Execute a request after the time for challenging it has passed. Can be called by anyone.
     *  @param _tokenID The tokenID of the token with the request to execute.
     */
    function executeRequest(bytes32 _tokenID) external {
        Token storage token = tokens[_tokenID];
        require(token.lastAction > 0, "The specified token was never submitted.");
        Request storage request = token.requests[token.requests.length - 1];
        require(now > token.lastAction + timeToChallenge, "The time to challenge has not passed yet.");
        require(!request.disputed, "The specified token is disputed.");
        require(
            request.challengeRewardBalance == request.challengeReward,
            "Only callable if no one contests the request."
        );

        if (token.status == TokenStatus.RegistrationRequested)
            token.status = TokenStatus.Registered;
        else if (token.status == TokenStatus.ClearingRequested)
            token.status = TokenStatus.Absent;
        else
            revert("Token in wrong status for executing request.");

        // Deliberate use of send in order to not block the contract in case of reverting fallback.
        request.parties[uint(Party.Requester)].send(request.challengeRewardBalance);
        request.challengeRewardBalance = 0;

        token.lastAction = now;

        emit TokenStatusChange(request.parties[uint(Party.Requester)], address(0), _tokenID, token.status, false);
    }


    /** @dev Rule in favor of party that paid more fees if not enough was raised to create a dispute.
     *  @param _tokenID The tokenID of the token with the request.
     */
    function feeTimeoutFirstRound(bytes32 _tokenID) external {
        Token storage token = tokens[_tokenID];
        require(token.lastAction > 0, "The specified token was never submitted.");
        Request storage request = token.requests[token.requests.length - 1];
        Round storage round = request.rounds[request.rounds.length - 1];
        require(request.rounds.length == 1, "This is not the first round");
        require(
            request.firstContributionTime + request.arbitrationFeesWaitingTime < now,
            "There is still time to place a contribution."
        );

        // Failed to fund first round.
        // Rule in favor of whoever paid more.
        Party winner;
        if (round.paidFees[uint(Party.Requester)] >= round.paidFees[uint(Party.Challenger)])
            winner = Party.Requester;
        else
            winner = Party.Challenger;

        // Update token state
        if(winner == Party.Requester) // Execute Request
            if (token.status == TokenStatus.RegistrationRequested)
                token.status = TokenStatus.Registered;
            else
                token.status = TokenStatus.Absent;
        else // Revert to previous state.
            if (token.status == TokenStatus.RegistrationRequested)
                token.status = TokenStatus.Absent;
            else if (token.status == TokenStatus.ClearingRequested)
                token.status = TokenStatus.Registered;

        // Send token balance.
        // Deliberate use of send in order to not block the contract in case of reverting fallback.
        if(winner == Party.Challenger)
            request.parties[uint(Party.Challenger)].send(request.challengeRewardBalance);
        else
            request.parties[uint(Party.Requester)].send(request.challengeRewardBalance);

        token.lastAction = now;
        request.challengeRewardBalance = 0;

        emit TokenStatusChange(
            request.parties[uint(Party.Requester)],
            request.parties[uint(Party.Challenger)],
            _tokenID,
            token.status,
            request.disputed
        );

    }

    /** @dev Submit a reference to evidence. EVENT.
     *  @param _evidence A link to an evidence using its URI.
     */
    function submitEvidence(bytes32 _tokenID, string _evidence) external {
        Token storage token = tokens[_tokenID];
        require(token.lastAction > 0, "The specified token was never submitted.");
        Request storage request = token.requests[token.requests.length - 1];
        require(request.disputed, "The request is not disputed.");
        require(!request.appealed, "Request already appealed.");
        emit Evidence(arbitrator, request.disputeID, msg.sender, _evidence);
    }

    // ************************ //
    // *      Governance      * //
    // ************************ //

    /** @dev Changes the `timeToChallenge` storage variable.
     *  @param _timeToChallenge The new `timeToChallenge` storage variable.
     */
    function changeTimeToChallenge(uint _timeToChallenge) external onlyGovernor {
        timeToChallenge = _timeToChallenge;
    }

    /** @dev Changes the `challengeReward` storage variable.
     *  @param _challengeReward The new `challengeReward` storage variable.
     */
    function changeChallengeReward(uint _challengeReward) external onlyGovernor {
        challengeReward = _challengeReward;
    }

    /** @dev Changes the `governor` storage variable.
     *  @param _governor The new `governor` storage variable.
     */
    function changeGovernor(address _governor) external onlyGovernor {
        governor = _governor;
    }

    /** @dev Changes the `stake` storage variable.
     *  @param _stake The new `stake` storage variable.
     */
    function changeStake(uint _stake) external onlyGovernor {
        stake = _stake;
    }

    /** @dev Changes the `arbitrationFeesWaitingTime` storage variable.
     *  @param _arbitrationFeesWaitingTime The new `_arbitrationFeesWaitingTime` storage variable.
     */
    function changeArbitrationFeesWaitingTime(uint _arbitrationFeesWaitingTime) external onlyGovernor {
        arbitrationFeesWaitingTime = _arbitrationFeesWaitingTime;
    }

    /* Public Views */

    /** @dev Return true if the token is on the list.
     *  @param _tokenID The tokenID of the token to check.
     *  @return allowed True if the token is allowed, false otherwise.
     */
    function isPermitted(bytes32 _tokenID) external view returns (bool allowed) {
        Token storage token = tokens[_tokenID];
        return token.status == TokenStatus.Registered || token.status == TokenStatus.ClearingRequested;
    }

    /* Internal */

    /**
     *  @dev Execute the ruling of a dispute.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function executeRuling(uint _disputeID, uint _ruling) internal {
        bytes32 tokenID = disputeIDToTokenID[_disputeID];
        Token storage token = tokens[tokenID];
        Request storage request = token.requests[token.requests.length - 1];
        Round storage round = request.rounds[request.rounds.length - 1];

        // Respect the ruling unless the losing side funded the appeal and the winning side paid less than expected.
        (Party winner, Party loser) = returnWinnerAndLoser(_ruling);
        if (
            round.loserFullyFunded &&
            round.paidFees[uint(winner)] < round.paidFees[uint(loser)] - round.requiredFeeStake
        )
            // Rule in favor of the losing party.
            if (_ruling == uint(RulingOption.Accept))
                winner = Party.Challenger;
            else
                winner = Party.Requester;
        else
            // Respect the ruling.
            if (_ruling == uint(RulingOption.Accept))
                winner = Party.Requester;
            else if (_ruling == uint(RulingOption.Refuse))
                winner = Party.Challenger;

        // Update token state
        if(winner == Party.Requester) // Execute Request
            if (token.status == TokenStatus.RegistrationRequested)
                token.status = TokenStatus.Registered;
            else
                token.status = TokenStatus.Absent;
        else // Revert to previous state.
            if (token.status == TokenStatus.RegistrationRequested)
                token.status = TokenStatus.Absent;
            else if (token.status == TokenStatus.ClearingRequested)
                token.status = TokenStatus.Registered;

        // Send token balance.
        // Deliberate use of send in order to not block the contract in case of reverting fallback.
        if(winner == Party.Challenger)
            request.parties[uint(Party.Challenger)].send(request.challengeReward * 2);
        else if(winner == Party.Requester)
            request.parties[uint(Party.Requester)].send(request.challengeReward * 2);
        else {
            // Reimburse parties.
            request.parties[uint(Party.Requester)].send(request.challengeReward);
            request.parties[uint(Party.Challenger)].send(request.challengeReward);
        }

        token.lastAction = now;
        request.disputed = false;
        request.challengeRewardBalance = 0;

        emit TokenStatusChange(
            request.parties[uint(Party.Requester)],
            request.parties[uint(Party.Challenger)],
            tokenID,
            token.status,
            request.disputed
        );
    }

     /** @dev Returns the contribution value and remainder from available ETH and required amount.
     *  @param _available The amount of ETH available for the contribution.
     *  @param _requiredAmount The amount of ETH required for the contribution.
     *  @return The amount of ETH taken.
     *  @return The amount of ETH left from the contribution.
     */
    function calculateContribution(uint _available, uint _requiredAmount)
        internal
        pure
        returns(uint, uint remainder)
    {
        if(_requiredAmount > _available)
            return (_available, 0); // Take whatever is available, return 0 as leftover ETH.

        remainder = _available - _requiredAmount;
        return (_requiredAmount, remainder);
    }

    /** @dev Returns the amount of fees a the winner of a dispute must pay to fully fund his side of an appeal.
     *  @param _amountPaidByLoser The amount of fees the loser paid to fund the appeal.
     *  @param _requiredFeeStake The required fee stake for the round.
     *  @param _appealCost The current appeal cost.
     *  @return The amount of fees a the winner of a dispute must pay to fully fund his side of an appeal.
     */
    function calculateWinnerRequiredFees(
        uint _amountPaidByLoser,
        uint _requiredFeeStake,
        uint _appealCost
    )
        internal
        pure
        returns (uint)
    {
        uint expectedValue = _amountPaidByLoser - _requiredFeeStake;
        return _appealCost > _amountPaidByLoser + expectedValue
            ? _appealCost - _amountPaidByLoser
            : expectedValue;
    }

    /** @dev Returns the winner and loser based on the ruling.
     *  @param _ruling The ruling given by an arbitrator.
     *  @return The party that won the dispute.
     *  @return The party that lost the dispute.
     */
    function returnWinnerAndLoser(uint _ruling) internal pure returns (Party winner, Party loser) {
        RulingOption ruling = RulingOption(_ruling);
        require(ruling != RulingOption.Other, "There isn't a winner or loser if the arbitrator refused to rule.");

        if (ruling == RulingOption.Accept) {
            winner = Party.Requester;
            loser = Party.Challenger;
        } else {
            winner = Party.Challenger;
            loser = Party.Requester;
        }
    }

    /* Interface Views */

    /** @dev Gets the info on a request of a token.
     *  @param _tokenID The ID of the token.
     *  @param _request The position of the request we want.
     *  @return The information.
     */
    function getRequestInfo(bytes32 _tokenID, uint _request)
        external
        view
        returns (bool, uint, uint, uint, uint, uint, uint, address[3])
    {
        Token storage token = tokens[_tokenID];
        Request storage request = token.requests[_request];
        return (
            request.disputed,
            request.disputeID,
            request.firstContributionTime,
            request.arbitrationFeesWaitingTime,
            request.timeToChallenge,
            request.challengeRewardBalance,
            request.challengeReward,
            request.parties
        );
    }

    /** @dev Gets the info on a round of a request.
     *  @param _tokenID The ID of the token.
     *  @param _request The position of the request we want.
     *  @param _round The position of the round we want.
     *  @return The information.
     */
    function getRoundInfo(bytes32 _tokenID, uint _request, uint _round)
        external
        view
        returns (uint, uint[3], bool, RulingOption)
    {
        Token storage token = tokens[_tokenID];
        Request storage request = token.requests[_request];
        Round storage round = request.rounds[_round];
        return (
            round.requiredFeeStake,
            round.paidFees,
            round.loserFullyFunded,
            round.ruling
        );
    }

    /** @dev Gets the contributions of a request.
     *  @param _tokenID The ID of the token.
     *  @param _request The position of the request.
     *  @param _round The podition of the round.
     *  @param _contributor The address of the contributor.
     *  @return The contributions.
     */
    function getContributions(
        bytes32 _tokenID,
        uint _request,
        uint _round,
        address _contributor
    ) external view returns(uint[3] contributions) {
        Token storage token = tokens[_tokenID];
        Request storage request = token.requests[_request];
        Round storage round = request.rounds[_round];
        contributions = round.contributions[_contributor];
    }

    /** @dev Return the numbers of tokens in the list per status. This function is O(n) at worst, where n is the number of tokens. This could exceed the gas limit, therefore this function should only be used for interface display and not by other contracts.
     *  @return The numbers of tokens in the list per status.
     */
    function tokensCounts()
        external
        view
        returns (
            uint disputed,
            uint absent,
            uint registered,
            uint submitted,
            uint clearingRequested
        )
    {
        for (uint i = 0; i < tokensList.length; i++) {
            Token storage token = tokens[tokensList[i]];
            Request storage request = token.requests[token.requests.length - 1];

            if (request.disputed) disputed++;
            if (token.status == TokenStatus.Absent) absent++;
            else if (token.status == TokenStatus.Registered) registered++;
            else if (token.status == TokenStatus.RegistrationRequested) submitted++;
            else if (token.status == TokenStatus.ClearingRequested) clearingRequested++;
        }
    }

    /** @dev Return the values of the tokens the query finds. This function is O(n) at worst, where n is the number of tokens. This could exceed the gas limit, therefore this function should only be used for interface display and not by other contracts.
     *  @param _cursor The pagination cursor.
     *  @param _count The number of tokens to return.
     *  @param _filter The filter to use. Each element of the array in sequence means:
     *  - Include absent tokens in result.
     *  - Include registered tokens in result.
     *  - Include tokens with registration requests that are not disputed in result.
     *  - Include tokens with clearing requests that are not disputed in result.
     *  - Include disputed tokens with registration requests in result.
     *  - Include disputed tokens with clearing requests in result.
     *  - Include tokens submitted by the caller.
     *  - Include tokens challenged by the caller.
     *  @param _oldestFirst The sort order to use.
     *  @return The values of the tokens found and wether there are more tokens for the current filter and sort.
     */
    function queryTokens(bytes32 _cursor, uint _count, bool[8] _filter, bool _oldestFirst)
        external
        view
        returns (bytes32[] values, bool hasMore)
    {
        uint _cursorIndex;
        values = new bytes32[](_count);
        uint _index = 0;

        if (_cursor == 0)
            _cursorIndex = 0;
        else {
            for (uint j = 0; j < tokensList.length; j++) {
                if (tokensList[j] == _cursor) {
                    _cursorIndex = j;
                    break;
                }
            }
            require(_cursorIndex != 0, "The cursor is invalid.");
        }

        for (
                uint i = _cursorIndex == 0 ? (_oldestFirst ? 0 : 1) : (_oldestFirst ? _cursorIndex + 1 : tokensList.length - _cursorIndex + 1);
                _oldestFirst ? i < tokensList.length : i <= tokensList.length;
                i++
            ) { // Oldest or newest first.
            bytes32 tokenID = tokensList[_oldestFirst ? i : tokensList.length - i];
            Token storage token = tokens[tokenID];
            Request storage request = token.requests[token.requests.length - 1];
            if (
                    /* solium-disable operator-whitespace */
                    (_filter[0] && token.status == TokenStatus.Absent) ||
                    (_filter[1] && token.status == TokenStatus.Registered) ||
                    (_filter[2] && token.status == TokenStatus.RegistrationRequested && !request.disputed) ||
                    (_filter[3] && token.status == TokenStatus.ClearingRequested && !request.disputed) ||
                    (_filter[4] && token.status == TokenStatus.RegistrationRequested && request.disputed) ||
                    (_filter[5] && token.status == TokenStatus.ClearingRequested && request.disputed) ||
                    (_filter[6] && request.parties[uint(Party.Requester)]== msg.sender) || // My Submissions.
                    (_filter[7] && request.parties[uint(Party.Challenger)]== msg.sender) // My Challenges.
                    /* solium-enable operator-whitespace */
            ) {
                if (_index < _count) {
                    values[_index] = tokensList[_oldestFirst ? i : tokensList.length - i];
                    _index++;
                } else {
                    hasMore = true;
                    break;
                }
            }
        }
    }

}