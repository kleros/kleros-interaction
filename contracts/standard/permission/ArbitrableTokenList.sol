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

    enum ItemStatus {
        Absent, // The item has never been submitted.
        Cleared, // The item has been submitted and the dispute resolution process determined it should not be added or a clearing request has been submitted and the dispute resolution process determined it should be cleared or the clearing was never contested.
        Resubmitted, // The item has been cleared but someone has resubmitted it.
        Registered, // The item has been submitted and the dispute resolution process determined it should be added or the submission was never contested.
        Submitted, // The item has been submitted.
        ClearingRequested, // The item is registered, but someone has requested to remove it.
        PreventiveClearingRequested // The item has never been registered, but someone asked to clear it preemptively to avoid it being shown as not registered during the dispute resolution process.
    }

    enum RulingOption {
        Other, // Arbitrator did not rule of refused to rule.
        Accept, // Execute request. Rule in favor of requester.
        Refuse // Refuse request. Rule in favor of challenger.
    }

    enum Party {
        Requester,
        Challenger,
        None
    }

    /* Structs */

    struct Item {
        ItemStatus status; // Status of the item.
        uint lastAction; // Time of the last action.
        uint balance; // The amount of funds placed at stake for this item. Does not include arbitrationFees.
        uint challengeReward; // The challengeReward of the item for the round.
        bytes32 latestAgreementID; // The ID of the latest agreement for the item.
    }

    /* Modifiers */

    modifier onlyT2CLGovernor {require(msg.sender == t2clGovernor, "The caller is not the t2cl governor."); _;}

    /* Events */

    /**
     *  @dev Called when the item's status changes or when it is challenged/resolved.
     *  @param requester Address of the requester.
     *  @param challenger Address of the challenger, if any.
     *  @param tokenID The tokenID of the item.
     *  @param status The status of the item.
     *  @param disputed Wether the item is being disputed.
     */
    event ItemStatusChange(
        address indexed requester,
        address indexed challenger,
        bytes32 indexed tokenID,
        ItemStatus status,
        bool disputed
    );

    /* Storage */

    // Settings
    uint public challengeReward; // The stake deposit required in addition to arbitration fees for challenging a request.
    uint public timeToChallenge; // The time before a request becomes executable if not challenged.
    uint public arbitrationFeesWaitingTime; // The maximum time to wait for arbitration fees if the dispute is raised.
    address public t2clGovernor; // The address that can update t2clGovernor, arbitrationFeesWaitingTime and challengeReward.

    // Items
    mapping(bytes32 => Item) public items;
    bytes32[] public itemsList;

    // Agreement and Item Extension
    mapping(bytes32 => bytes32) public agreementIDToItemID;

    /* Constructor */

    /**
     *  @dev Constructs the arbitrable token list.
     *  @param _arbitrator The chosen arbitrator.
     *  @param _arbitratorExtraData Extra data for the arbitrator contract.
     *  @param _t2clGovernor The t2clGovernor address. This address can update t2clGovernor, arbitrationFeesWaitingTime and challengeReward.
     *  @param _arbitrationFeesWaitingTime The maximum time to wait for arbitration fees if the dispute is raised.
     *  @param _challengeReward The amount in Weis of deposit required for a submission or a challenge in addition to the arbitration fees.
     *  @param _timeToChallenge The time in seconds, parties have to challenge.
     */
    constructor(
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        address _t2clGovernor,
        uint _arbitrationFeesWaitingTime,
        uint _challengeReward,
        uint _timeToChallenge
    ) Arbitrable(_arbitrator, _arbitratorExtraData) public {
        challengeReward = _challengeReward;
        timeToChallenge = _timeToChallenge;
        t2clGovernor = _t2clGovernor;
        arbitrationFeesWaitingTime = _arbitrationFeesWaitingTime;
    }

    /* Public Views */

    /** @dev Return true if the item is allowed. We consider the item to be in the list if its status is contested and it has not won a dispute previously.
     *  @param _tokenID The tokenID of the item to check.
     *  @return allowed True if the item is allowed, false otherwise.
     */
    function isPermitted(bytes32 _tokenID) public view returns (bool allowed) {
        Item storage item = items[_tokenID];
        return item.status == ItemStatus.Registered || item.status == ItemStatus.ClearingRequested;
    }

}