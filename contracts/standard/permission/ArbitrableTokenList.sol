/**
 *  @authors: [@mtsalenc]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.4.24;

import "../arbitration/Arbitrable.sol";
import "./PermissionInterface.sol";


/**
 *  @title ArbitrableTokenList
 *  This is a T2CL for tokens. Tokens can be submitted and cleared with a timeout for challenging.
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
    // - 1 for Party.Requester.
    // - 2 for Party.Challenger.

    struct Token {
        string name;
        address addr;
        string ticker;
        string URI;
        string networkID;
        TokenStatus status;
        Request[] requests;
    }

    struct Request {
        bool disputed; // True if a dispute is taking place.
        uint disputeID; // ID of the dispute, if any.
        uint submissionTime; // Time when the request was made.
        uint challengeRewardBalance; // The amount of funds placed at stake for this request.
        uint challengerDepositTime; // The when the challenger placed his deposit. Used to track when the request left the challenge period and entered the arbitration fees funding period.
        uint balance; // Summation of reimbursable fees and stake rewards available.
        bool resolved; // True if the request was executed and/or any disputes raised were resolved.
        address[3] parties; // Address of requester and challenger, if any.
        uint[3] pot; // Tracks the prefund balance available for each side.
        Round[] rounds; // Tracks fees for each round of dispute and appeals.
        mapping(address => uint[3]) contributions; // Maps contributors to their contributions for each side, if any.
    }

    struct Round {
        bool appealed; // True if an appeal was raised.
        uint oldWinnerTotalCost; // Governance changes on the second half of the appeal funding period create a difference between the amount that must be contributed by the winner and the loser. This variable tracks the amount that was required of the winner in the first round, before a change that happened on the second round (e.g previous appeal cost + previous required winner stake).
        uint[3] paidFees; // Tracks the fees paid for this round.
        uint[3] requiredForSide; // The total amount required to fully fund each side.
    }

    /* Modifiers */

    modifier onlyGovernor { require(msg.sender == governor, "The caller is not the governor."); _; }
    modifier supportsAppealPeriod(uint _disputeID) {
        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(_disputeID);
        require(appealPeriodEnd > appealPeriodStart, "Arbitrator must support appeal period.");
        _;
    }
    modifier withinAppealPeriod(uint _disputeID) {
        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(_disputeID);
        require(
            now - appealPeriodEnd < appealPeriodEnd - appealPeriodStart,
            "Contributions must be done before the end of the appeal period."
        );
        _;
    }

    /* Events */

    /**
     *  @dev Called when the token's status changes or when it is challenged/resolved.
     *  @param _requester Address of the requester.
     *  @param _challenger Address of the challenger, if any.
     *  @param _tokenID The tokenID of the token.
     *  @param _status The status of the token.
     *  @param _disputed Whether the token is being disputed.
     */
    event TokenStatusChange(
        address indexed _requester,
        address indexed _challenger,
        bytes32 indexed _tokenID,
        TokenStatus _status,
        bool _disputed
    );

    /** @dev Emitted when a contribution is made.
     *  @param _tokenID The ID of the token that the contribution was made to.
     *  @param _contributor The address that sent the contribution.
     *  @param _side The side the contribution was made to.
     *  @param _value The value of the contribution.
     */
    event Contribution(bytes32 indexed _tokenID, address indexed _contributor, Party indexed _side, uint _value);

    /** @dev Emitted shen a deposit is made to challenge a request.
     *  @param _tokenID The ID of the token that the contribution was made to.
     *  @param _challenger The address that placed the deposit.
     */
    event ChallengeDepositPlaced(bytes32 indexed _tokenID, address indexed _challenger);

    /** @dev Emitted when a contribution reward is withdrawn.
     *  @param _tokenID The ID of the token that the contribution was made to.
     *  @param _request The request from which the withdrawal was made.
     *  @param _contributor The address that sent the contribution.
     *  @param _value The value of the reward.
     */
    event RewardWithdrawal(bytes32 indexed _tokenID, uint indexed _request, address indexed _contributor, uint _value);

    /* Storage */

    // Settings
    uint public challengeReward; // The stake deposit required in addition to arbitration fees for challenging a request.
    uint public challengePeriodDuration; // The time before a request becomes executable if not challenged.
    uint public arbitrationFeesWaitingTime; // The maximum time to wait for arbitration fees if the dispute is raised.
    address public governor; // The address that can update t2clGovernor, arbitrationFeesWaitingTime and challengeReward.

    uint public constant MULTIPLIER_PRECISION = 10000; // Precision parameter for multipliers.

    // Parameters for calculating the required fee stake that must be paid by each party for a round.
    // Values are in 4 Digits precision (e.g. a multiplier of 5000 results in 50% of the original value).
    uint public winnerStakeMultiplier; // Multiplier for calculating the fee stake paid by the party that won the previous round.
    uint public loserStakeMultiplier; // Multiplier for calculating the fee stake paid by the party that lost the previous round.
    uint public sharedStakeMultiplier; // Multiplier for calculating the fee stake that both parties must pay for the first round of a dispute.

    // There is a chance that the winner of the last round refuses to fund his side of an appeal. In this case there would be no reward do fund the loser. To account for this a percentage of all previous rounds is awarded to parties funding the last round.
    uint public lastRoundRewardMultiplier; // Multiplier for bonus reward of the last round of a dispute. Value in 4 digits precision.

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
     *  @param _challengePeriodDuration The time in seconds, parties have to challenge.
     *  @param _sharedStakeMultiplier Multiplier for calculating the fee stake that both parties must pay for the first round of a dispute. 4 Digits precision (e.g. a multiplier of 20000 results in 200% of the original value).
     *  @param _winnerStakeMultiplier Multiplier for calculating the fee stake paid by the party that won the previous round. 4 Digits precision (e.g. a multiplier of 20000 results in 200% of the original value).
     *  @param _loserStakeMultiplier Multiplier for calculating the fee stake paid by the party that lost the previous round. 4 Digits precision (e.g. a multiplier of 20000 results in 200% of the original value).
     *  @param _lastRoundRewardMultiplier Fraction of the loser stake given to the last round contributors. 4 Digits precision (e.g. a multiplier of 5000 results in 50% of the original value). Value must be less than 100%.
     */
    constructor(
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        string _metaEvidence,
        address _governor,
        uint _arbitrationFeesWaitingTime,
        uint _challengeReward,
        uint _challengePeriodDuration,
        uint _sharedStakeMultiplier,
        uint _winnerStakeMultiplier,
        uint _loserStakeMultiplier,
        uint _lastRoundRewardMultiplier
    ) Arbitrable(_arbitrator, _arbitratorExtraData) public {
        require(_lastRoundRewardMultiplier < MULTIPLIER_PRECISION, "Value must be less then 100%.");

        governor = _governor;
        arbitrationFeesWaitingTime = _arbitrationFeesWaitingTime;
        challengeReward = _challengeReward;
        challengePeriodDuration = _challengePeriodDuration;
        sharedStakeMultiplier = _sharedStakeMultiplier;
        winnerStakeMultiplier = _winnerStakeMultiplier;
        loserStakeMultiplier = _loserStakeMultiplier;
        lastRoundRewardMultiplier = _lastRoundRewardMultiplier;

        emit MetaEvidence(0, _metaEvidence);
    }

    /* Public */

    // ************************ //
    // *       Requests       * //
    // ************************ //

    /** @dev Funds a request to change a token status.
     *  Extra eth will be kept as reserved arbitration fees for future disputes.
     *  @param _name The name of the token.
     *  @param _ticker The token ticker.
     *  @param _addr The token address.
     *  @param _URI The to the token image
     *  @param _networkID The id of the token's network if it's the same as the TCR's.
     */
    function requestStatusChange(
        string _name,
        string _ticker,
        address _addr,
        string _URI,
        string _networkID
    ) external payable {
        require(msg.value >= challengeReward, "Not enough ETH.");
        bytes32 tokenID = keccak256(
            abi.encodePacked(
                _name,
                _ticker,
                _addr,
                _URI,
                _networkID
            )
        );

        Token storage token = tokens[tokenID];
        if (token.requests.length == 0) {
            // Initial token registration
            token.name = _name;
            token.ticker = _ticker;
            token.addr = _addr;
            token.URI = _URI;
            token.networkID = _networkID;
            tokensList.push(tokenID);
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
        request.parties[uint(Party.Requester)] = msg.sender;
        request.submissionTime = now;

        // Place deposit.
        request.challengeRewardBalance = challengeReward;

        // Setup first round.
        request.rounds.length++;
        Round storage round = request.rounds[request.rounds.length - 1];

        // Take contributions, if any.
        uint contribution = msg.value - challengeReward;
        request.pot[uint(Party.Requester)] = contribution;
        request.contributions[msg.sender][uint(Party.Requester)] = contribution;

        // Save request balance.
        request.balance = contribution;

        if (contribution > 0)
            emit Contribution(tokenID, msg.sender, Party.Requester, contribution);

        emit TokenStatusChange(
            request.parties[uint(Party.Requester)],
            request.parties[uint(Party.Challenger)],
            tokenID,
            token.status,
            request.disputed
        );
    }

    /** @dev Challenges the latest request of a token. Keeps unused ETH as prefund. Raises a dispute if both sides are fully funded.
     *  @param _tokenID The tokenID of the token with the request to execute.
     */
    function challengeRequest(bytes32 _tokenID) external payable {
        Token storage token = tokens[_tokenID];
        require(
            token.status == TokenStatus.RegistrationRequested || token.status == TokenStatus.ClearingRequested,
            "Token does not have any pending requests."
        );
        Request storage request = token.requests[token.requests.length - 1];
        require(request.challengeRewardBalance == challengeReward, "Request should have only the requester's deposit.");
        require(msg.value >= challengeReward, "Not enough ETH. Party starting dispute must place a deposit in full.");
        require(now - request.submissionTime < challengePeriodDuration, "The challenge period has already passed.");

        // Take the deposit and save the challenger's address.
        request.challengeRewardBalance += challengeReward;
        request.parties[uint(Party.Challenger)] = msg.sender;
        emit ChallengeDepositPlaced(_tokenID, msg.sender);

        // Add contributions to challenger's pot.
        uint contribution = msg.value - challengeReward;
        request.pot[uint(Party.Challenger)] = contribution;
        request.contributions[msg.sender][uint(Party.Challenger)] = contribution;
        if (contribution > 0)
            emit Contribution(_tokenID, msg.sender, Party.Challenger, contribution);

        // Save the start of the arbitration fees funding period.
        request.challengerDepositTime = now;

        // Add contribution to request balance.
        request.balance += contribution;

        // Calculate the total amount of fees required.
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        uint totalAmountRequired = arbitrationCost + arbitrationCost * sharedStakeMultiplier / MULTIPLIER_PRECISION;
        Round storage round = request.rounds[0];

        // Fund challenger side from his pot.
        uint amountStillRequired = totalAmountRequired - round.paidFees[uint(Party.Challenger)];
        (contribution, request.pot[uint(Party.Challenger)]) = calculateContribution(
            request.pot[uint(Party.Challenger)],
            amountStillRequired
        );
        round.paidFees[uint(Party.Challenger)] = contribution;

        // Fund requester side from his pot.
        amountStillRequired = totalAmountRequired - round.paidFees[uint(Party.Requester)];
        (contribution, request.pot[uint(Party.Requester)]) = calculateContribution(
            request.pot[uint(Party.Requester)],
            amountStillRequired
        );
        round.paidFees[uint(Party.Requester)] += contribution;

        // Raise dispute if both sides are fully funded.
        if (round.paidFees[uint(Party.Requester)] >= totalAmountRequired &&
            round.paidFees[uint(Party.Challenger)] >= totalAmountRequired) {

            request.disputeID = arbitrator.createDispute.value(totalAmountRequired)(2, arbitratorExtraData);
            disputeIDToTokenID[request.disputeID] = _tokenID;
            request.disputed = true;
            request.rounds.length++;
            request.balance -= totalAmountRequired;

            emit TokenStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                _tokenID,
                token.status,
                request.disputed
            );
        }

    }

    /** @dev Add funds to the challenger's pot. Keeps unused ETH as prefund. Raises a dispute if both sides are fully funded. Only callable if there are no disputes.
     *  @param _tokenID The tokenID of the token with the request to execute.
     */
    function fundChallengerPotDispute(bytes32 _tokenID) external payable {
        Token storage token = tokens[_tokenID];
        require(
            token.status == TokenStatus.RegistrationRequested || token.status == TokenStatus.ClearingRequested,
            "Token does not have any pending requests."
        );
        Request storage request = token.requests[token.requests.length - 1];
        require(!request.disputed, "The request is already disputed.");
        require(request.challengerDepositTime > 0, "Request should have both parties deposits.");
        require(
            now - request.challengerDepositTime < arbitrationFeesWaitingTime,
            "The arbitration fees funding period of the first round has already passed."
        );

        // Add contributions to challenger's pot.
        request.pot[uint(Party.Challenger)] += msg.value;
        request.contributions[msg.sender][uint(Party.Challenger)] += msg.value;
        if (msg.value > 0)
            emit Contribution(_tokenID, msg.sender, Party.Challenger, msg.value);

        // Add contribution to request balance.
        request.balance += msg.value;

        // Calculate the total amount of fees required.
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        uint totalAmountRequired = arbitrationCost + arbitrationCost * sharedStakeMultiplier / MULTIPLIER_PRECISION;
        Round storage round = request.rounds[0];

        // Fund challenger side from his pot.
        uint amountStillRequired = totalAmountRequired - round.paidFees[uint(Party.Challenger)];
        uint contribution;
        (contribution, request.pot[uint(Party.Challenger)]) = calculateContribution(
            request.pot[uint(Party.Challenger)],
            amountStillRequired
        );
        round.paidFees[uint(Party.Challenger)] += contribution;

        // Raise dispute if both sides are fully funded.
        if (round.paidFees[uint(Party.Requester)] >= totalAmountRequired &&
            round.paidFees[uint(Party.Challenger)] >= totalAmountRequired) {

            request.disputeID = arbitrator.createDispute.value(totalAmountRequired)(2, arbitratorExtraData);
            disputeIDToTokenID[request.disputeID] = _tokenID;
            request.disputed = true;
            request.rounds.length++;
            request.balance -= totalAmountRequired;

            emit TokenStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                _tokenID,
                token.status,
                request.disputed
            );
        }
    }

    /** @dev Add funds to the requester's pot. Keeps unused ETH as prefund. Raises a dispute if both sides are fully funded. Only callable if there are no disputes.
     *  @param _tokenID The tokenID of the token with the request to execute.
     */
    function fundRequesterPotDispute(bytes32 _tokenID) external payable {
        Token storage token = tokens[_tokenID];
        require(
            token.status == TokenStatus.RegistrationRequested || token.status == TokenStatus.ClearingRequested,
            "Token does not have any pending requests."
        );
        Request storage request = token.requests[token.requests.length - 1];
        require(!request.disputed, "The request is already disputed.");
        require(request.challengerDepositTime > 0, "Request should have both parties deposits.");
        require(
            now - request.challengerDepositTime < arbitrationFeesWaitingTime,
            "The arbitration fees funding period of the first round has already passed."
        );

        // Add contributions to requester's pot.
        request.pot[uint(Party.Requester)] += msg.value;
        request.contributions[msg.sender][uint(Party.Requester)] += msg.value;
        if (msg.value > 0)
            emit Contribution(_tokenID, msg.sender, Party.Requester, msg.value);

        // Add contribution to request balance.
        request.balance += msg.value;

        // Calculate the total amount of fees required.
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        uint totalAmountRequired = arbitrationCost + arbitrationCost * sharedStakeMultiplier / MULTIPLIER_PRECISION;
        Round storage round = request.rounds[0];

        // Fund requester side from his pot.
        uint amountStillRequired = totalAmountRequired - round.paidFees[uint(Party.Requester)];
        uint contribution;
        (contribution, request.pot[uint(Party.Requester)]) = calculateContribution(
            request.pot[uint(Party.Requester)],
            amountStillRequired
        );
        round.paidFees[uint(Party.Requester)] += contribution;

        // Raise dispute if both sides are fully funded.
        if (round.paidFees[uint(Party.Requester)] >= totalAmountRequired &&
            round.paidFees[uint(Party.Challenger)] >= totalAmountRequired) {

            request.disputeID = arbitrator.createDispute.value(totalAmountRequired)(2, arbitratorExtraData);
            disputeIDToTokenID[request.disputeID] = _tokenID;
            request.disputed = true;
            request.rounds.length++;
            request.balance -= totalAmountRequired;

            emit TokenStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                _tokenID,
                token.status,
                request.disputed
            );
        }
    }

    /** @dev Fund a side's pot during the appeal period. Keeps unused ETH as prefund. Callable only if:
     *  - Arbitrator supports appeal period;
     *  - Current time is before the end of the appeal period;
     *  - If the side is the loser, the current time is on the fisrt half of the appeal period.
     *  @param _tokenID The tokenID of the token to fund.
     *  @param _side The recipient of the contribution.
     */
    function fundPotAppeal(bytes32 _tokenID, Party _side)
        external
        payable
        supportsAppealPeriod(request.disputeID)
        withinAppealPeriod(request.disputeID)
    {
        Request storage request = tokens[_tokenID].requests[tokens[_tokenID].requests.length - 1];
        require(
            arbitrator.disputeStatus(request.disputeID) == Arbitrator.DisputeStatus.Appealable,
            "The ruling for the token is not appealable."
        );

        // Add contributions to side's pot.
        request.pot[uint(_side)] += msg.value;
        request.contributions[msg.sender][uint(_side)] += msg.value;
        if (msg.value > 0)
            emit Contribution(_tokenID, msg.sender, _side, msg.value);

        // Add contribution to request balance.
        request.balance += msg.value;

        // Calculate the total amount required to fully fund the each side.
        Round storage round = request.rounds[request.rounds.length - 1];
        round.requiredForSide = calculateRequiredForSide(request.disputeID, round.oldWinnerTotalCost);

        // Fund side from his pot.
        if (round.requiredForSide[uint(_side)] - round.paidFees[uint(_side)] > request.pot[uint(_side)]) {
            // Pot does not have enough. Take whatever is available.
            request.pot[uint(_side)] = 0;
            round.paidFees[uint(_side)] += request.pot[uint(_side)];
        } else {
            // Pot has more than it's needed for this round. Take the amount needed.
            request.pot[uint(_side)] -= round.requiredForSide[uint(_side)] - round.paidFees[uint(_side)];
            round.paidFees[uint(_side)] += round.requiredForSide[uint(_side)] - round.paidFees[uint(_side)];
        }

        if ((arbitrator.currentRuling(request.disputeID) == uint(RulingOption.Accept) && _side == Party.Challenger) ||
            (arbitrator.currentRuling(request.disputeID) == uint(RulingOption.Refuse) && _side == Party.Requester)) {
            // Beneficiary is the losing side.
            require(inFirstHalfOfAppealPeriod(request.disputeID), "Appeal period for funding the losing side ended.");
        } else if ((arbitrator.currentRuling(request.disputeID) == uint(RulingOption.Accept) && _side == Party.Requester) ||
            (arbitrator.currentRuling(request.disputeID) == uint(RulingOption.Refuse) && _side == Party.Challenger)) {
            // Beneficiary is the winning side.
            // If in the first half of the appeal period, update the old total cost to the winner.
            // This is required to calculate the winner's cost when governacne changes are made in the second half of the appeal period.
            // The winner total cost is max(old appeal cost + old winner stake, new appeal cost).
            if (inFirstHalfOfAppealPeriod(request.disputeID))
                round.oldWinnerTotalCost = round.requiredForSide[uint(_side)];
        }

        // Raise appeal if both sides are fully funded.
        if (round.paidFees[uint(Party.Requester)] >= round.requiredForSide[uint(Party.Requester)] &&
            round.paidFees[uint(Party.Challenger)] >= round.requiredForSide[uint(Party.Challenger)]) {

            arbitrator.appeal.value(
                arbitrator.appealCost(request.disputeID, arbitratorExtraData)
            )(request.disputeID, arbitratorExtraData);
            round.appealed = true;
            request.balance -= arbitrator.appealCost(request.disputeID, arbitratorExtraData);

            emit TokenStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                _tokenID,
                tokens[_tokenID].status,
                request.disputed
            );
        }
    }

    /** @dev Reimburses fees withdraws the caller's rewards for funding the winner.
     *  @param _tokenID The ID of the token.
     *  @param _request The ID of the token.
     */
    function withdrawFeesAndRewards(bytes32 _tokenID, uint _request) external {
        Token storage token = tokens[_tokenID];
        Request storage request = token.requests[_request];
        require(
            request.resolved,
            "The request was not executed and/or there are disputes pending resolution."
        );

        uint reward;
        if (!request.disputed || RulingOption(arbitrator.currentRuling(request.disputeID)) == RulingOption.Other) {
            // No disputes were raised, or there isn't a winner and and loser. Reimburse contributions.
            reward = request.contributions[msg.sender][uint(Party.Requester)] + request.contributions[msg.sender][uint(Party.Challenger)];
            request.contributions[msg.sender][uint(Party.Requester)] = 0;
            request.contributions[msg.sender][uint(Party.Challenger)] = 0;
        } else {
            Party winner;
            if(RulingOption(arbitrator.currentRuling(request.disputeID)) == RulingOption.Accept)
                winner = Party.Requester;
            else
                winner = Party.Challenger;

            uint share = request.contributions[msg.sender][uint(winner)] * MULTIPLIER_PRECISION / request.pot[uint(winner)];
            reward = (share * request.balance) / MULTIPLIER_PRECISION;
            request.contributions[msg.sender][uint(winner)] = 0;
        }

        msg.sender.transfer(reward);
        emit RewardWithdrawal(_tokenID, _request, msg.sender, reward);
    }

    /** @dev Execute a request after the time for challenging it has passed. Can be called by anyone.
     *  @param _tokenID The tokenID of the token with the request to execute.
     */
    function executeRequest(bytes32 _tokenID) external {
        Token storage token = tokens[_tokenID];
        Request storage request = token.requests[token.requests.length - 1];
        require(now - request.submissionTime > challengePeriodDuration, "The time to challenge has not passed yet.");
        require(!request.disputed, "The specified token is disputed.");
        require(
            request.challengerDepositTime > 0,
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
        request.resolved = true;

        emit TokenStatusChange(
            request.parties[uint(Party.Requester)],
            request.parties[uint(Party.Challenger)],
            _tokenID,
            token.status,
            request.disputed
        );
    }


    /** @dev Rule in favor of party that paid more fees if not enough was raised to create a dispute.
     *  @param _tokenID The tokenID of the token with the request.
     */
    function feeTimeoutFirstRound(bytes32 _tokenID) external {
        Token storage token = tokens[_tokenID];
        Request storage request = token.requests[token.requests.length - 1];
        Round storage round = request.rounds[request.rounds.length - 1];
        require(request.rounds.length == 1, "This is not the first round.");
        require(
            now - request.challengerDepositTime > arbitrationFeesWaitingTime,
            "There is still time to place a contribution."
        );

        // Failed to fund first round.
        // Rule in favor of requester if he paid more or equal to the challenger. Rule in favor of challenger otherwise.
        Party winner;
        if (round.paidFees[uint(Party.Requester)] >= round.paidFees[uint(Party.Challenger)])
            winner = Party.Requester;
        else
            winner = Party.Challenger;

        // Update token state
        if (winner == Party.Requester) // Execute Request
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
        if (winner == Party.Challenger)
            request.parties[uint(Party.Challenger)].send(request.challengeRewardBalance);
        else
            request.parties[uint(Party.Requester)].send(request.challengeRewardBalance);

        request.challengeRewardBalance = 0;

        emit TokenStatusChange(
            request.parties[uint(Party.Requester)],
            request.parties[uint(Party.Challenger)],
            _tokenID,
            token.status,
            request.disputed
        );
    }

    /** @dev Give a ruling for a dispute. Must be called by the arbitrator.
     *  Overrides parent function to account for the situation where a party loses a case due to paying less appeal fees than expected.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function rule(uint _disputeID, uint _ruling) public onlyArbitrator {
        emit Ruling(Arbitrator(msg.sender),_disputeID,_ruling);
        if(_ruling == uint(RulingOption.Other)) { // Respect ruling if there isn't a winner or loser.
            executeRuling(_disputeID,_ruling);
            return;
        }

        bytes32 tokenID = disputeIDToTokenID[_disputeID];
        Token storage token = tokens[tokenID];
        Request storage request = token.requests[token.requests.length - 1];
        Round storage round = request.rounds[request.rounds.length - 1];

        Party winner;
        Party loser;
        RulingOption currentRuling = RulingOption(arbitrator.currentRuling(request.disputeID));
        if(currentRuling == RulingOption.Accept) {
            winner = Party.Requester;
            loser = Party.Challenger;
        } else {
            winner = Party.Challenger;
            loser = Party.Requester;
        }

        // Respect the ruling unless the losing side funded the appeal and the winning side paid less than expected.
        if (round.paidFees[uint(loser)] >= round.requiredForSide[uint(loser)]) {
            // Loser is fully funded but the winner is not. Rule in favor of the loser.
            if (_ruling == uint(RulingOption.Accept))
                executeRuling(_disputeID,uint(RulingOption.Refuse));
            else
                executeRuling(_disputeID,uint(RulingOption.Accept));
        } else
            executeRuling(_disputeID,_ruling); // Respect the ruling.
    }

    /** @dev Submit a reference to evidence. EVENT.
     *  @param _evidence A link to an evidence using its URI.
     */
    function submitEvidence(bytes32 _tokenID, string _evidence) external {
        Token storage token = tokens[_tokenID];
        Request storage request = token.requests[token.requests.length - 1];
        require(request.disputed, "The request is not disputed.");

        Round storage round = request.rounds[request.rounds.length - 1];
        require(!round.appealed, "Request already appealed.");

        emit Evidence(arbitrator, request.disputeID, msg.sender, _evidence);
    }

    // ************************ //
    // *      Governance      * //
    // ************************ //

    /** @dev Changes the `challengePeriodDuration` storage variable.
     *  @param _challengePeriodDuration The new `challengePeriodDuration` storage variable.
     */
    function changeTimeToChallenge(uint _challengePeriodDuration) external onlyGovernor {
        challengePeriodDuration = _challengePeriodDuration;
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

    /** @dev Changes the `arbitrationFeesWaitingTime` storage variable.
     *  @param _arbitrationFeesWaitingTime The new `_arbitrationFeesWaitingTime` storage variable.
     */
    function changeArbitrationFeesWaitingTime(uint _arbitrationFeesWaitingTime) external onlyGovernor {
        arbitrationFeesWaitingTime = _arbitrationFeesWaitingTime;
    }

    /** @dev Changes the `sharedStakeMultiplier` storage variable.
     *  @param _sharedStakeMultiplier The new `sharedStakeMultiplier` storage variable.
     */
    function changeSharedStakeMultiplier(uint _sharedStakeMultiplier) external onlyGovernor {
        sharedStakeMultiplier = _sharedStakeMultiplier;
    }

    /** @dev Changes the `winnerStakeMultiplier` storage variable.
     *  @param _winnerStakeMultiplier The new `_winnerStakeMultiplier` storage variable.
     */
    function changeWinnerStakeMultiplier(uint _winnerStakeMultiplier) external onlyGovernor {
        winnerStakeMultiplier = _winnerStakeMultiplier;
    }

    /** @dev Changes the `loserStakeMultiplier` storage variable.
     *  @param _loserStakeMultiplier The new `_loserStakeMultiplier` storage variable.
     */
    function changeLoserStakeMultiplier(uint _loserStakeMultiplier) external onlyGovernor {
        loserStakeMultiplier = _loserStakeMultiplier;
    }

    /** @dev Changes the `lastRoundRewardMultiplier` storage variable.
     *  @param _lastRoundRewardMultiplier The new `_lastRoundRewardMultiplier` storage variable.
     */
    function changeLastRoundRewardMultiplier(uint _lastRoundRewardMultiplier) external onlyGovernor {
        require(_lastRoundRewardMultiplier < MULTIPLIER_PRECISION, "Value must be less then 100%.");
        lastRoundRewardMultiplier = _lastRoundRewardMultiplier;
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

        Party winner;
        RulingOption currentRuling = RulingOption(arbitrator.currentRuling(request.disputeID));
        if(currentRuling == RulingOption.Accept)
            winner = Party.Requester;
        else if (currentRuling == RulingOption.Refuse)
            winner = Party.Challenger;

        // Update token state
        if (winner == Party.Requester) // Execute Request
            if (token.status == TokenStatus.RegistrationRequested)
                token.status = TokenStatus.Registered;
            else
                token.status = TokenStatus.Absent;
        else // Revert to previous state.
            if (token.status == TokenStatus.RegistrationRequested)
                token.status = TokenStatus.Absent;
            else if (token.status == TokenStatus.ClearingRequested)
                token.status = TokenStatus.Registered;

        // Send challenge reward.
        // Deliberate use of send in order to not block the contract in case of reverting fallback.
        if (winner == Party.Challenger)
            request.parties[uint(Party.Challenger)].send(request.challengeRewardBalance);
        else if (winner == Party.Requester)
            request.parties[uint(Party.Requester)].send(request.challengeRewardBalance);
        else {
            // Reimburse parties.
            request.parties[uint(Party.Requester)].send(request.challengeRewardBalance / 2);
            request.parties[uint(Party.Challenger)].send(request.challengeRewardBalance / 2);
        }

        request.challengeRewardBalance = 0;
        request.resolved = true;

        emit TokenStatusChange(
            request.parties[uint(Party.Requester)],
            request.parties[uint(Party.Challenger)],
            tokenID,
            token.status,
            request.disputed
        );
    }

    /** @dev Returns true if disputeID is in the first half of the appeal period. Used to get around stack limits.
     *  @param _disputeID The ID of the dispute to be queried.
     */
    function inFirstHalfOfAppealPeriod(uint _disputeID)
        internal
        view
        supportsAppealPeriod(_disputeID)
        returns (bool)
    {
        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(_disputeID);
        return now - appealPeriodStart < (appealPeriodEnd - appealPeriodStart) / 2;
    }

    /** @dev Returns the amount that must be paid by each side to fully fund an appeal.
     *  @param _disputeID The dispute ID to be queried.
     *  @param _oldWinnerTotalCost The total amount of fees the winner had to pay before a governance change in the second half of an appeal period.
     *  @return The amount of ETH required for each side.
     */
    function calculateRequiredForSide(uint _disputeID, uint _oldWinnerTotalCost)
        internal
        view
        supportsAppealPeriod(_disputeID)
        returns(uint[3] requiredForSide)
    {
        Party winner;
        Party loser;
        RulingOption currentRuling = RulingOption(arbitrator.currentRuling(_disputeID));
        if(currentRuling == RulingOption.Accept) {
            winner = Party.Requester;
            loser = Party.Challenger;
        } else if (currentRuling == RulingOption.Refuse) {
            winner = Party.Challenger;
            loser = Party.Requester;
        }

        uint appealCost = arbitrator.appealCost(_disputeID, arbitratorExtraData);
        if(uint(winner) > 0) {
            // Arbitrator gave a decisive ruling.

            // Set the required amount for the winner.
            requiredForSide[uint(winner)] = appealCost + (appealCost * winnerStakeMultiplier) / MULTIPLIER_PRECISION;
            // Fee changes in the second half of the appeal period may create a difference between the amount paid by the winner and the amount paid by the loser.
            // To deal with this case, the amount that must be paid by the winner is max(old appeal cost + old winner stake, new appeal cost).
            (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(_disputeID);
            if (now - appealPeriodStart > (appealPeriodEnd - appealPeriodStart) / 2) // In first half of appeal period.
                requiredForSide[uint(winner)] = _oldWinnerTotalCost > appealCost ? _oldWinnerTotalCost : appealCost;

            // Set the required amount for the loser.
            // The required amount for the loser must only be affected by governance/fee changes made in the first half of the appeal period. Otherwise, increases would cause the loser to lose the case due to being underfunded.
            if (now - appealPeriodStart < (appealPeriodEnd - appealPeriodStart) / 2) // In first half of appeal period.
                requiredForSide[uint(loser)] = appealCost + (appealCost * loserStakeMultiplier) / MULTIPLIER_PRECISION;
        } else {
            // Arbitrator did not rule or refused to rule.
            requiredForSide[uint(Party.Requester)] = appealCost + (appealCost * sharedStakeMultiplier) / MULTIPLIER_PRECISION;
            requiredForSide[uint(Party.Challenger)] = appealCost + (appealCost * sharedStakeMultiplier) / MULTIPLIER_PRECISION;
        }

        return requiredForSide;
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
        returns(uint taken, uint remainder)
    {
        if (_requiredAmount > _available)
            return (_available, 0); // Take whatever is available, return 0 as leftover ETH.

        remainder = _available - _requiredAmount;
        return (_requiredAmount, remainder);
    }

    /* Interface Views */

    /** @dev Returns token information. Includes length of requests array.
     *  @param _tokenID The ID of the token.
     *  @return The token information.
     */
    function getTokenInfo(bytes32 _tokenID)
        external
        view
        returns (
            TokenStatus status,
            string name,
            address addr,
            string ticker,
            uint numberOfRequests,
            string URI,
            string networkID
        )
    {
        Token storage token = tokens[_tokenID];
        return (
            token.status,
            token.name,
            token.addr,
            token.ticker,
            token.requests.length,
            token.URI,
            token.networkID
        );
    }

    /** @dev Gets the info on a request of a token.
     *  @param _tokenID The ID of the token.
     *  @param _request The position of the request we want.
     *  @return The information.
     */
    function getRequestInfo(bytes32 _tokenID, uint _request)
        external
        view
        returns (
            bool disputed,
            uint disputeID,
            uint challengerDepositTime,
            uint challengeRewardBalance,
            address[3] parties,
            uint numberOfRounds
        )
    {
        Token storage token = tokens[_tokenID];
        Request storage request = token.requests[_request];
        return (
            request.disputed,
            request.disputeID,
            request.challengerDepositTime,
            request.challengeRewardBalance,
            request.parties,
            request.rounds.length
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
        returns (
            uint[3] paidFees
        )
    {
        Token storage token = tokens[_tokenID];
        Request storage request = token.requests[_request];
        Round storage round = request.rounds[_round];
        return (
            round.paidFees
        );
    }

    /** @dev Gets the contributions of a request.
     *  @param _tokenID The ID of the token.
     *  @param _request The position of the request.
     *  @param _contributor The address of the contributor.
     *  @return The contributions.
     */
    function getContributions(
        bytes32 _tokenID,
        uint _request,
        address _contributor
    ) external view returns(uint[3] contributions) {
        Token storage token = tokens[_tokenID];
        Request storage request = token.requests[_request];
        contributions = request.contributions[_contributor];
    }

    /** @dev Return the numbers of tokens in the list.
     *  @return The numbers of tokens in the list.
     */
    function tokenCount() external view returns (uint count) {
        return tokensList.length;
    }

    /** @dev Return the numbers of tokens with each status. This function is O(n) at worst, where n is the number of tokens. This could exceed the gas limit, therefore this function should only be used for interface display and not by other contracts.
     *  @return The numbers of tokens in the list per status.
     */
    function countByStatus()
        external
        view
        returns (
            uint disputed,
            uint absent,
            uint registered,
            uint registrationRequested,
            uint clearingRequested
        )
    {
        for (uint i = 0; i < tokensList.length; i++) {
            Token storage token = tokens[tokensList[i]];
            Request storage request = token.requests[token.requests.length - 1];

            if (uint(token.status) > 1 && request.disputed) disputed++;
            if (token.status == TokenStatus.Absent) absent++;
            else if (token.status == TokenStatus.Registered) registered++;
            else if (token.status == TokenStatus.RegistrationRequested) registrationRequested++;
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
     *  @return The values of the tokens found and whether there are more tokens for the current filter and sort.
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
