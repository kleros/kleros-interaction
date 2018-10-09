/**
 *  @title Arbitrable Token List
 *  @author Matheus Alencar - <mtsalenc@gmail.com>
 */

pragma solidity ^0.4.24;

import "../../../permission/ArbitrablePermissionList.sol";
import "../fee/MultiPartyInsurableFees.sol";
import "../agreement/MultiPartyAgreements.sol";
import "../composed/MultiPartyInsurableArbitrableAgreementsBase.sol";


/**
 *  @title Arbitrable Token List
 *  This is a T2CL list for tokens. Token submissions can be submitted and challenged.
 */
contract ArbitrableTokenList is MultiPartyInsurableArbitrableAgreementsBase {

    /* Enums */

    enum ItemStatus {
        Absent, // The item has never been submitted.
        Cleared, // The item has been submitted and the dispute resolution process determined it should not be added or a clearing request has been submitted and not contested.
        Resubmitted, // The item has been cleared but someone has resubmitted it.
        Registered, // The item has been submitted and the dispute resolution process determined it should be added or the submission was never contested.
        Submitted, // The item has been submitted.
        ClearingRequested, // The item is registered, but someone has requested to remove it.
        PreventiveClearingRequested // The item has never been registered, but someone asked to clear it preemptively to avoid it being shown as not registered during the dispute resolution process.
    }

    /* Structs */

    struct Item {
        ItemStatus status; // Status of the item.
        uint lastAction; // Time of the last action.
        address submitter; // Address of the submitter of the item status change request, if any.
        address challenger; // Address of the challenger, if any.
        // The total amount of funds to be given to the winner of a potential dispute. Includes challengeReward and reimbursement of arbitration fees.
        uint balance;
    }

    /* Events */

    /**
     *  @dev Called when the item's status changes or when it is contested/resolved.
     *  @param submitter Address of the submitter, if any.
     *  @param challenger Address of the challenger, if any.
     *  @param value The value of the item.
     *  @param status The status of the item.
     *  @param disputed The item is being disputed.
     */
    event ItemStatusChange(
        address indexed submitter,
        address indexed challenger,
        bytes32 indexed value,
        ItemStatus status,
        bool disputed
    );

    /* Storage */

    // Settings
    bool public blacklist; // True if the list should function as a blacklist, false if it should function as a whitelist.
    bool public appendOnly; // True if the list should be append only.
    bool public rechallengePossible; // True if items winning their disputes can be challenged again.
    uint public challengeReward; // The challengeReward to put to submit/clear/challenge an item in addition of arbitration fees.
    uint public timeToChallenge; // The time before which an action is executable if not challenged.

    // Ruling Options
    uint8 constant REGISTER = 1;
    uint8 constant CLEAR = 2;

    // Items
    mapping(bytes32 => Item) public items;
    mapping(uint => bytes32) public disputeIDToItem;
    bytes32[] public itemsList;

    // Agreement and Item extension
    mapping(bytes32 => uint) public itemIDToAgreementCount;
    mapping(bytes32 => bytes32) public agreementIDtoItemID;

    /* Constructor */

    /**
     *  @dev Constructs the arbitrable permission list and sets the type.
     *  @param _arbitrator The chosen arbitrator.
     *  @param _arbitratorExtraData Extra data for the arbitrator contract.
     *  @param _metaEvidence The URL of the meta evidence object.
     *  @param _blacklist True if the list should function as a blacklist, false if it should function as a whitelist.
     *  @param _appendOnly True if the list should be append only.
     *  @param _rechallengePossible True if it is possible to challenge again a submission which has won a dispute.
     *  @param _challengeReward The amount in Weis of deposit required for a submission or a challenge in addition of the arbitration fees.
     *  @param _timeToChallenge The time in seconds, other parties have to challenge.
     *  @param _feeGovernor The fee governor of this contract.
     *  @param _stake The stake parameter for sharing fees.
     */
    constructor(
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        string _metaEvidence,
        bool _blacklist,
        bool _appendOnly,
        bool _rechallengePossible,
        uint _challengeReward,
        uint _timeToChallenge,
        address _feeGovernor,
        uint _stake
    ) public MultiPartyInsurableArbitrableAgreementsBase(_arbitrator, _arbitratorExtraData, _feeGovernor, _stake){
        emit MetaEvidence(0, _metaEvidence);
        blacklist = _blacklist;
        appendOnly = _appendOnly;
        rechallengePossible = _rechallengePossible;
        challengeReward = _challengeReward;
        timeToChallenge = _timeToChallenge;
    }

    /* Public */

    /**
     *  @dev Request for an item to be registered.
     *  @param _value The value of the item to register.
     *  @param _metaEvidence The meta evidence for the potential dispute.
     *  @param _arbitrationFeesWaitingTime The maximum time to wait for arbitration fees if the dispute is raised.
     *  @param _arbitrator The arbitrator to use for the potential dispute.
     */
    function requestRegistration(
        bytes32 _value,
        string _metaEvidence,
        uint _arbitrationFeesWaitingTime,
        Arbitrator _arbitrator
    ) public payable {
        Item storage item = items[_value];
        uint arbitratorCost = arbitrator.arbitrationCost(arbitratorExtraData);
        require(msg.value >= challengeReward + arbitratorCost, "Not enough ETH.");

        if (item.status == ItemStatus.Absent)
            item.status = ItemStatus.Submitted;
        else if (item.status == ItemStatus.Cleared)
            item.status = ItemStatus.Resubmitted;
        else
            revert("Item in wrong status for registration."); // If the item is neither Absent nor Cleared, it is not possible to request registering it.

        if (item.lastAction == 0) {
            itemsList.push(_value);
        }

        item.submitter = msg.sender;
        item.balance += msg.value;
        item.lastAction = now;

        address[] memory _parties = new address[](1);
        _parties[0] = msg.sender;

        _createAgreement(
            _value,
            _metaEvidence,
            _parties,
            2,
            new bytes(0),
            _arbitrationFeesWaitingTime,
            _arbitrator
        );

        bool disputed = agreements[latestAgreementId(_value)].disputed;

        emit ItemStatusChange(item.submitter, item.challenger, _value, item.status, disputed);
    }

    /**
     *  @dev Request an item to be cleared.
     *  @param _value The value of the item to clear.
     *  @param _metaEvidence The meta evidence for the potential dispute.
     *  @param _arbitrationFeesWaitingTime The maximum time to wait for arbitration fees if the dispute is raised.
     *  @param _arbitrator The arbitrator to use for the potential dispute.
     */
    function requestClearing(
        bytes32 _value,
        string _metaEvidence,
        uint _arbitrationFeesWaitingTime,
        Arbitrator _arbitrator
    ) public payable {
        Item storage item = items[_value];
        uint arbitratorCost = arbitrator.arbitrationCost(arbitratorExtraData);
        require(!appendOnly, "List is append only.");
        require(msg.value >= challengeReward + arbitratorCost, "Not enough ETH.");

        if (item.status == ItemStatus.Registered)
            item.status = ItemStatus.ClearingRequested;
        else if (item.status == ItemStatus.Absent)
            item.status = ItemStatus.PreventiveClearingRequested;
        else
            revert("Item in wrong status for clearing."); // If the item is neither Registered nor Absent, it is not possible to request clearing it.

        if (item.lastAction == 0) {
            itemsList.push(_value);
        }

        item.submitter = msg.sender;
        item.balance += msg.value;
        item.lastAction = now;

        address[] memory _parties = new address[](1);
        _parties[0] = msg.sender;

        _createAgreement(
            _value,
            _metaEvidence,
            _parties,
            2,
            new bytes(0),
            _arbitrationFeesWaitingTime,
            _arbitrator
        );

        bool disputed = agreements[latestAgreementId(_value)].disputed;

        emit ItemStatusChange(item.submitter, item.challenger, _value, item.status, disputed);
    }

    /** @dev Overrides parent to save and check information specific to Arbitrable Token List.
     *  For calls that initiate a dispute, msg.value must also include `challengeReward`.
     *  @param _agreementID The ID of the agreement.
     *  @param _side The side. 0 for the side that lost the previous round, if any, and 1 for the one that won.
     */
    function fundDispute(bytes32 _agreementID, uint _side) public payable {
        Agreement storage agreement = agreements[_agreementID];
        PaidFees storage _paidFees = paidFees[_agreementID];
        require(agreement.creator != address(0), "The specified agreement does not exist.");
        require(!agreement.executed, "You cannot fund disputes for executed agreements.");
        require(
            !agreement.disputed || agreement.arbitrator.disputeStatus(agreement.disputeID) == Arbitrator.DisputeStatus.Appealable,
            "The agreement is already disputed and is not appealable."
        );
        require(_side <= 1, "There are only two sides.");
        require(msg.value > 0, "The value of the contribution cannot be zero.");

        // Prepare storage for first call.
        if (_paidFees.firstContributionTime == 0) {
            _paidFees.firstContributionTime = now;
            _paidFees.ruling.push(0);
            _paidFees.stake.push(stake);
            _paidFees.totalValue.push(0);
            _paidFees.totalContributedPerSide.push([0, 0]);
            _paidFees.loserFullyFunded.push(false);
            _paidFees.contributions.length++;
        } else { // Reset cache
            fundDisputeCache.cost = 0;
            fundDisputeCache.appealing = false;
            (fundDisputeCache.appealPeriodStart, fundDisputeCache.appealPeriodEnd) = (0, 0);
            fundDisputeCache.appealPeriodSupported = false;
            fundDisputeCache.requiredValueForSide = 0;
            fundDisputeCache.expectedValue = 0;
            fundDisputeCache.stillRequiredValueForSide = 0;
            fundDisputeCache.keptValue = 0;
            fundDisputeCache.refundedValue = 0;
        }

        // Check time outs and requirements.
        if (_paidFees.stake.length == 1) { // First round.
            require(msg.value >= challengeReward, "Initiating a challenge requires placing value at stake"); // Account attempting to raise a dispute must place value at stake.
            fundDisputeCache.cost = agreement.arbitrator.arbitrationCost(agreement.extraData);

            // Arbitration fees time out.
            if (now - _paidFees.firstContributionTime > agreement.arbitrationFeesWaitingTime) {
                executeAgreementRuling(_agreementID, 0);
                return;
            }
        } else { // Appeal.
            fundDisputeCache.cost = agreement.arbitrator.appealCost(agreement.disputeID, agreement.extraData);

            fundDisputeCache.appealing = true;
            (fundDisputeCache.appealPeriodStart, fundDisputeCache.appealPeriodEnd) = agreement.arbitrator.appealPeriod(agreement.disputeID);
            fundDisputeCache.appealPeriodSupported = fundDisputeCache.appealPeriodStart != 0 && fundDisputeCache.appealPeriodEnd != 0;
            if (fundDisputeCache.appealPeriodSupported) {
                if (now < fundDisputeCache.appealPeriodStart + ((fundDisputeCache.appealPeriodEnd - fundDisputeCache.appealPeriodStart) / 2)) // In the first half of the appeal period.
                    require(_side == 0, "It is the losing side's turn to fund the appeal.");
                else // In the second half of the appeal period.
                    require(
                        _side == 1 && _paidFees.loserFullyFunded[_paidFees.loserFullyFunded.length - 1],
                        "It is the winning side's turn to fund the appeal, only if the losing side already fully funded it."
                    );
            } else require(msg.value >= fundDisputeCache.cost, "Fees must be paid in full if the arbitrator does not support `appealPeriod`.");
        }
    }

    /**
     *  @dev Execute a request after the time for challenging it has passed. Can be called by anyone.
     *  @param _value The value of the item with the request to execute.
     */
    function executeRequest(bytes32 _value) public {
        Item storage item = items[_value];
        bytes32 agreementID = latestAgreementId(_value);
        Agreement storage latestAgreement = agreements[agreementID];
        require(now - item.lastAction >= timeToChallenge, "The time to challenge has not passed yet.");
        require(!latestAgreement.disputed, "The item is still disputed.");
        require(latestAgreement.creator != address(0), "The specified agreement does not exist.");
        require(!latestAgreement.executed, "The specified agreement has already been executed.");
        require(!latestAgreement.disputed, "The specified agreement is disputed.");
        latestAgreement.executed = true;

        if (item.status == ItemStatus.Resubmitted || item.status == ItemStatus.Submitted)
            item.status = ItemStatus.Registered;
        else if (item.status == ItemStatus.ClearingRequested || item.status == ItemStatus.PreventiveClearingRequested)
            item.status = ItemStatus.Cleared;
        else
            revert("Item in wrong status for executing request.");

        item.submitter.send(item.balance); // Deliberate use of send in order to not block the contract in case of reverting fallback.
        item.balance = 0;

        emit ItemStatusChange(item.submitter, item.challenger, _value, item.status, latestAgreement.disputed);
    }

    /* Public Views */

    /**
     *  @dev Returns the latest agreement for an item
     *  @param _value The value of the item to check.
     *  @return The latest agreementID
     */
    function latestAgreementId(bytes32 _value) public view returns (bytes32) {
        return keccak256(abi.encodePacked(_value, itemIDToAgreementCount[_value]));
    }

    /**
     *  @dev Return true if the item is allowed.
     *  We consider the item to be in the list if its status is contested and it has not won a dispute previously.
     *  @param _value The value of the item to check.
     *  @return allowed True if the item is allowed, false otherwise.
     */
    function isPermitted(bytes32 _value) public view returns (bool allowed) {
        Item storage item = items[_value];
        Agreement storage latestAgreement = agreements[latestAgreementId(_value)];
        bool _excluded = item.status <= ItemStatus.Resubmitted ||
            (item.status == ItemStatus.PreventiveClearingRequested && !latestAgreement.disputed);
        return blacklist ? _excluded : !_excluded; // Items excluded from blacklist should return true.
    }

    /* Internal */

    /** @dev Extends parent to use counter identify agreements.
     *  @param _value The item id.
     *  @param _metaEvidence The meta evidence of the agreement.
     *  @param _parties The `parties` value of the agreement.
     *  @param _numberOfChoices The `numberOfChoices` value of the agreement.
     *  @param _extraData The `extraData` value of the agreement.
     *  @param _arbitrationFeesWaitingTime The `arbitrationFeesWaitingTime` value of the agreement.
     *  @param _arbitrator The `arbitrator` value of the agreement.
     */
    function _createAgreement(
        bytes32 _value,
        string _metaEvidence,
        address[] _parties,
        uint _numberOfChoices,
        bytes _extraData,
        uint _arbitrationFeesWaitingTime,
        Arbitrator _arbitrator
    ) internal {
        itemIDToAgreementCount[_value]++;
        bytes32 agreementID = keccak256(abi.encodePacked(_value, itemIDToAgreementCount[_value]));
        agreementIDtoItemID[agreementID] = _value;

        super._createAgreement(
            agreementID,
            _metaEvidence,
            _parties,
            _numberOfChoices,
            _extraData,
            _arbitrationFeesWaitingTime,
            _arbitrator
        );
    }

    /** @dev Executes the ruling on the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _ruling The ruling.
     */
    function executeAgreementRuling(bytes32 _agreementID, uint _ruling) internal {
        super.executeAgreementRuling(_agreementID, _ruling);
        uint256 disputeID = agreements[_agreementID].disputeID;
        Item storage item = items[disputeIDToItem[disputeID]];
        Agreement storage latestAgreement = agreements[_agreementID];
        require(latestAgreement.disputed, "The item is not disputed.");

        if (_ruling == REGISTER) {
            if (rechallengePossible && item.status==ItemStatus.Submitted) {
                uint arbitratorCost = arbitrator.arbitrationCost(arbitratorExtraData);
                if (arbitratorCost + challengeReward < item.balance) { // Check that the balance is enough.
                    uint toSend = item.balance - (arbitratorCost + challengeReward);
                    item.submitter.send(toSend); // Keep the arbitration cost and the challengeReward and send the remaining to the submitter.
                    item.balance -= toSend;
                }
            } else {
                if (item.status==ItemStatus.Resubmitted || item.status==ItemStatus.Submitted)
                    item.submitter.send(item.balance); // Deliberate use of send in order to not block the contract in case of reverting fallback.
                else
                    item.challenger.send(item.balance);

                item.status = ItemStatus.Registered;
            }
        } else if (_ruling == CLEAR) {
            if (item.status == ItemStatus.PreventiveClearingRequested || item.status == ItemStatus.ClearingRequested)
                item.submitter.send(item.balance);
            else
                item.challenger.send(item.balance);

            item.status = ItemStatus.Cleared;
        } else { // Split the balance 50-50 and give the item the initial status.
            if (item.status==ItemStatus.Resubmitted)
                item.status = ItemStatus.Cleared;
            else if (item.status==ItemStatus.ClearingRequested)
                item.status = ItemStatus.Registered;
            else
                item.status = ItemStatus.Absent;
            item.submitter.send(item.balance / 2);
            item.challenger.send(item.balance / 2);
        }

        latestAgreement.disputed = false;
        if (rechallengePossible && item.status==ItemStatus.Submitted && _ruling==REGISTER)
            item.lastAction = now; // If the item can be rechallenged, update the time and keep the remaining balance.
        else
            item.balance = 0;

        emit ItemStatusChange(item.submitter, item.challenger, disputeIDToItem[disputeID], item.status, latestAgreement.disputed);
    }

    /* Interface Views */

    /**
     *  @dev Return the number of items in the list.
     *  @return The number of items in the list.
     */
    function itemsCount() public view returns (uint count) {
        count = itemsList.length;
    }

    /**
     *  @dev Return the numbers of items in the list per status.
     *  @return The numbers of items in the list per status.
     */
    function itemsCounts() public view returns (uint pending, uint challenged, uint accepted, uint rejected) {
        for (uint i = 0; i < itemsList.length; i++) {
            Item storage item = items[itemsList[i]];
            Agreement storage latestAgreement = agreements[latestAgreementId(itemsList[i])];
            if (latestAgreement.disputed) challenged++;
            else if (item.status == ItemStatus.Resubmitted || item.status == ItemStatus.Submitted) pending++;
            else if (item.status == ItemStatus.Registered) accepted++;
            else if (item.status == ItemStatus.Cleared) rejected++;
        }
    }

    /**
     *  @dev Return the values of the items the query finds.
     *  This function is O(n) at worst, where n is the number of items. This could exceed the gas limit, therefore this function should only be used for interface display and not by other contracts.
     *  @param _cursor The pagination cursor.
     *  @param _count The number of items to return.
     *  @param _filter The filter to use.
     *  @param _sort The sort order to use.
     *  @return The values of the items found and wether there are more items for the current filter and sort.
     */
    function queryItems(bytes32 _cursor, uint _count, bool[6] _filter, bool _sort) public view returns (bytes32[] values, bool hasMore) {
        uint _cursorIndex;
        values = new bytes32[](_count);
        uint _index = 0;

        if (_cursor == 0)
            _cursorIndex = 0;
        else {
            for (uint j = 0; j < itemsList.length; j++) {
                if (itemsList[j] == _cursor) {
                    _cursorIndex = j;
                    break;
                }
            }
            require(_cursorIndex != 0, "The cursor is invalid.");
        }

        for (
                uint i = _cursorIndex == 0 ? (_sort ? 0 : 1) : (_sort ? _cursorIndex + 1 : itemsList.length - _cursorIndex + 1);
                _sort ? i < itemsList.length : i <= itemsList.length;
                i++
            ) { // Oldest or newest first.
            bytes32 itemID = itemsList[_sort ? i : itemsList.length - i];
            Item storage item = items[itemID];
            bytes32 agreementId = latestAgreementId(itemID);
            Agreement storage latestAgreement = agreements[agreementId];
            if (
                    // solium-disable-next-line operator-whitespace
                    item.status != ItemStatus.Absent && item.status != ItemStatus.PreventiveClearingRequested && (
                    // solium-disable-next-line operator-whitespace
                    (_filter[0] && (item.status == ItemStatus.Resubmitted || item.status == ItemStatus.Submitted)) || // Pending.
                    (_filter[1] && latestAgreement.disputed) || // Challenged.
                    (_filter[2] && item.status == ItemStatus.Registered) || // Accepted.
                    (_filter[3] && item.status == ItemStatus.Cleared) || // Rejected.
                    (_filter[4] && item.submitter == msg.sender) || // My Submissions.
                    (_filter[5] && item.challenger == msg.sender) // My Challenges.
                )
            ) {
                if (_index < _count) {
                    values[_index] = itemsList[_sort ? i : itemsList.length - i];
                    _index++;
                } else {
                    hasMore = true;
                    break;
                }
            }
        }
    }

}
