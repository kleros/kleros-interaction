 /**
 *  @title Arbitrable Permission List
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  This code hasn't undertaken bug bounty programs yet.
 *  This code requires truffle tests.
 */

pragma solidity ^0.4.18;

import "../arbitration/Arbitrable.sol";
import "./PermissionInterface.sol";

/**
 *  @title Arbitrable Permission List
 *  @dev This is an arbitrator curated registry. Anyone can post an item with a deposit. If no one complains within a defined time period, the item is added to the registry.
 *  Someone can complain and also post a deposit, if, someone does, a dispute is created. The winner of the dispute gets the deposit of the other party and the item is added or removed accordingly.
 *  During the time of the dispute, the item is shown as blacklisted unless it already won a previous dispute. This follows the philosophy that it is better to show the user a warning about a potentially harmless listing than to take the risk of the user being scammed or exposed to inappropriate content without warning.
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
        address submitter; // Address of the submitter, if any.
        address challenger; // Address of the challenger, if any.
        // The total amount of funds to be given to the winner of a potential dispute. Includes stake and reimbursement of arbitration fees.
        uint balance;
        bool disputed; // True if a dispute is taking place.
        uint disputeID; // ID of the dispute, if any.
    }

    /* Storage */

    // Settings
    bool blacklist; // True if the list should function as a blacklist, false if it should function as a whitelist.
    bool appendOnly; // True if the list should be append only.
    Arbitrator public arbitrator;
    bytes public arbitratorExtraData;
    uint public stake;
    uint public timeToChallenge;

    // Ruling Options
    uint8 constant BLACKLIST = 1;
    uint8 constant CLEAR = 2;
    string constant RULING_OPTIONS = "Blacklist;Clear";

    // Items
    mapping(bytes32 => Item) public items;
    mapping(uint => bytes32) public disputeIDToItem;

    /* Constructor */

    /**
     *  @dev Constructs the arbitrable permission list and sets the type.
     *  @param _contractHash Keccak256 hash of the plain contract.
     *  @param _blacklist True if the list should function as a blacklist, false if it should function as a whitelist.
     *  @param _appendOnly True if the list should be append only.
     *  @param _arbitrator The chosen arbitrator.
     *  @param _arbitratorExtraData Extra data for the arbitrator contract.
     *  @param _stake The amount in Weis of deposit required for a submission or a challenge.
     *  @param _timeToChallenge The time in seconds, other parties have to challenge.
     */
    function ArbitrablePermissionList(
        bytes32 _contractHash,
        bool _blacklist,
        bool _appendOnly,
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        uint _stake,
        uint _timeToChallenge) Arbitrable(_arbitrator, _arbitratorExtraData, _contractHash) public {
        blacklist = _blacklist;
        appendOnly = _appendOnly;
        arbitrator = _arbitrator;
        arbitratorExtraData = _arbitratorExtraData;
        stake = _stake;
        timeToChallenge = _timeToChallenge;
    }

    /* Public */

    /**
     *  @dev Request an item to be registered.
     *  @param _value The item to register.
     */
    function requestRegistering(bytes32 _value) public payable {
        Item storage item = items[_value];
        uint arbitratorCost = arbitrator.arbitrationCost(arbitratorExtraData);
        require(msg.value >= stake+arbitratorCost);

        if (items[_value].status == ItemStatus.Absent)
            items[_value].status = ItemStatus.Submitted;
        else if (items[_value].status == ItemStatus.Cleared)
            items[_value].status = ItemStatus.Resubmitted;
        else
            revert(); // If the item is neither Absent nor Cleared, it is not possible to request registering it.

        item.submitter = msg.sender;
        item.balance += msg.value;
        item.lastAction = now;
    }

    /**
     *  @dev Request an item to be cleared.
     *  @param _value The item to clear.
     */
    function requestClearing(bytes32 _value) public payable {
        Item storage item = items[_value];
        uint arbitratorCost = arbitrator.arbitrationCost(arbitratorExtraData);
        require(msg.value >= stake+arbitratorCost);

        if (item.status == ItemStatus.Registered)
            item.status = ItemStatus.ClearingRequested;
        else if (item.status == ItemStatus.Absent)
            item.status = ItemStatus.PreventiveClearingRequested;
        else
            revert(); // If the item is neither Registered nor Absent, it is not possible to request clearing it.

        item.submitter = msg.sender;
        item.balance += msg.value;
        item.lastAction = now;
    }

    /**
     *  @dev Challenge a registering request.
     *  @param _value The item subject to the registering request.
     */
    function challengeRegistering(bytes32 _value) public payable {
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
        } else { // In the case the arbitration fees increase so much that the deposit of the requester is not high enough. Cancel the request.
            if (item.status == ItemStatus.Resubmitted)
                item.status = ItemStatus.Cleared;
            else
                item.status = ItemStatus.Absent;

            item.submitter.send(item.balance); // Deliberate use of send in order to not block the contract in case of reverting fallback.
            item.balance = 0;
            msg.sender.transfer(msg.value);
        }

        item.lastAction = now;
    }

    /**
     *  @dev Challenge a clearing request.
     *  @param _value The item subject to the clearing request.
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
        } else { // In the case the arbitration fees increase so much that the deposit of the requester is not high enough. Cancel the request.
            if (item.status == ItemStatus.ClearingRequested)
                item.status = ItemStatus.Registered;
            else
                item.status = ItemStatus.Absent;

            item.submitter.send(item.balance); // Deliberate use of send in order to not block the contract in case of reverting fallback.
            item.balance = 0;
            msg.sender.transfer(msg.value);
        }

        item.lastAction = now;
    }

    /**
     *  @dev Appeal ruling. Anyone can appeal to prevent a malicious actor from challenging its own submission and loosing on purpose.
     *  @param _value The item with the dispute to appeal on.
     */
    function appeal(bytes32 _value) public payable {
        Item storage item = items[_value];
        arbitrator.appeal.value(msg.value)(item.disputeID,arbitratorExtraData); // Appeal, no need to check anything as the arbitrator does it.
    }

    /**
     *  @dev Execute a request after the time for challenging it has passed. Can be called by anyone.
     *  @param _value The item with the request to execute.
     */
    function executeRequest(bytes32 _value) public {
        Item storage item = items[_value];
        require(now - item.lastAction >= timeToChallenge);

        if (item.status == ItemStatus.Resubmitted || item.status == ItemStatus.Submitted)
            item.status = ItemStatus.Registered;
        else if (item.status == ItemStatus.ClearingRequested || item.status == ItemStatus.PreventiveClearingRequested)
            item.status = ItemStatus.Cleared;
        else
            revert();

        item.submitter.send(item.balance); // Deliberate use of send in order to not block the contract in case of reverting fallback.
    }

    /* Public Views */

    /**
     *  @dev Return true if the item is allowed. We take a conservative approach and return false if the status of the item is contested and it has not won a previous dispute.
     *  @param _value The item to check.
     *  @return allowed True if the item is allowed, false otherwise.
     */
    function isPermitted(bytes32 _value) public view returns (bool allowed) {
        bool _registered = items[_value].status <= ItemStatus.Resubmitted ||
            (items[_value].status == ItemStatus.PreventiveClearingRequested && !items[_value].disputed);
        return blacklist ? !_registered : _registered;
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

        if (_ruling == BLACKLIST) {
            if (item.status == ItemStatus.Resubmitted || item.status == ItemStatus.Submitted)
                item.submitter.send(item.balance); // Deliberate use of send in order to not block the contract in case of reverting fallback.
            else
                item.challenger.send(item.balance);

            item.status = ItemStatus.Registered;
        } else if (_ruling == CLEAR) {
            if (item.status == ItemStatus.PreventiveClearingRequested || item.status == ItemStatus.ClearingRequested)
                item.submitter.send(item.balance);
            else
                item.challenger.send(item.balance);

            item.status = ItemStatus.Cleared;
        } else { // Split the balance 50-50 and give the item the initial status.
            item.status = ItemStatus.Absent;
            item.submitter.send(item.balance / 2);
            item.challenger.send(item.balance / 2);
        }

        item.disputed = false;
        item.balance = 0;
    }
}
