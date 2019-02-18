/**
 *  @title Two-Party Arbitrable
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */


pragma solidity ^0.4.15;
import "./Arbitrable.sol";


/** @title Two-Party Arbitrable
 *  @dev A contract between two parties which can be arbitrated. Both parties has to pay for the arbitration fee. The winning party will get its fee refunded.
 *  To develop a contract inheriting from this one, you need to:
 *  - Redefine RULING_OPTIONS to explain the consequences of the possible rulings.
 *  - Redefine executeRuling while still calling super.executeRuling to implement the results of the arbitration.
 */
contract TwoPartyArbitrable is Arbitrable {
    uint public timeout; // Time in second a party can take before being considered unresponding and lose the dispute.
    uint8 public amountOfChoices;
    address public partyA;
    address public partyB;
    uint public partyAFee; // Total fees paid by the partyA.
    uint public partyBFee; // Total fees paid by the partyB.
    uint public lastInteraction; // Last interaction for the dispute procedure.
    uint public disputeID;
    enum Status {NoDispute, WaitingPartyA, WaitingPartyB, DisputeCreated, Resolved}
    Status public status;

    uint8 constant PARTY_A_WINS = 1;
    uint8 constant PARTY_B_WINS = 2;
    string constant RULING_OPTIONS = "Party A wins;Party B wins"; // A plain English of what rulings do. Need to be redefined by the child class.

    modifier onlyPartyA{require(msg.sender == partyA, "Can only be called by party A."); _;}
    modifier onlyPartyB{require(msg.sender == partyB, "Can only be called by party B."); _;}
    modifier onlyParty{require(msg.sender == partyA || msg.sender == partyB, "Can only be called by party A or party B."); _;}

    enum Party {PartyA, PartyB}

    /** @dev Indicate that a party has to pay a fee or would otherwise be considered as loosing.
     *  @param _party The party who has to pay.
     */
    event HasToPayFee(Party _party);

    /** @dev Constructor. Choose the arbitrator.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _timeout Time after which a party automatically loose a dispute.
     *  @param _partyB The recipient of the transaction.
     *  @param _amountOfChoices The number of ruling options available.
     *  @param _arbitratorExtraData Extra data for the arbitrator.
     *  @param _metaEvidence Link to the meta-evidence.
     */
    constructor(
        Arbitrator _arbitrator,
        uint _timeout,
        address _partyB,
        uint8 _amountOfChoices,
        bytes _arbitratorExtraData,
        string _metaEvidence
    )
        Arbitrable(_arbitrator,_arbitratorExtraData)
        public
    {
        timeout = _timeout;
        partyA = msg.sender;
        partyB = _partyB;
        amountOfChoices = _amountOfChoices;
        emit MetaEvidence(0, _metaEvidence);
    }


    /** @dev Pay the arbitration fee to raise a dispute. To be called by the party A. UNTRUSTED.
     *  Note that the arbitrator can have createDispute throw, which will make this function
     *  throw and therefore lead to a party being timed-out.
     *  This is not a vulnerability as the arbitrator can rule in favor of one party anyway.
     */
    function payArbitrationFeeByPartyA() public payable onlyPartyA {
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        partyAFee += msg.value;
        require(
            partyAFee >= arbitrationCost,
            "Not enough ETH to cover arbitration costs."
        ); // Require that the total pay at least the arbitration cost.
        require(status < Status.DisputeCreated, "Dispute has already been created."); // Make sure a dispute has not been created yet.

        lastInteraction = now;
        // The partyB still has to pay. This can also happens if he has paid, but arbitrationCost has increased.
        if (partyBFee < arbitrationCost) {
            status = Status.WaitingPartyB;
            emit HasToPayFee(Party.PartyB);
        } else { // The partyB has also paid the fee. We create the dispute
            raiseDispute(arbitrationCost);
        }
    }


    /** @dev Pay the arbitration fee to raise a dispute. To be called by the party B. UNTRUSTED.
     *  Note that this function mirror payArbitrationFeeByPartyA.
     */
    function payArbitrationFeeByPartyB() public payable onlyPartyB {
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        partyBFee += msg.value;
        require(
            partyBFee >= arbitrationCost,
            "Not enough ETH to cover arbitration costs."
        ); // Require that the total pay at least the arbitration cost.
        require(status < Status.DisputeCreated, "Dispute has already been created."); // Make sure a dispute has not been created yet.

        lastInteraction = now;
        // The partyA still has to pay. This can also happens if he has paid, but arbitrationCost has increased.
        if (partyAFee < arbitrationCost) {
            status = Status.WaitingPartyA;
            emit HasToPayFee(Party.PartyA);
        } else { // The partyA has also paid the fee. We create the dispute
            raiseDispute(arbitrationCost);
        }
    }

    /** @dev Create a dispute. UNTRUSTED.
     *  @param _arbitrationCost Amount to pay the arbitrator.
     */
    function raiseDispute(uint _arbitrationCost) internal {
        status = Status.DisputeCreated;
        disputeID = arbitrator.createDispute.value(_arbitrationCost)(amountOfChoices,arbitratorExtraData);
        emit Dispute(arbitrator, disputeID, 0, 0);
    }

    /** @dev Reimburse partyA if partyB fails to pay the fee.
     */
    function timeOutByPartyA() public onlyPartyA {
        require(status == Status.WaitingPartyB, "Not waiting for party B.");
        require(now >= lastInteraction + timeout, "The timeout time has not passed.");

        executeRuling(disputeID,PARTY_A_WINS);
    }

    /** @dev Pay partyB if partyA fails to pay the fee.
     */
    function timeOutByPartyB() public onlyPartyB {
        require(status == Status.WaitingPartyA, "Not waiting for party A.");
        require(now >= lastInteraction + timeout, "The timeout time has not passed.");

        executeRuling(disputeID,PARTY_B_WINS);
    }

    /** @dev Submit a reference to evidence. EVENT.
     *  @param _evidence A link to an evidence using its URI.
     */
    function submitEvidence(string _evidence) public onlyParty {
        require(status >= Status.DisputeCreated, "The dispute has not been created yet.");
        emit Evidence(arbitrator, 0, msg.sender, _evidence);
    }

    /** @dev Appeal an appealable ruling.
     *  Transfer the funds to the arbitrator.
     *  Note that no checks are required as the checks are done by the arbitrator.
     *  @param _extraData Extra data for the arbitrator appeal procedure.
     */
    function appeal(bytes _extraData) public onlyParty payable {
        arbitrator.appeal.value(msg.value)(disputeID,_extraData);
    }

    /** @dev Execute a ruling of a dispute. It reimburse the fee to the winning party.
     *  This need to be extended by contract inheriting from it.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. 1 : Reimburse the partyA. 2 : Pay the partyB.
     */
    function executeRuling(uint _disputeID, uint _ruling) internal {
        require(_disputeID == disputeID, "Wrong dispute ID.");
        require(_ruling <= amountOfChoices, "Invalid ruling.");

        // Give the arbitration fee back.
        // Note that we use send to prevent a party from blocking the execution.
        // In both cases sends the highest amount paid to avoid ETH to be stuck in
        // the contract if the arbitrator lowers its fee.
        if (_ruling==PARTY_A_WINS)
            partyA.send(partyAFee > partyBFee ? partyAFee : partyBFee);
        else if (_ruling==PARTY_B_WINS)
            partyB.send(partyAFee > partyBFee ? partyAFee : partyBFee);

        status = Status.Resolved;
    }

}
