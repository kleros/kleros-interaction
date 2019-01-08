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
        TokenStatus status;
        string name;
        address addr;
        string ticker;
        uint lastAction; // Time of the last action.
        Request[] requests;
        string URI;
        string networkID;
    }

    struct Request {
        bool disputed; // True if a dispute is taking place.
        uint disputeID; // ID of the dispute, if any.
        uint firstContributionTime; // The time the first contribution was made at. Used to track when the request left the challenge period and entered the arbitration fees funding period.
        uint arbitrationFeesWaitingTime; // The waiting time for fees for each round.
        uint timeToChallenge; // The time to challenge for each round.
        uint challengeRewardBalance; // The amount of funds placed at stake for this token.
        uint challengeReward; // The challengeReward of the token for the round.
        address[3] parties; // Address of requester and challenger, if any.
        Round[] rounds; // Tracks fees for each round of dispute and appeals.
        uint latestRound; // Tracks the current round of a dispute, if any.
        bool executed; // True if the request has been executed or if a non appealable ruling was given.
    }

    struct Round {
        uint[3] requiredStakeForSide; // The required stake that must be paid for each side.
        bool requiredFeeStakeSet; // Whether the required fee stake has been calculated.
        bool loserFullyFunded; // True if there the losing side of a dispute fully funded his side of an appeal.
        RulingOption ruling; // The ruling given by an arbitrator, if any.
        bool appealed; // True if an appeal was raised.
        uint[3] paidFees; // Tracks the total balance paid by each side on this round. Used to calculate rewards.
        uint[3] amountToArbitrator; // Tracks the amount of fees reserved to be consumed by the arbitrator. Used to allow withdrawing unused ETH from prefunds. This can happen in the case the party is the winner of the previous round and was fully prefunded as the loser.
        mapping(address => uint[3]) contributions; // Maps contributors to their contributions for each side, if any.
        uint oldAppealCost; // It is necessary to store the full cost to the winner when the loser is fully funded to calculate the amount the winner will have to pay when there is a change to the fees and/or stake during the winners turn. The winner's required amount is max(oldAppealCost+oldWinnerStake, newAppealCost).
    }

    /* Modifiers */

    modifier onlyGovernor {require(msg.sender == governor, "The caller is not the governor."); _;}

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
     *  @param _contributor The round for which the contribution was made.
     *  @param _value The value of the contribution.
     */
    event Contribution(bytes32 indexed _tokenID, address indexed _contributor, uint indexed _round, uint _value);

    /** @dev Emitted shen a deposit is made to challenge a request.
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
     *  @param _timeToChallenge The time in seconds, parties have to challenge.
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
        uint _timeToChallenge,
        uint _sharedStakeMultiplier,
        uint _winnerStakeMultiplier,
        uint _loserStakeMultiplier,
        uint _lastRoundRewardMultiplier
    ) Arbitrable(_arbitrator, _arbitratorExtraData) public {
        require(_lastRoundRewardMultiplier < MULTIPLIER_PRECISION, "Value must be less then 100%.");

        challengeReward = _challengeReward;
        timeToChallenge = _timeToChallenge;
        governor = _governor;
        arbitrationFeesWaitingTime = _arbitrationFeesWaitingTime;
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
     *  - Extra eth will be kept as reserved arbitration fees for future disputes.
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
        request.arbitrationFeesWaitingTime = arbitrationFeesWaitingTime;
        request.timeToChallenge = timeToChallenge;
        request.parties[uint(Party.Requester)] = msg.sender;
        request.challengeReward = challengeReward;

        // Place deposit.
        request.challengeRewardBalance = challengeReward;

        // Setup first round.
        request.rounds.length++;
        Round storage round = request.rounds[request.rounds.length - 1];

        if(msg.value > challengeReward){
            // Take contributions, if any.
            (uint contribution, uint remainingETH) = calculateContribution(
                msg.value - challengeReward,
                arbitrator.arbitrationCost(arbitratorExtraData)
            );
            round.paidFees[uint(Party.Requester)] += contribution;
            round.contributions[msg.sender][uint(Party.Requester)];

            emit Contribution(tokenID, msg.sender, 0, contribution);

            msg.sender.send(remainingETH); // Refund any remaining ETH to the caller.
        }

        token.lastAction = now;
        emit TokenStatusChange(msg.sender, address(0), tokenID, token.status, false);
    }

    /** @dev Funds the challenger side of the first round. Refunds remaining ETH to the caller.
     *  @param _tokenID The tokenID of the token with the request to execute.
     */
    function fundChallenger(bytes32 _tokenID) external payable {
        Token storage token = tokens[_tokenID];
        require(
            token.status == TokenStatus.RegistrationRequested || token.status == TokenStatus.ClearingRequested,
            "Token does not have any pending requests."
        );
        Request storage request = token.requests[token.requests.length - 1];
        require(!request.disputed, "The token is already disputed.");
        require(request.latestRound == 0, "This function should be used only for the first round.");

        // Check if caller is starting the challenge.
        if (request.challengeRewardBalance == request.challengeReward) { // This means the request only has the requester's deposit.
            // Caller is starting the challenge.
            require(msg.value >= request.challengeReward, "Not enough ETH. Party starting dispute must place a deposit in full.");
            require(now - token.lastAction < request.timeToChallenge, "The challenge period has already passed.");

            // Take the deposit.
            request.parties[uint(Party.Challenger)] = msg.sender;
            (, remainingETH) = calculateContribution(remainingETH, request.challengeReward);
            request.challengeRewardBalance = request.challengeRewardBalance + request.challengeReward;

            emit ChallengeDepositPlaced(_tokenID, msg.sender);

            token.lastAction = now;
            request.firstContributionTime = now; // Time when the request left the challenge period and entered the arbitration fees funding period.
        } else
            require(
                now - request.firstContributionTime < request.arbitrationFeesWaitingTime,
                "The arbitration fees funding period has already passed."
            );

        Round storage round = request.rounds[0];
        uint remainingETH = msg.value;

        // Calculate the amount of fees required.
        uint totalAmountRequired = arbitrator.arbitrationCost(arbitratorExtraData);

        // Take contributions, if any.
        uint amountStillRequired = totalAmountRequired - round.paidFees[uint(Party.Challenger)];
        uint contribution;
        (contribution, remainingETH) = calculateContribution(remainingETH, amountStillRequired);
        round.paidFees[uint(Party.Challenger)] += contribution;
        round.contributions[msg.sender][uint(Party.Challenger)] += contribution;

        if(contribution > 0) {
            emit Contribution(_tokenID, msg.sender, 0, contribution);
            token.lastAction = now;
        }

        // Refund remaining ETH.
        msg.sender.send(remainingETH); // Deliberate use of send to avoid blocking in case the caller refuses refunds.

        // Raise dispute if both sides are fully funded.
        if (round.paidFees[uint(Party.Requester)] >= totalAmountRequired &&
            round.paidFees[uint(Party.Challenger)] >= totalAmountRequired) {
            request.disputeID = arbitrator.createDispute.value(totalAmountRequired)(2, arbitratorExtraData);
            disputeIDToTokenID[request.disputeID] = _tokenID;
            request.disputed = true;
            request.latestRound++;

            // We keep the consumed fees to calculate refunds unused fees contributed via prefunds.
            round.amountToArbitrator[uint(Party.Requester)] = totalAmountRequired;
            round.amountToArbitrator[uint(Party.Challenger)] = totalAmountRequired;

            emit TokenStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                _tokenID,
                token.status,
                request.disputed
            );
            token.lastAction = now;
        }
    }

    /** @dev Funds the requester side of the first round. Refunds remaining ETH to the caller.
     *  @param _tokenID The tokenID of the token with the request to execute.
     */
    function fundRequester(bytes32 _tokenID) external payable {
        Token storage token = tokens[_tokenID];
        require(
            token.status == TokenStatus.RegistrationRequested || token.status == TokenStatus.ClearingRequested,
            "Token does not have any pending requests."
        );
        Request storage request = token.requests[token.requests.length - 1];
        require(!request.disputed, "The token is already disputed.");
        require(request.latestRound == 0, "This function should be used only for the first round.");
        require(
            now - request.firstContributionTime < request.arbitrationFeesWaitingTime,
            "The arbitration fees funding period has already passed."
        );

        Round storage round = request.rounds[0];
        uint remainingETH = msg.value;

        uint totalAmountRequired = arbitrator.arbitrationCost(arbitratorExtraData);

        // Take contributions, if any.
        uint amountStillRequired = totalAmountRequired - round.paidFees[uint(Party.Requester)];
        uint contribution;
        (contribution, remainingETH) = calculateContribution(remainingETH, amountStillRequired);
        round.paidFees[uint(Party.Requester)] += contribution;
        round.contributions[msg.sender][uint(Party.Requester)] += contribution;

        if(contribution > 0) {
            emit Contribution(_tokenID, msg.sender, 0, contribution);
            token.lastAction = now;
        }

        // Refund remaining ETH.
        msg.sender.send(remainingETH); // Deliberate use of send to avoid blocking in case the caller refuses refunds.

        // Raise dispute if both sides are fully funded.
        if (round.paidFees[uint(Party.Requester)] >= totalAmountRequired &&
            round.paidFees[uint(Party.Challenger)] >= totalAmountRequired) {
            request.disputeID = arbitrator.createDispute.value(totalAmountRequired)(2, arbitratorExtraData);
            disputeIDToTokenID[request.disputeID] = _tokenID;
            request.disputed = true;
            request.latestRound++;

            // Save the consumed fees to calculate refunds of unused fees contributed via prefunds.
            round.amountToArbitrator[uint(Party.Requester)] = totalAmountRequired;
            round.amountToArbitrator[uint(Party.Challenger)] = totalAmountRequired;

            emit TokenStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                _tokenID,
                token.status,
                request.disputed
            );
            token.lastAction = now;
        }
    }

    /** @dev Prefunds the challenger side of a future round. Keeps all ETH since we can't know beforehand
     *  @param _tokenID The tokenID of the token with the request to execute.
     *  @param _round The round for which we want to fund a dispute.
     */
    function prefundChallenger(bytes32 _tokenID, uint _round) external payable {
        Token storage token = tokens[_tokenID];
        require(
            token.status == TokenStatus.RegistrationRequested || token.status == TokenStatus.ClearingRequested,
            "Token does not have any pending requests."
        );
        Request storage request = token.requests[token.requests.length - 1];
        require(!request.disputed, "The token is already disputed.");
        require(_round > request.latestRound, "This function should only be used to fund future rounds");

        if(_round > request.rounds.length - 1)
            request.rounds.length = _round + 1; // Prefunding a future round. Increase array size.

        Round storage round = request.rounds[_round];
        uint remainingETH = msg.value;

        // Calculate the amount of fees required.
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        uint totalAmountRequired = arbitrationCost + (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_PRECISION; // Since we don't know the if the party is the winner or loser of the previous round, we calculate the amount necessary if the challenger is the losing party.

        // Take contributions, if any.
        uint amountStillRequired = totalAmountRequired - round.paidFees[uint(Party.Challenger)];
        uint contribution;
        (contribution, remainingETH) = calculateContribution(remainingETH, amountStillRequired);
        round.paidFees[uint(Party.Challenger)] += contribution;
        round.contributions[msg.sender][uint(Party.Challenger)] += contribution;

        if(contribution > 0) {
            emit Contribution(_tokenID, msg.sender, _round, contribution);
            token.lastAction = now;
        }

        // Refund remaining ETH to the caller.
        msg.sender.send(remainingETH); // Deliberate use of send to avoid blocking in case the caller refuses refunds.
    }

    /** @dev Prefunds the requester side of a future round. Keeps all ETH since we can't know beforehand
     *  @param _tokenID The tokenID of the token with the request to execute.
     *  @param _round The round for which we want to fund a dispute.
     */
    function prefundRequester(bytes32 _tokenID, uint _round) external payable {
        Token storage token = tokens[_tokenID];
        require(
            token.status == TokenStatus.RegistrationRequested || token.status == TokenStatus.ClearingRequested,
            "Token does not have any pending requests."
        );
        Request storage request = token.requests[token.requests.length - 1];
        require(!request.disputed, "The token is already disputed.");
        require(_round > request.latestRound, "This function should only be used to fund future rounds");

        if(_round > request.rounds.length - 1)
            request.rounds.length = _round + 1; // Prefunding a future round. Increase array size.

        Round storage round = request.rounds[_round];
        uint remainingETH = msg.value;

        // Calculate the amount of fees required.
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        uint totalAmountRequired = arbitrationCost + (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_PRECISION; // Since we don't know the if the party is the winner or loser of the previous round, we calculate the amount necessary if the requester is the losing party.

        // Take contributions, if any.
        uint amountStillRequired = totalAmountRequired - round.paidFees[uint(Party.Requester)];
        uint contribution;
        (contribution, remainingETH) = calculateContribution(remainingETH, amountStillRequired);
        round.paidFees[uint(Party.Requester)] += contribution;
        round.contributions[msg.sender][uint(Party.Requester)] += contribution;

        if(contribution > 0) {
            emit Contribution(_tokenID, msg.sender, _round, contribution);
            token.lastAction = now;
        }

        // Refund remaining ETH to the caller.
        msg.sender.send(remainingETH); // Deliberate use of send to avoid blocking in case the caller refuses refunds.
    }

    /** @dev Fund the losing side of the appeal. Callable only if arbitrator supports appeal period and time is on the first half of the appeal period.
     *  - Refunds remaining ETH to the caller intead of keeping it for future disputes (as in done when requesting a status change) due to transaction ordering, front running and gas wars that could result in unwanted prefunds for future rounds.
     *  @param _tokenID The tokenID of the token to fund.
     */
    function fundAppealLosingSide(bytes32 _tokenID) external payable {
        Token storage token = tokens[_tokenID];
        require(token.lastAction > 0, "The specified token was never submitted.");
        Request storage request = token.requests[token.requests.length - 1];
        require(
            arbitrator.disputeStatus(request.disputeID) == Arbitrator.DisputeStatus.Appealable,
            "The ruling for the token is not appealable."
        );
        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(request.disputeID);
        require(appealPeriodEnd > appealPeriodStart, "Arbitrator must support appeal period.");
        uint appealPeriodDuration = appealPeriodEnd - (appealPeriodStart);
        require(
            now < appealPeriodStart + (appealPeriodDuration / 2),
            "Appeal period for funding the losing side ended."
        );

        Round storage round = request.rounds[request.latestRound];
        require(!round.loserFullyFunded, "Loser must not be yet fully funded.");

        // Calculate required fee stake for each side if we haven't done that yet.
        (Party winner, Party loser) = returnWinnerAndLoser(arbitrator.currentRuling(request.disputeID));
        uint appealCost = arbitrator.appealCost(request.disputeID, arbitratorExtraData);
        if (!round.requiredFeeStakeSet) {
            round.requiredStakeForSide[uint(loser)] = appealCost * loserStakeMultiplier / MULTIPLIER_PRECISION;
            round.requiredStakeForSide[uint(winner)] = appealCost * winnerStakeMultiplier / MULTIPLIER_PRECISION;
            round.requiredFeeStakeSet = true;
        }

        // Calculate the amount required.
        uint remainingETH = msg.value;
        uint totalRequiredFees = appealCost + round.requiredStakeForSide[uint(loser)];
        uint amountStillRequired = totalRequiredFees - round.paidFees[uint(loser)];

        // Take the contribution, if any.
        uint contribution;
        (contribution, remainingETH) = calculateContribution(remainingETH, amountStillRequired);
        round.paidFees[uint(loser)] += contribution;
        round.contributions[msg.sender][uint(loser)] += contribution;

        // Refund remaining ETH.
        msg.sender.send(remainingETH); // Deliberate use of send to avoid blocking in case the caller refuses refunds.

        if (contribution > 0) {
            emit Contribution(_tokenID, msg.sender, request.latestRound, contribution);
            token.lastAction = now;
        }

        if (round.paidFees[uint(loser)] >= totalRequiredFees) {
            round.loserFullyFunded = true;
            round.amountToArbitrator[uint(loser)] = totalRequiredFees; // Used to calculate prefund reimbursements.
            round.oldAppealCost = appealCost;
            token.lastAction = now;
        }
    }

    /** @dev Fund the winning side of the appeal. Callable only if arbitrator supports appeal period and time is on the second half of the appeal period.
     *  - Refunds remaining ETH to the caller intead of keeping it for future disputes (as in done when requesting a status change) due to transaction ordering, front running and gas wars that could result in unwanted prefunds for future rounds.
     *  @param _tokenID The tokenID of the token to fund.
     */
    function fundAppealWinningSide(bytes32 _tokenID) external payable {
        // We access the token from the array instead of using a variable like elsewhere to avoid reaching the stack limit.
        require(tokens[_tokenID].lastAction > 0, "The specified token was never submitted.");
        Request storage request = tokens[_tokenID].requests[tokens[_tokenID].requests.length - 1]; // Take the last request.
        require(
            arbitrator.disputeStatus(request.disputeID) == Arbitrator.DisputeStatus.Appealable,
            "The ruling for the token is not appealable."
        );
        Round storage round = request.rounds[request.latestRound];
        require(
            round.loserFullyFunded,
            "It is the winning side's turn to fund the appeal, only if the losing side already fully funded it."
        );
        require(
            RulingOption(arbitrator.currentRuling(request.disputeID)) != RulingOption.Other,
            "Cannot appeal a dispute on which the arbitrator refused to rule."
        );
        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(request.disputeID);
        require(appealPeriodEnd > appealPeriodStart, "Arbitrator must support appeal period.");
        require(
            now > appealPeriodStart + ((appealPeriodEnd - appealPeriodStart) / 2),
            "It's the losing side's turn to fund the appeal."
        );

        (Party winner, Party loser) = returnWinnerAndLoser(arbitrator.currentRuling(request.disputeID));

        // Calculate the total amount required. The total required fees is max(oldAppealCost + oldWinnerStake, newAppealCost).
        uint oldTotalCost = round.oldAppealCost + round.requiredStakeForSide[uint(winner)];
        uint totalRequiredFees = oldTotalCost > arbitrator.appealCost(request.disputeID, arbitratorExtraData)
            ? oldTotalCost
            : arbitrator.appealCost(request.disputeID, arbitratorExtraData);

        // Calculate the amount still required.
        uint remainingETH = msg.value;
        uint amountStillRequired = totalRequiredFees - round.paidFees[uint(winner)];

        // Take the contribution, if any.
        uint contribution;
        (contribution, remainingETH) = calculateContribution(remainingETH, amountStillRequired);
        round.paidFees[uint(winner)] += contribution;
        round.contributions[msg.sender][uint(winner)] += contribution;

        // Refund remaining ETH.
        msg.sender.send(remainingETH); // Deliberate use of send to avoid blocking in case the caller refuses refunds.

        if (contribution > 0) {
            emit Contribution(_tokenID, msg.sender, request.latestRound, contribution);
            tokens[_tokenID].lastAction = now;
        }

        // Raise appeal if both sides are fully funded.
        if (round.paidFees[uint(winner)] >= totalRequiredFees) {
            arbitrator.appeal.value(
                arbitrator.appealCost(request.disputeID, arbitratorExtraData)
            )(request.disputeID, arbitratorExtraData);

            // Save the ruling. Used for reimbursing unused crowdfunding fees and withdrawing rewards.
            round.ruling = RulingOption(arbitrator.currentRuling(request.disputeID));
            round.amountToArbitrator[uint(winner)] = totalRequiredFees; // Used to calculate prefund reimbursements.
            round.appealed = true;

            if(request.latestRound == request.rounds.length - 1)
                request.rounds.length++;
            request.latestRound++;

            tokens[_tokenID].lastAction = now;
        }
    }

    /** @dev Reimburses unused fees or withdraws the caller's reward for funding the current or previous round of a challenge.
     *  @param _tokenID The ID of the token.
     *  @param _round The round.
     */
    function withdrawFeesAndRewards(bytes32 _tokenID, uint _round) external {
        Token storage token = tokens[_tokenID];
        require(token.lastAction > 0, "The specified token was never submitted.");
        require(
            _round <= request.latestRound,
            "This function should be used only to withdraw from the current or previous rounds"
        );
        Request storage request = token.requests[token.requests.length - 1];
        Round storage round = request.rounds[_round];

        uint latestRound = request.latestRound;
        uint total;
        if(_round == 0) {
            require(
                request.executed,
                "There must be no pending disputes to withdraw fee reimbursement of the first round."
            );
            if(latestRound == 0) {
                total =
                round.contributions[msg.sender][uint(Party.Requester)] + round.contributions[msg.sender][uint(Party.Challenger)];
            } else {
                Party winner = request.rounds[_round].ruling == RulingOption.Accept ? Party.Requester : Party.Challenger;

                // Reimburse fees contributed to the winner.
                total = round.contributions[msg.sender][uint(winner)];
            }
        } else {
            if(_round < latestRound) {
                // Withdrawl from appealed round.
                // TODO: total = feesContributedToWinner + (reward * 0.9%)
            } else {
                // Withdraw from the last round.
                // If there was a dispute
                // TODO: total = feesContributed to winner + (total reward * 0.1%)
            }
        }

        round.contributions[msg.sender] = [0, 0, 0];
        msg.sender.transfer(total);
        emit RewardWithdrawal(_tokenID, _round, msg.sender, total);
    }

    /** @dev Execute a request after the time for challenging it has passed. Can be called by anyone.
     *  @param _tokenID The tokenID of the token with the request to execute.
     */
    function executeRequest(bytes32 _tokenID) external {
        Token storage token = tokens[_tokenID];
        require(token.lastAction > 0, "The specified token was never submitted.");
        Request storage request = token.requests[token.requests.length - 1];
        require(now - (token.lastAction) > request.timeToChallenge, "The time to challenge has not passed yet.");
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
        request.executed = true;

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
        require(request.rounds.length == 1, "This is not the first round.");
        require(
            request.firstContributionTime + (request.arbitrationFeesWaitingTime) < now,
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

        Round storage round = request.rounds[request.rounds.length - 1];
        require(!round.appealed, "Request already appealed.");

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

        // Respect the ruling unless the losing side funded the appeal and the winning side paid less than expected.
        (Party winner, Party loser) = returnWinnerAndLoser(_ruling);
        if (
            round.loserFullyFunded &&
            round.paidFees[uint(loser)] - (round.requiredStakeForSide[uint(loser)]) > round.paidFees[uint(winner)]
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
            request.parties[uint(Party.Challenger)].send(request.challengeReward * 2);
        else if (winner == Party.Requester)
            request.parties[uint(Party.Requester)].send(request.challengeReward * 2);
        else {
            // Reimburse parties.
            request.parties[uint(Party.Requester)].send(request.challengeReward);
            request.parties[uint(Party.Challenger)].send(request.challengeReward);
        }

        token.lastAction = now;
        request.disputed = false;
        request.executed = true;
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
        if (_requiredAmount > _available)
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
        uint expectedValue = _amountPaidByLoser - (_requiredFeeStake);
        return _appealCost > _amountPaidByLoser + (expectedValue)
            ? _appealCost - (_amountPaidByLoser)
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
            uint lastAction,
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
            token.lastAction,
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
            uint firstContributionTime,
            uint arbitrationFeesWaitingTime,
            uint timeToChallenge,
            uint challengeRewardBalance,
            uint challengeReward,
            address[3] parties,
            uint numberOfRounds
        )
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
            uint[3] requiredStakeForSide,
            uint[3] paidFees,
            bool loserFullyFunded,
            RulingOption ruling
        )
    {
        Token storage token = tokens[_tokenID];
        Request storage request = token.requests[_request];
        Round storage round = request.rounds[_round];
        return (
            round.requiredStakeForSide,
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

            if (request.disputed) disputed++;
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
