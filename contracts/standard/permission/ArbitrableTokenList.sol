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
 *  This contract is arbitrable token curated list for tokens, sometimes referred to as a Token² Curated List. Users can send requests to register or remove tokens from the list which can, in turn, be challenged by parties that disagree with the request.
 *  A crowdsourced insurance system allows parties to contribute to arbitration fees and win rewards if the side they backed ultimatly wins a dispute.
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

    // ************************ //
    // *  Request Life Cycle  * //
    // ************************ //
    // Changes to the token status are made via requests for either listing or removing a token from the Token² Curated List.
    // The costs for placing a request vary depending on whether a party challenges that request and on the number of appeals.
    // To place or challenge a request, a party must place value at stake. This value will rewarded to the party that ultimatly wins the dispute. If no one challenges the request, the value will be reimbursed to the requester.
    // Additionally to the challenge reward, in the case a party challenges a request, both sides must fully pay the amount of arbitration fees required to raise a dispute. The party that wins ultimatly wins the case will be reimbursed.
    // Finally, arbitration fees can be crowdsourced. To incentivise insurers, an additional value must placed at stake. Contributors that fund the side that ultimatly win a dispute will be reimbursed and rewarded with the other side's fee stake proportinally to their contribution.
    // In summary, costs for placing or challenging a request are the following:
    // - A challenge reward given to the party that wins a potential dispute.
    // - Arbitration fees used to pay jurors.
    // - Fee stake that can be rewarded to anyone that contributes to a party's arbitration fees.

    /* Structs */
    struct Token {
        string name; // The token name (e.g. Pinakion).
        string ticker; // The token ticker (e.g. PNK).
        address addr; // The Ethereum address of the token, if it is running on an EVM based network.
        string URI; // A URI pointing to the token logo.
        string networkID; // The ID of the network. Can be used for listing tokens from other blockchains. 'ETH' if the token is deployed on the Ethereum mainnet.
        TokenStatus status;
        Request[] requests; // List of status change requests made for the token.
    }

    // Arrays of that have 3 elements to map with the Party enum for better readability:
    // - 0 is unused, matches Party.None.
    // - 1 for Party.Requester.
    // - 2 for Party.Challenger.
    struct Request {
        bool disputed; // True if a dispute was raised.
        uint disputeID; // ID of the dispute, if any.
        uint submissionTime; // Time when the request was made. Used to track when the challenge period ends.
        uint challengeRewardBalance; // The amount of funds placed at stake for this request. This value will be given to the party that ultimatly wins a potential dispute, or be reimbursed to the requester if no one challenges.
        uint challengerDepositTime; // The time when a challenger placed his deposit. Used to track when the request left the challenge period and entered the arbitration fees funding period.
        uint feeRewards; // Summation of reimbursable fees and stake rewards available to the parties that made contributions to the side that ultimatly wins a dispute.
        bool resolved; // True if the request was executed and/or any disputes raised were resolved.
        address[3] parties; // Address of requester and challenger, if any.
        uint[3] pot; // Tracks the amount of funds available to fund a round. Can be non zero if a party paid more than is necessary to fund the current round of a dispute.
        Round[] rounds; // Tracks each round of a dispute.
        mapping(address => uint[3]) contributions; // Maps contributors to their contributions for each side, if any.
    }

    struct Round {
        bool appealed; // True if this round was appealed.
        uint oldWinnerTotalCost; // Governance changes on the second half of the appeal funding period create a difference between the amount that must be contributed by the winner and the loser. This variable tracks the amount that was required of the winner in the first round, before a change that happened on the second half of the funding period. It is used to calculate the amount that must be paid by the winner to fully fund his side, which is max(old total cost, new appeal cost).
        uint[3] paidFees; // Tracks the fees paid by each side on this round.
        uint[3] requiredForSide; // The total amount required to fully fund each side. It is the summation of the dispute or appeal cost and the fee stake.
    }

    /* Modifiers */

    modifier onlyGovernor {require(msg.sender == governor, "The caller is not the governor."); _;}

    /* Events */

    /**
     *  @dev Emitted when a party places a request, a dispute or appeals are raised or when a request is executed.
     *  @param _requester Address of the party that placed the request.
     *  @param _challenger Address of the party challenging the request, if any.
     *  @param _tokenID The token ID. It is the keccak256 hash of it's data.
     *  @param _status The status of the token.
     *  @param _disputed Whether the token is disputed.
     */
    event TokenStatusChange(
        address indexed _requester,
        address indexed _challenger,
        bytes32 indexed _tokenID,
        TokenStatus _status,
        bool _disputed
    );

    /** @dev Emitted when a party makes contribution a side's pot.
     *  @param _tokenID The ID of the token that the contribution was made to.
     *  @param _contributor The address that sent the contribution.
     *  @param _side The side the contribution was made to.
     *  @param _value The value of the contribution.
     */
    event Contribution(bytes32 indexed _tokenID, address indexed _contributor, Party indexed _side, uint _value);

    /** @dev Emitted when a deposit is made to challenge a request.
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
    uint public challengeReward; // The deposit required for placing and/or challenging a request. A party that wins a disputed request will be reimbursed and will receive the other's deposit.
    uint public challengePeriodDuration; // The time before a request becomes executable if not challenged.
    uint public arbitrationFeesWaitingTime; // The time available to fund arbitration fees and fee stake for a potential dispute.
    address public governor; // The address that can make governance changes to the parameters of the Token² Curated List.

    // The required fee stake that a party must pay depends on who won the previous round and is proportional to the arbitration cost such that the fee stake for a round = stake multiplier * arbitration cost for that round.
    // The value is the percentage in 4 digits precision (e.g. a multiplier of 5000 results in 50% of the arbitration cost for that round).
    uint public winnerStakeMultiplier; // Multiplier for calculating the fee stake paid by the party that won the previous round.
    uint public loserStakeMultiplier; // Multiplier for calculating the fee stake paid by the party that lost the previous round.
    uint public sharedStakeMultiplier; // Multiplier for calculating the fee stake that be must paid in the case where the previous round does not have a winner (e.g. when it's the first round or the arbitrator ruled refused to rule/could not rule).
    uint public constant MULTIPLIER_PRECISION = 10000; // Precision parameter for multipliers.

    mapping(bytes32 => Token) public tokens; // Maps the token ID to the token data.
    mapping(uint => bytes32) public disputeIDToTokenID; // Maps a disputeID to the affected token's ID.
    bytes32[] public tokensList; // List of IDs of submitted tokens.

    /* Constructor */

    /**
     *  @dev Constructs the arbitrable token curated list.
     *  @param _arbitrator The chosen arbitrator.
     *  @param _arbitratorExtraData Extra data for the arbitrator contract.
     *  @param _metaEvidence The URI of the meta evidence object.
     *  @param _governor The governor of this contract.
     *  @param _arbitrationFeesWaitingTime The maximum time to wait for arbitration fees if the dispute is raised.
     *  @param _challengeReward The amount in weis required to submit or a challenge a request.
     *  @param _challengePeriodDuration The time in seconds, parties have to challenge a request.
     *  @param _sharedStakeMultiplier Percentage of the arbitration cost that each party pay as fee stake for a round when there isn't a winner/loser in the previous round (e.g. when it's the first round or the arbitrator refused to or did not rule). Value in 2 digits precision (e.g. 2500 results in 25% of the arbitration cost value of that round).
     *  @param _winnerStakeMultiplier Percentage of the arbitration cost that the winner has to pay as fee stake for a round. Value in 2 digits precision (e.g. 5000 results in 50% of the arbitration cost value of that round).
     *  @param _loserStakeMultiplier Percentage of the arbitration cost that the loser has to pay as fee stake for a round. Value in 2 digits precision (e.g. 10000 results in 100% of the arbitration cost value of that round).
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
        uint _loserStakeMultiplier
    ) Arbitrable(_arbitrator, _arbitratorExtraData) public {
        emit MetaEvidence(0, _metaEvidence);
        governor = _governor;
        arbitrationFeesWaitingTime = _arbitrationFeesWaitingTime;
        challengeReward = _challengeReward;
        challengePeriodDuration = _challengePeriodDuration;
        sharedStakeMultiplier = _sharedStakeMultiplier;
        winnerStakeMultiplier = _winnerStakeMultiplier;
        loserStakeMultiplier = _loserStakeMultiplier;
    }

    /* Public */

    // ************************ //
    // *       Requests       * //
    // ************************ //

    /** @dev Submit a request to change a token status. Extra ETH will be kept as reserve for future disputes.
     *  @param _name The token name (e.g. Pinakion).
     *  @param _ticker The token ticker (e.g. PNK).
     *  @param _addr The Ethereum address of the token, if it is running on an EVM based network.
     *  @param _URI A URI pointing to the token logo.
     *  @param _networkID The ID of the network. Can be used for listing tokens from other blockchains. 'ETH' if the token is
     */
    function requestStatusChange(
        string _name,
        string _ticker,
        address _addr,
        string _URI,
        string _networkID
    )
        external
        payable
    {
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
        }

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
        request.feeRewards = contribution;

        emit TokenStatusChange(
            request.parties[uint(Party.Requester)],
            request.parties[uint(Party.Challenger)],
            tokenID,
            token.status,
            false
        );

        if (contribution > 0)
            emit Contribution(tokenID, msg.sender, Party.Requester, contribution);
    }

    /** @dev Challenges the latest request of a token. Keeps extra ETH as prefund. Raises a dispute if both sides are fully funded.
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
        request.challengerDepositTime = now; // Save the start of the first round arbitration fees funding period.
        emit ChallengeDepositPlaced(_tokenID, msg.sender);

        // Add contributions to challenger's pot.
        uint contribution = msg.value - challengeReward;
        request.pot[uint(Party.Challenger)] += contribution;
        request.contributions[msg.sender][uint(Party.Challenger)] += contribution;
        if (contribution > 0)
            emit Contribution(_tokenID, msg.sender, Party.Challenger, contribution);

        // Add contribution to request balance.
        request.feeRewards += contribution;

        // Calculate the total amount of fees required.
        Round storage round = request.rounds[0];
        round.requiredForSide = calculateRequiredForSide(request.disputeID, round.oldWinnerTotalCost);
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);

        // Fund challenger side from his pot.
        uint amountStillRequired = round.requiredForSide[uint(Party.Challenger)] - round.paidFees[uint(Party.Challenger)];
        (contribution, request.pot[uint(Party.Challenger)]) = calculateContribution(
            request.pot[uint(Party.Challenger)],
            amountStillRequired
        );
        round.paidFees[uint(Party.Challenger)] = contribution;
        request.feeRewards += contribution;

        // Fund requester side from his pot.
        amountStillRequired = round.requiredForSide[uint(Party.Requester)] - round.paidFees[uint(Party.Requester)];
        (contribution, request.pot[uint(Party.Requester)]) = calculateContribution(
            request.pot[uint(Party.Requester)],
            amountStillRequired
        );
        round.paidFees[uint(Party.Requester)] += contribution;
        request.feeRewards += contribution;

        // Raise dispute if both sides are fully funded.
        if (round.paidFees[uint(Party.Requester)] >= round.requiredForSide[uint(Party.Requester)] &&
            round.paidFees[uint(Party.Challenger)] >= round.requiredForSide[uint(Party.Challenger)]) {

            request.disputeID = arbitrator.createDispute.value(arbitrationCost)(2, arbitratorExtraData);
            disputeIDToTokenID[request.disputeID] = _tokenID;
            request.disputed = true;
            request.rounds.length++;
            request.feeRewards -= arbitrationCost;

            emit TokenStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                _tokenID,
                token.status,
                request.disputed
            );
        }
    }

    /** @dev Add funds to a party's pot. Keeps unused ETH as prefund. Raises a dispute if a challenger placed a deposit and both sides are fully funded.
     *  @param _tokenID The tokenID of the token with the request to execute.
     */
    function fundPotDispute(bytes32 _tokenID, Party _side) external payable {
        require(
            _side == Party.Requester || _side == Party.Challenger,
            "Side must be either the requester or challenger."
        );
        Token storage token = tokens[_tokenID];
        require(
            token.status == TokenStatus.RegistrationRequested || token.status == TokenStatus.ClearingRequested,
            "Token does not have any pending requests."
        );
        Request storage request = token.requests[token.requests.length - 1];
        require(!request.disputed, "The request is already disputed.");

        // If a challenger placed a deposit, contributions must be done before the end of the arbitration fees waiting time.
        if(request.challengerDepositTime > 0)
            require(
                now - request.challengerDepositTime < arbitrationFeesWaitingTime,
                "The arbitration fees funding period of the first round has already passed."
            );

        // Add contributions to the side's pot.
        request.pot[uint(_side)] += msg.value;
        request.contributions[msg.sender][uint(_side)] += msg.value;
        if (msg.value > 0)
            emit Contribution(_tokenID, msg.sender, _side, msg.value);

        if(request.challengerDepositTime == 0) // If no party placed a challenge deposit, stop here.
            return;

        // Calculate the total amount of fees required to fully fund each side.
        Round storage round = request.rounds[0];
        round.requiredForSide = calculateRequiredForSide(request.disputeID, round.oldWinnerTotalCost);

        // Fund challenger side from his pot.
        uint amountStillRequired = round.requiredForSide[uint(Party.Challenger)] - round.paidFees[uint(Party.Challenger)];
        uint contribution;
        (contribution, request.pot[uint(Party.Challenger)]) = calculateContribution(
            request.pot[uint(Party.Challenger)],
            amountStillRequired
        );
        round.paidFees[uint(Party.Challenger)] += contribution;
        request.feeRewards += contribution;

        // Fund requester side from his pot.
        amountStillRequired = round.requiredForSide[uint(Party.Requester)] - round.paidFees[uint(Party.Requester)];
        (contribution, request.pot[uint(Party.Requester)]) = calculateContribution(
            request.pot[uint(Party.Requester)],
            amountStillRequired
        );
        round.paidFees[uint(Party.Requester)] += contribution;
        request.feeRewards += contribution;

        // Raise dispute if both sides are fully funded.
        if (round.paidFees[uint(Party.Requester)] >= round.requiredForSide[uint(Party.Requester)] &&
            round.paidFees[uint(Party.Challenger)] >= round.requiredForSide[uint(Party.Challenger)]) {

            uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
            request.disputeID = arbitrator.createDispute.value(arbitrationCost)(2, arbitratorExtraData);
            disputeIDToTokenID[request.disputeID] = _tokenID;
            request.disputed = true;
            request.rounds.length++;
            request.feeRewards -= arbitrationCost;

            emit TokenStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                _tokenID,
                token.status,
                request.disputed
            );
        }
    }

    /** @dev Fund a side's pot while a ruling is appealable. Keeps unused ETH as prefund.
     *  @param _tokenID The tokenID of the token to fund.
     *  @param _side The recipient of the contribution.
     */
    function fundPotAppeal(bytes32 _tokenID, Party _side) external payable {
        require(
            _side == Party.Requester || _side == Party.Challenger,
            "Side must be either the requester or challenger."
        );
        Request storage request = tokens[_tokenID].requests[tokens[_tokenID].requests.length - 1];
        require(
            arbitrator.disputeStatus(request.disputeID) == Arbitrator.DisputeStatus.Appealable,
            "The ruling for the token is not appealable."
        );
        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(request.disputeID);
        if(appealPeriodEnd > appealPeriodStart) // Appeal period is known.
            require(now < appealPeriodEnd, "Appeal period ended.");

        // Add contributions to the beneficiary's pot.
        request.pot[uint(_side)] += msg.value;
        request.contributions[msg.sender][uint(_side)] += msg.value;
        if (msg.value > 0)
            emit Contribution(_tokenID, msg.sender, _side, msg.value);

        // Calculate and update the total amount required to fully fund the each side.
        Round storage round = request.rounds[request.rounds.length - 1];
        round.requiredForSide = calculateRequiredForSide(request.disputeID, round.oldWinnerTotalCost);

        // Fund challenger side from his pot.
        uint amountStillRequired = round.requiredForSide[uint(Party.Challenger)] - round.paidFees[uint(Party.Challenger)];
        uint contribution;
        (contribution, request.pot[uint(Party.Challenger)]) = calculateContribution(
            request.pot[uint(Party.Challenger)],
            amountStillRequired
        );
        round.paidFees[uint(Party.Challenger)] += contribution;
        request.feeRewards += contribution;

        // Fund requester side from his pot.
        amountStillRequired = round.requiredForSide[uint(Party.Requester)] - round.paidFees[uint(Party.Requester)];
        (contribution, request.pot[uint(Party.Requester)]) = calculateContribution(
            request.pot[uint(Party.Requester)],
            amountStillRequired
        );
        round.paidFees[uint(Party.Requester)] += contribution;
        request.feeRewards += contribution;

        // If the arbitrator supports appeal period, the loser is restricted to receive funding in the first half of it.
        // Additionally, governance changes that happen on the second half of the appeal period can affect the total appeal cost to the winner.
        if(appealPeriodEnd > appealPeriodStart) { // Appeal period is known.
            if ((arbitrator.currentRuling(request.disputeID) == uint(RulingOption.Accept) && _side == Party.Challenger) ||
                (arbitrator.currentRuling(request.disputeID) == uint(RulingOption.Refuse) && _side == Party.Requester)) {
                // Beneficiary is the losing side.
                require(
                    now - appealPeriodStart < (appealPeriodEnd - appealPeriodStart) / 2, // First half of appeal period.
                    "Appeal period for funding the losing side ended."
                );
            } else if ((arbitrator.currentRuling(request.disputeID) == uint(RulingOption.Accept) && _side == Party.Requester) ||
                (arbitrator.currentRuling(request.disputeID) == uint(RulingOption.Refuse) && _side == Party.Challenger)) {
                // Beneficiary is the winning side.
                // If in the first half of the appeal period, update the old total cost to the winner.
                // This is required to calculate the amount the winner has to pay when governance changes are made in the second half of the appeal period.
                if (now - appealPeriodStart < (appealPeriodEnd - appealPeriodStart) / 2) // First half of appeal period.
                    round.oldWinnerTotalCost = round.requiredForSide[uint(_side)];
            }
        }

        // Raise appeal if both sides are fully funded.
        if (round.paidFees[uint(Party.Requester)] >= round.requiredForSide[uint(Party.Requester)] &&
            round.paidFees[uint(Party.Challenger)] >= round.requiredForSide[uint(Party.Challenger)]) {

            arbitrator.appeal.value(
                arbitrator.appealCost(request.disputeID, arbitratorExtraData)
            )(request.disputeID, arbitratorExtraData);
            round.appealed = true;
            request.feeRewards -= arbitrator.appealCost(request.disputeID, arbitratorExtraData);

            emit TokenStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                _tokenID,
                tokens[_tokenID].status,
                request.disputed
            );
        }
    }

    /** @dev Add only enough funds to fund the latest round of a dispute. Refunds the rest to the caller.
     *  @param _tokenID The tokenID of the token with the request to execute.
     *  @param _side The recipient of the contribution.
     */
    function fundLatestRound(bytes32 _tokenID, Party _side) external payable {
        require(
            _side == Party.Requester || _side == Party.Challenger,
            "Side must be either the requester or challenger."
        );
        Token storage token = tokens[_tokenID];
        require(
            token.status == TokenStatus.RegistrationRequested || token.status == TokenStatus.ClearingRequested,
            "Token does not have any pending requests."
        );
        Request storage request = token.requests[token.requests.length - 1];

        // Check if the contribution is within time restrictions, if there are any.
        if(!request.disputed && request.challengerDepositTime > 0) { // In the arbitration fees funding period of the first round.
            require(
                now - request.challengerDepositTime < arbitrationFeesWaitingTime,
                "The arbitration fees funding period of the first round has already passed."
            );
        } else { // Later round.
            (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(request.disputeID);
            if(appealPeriodEnd > appealPeriodStart) {
                // Appeal period is known. Contributions are time restricted depending on whether the beneficiary is the loser.
                Party loser;
                if(RulingOption(arbitrator.currentRuling(request.disputeID)) == RulingOption.Refuse)
                    loser = Party.Requester;
                else
                    loser = Party.Challenger;

                // The losing side must fully fund in the first half of the appeal period if it is known.
                if(_side == loser)
                    require(
                        now - appealPeriodStart < (appealPeriodEnd - appealPeriodStart) / 2,
                        "Appeal period for funding the losing side ended."
                    );
                else
                    require(now < appealPeriodEnd, "Appeal period ended."); // Winner can only receive contributions in the appeal period.
            }
        }

        // Calculate the amount of fees still required.
        Round storage round = request.rounds[request.rounds.length - 1];
        round.requiredForSide = calculateRequiredForSide(request.disputeID, round.oldWinnerTotalCost);

        // Take only the necessary ETH to fund the latest round and add it to the pot.
        uint contribution;
        uint remainingETH = msg.value;
        (contribution, remainingETH) = calculateContribution(remainingETH, amountStillRequired);
        request.pot[uint(_side)] += contribution;
        request.contributions[msg.sender][uint(_side)] += contribution;
        if (contribution > 0)
            emit Contribution(_tokenID, msg.sender, _side, contribution);

        // Fund challenger side from his pot.
        uint amountStillRequired = round.requiredForSide[uint(Party.Challenger)] - round.paidFees[uint(Party.Challenger)];
        (contribution, request.pot[uint(Party.Challenger)]) = calculateContribution(
            request.pot[uint(Party.Challenger)],
            amountStillRequired
        );
        round.paidFees[uint(Party.Challenger)] += contribution;
        request.feeRewards += contribution;

        // Fund requester side from his pot.
        amountStillRequired = round.requiredForSide[uint(Party.Requester)] - round.paidFees[uint(Party.Requester)];
        (contribution, request.pot[uint(Party.Requester)]) = calculateContribution(
            request.pot[uint(Party.Requester)],
            amountStillRequired
        );
        round.paidFees[uint(Party.Requester)] += contribution;
        request.feeRewards += contribution;

        // Raise dispute or appeal if both sides are fully funded.
        if (round.paidFees[uint(Party.Requester)] >= round.paidFees[uint(Party.Requester)] &&
            round.paidFees[uint(Party.Challenger)] >= round.paidFees[uint(Party.Challenger)]) {

            uint cost = !request.disputed
                ? arbitrator.arbitrationCost(arbitratorExtraData)
                : arbitrator.appealCost(request.disputeID, arbitratorExtraData);

            if(!request.disputed) {
                // First round, raise dispute.
                request.disputeID = arbitrator.createDispute.value(cost)(2, arbitratorExtraData);
                disputeIDToTokenID[request.disputeID] = _tokenID;
                request.disputed = true;
            } else {
                // Later round, raise an appeal.
                arbitrator.appeal.value(cost)(request.disputeID, arbitratorExtraData);
                round.appealed = true;
            }

            request.rounds.length++;
            request.feeRewards -= cost;

            emit TokenStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                _tokenID,
                token.status,
                request.disputed
            );
        }
    }

    /** @dev Reimburses caller's contributions if no disputes were raised or reimburses contributions and withdraws the rewards proportional to the contribtutions made to the winner of a dispute.
     *  @param _tokenID The ID of the token.
     *  @param _request The request from which to withdraw.
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
            Party loser;
            if(RulingOption(arbitrator.currentRuling(request.disputeID)) == RulingOption.Accept) {
                winner = Party.Requester;
                loser = Party.Challenger;
            } else {
                winner = Party.Challenger;
                loser = Party.Requester;
            }

            // Take rewards for funding the winner.
            uint share = request.contributions[msg.sender][uint(winner)] * MULTIPLIER_PRECISION / request.pot[uint(winner)];
            reward = (share * request.feeRewards) / MULTIPLIER_PRECISION;
            request.contributions[msg.sender][uint(winner)] = 0;

            // Also take unused prefunds to the loser.
            share = request.contributions[msg.sender][uint(loser)] * MULTIPLIER_PRECISION / request.pot[uint(loser)];
            reward += (share * request.pot[uint(loser)]) / MULTIPLIER_PRECISION;
            request.contributions[msg.sender][uint(loser)] = 0;
        }

        msg.sender.transfer(reward);
        emit RewardWithdrawal(_tokenID, _request, msg.sender, reward);
    }

    /** @dev Execute a request after the time for challenging it has passed. Can be called by anyone.
     *  @param _tokenID The id of the token with the request to execute.
     */
    function executeRequest(bytes32 _tokenID) external {
        Token storage token = tokens[_tokenID];
        Request storage request = token.requests[token.requests.length - 1];
        require(now - request.submissionTime > challengePeriodDuration, "The time to challenge has not passed yet.");
        require(!request.disputed, "The specified token is disputed.");
        require(request.challengerDepositTime == 0, "Only callable if no one contests the request.");

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
            false
        );
    }


    /** @dev Rule in favor of party that paid more fees if not enough was raised to create a dispute.
     *  @param _tokenID The ID of the token with the request to timeout.
     */
    function feeTimeoutFirstRound(bytes32 _tokenID) external {
        Token storage token = tokens[_tokenID];
        Request storage request = token.requests[token.requests.length - 1];
        Round storage round = request.rounds[request.rounds.length - 1];
        require(!request.disputed, "The request cannot be disputed.");
        require(request.challengerDepositTime > 0, "The request should have both parties deposits.");
        require(
            now - request.challengerDepositTime > arbitrationFeesWaitingTime,
            "There is still time to place a contribution."
        );

        // Failed to fund first round.
        // Rule in favor of requester if he paid more or the same amount of the challenger. Rule in favor of challenger otherwise.
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
     *  Overrides parent function to account for the situation where the winner loses a case due to paying less appeal fees than expected.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function rule(uint _disputeID, uint _ruling) public onlyArbitrator {
        emit Ruling(Arbitrator(msg.sender),_disputeID,_ruling);
        if(_ruling == uint(RulingOption.Other) || round.paidFees[uint(loser)] < round.requiredForSide[uint(loser)]) {
            // Respect ruling if there isn't a winner or loser or if the loser did not fully fund his side of an appeal.
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
        }
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

    /** @dev Changes the duration of the challenge period.
     *  @param _challengePeriodDuration The new duration of the challenge period.
     */
    function changeTimeToChallenge(uint _challengePeriodDuration) external onlyGovernor {
        challengePeriodDuration = _challengePeriodDuration;
    }

    /** @dev Changes the required deposit required to place or challenge a request.
     *  @param _challengeReward The new amount of wei required to place or challenge a request.
     */
    function changeChallengeReward(uint _challengeReward) external onlyGovernor {
        challengeReward = _challengeReward;
    }

    /** @dev Changes the governor of the token² curated list.
     *  @param _governor The address of the new governor.
     */
    function changeGovernor(address _governor) external onlyGovernor {
        governor = _governor;
    }

    /** @dev Changes duration of the arbitration fees funding period.
     *  @param _arbitrationFeesWaitingTime The new duration of the arbitration fees funding period in seconds.
     */
    function changeArbitrationFeesWaitingTime(uint _arbitrationFeesWaitingTime) external onlyGovernor {
        arbitrationFeesWaitingTime = _arbitrationFeesWaitingTime;
    }

    /** @dev Changes the percentage of arbitration fees that must be paid as fee stake by parties when there wasn't a winner or loser in the previous round.
     *  @param _sharedStakeMultiplier The new percentage of arbitration fees that must be paid as fee stake with 2 digits precision (e.g. a value of 1000 will result in 10% of the arbitration fees required in that round).
     */
    function changeSharedStakeMultiplier(uint _sharedStakeMultiplier) external onlyGovernor {
        sharedStakeMultiplier = _sharedStakeMultiplier;
    }

    /** @dev Changes the percentage of arbitration fees that must be paid as fee stake by winner of the previous round.
     *  @param _winnerStakeMultiplier The new percentage of arbitration fees that must be paid as fee stake with 2 digits precision (e.g. a value of 5000 will result in 50% of the arbitration fees required in that round).
     */
    function changeWinnerStakeMultiplier(uint _winnerStakeMultiplier) external onlyGovernor {
        winnerStakeMultiplier = _winnerStakeMultiplier;
    }

    /** @dev Changes the percentage of arbitration fees that must be paid as fee stake by party that lost the previous round.
     *  @param _loserStakeMultiplier The new percentage of arbitration fees that must be paid as fee stake with 2 digits precision (e.g. a value of 10000 will result in 100% of the arbitration fees required in that round).
     */
    function changeLoserStakeMultiplier(uint _loserStakeMultiplier) external onlyGovernor {
        loserStakeMultiplier = _loserStakeMultiplier;
    }

    /* Public Views */

    /** @dev Return true if the token is on the list.
     *  @param _tokenID The ID of the token to be queried.
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
            false
        );
    }

    /** @dev Returns the amount that must be paid by each side to fully fund a dispute or appeal.
     *  @param _disputeID The dispute ID to be queried.
     *  @param _oldWinnerTotalCost The total amount of fees the winner had to pay before a governance change in the second half of an appeal period. If the appeal period is not known or the arbitrator does not support appeal period, this parameter is unused.
     *  @return The amount of ETH required for each side.
     */
    function calculateRequiredForSide(uint _disputeID, uint _oldWinnerTotalCost)
        internal
        view
        returns(uint[3] requiredForSide)
    {
        bytes32 tokenID = disputeIDToTokenID[_disputeID];
        Token storage token = tokens[tokenID];
        Request storage request = token.requests[token.requests.length - 1];

        if(!request.disputed) { // First round of a dispute.
            uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
            requiredForSide[uint(Party.Requester)] =
                arbitrationCost + (arbitrationCost * sharedStakeMultiplier) / MULTIPLIER_PRECISION;
            requiredForSide[uint(Party.Challenger)] =
                arbitrationCost + (arbitrationCost * sharedStakeMultiplier) / MULTIPLIER_PRECISION;
            return;
        }

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

            (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(_disputeID);
            if(appealPeriodEnd > appealPeriodStart){ // The appeal period is known.
                // Fee changes in the second half of the appeal period may create a difference between the amount paid by the winner and the amount paid by the loser.
                // To deal with this case, the amount that must be paid by the winner is max(old appeal cost + old winner stake, new appeal cost).
                if (now - appealPeriodStart > (appealPeriodEnd - appealPeriodStart) / 2) // In first half of appeal period.
                requiredForSide[uint(winner)] = _oldWinnerTotalCost > appealCost ? _oldWinnerTotalCost : appealCost;

                // Set the required amount for the loser.
                // The required amount for the loser must only be affected by governance/fee changes made in the first half of the appeal period. Otherwise, increases would cause the loser to lose the case due to being underfunded.
                if (now - appealPeriodStart < (appealPeriodEnd - appealPeriodStart) / 2) // In first half of appeal period.
                    requiredForSide[uint(loser)] = appealCost + (appealCost * loserStakeMultiplier) / MULTIPLIER_PRECISION;
            } else // Arbitration period is not known or the arbitrator does not support appeal period.
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
     *  @param _tokenID The ID of the queried token.
     *  @return The token information.
     */
    function getTokenInfo(bytes32 _tokenID)
        external
        view
        returns (
            string name,
            string ticker,
            address addr,
            string URI,
            string networkID,
            TokenStatus status,
            uint numberOfRequests
        )
    {
        Token storage token = tokens[_tokenID];
        return (
            token.name,
            token.ticker,
            token.addr,
            token.URI,
            token.networkID,
            token.status,
            token.requests.length
        );
    }

    /** @dev Gets information on a request made for a token.
     *  @param _tokenID The ID of the queried token.
     *  @param _request The request to be queried.
     *  @return The information.
     */
    function getRequestInfo(bytes32 _tokenID, uint _request)
        external
        view
        returns (
            bool disputed,
            uint disputeID,
            uint submissionTime,
            uint challengeRewardBalance,
            uint challengerDepositTime,
            uint balance,
            bool resolved,
            address[3] parties,
            uint[3] pot,
            uint numberOfRounds
        )
    {
        Token storage token = tokens[_tokenID];
        Request storage request = token.requests[_request];
        return (
            request.disputed,
            request.disputeID,
            request.submissionTime,
            request.challengeRewardBalance,
            request.challengerDepositTime,
            request.feeRewards,
            request.resolved,
            request.parties,
            request.pot,
            request.rounds.length
        );
    }

    /** @dev Gets the information on a round of a request.
     *  @param _tokenID The ID of the queried token.
     *  @param _request The request to be queried.
     *  @param _round The round to be queried.
     *  @return The information.
     */
    function getRoundInfo(bytes32 _tokenID, uint _request, uint _round)
        external
        view
        returns (
            bool appealed,
            uint oldWinnerTotalCost,
            uint[3] paidFees,
            uint[3] requiredForSide
        )
    {
        Token storage token = tokens[_tokenID];
        Request storage request = token.requests[_request];
        Round storage round = request.rounds[_round];
        return (
            round.appealed,
            round.oldWinnerTotalCost,
            round.paidFees,
            round.requiredForSide
        );
    }

    /** @dev Gets the contributions made by a party for a given request.
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

    /** @dev Return the numbers of tokens that were submitted. Includes tokens that never made it to the list or were later removed.
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
        uint cursorIndex;
        values = new bytes32[](_count);
        uint index = 0;

        if (_cursor == 0)
            cursorIndex = 0;
        else {
            for (uint j = 0; j < tokensList.length; j++) {
                if (tokensList[j] == _cursor) {
                    cursorIndex = j;
                    break;
                }
            }
            require(cursorIndex != 0, "The cursor is invalid.");
        }

        for (
                uint i = cursorIndex == 0 ? (_oldestFirst ? 0 : 1) : (_oldestFirst ? cursorIndex + 1 : tokensList.length - cursorIndex + 1);
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
                if (index < _count) {
                    values[index] = tokensList[_oldestFirst ? i : tokensList.length - i];
                    index++;
                } else {
                    hasMore = true;
                    break;
                }
            }
        }
    }
}
