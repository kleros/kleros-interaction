 /**
 *  @title Arbitrable Permission List
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  This code hasn't undertaken bug bounty programs yet.
 */

pragma solidity ^0.4.23;

import "../arbitration/Arbitrable.sol";
import "./PermissionInterface.sol";

/**
 *  @title Arbitrable Permission List
 *  @dev This is an arbitrator curated registry. Anyone can post an item with a deposit. If no one complains within a defined time period, the item is added to the registry.
 *  Anyone can complain and also post a deposit. If someone does, a dispute is created. The winner of the dispute gets the deposit of the other party and the item is added or removed accordingly.
 *  To make a request, parties have to deposit a stake and the arbitration fees. If the arbitration fees change between the submitter's payment and the challenger's payment, a part of the submitter stake can be used as an arbitration fee deposit.
 *  In case the arbitrator refuses to rule, the item is put in the initial absent status and the balance is split equally between parties.
 */
contract ArbitrablePermissionList is PermissionInterface, Arbitrable {
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
        uint balance; // The total amount of funds to be given to the winner of a potential dispute. Includes stake and reimbursement of arbitration fees.
        bool disputed; // True if a dispute is taking place.
        uint disputeID; // ID of the dispute, if any.
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
    uint public stake; // The stake to put to submit/clear/challenge and item in addition of arbitration fees.
    uint public timeToChallenge; // The time before which an action is executable if not challenged.

    // Ruling Options
    uint8 constant REGISTER = 1;
    uint8 constant CLEAR = 2;

    // Items
    mapping(bytes32 => Item) public items;
    mapping(uint => bytes32) public disputeIDToItem;
    bytes32[] public itemsList;

    /* Constructor */

    /**
     *  @dev Constructs the arbitrable permission list and sets the type.
     *  @param _arbitrator The chosen arbitrator.
     *  @param _arbitratorExtraData Extra data for the arbitrator contract.
     *  @param _metaEvidence The URL of the meta evidence object.
     *  @param _blacklist True if the list should function as a blacklist, false if it should function as a whitelist.
     *  @param _appendOnly True if the list should be append only.
     *  @param _rechallengePossible True if it is possible to challenge again a submission which has won a dispute.
     *  @param _stake The amount in Weis of deposit required for a submission or a challenge in addition of the arbitration fees.
     *  @param _timeToChallenge The time in seconds, other parties have to challenge.
     */
    constructor(
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        string _metaEvidence,
        bool _blacklist,
        bool _appendOnly,
        bool _rechallengePossible,
        uint _stake,
        uint _timeToChallenge) Arbitrable(_arbitrator, _arbitratorExtraData) public {
        emit MetaEvidence(0, _metaEvidence);
        blacklist = _blacklist;
        appendOnly = _appendOnly;
        rechallengePossible = _rechallengePossible;
        stake = _stake;
        timeToChallenge = _timeToChallenge;
    }

    /* Public */

    /**
     *  @dev Request for an item to be registered.
     *  @param _value The value of the item to register.
     */
    function requestRegistration(bytes32 _value) public payable {
        Item storage item = items[_value];
        uint arbitratorCost = arbitrator.arbitrationCost(arbitratorExtraData);
        require(msg.value >= stake + arbitratorCost);

        if (item.status == ItemStatus.Absent)
            item.status = ItemStatus.Submitted;
        else if (item.status == ItemStatus.Cleared)
            item.status = ItemStatus.Resubmitted;
        else
            revert(); // If the item is neither Absent nor Cleared, it is not possible to request registering it.

        if (item.lastAction == 0) {
            itemsList.push(_value);
        }

        item.submitter = msg.sender;
        item.balance += msg.value;
        item.lastAction = now;

        emit ItemStatusChange(item.submitter, item.challenger, _value, item.status, item.disputed);
    }

    /**
     *  @dev Request an item to be cleared.
     *  @param _value The value of the item to clear.
     */
    function requestClearing(bytes32 _value) public payable {
        Item storage item = items[_value];
        uint arbitratorCost = arbitrator.arbitrationCost(arbitratorExtraData);
        require(!appendOnly);
        require(msg.value >= stake + arbitratorCost);

        if (item.status == ItemStatus.Registered)
            item.status = ItemStatus.ClearingRequested;
        else if (item.status == ItemStatus.Absent)
            item.status = ItemStatus.PreventiveClearingRequested;
        else
            revert(); // If the item is neither Registered nor Absent, it is not possible to request clearing it.
        
        if (item.lastAction == 0) {
            itemsList.push(_value);
        }

        item.submitter = msg.sender;
        item.balance += msg.value;
        item.lastAction = now;

        emit ItemStatusChange(item.submitter, item.challenger, _value, item.status, item.disputed);
    }

    /**
     *  @dev Challenge a registration request.
     *  @param _value The value of the item subject to the registering request.
     */
    function challengeRegistration(bytes32 _value) public payable {
        Item storage item = items[_value];
        uint arbitratorCost = arbitrator.arbitrationCost(arbitratorExtraData);
        require(msg.value >= stake + arbitratorCost);
        require(item.status == ItemStatus.Resubmitted || item.status == ItemStatus.Submitted);
        require(!item.disputed);

        if (item.balance >= arbitratorCost) { // In the general case, create a dispute.
            item.challenger = msg.sender;
            item.balance += msg.value-arbitratorCost;
            item.disputed = true;
            item.disputeID = arbitrator.createDispute.value(arbitratorCost)(2,arbitratorExtraData);
            disputeIDToItem[item.disputeID] = _value;
            emit Dispute(arbitrator, item.disputeID, 0);
        } else { // In the case the arbitration fees increased so much that the deposit of the requester is not high enough. Cancel the request.
            if (item.status == ItemStatus.Resubmitted)
                item.status = ItemStatus.Cleared;
            else
                item.status = ItemStatus.Absent;

            item.submitter.send(item.balance); // Deliberate use of send in order to not block the contract in case of reverting fallback.
            item.balance = 0;
            msg.sender.transfer(msg.value);
        }

        item.lastAction = now;

        emit ItemStatusChange(item.submitter, item.challenger, _value, item.status, item.disputed);
    }

    /**
     *  @dev Challenge a clearing request.
     *  @param _value The value of the item subject to the clearing request.
     */
    function challengeClearing(bytes32 _value) public payable {
        Item storage item = items[_value];
        uint arbitratorCost = arbitrator.arbitrationCost(arbitratorExtraData);
        require(msg.value >= stake + arbitratorCost);
        require(item.status == ItemStatus.ClearingRequested || item.status == ItemStatus.PreventiveClearingRequested);
        require(!item.disputed);

        if (item.balance >= arbitratorCost) { // In the general case, create a dispute.
            item.challenger = msg.sender;
            item.balance += msg.value-arbitratorCost;
            item.disputed = true;
            item.disputeID = arbitrator.createDispute.value(arbitratorCost)(2,arbitratorExtraData);
            disputeIDToItem[item.disputeID] = _value;
            emit Dispute(arbitrator, item.disputeID, 0);
        } else { // In the case the arbitration fees increased so much that the deposit of the requester is not high enough. Cancel the request.
            if (item.status == ItemStatus.ClearingRequested)
                item.status = ItemStatus.Registered;
            else
                item.status = ItemStatus.Absent;

            item.submitter.send(item.balance); // Deliberate use of send in order to not block the contract in case of reverting fallback.
            item.balance = 0;
            msg.sender.transfer(msg.value);
        }

        item.lastAction = now;

        emit ItemStatusChange(item.submitter, item.challenger, _value, item.status, item.disputed);
    }

    /**
     *  @dev Appeal ruling. Anyone can appeal to prevent a malicious actor from challenging its own submission and loosing on purpose.
     *  @param _value The value of the item with the dispute to appeal on.
     */
    function appeal(bytes32 _value) public payable {
        Item storage item = items[_value];
        arbitrator.appeal.value(msg.value)(item.disputeID,arbitratorExtraData); // Appeal, no need to check anything as the arbitrator does it.
    }

    /**
     *  @dev Execute a request after the time for challenging it has passed. Can be called by anyone.
     *  @param _value The value of the item with the request to execute.
     */
    function executeRequest(bytes32 _value) public {
        Item storage item = items[_value];
        require(now - item.lastAction >= timeToChallenge);
        require(!item.disputed);

        if (item.status == ItemStatus.Resubmitted || item.status == ItemStatus.Submitted)
            item.status = ItemStatus.Registered;
        else if (item.status == ItemStatus.ClearingRequested || item.status == ItemStatus.PreventiveClearingRequested)
            item.status = ItemStatus.Cleared;
        else
            revert();

        item.submitter.send(item.balance); // Deliberate use of send in order to not block the contract in case of reverting fallback.

        emit ItemStatusChange(item.submitter, item.challenger, _value, item.status, item.disputed);
    }

    /* Public Views */

    /**
     *  @dev Return true if the item is allowed. 
     *  We consider the item to be in the list if its status is contested and it has not won a dispute previously.
     *  @param _value The value of the item to check.
     *  @return allowed True if the item is allowed, false otherwise.
     */
    function isPermitted(bytes32 _value) public view returns (bool allowed) {
        Item storage item = items[_value];
        bool _excluded = item.status <= ItemStatus.Resubmitted ||
            (item.status == ItemStatus.PreventiveClearingRequested && !item.disputed);
        return blacklist ? _excluded : !_excluded; // Items excluded from blacklist should return true.
    }

    /* Internal */

    /**
     *  @dev Execute the ruling of a dispute.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function executeRuling(uint _disputeID, uint _ruling) internal {
        Item storage item = items[disputeIDToItem[_disputeID]];
        require(item.disputed);

        if (_ruling == REGISTER) {
            if (rechallengePossible && item.status==ItemStatus.Submitted) {
                uint arbitratorCost = arbitrator.arbitrationCost(arbitratorExtraData);
                if (arbitratorCost + stake < item.balance) { // Check that the balance is enough.
                    uint toSend = item.balance - (arbitratorCost + stake);
                    item.submitter.send(toSend); // Keep the arbitration cost and the stake and send the remaining to the submitter.
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
        
        item.disputed = false;
        if (rechallengePossible && item.status==ItemStatus.Submitted && _ruling==REGISTER) 
            item.lastAction=now; // If the item can be rechallenged, update the time and keep the remaining balance.
        else
            item.balance = 0;

        emit ItemStatusChange(item.submitter, item.challenger, disputeIDToItem[_disputeID], item.status, item.disputed);
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
            if (item.disputed) challenged++;
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
            require(_cursorIndex != 0);
        }

        for (
                uint i = _cursorIndex == 0 ? (_sort ? 0 : 1) : (_sort ? _cursorIndex + 1 : itemsList.length - _cursorIndex + 1);
                _sort ? i < itemsList.length : i <= itemsList.length;
                i++
            ) { // Oldest or newest first
            Item storage item = items[itemsList[_sort ? i : itemsList.length - i]];
            if (
                item.status != ItemStatus.Absent && item.status != ItemStatus.PreventiveClearingRequested && (
                    (_filter[0] && (item.status == ItemStatus.Resubmitted || item.status == ItemStatus.Submitted)) || // Pending
                    (_filter[1] && item.disputed) || // Challenged
                    (_filter[2] && item.status == ItemStatus.Registered) || // Accepted
                    (_filter[3] && item.status == ItemStatus.Cleared) || // Rejected
                    (_filter[4] && item.submitter == msg.sender) || // My Submissions
                    (_filter[5] && item.challenger == msg.sender) // My Challenges
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