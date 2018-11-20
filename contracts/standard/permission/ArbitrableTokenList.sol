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
        Requester,
        Challenger
    }

    /* Structs */

    struct Token {
        TokenStatus status;
        string name;
        address addr;
        string ticker;
        uint lastAction; // Time of the last action.
        uint challengeRewardBalance; // The amount of funds placed at stake for this token. Does not include arbitrationFees.
        uint challengeReward; // The challengeReward of the token for the round.
        bool disputed; // True if a dispute is taking place.
        uint disputeID; // ID of the dispute, if any.
        uint firstContributionTime; // The time the first contribution was made at.
        uint arbitrationFeesWaitingTime; // The waiting time for fees for each round.
        uint timeToChallenge; // The time to challenge for each round.

        // Positions map with the Party enum, 1 for requester and 2 for challenger. Position 0 is Party.None, not used.
        address[3] parties; // Address of requester and challenger, if any.
        uint[3] paidFees; // The amount of fees paid by each side if there, if any.
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
        Token storage token = tokens[_tokenID];
        require(msg.value >= challengeReward, "Not enough ETH.");
        require(!token.disputed, "Token must not be disputed for submitting status change request");

        if(token.lastAction == 0) { // Initial token registration
            token.name = _name;
            token.ticker = _ticker;
            token.addr = _addr;
        }

        if (token.status == TokenStatus.Absent)
            token.status = TokenStatus.RegistrationRequested;
        else if (token.status == TokenStatus.Registered)
            token.status = TokenStatus.ClearingRequested;
        else
            revert("Token in wrong status for request.");

        token.challengeRewardBalance = msg.value;
        token.lastAction = now;
        token.parties[uint(Party.Requester)] = msg.sender;

        token.challengeReward = challengeReward;
        token.arbitrationFeesWaitingTime = arbitrationFeesWaitingTime;
        token.timeToChallenge = timeToChallenge;

        emit TokenStatusChange(msg.sender, address(0), _tokenID, token.status, false);
    }

    /** @dev Fully fund the challenger side of the dispute.
     *  @param _tokenID The tokenID of the token with the request to execute.
     */
    function fullyFundChallenger(bytes32 _tokenID) external payable {
        Token storage token = tokens[_tokenID];
        require(token.lastAction == 0, "The specified token does not exist.");
        require(!token.disputed, "The token is already disputed");
        require(
            token.status == TokenStatus.RegistrationRequested || token.status == TokenStatus.ClearingRequested,
            "Token does not have any pending requests"
        );
        require(
            msg.value == token.challengeReward + arbitrator.arbitrationCost(arbitratorExtraData),
            "Not enough ETH."
        );
        require(token.lastAction + timeToChallenge < now, "The time to challenge has already passed.");

        token.challengeRewardBalance = token.challengeReward;
        token.paidFees[uint(Party.Challenger)] = token.challengeReward;
        token.parties[uint(Party.Challenger)]= msg.sender;
        token.lastAction = now;
    }

    /** @dev Fully fund the requester side of the dispute.
     *  @param _tokenID The tokenID of the token with the request to execute.
     */
    function fullyFundRequester(bytes32 _tokenID) public payable {
        require(msg.value == arbitrationCost, "Not enough ETH.");
        Token storage token = tokens[_tokenID];
        require(token.lastAction == 0, "The specified token does not exist.");
        require(token.challengeRewardBalance == token.challengeReward * 2, "Both sides must have staked ETH.");
        require(!token.disputed, "The token is already disputed");
        require(
            token.status == TokenStatus.RegistrationRequested || token.status == TokenStatus.ClearingRequested,
            "Token does not have any pending requests"
        );
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        token.paidFees[uint(Party.Requester)] += msg.value;
        token.lastAction = now;

        if (token.paidFees[uint(Party.Requester)] >= arbitrationCost && token.paidFees[uint(Party.Challenger)] >= arbitrationCost) {
            token.disputeID = arbitrator.createDispute.value(arbitrationCost)(2, arbitratorExtraData);
            disputeIDToTokenID[token.disputeID] = _tokenID;
            token.disputed = true;
        }
    }

    /** @dev Execute a request after the time for challenging it has passed. Can be called by anyone.
     *  @param _tokenID The tokenID of the token with the request to execute.
     */
    function executeRequest(bytes32 _tokenID) external {
        Token storage token = tokens[_tokenID];
        require(token.lastAction + timeToChallenge > now, "The time to challenge has not passed yet.");
        require(!token.disputed, "The specified agreement is disputed.");

        if (token.status == TokenStatus.RegistrationRequested)
            token.status = TokenStatus.Registered;
        else if (token.status == TokenStatus.ClearingRequested)
            token.status = TokenStatus.Absent;
        else
            revert("Token in wrong status for executing request.");

        token.lastAction = now;
        token.parties[uint(Party.Requester)].send(token.challengeRewardBalance); // Deliberate use of send in order to not block the contract in case of reverting fallback.
        token.challengeRewardBalance = 0;

        emit TokenStatusChange(token.parties[uint(Party.Requester)], address(0), _tokenID, token.status, false);
    }

    /** @dev Submit a reference to evidence. EVENT.
     *  @param _evidence A link to an evidence using its URI.
     */
    function submitEvidence(bytes32 _tokenID, string _evidence) public {
        Token storage token = tokens[_tokenID];
        require(token.disputed, "The token is not disputed");
        emit Evidence(arbitrator, token.disputeID, msg.sender, _evidence);
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
    function changeStake(uint _stake) public onlyGovernor {
        stake = _stake;
    }

    /** @dev Changes the `arbitrationFeesWaitingTime` storage variable.
     *  @param _arbitrationFeesWaitingTime The new `_arbitrationFeesWaitingTime` storage variable.
     */
    function changeArbitrationFeesWaitingTime(uint _arbitrationFeesWaitingTime) external onlyGovernor {
        arbitrationFeesWaitingTime = _arbitrationFeesWaitingTime;
    }

    /* Public Views */

    /** @dev Return true if the token is allowed. We consider the token to be in the list if its status is contested and it has not won a dispute previously.
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
        Party winner;
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

        // Send token balance and reimburse fees.
        // Deliberate use of send in order to not block the contract in case of reverting fallback.
        if(winner == Party.Challenger)
            token.parties[uint(Party.Challenger)].send(token.challengeReward + token.paidFees[uint(Party.Challenger)]);
        else if(winner == Party.Requester)
            token.parties[uint(Party.Requester)].send(token.challengeReward + token.paidFees[uint(Party.Requester)]);
        else {
            // Reimburse parties.
            token.parties[uint(Party.Requester)].send(token.challengeReward + token.paidFees[uint(Party.Requester)]);
            token.parties[uint(Party.Challenger)].send(token.challengeReward + token.paidFees[uint(Party.Challenger)]);
        }

        token.lastAction = now;
        token.disputed = false;
        token.challengeRewardBalance = 0;
        token.paidFees[uint(Party.Requester)] = 0;
        token.paidFees[uint(Party.Challenger)] = 0;
        token.challengeReward = 0; // Reset challengeReward once a dispute is resolved.

        emit TokenStatusChange(token.parties[uint(Party.Requester)], token.parties[uint(Party.Challenger)], tokenID, token.status, token.disputed);
    }

    /* Interface Views */

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

            if (token.disputed) disputed++;
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
    function queryTokens(
        bytes32 _cursor,
        uint _count,
        bool[8] _filter,
        bool _oldestFirst
    ) external view returns (bytes32[] values, bool hasMore) {
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
            if (
                    /* solium-disable operator-whitespace */
                    (_filter[0] && token.status == TokenStatus.Absent) ||
                    (_filter[1] && token.status == TokenStatus.Registered) ||
                    (_filter[2] && token.status == TokenStatus.RegistrationRequested && !token.disputed) ||
                    (_filter[3] && token.status == TokenStatus.ClearingRequested && !token.disputed) ||
                    (_filter[4] && token.status == TokenStatus.RegistrationRequested && token.disputed) ||
                    (_filter[5] && token.status == TokenStatus.ClearingRequested && token.disputed) ||
                    (_filter[6] && token.parties[uint(Party.Requester)]== msg.sender) || // My Submissions.
                    (_filter[7] && token.parties[uint(Party.Challenger)]== msg.sender) // My Challenges.
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