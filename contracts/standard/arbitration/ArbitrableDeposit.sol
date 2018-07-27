/**
 *  @title ArbitrableDeposit
 *  @author Luke Hartman - <lhartman3@zagmail.gonzaga.edu>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */


pragma solidity ^0.4.15;
import "./Arbitrable.sol";


/** @title Arbitrable Deposit
 *  This is a a contract which allow for an owner deposit. Anyone besides the owner can seek arbitration/file a claim as a claimant.
 * To develop a contract inheriting from this one, you need to:
 *  - Redefine RULING_OPTIONS to explain the consequences of the possible rulings.
 *  - Redefine executeRuling while still calling super.executeRuling to implement the results of the arbitration.
 */
contract ArbitrableDeposit is Arbitrable {
    address public owner;
    address public claimant;
    uint public timeout; // Time in seconds a party can take before being considered unresponding and lose the dispute.
    uint public ownerFee; // Total fees paid by the owner.
    uint public claimantFee; // Total fees paid by the claimant.
    uint public lastInteraction; // Last interaction for the dispute procedure.
    uint public disputeID;
    uint public amount; // Total amount deposited by owner.
    uint public claimAmount; // Claim amount a claimant proposes.
    uint public claimRate; // Rate of a claim the claimant must deposit as an integer.
    uint internal claimResponseAmount; // Amount which the Owner responds to the claimant's asking claim.
    uint public claimDepositAmount; // Total amount a claimant must deposit.

    enum Status {NoDispute, WaitingOwner, WaitingClaimant, DisputeCreated, Resolved}
    Status public status;

    uint8 constant AMOUNT_OF_CHOICES = 2;
    uint8 constant OWNER_WINS = 1;
    uint8 constant CLAIMANT_WINS = 2;
    string constant RULING_OPTIONS = "Owner wins;Claimant wins"; // A plain English of what rulings do. Need to be redefined by the child class.

    modifier onlyOwner{ require(msg.sender == address(owner)); _; }
    modifier onlyNotOwner{ require(msg.sender != address(owner)); _;}
    modifier onlyClaimant{ require(msg.sender == address(claimant)); _;}

    enum Party {Owner, Claimant}

    /** @dev Indicate that a party has to pay a fee or would otherwise be considered as loosing.
     *  @param _party The party who has to pay.
     */
    event HasToPayFee(Party _party);

    /** @dev Constructor. Choose the arbitrator
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _timeout Time after which a party automatically loose a dispute.
     *  @param _arbitratorExtraData Extra data for the arbitrator.
     *  @param _metaEvidence Link to the meta evidence.
     */
    constructor(Arbitrator _arbitrator, uint _timeout, bytes _arbitratorExtraData, uint _claimRate, string _metaEvidence) Arbitrable(_arbitrator, _arbitratorExtraData) public payable {
        timeout = _timeout;
        claimRate = _claimRate;
        status = Status.NoDispute;
        amount += msg.value;
        owner = msg.sender;
        address(this).transfer(amount);
        emit MetaEvidence(0, _metaEvidence);
    }

    /** @dev Owner deposit to contract. To be called when the owner makes a deposit.
     */
    function deposit() public payable onlyOwner {
        amount += msg.value;
        address(this).send(msg.value);
    }

    /** @dev File a claim against owner. To be called when someone makes a claim.
     *  @param _claimAmount The proposed claim amount by the claimant.
     */
    function makeClaim(uint _claimAmount) public onlyNotOwner {
        require(_claimAmount <= amount);
        claimant = msg.sender;
        claimAmount = _claimAmount;
        claimDepositAmount = (_claimAmount * claimRate) / 100;
        address(this).transfer(claimDepositAmount);
        status = Status.WaitingOwner;
    }

    /** @dev Owner response to claimant. To be called when the owner initates a
     *  a response.
     *  @param _responseAmount The counter-offer amount the Owner proposes to a claimant.
     */
    function claimResponse(uint _responseAmount) public onlyOwner {
        require(_responseAmount <= claimDepositAmount);
        claimResponseAmount = _responseAmount;
        if (_responseAmount == claimDepositAmount) {
            claimant.transfer(_responseAmount);
            claimAmount = 0;
            amount = 0;
            status = Status.Resolved;
        }  else {
            payArbitrationFeeByOwner();
        }
    }

    /** @dev Pay the arbitration fee to raise a dispute. To be called by the owner. UNTRUSTED.
     *  Note that the arbitrator can have createDispute throw, which will make this function throw and therefore lead to a party being timed-out.
     *  This is not a vulnerability as the arbitrator can rule in favor of one party anyway.
     */
    function payArbitrationFeeByOwner() public payable onlyOwner{
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        ownerFee += msg.value;
        require(ownerFee == arbitrationCost); // Require that the total pay at least the arbitration cost.
        require(status < Status.DisputeCreated); // Make sure a dispute has not been created yet.

        lastInteraction = now;
        if (claimantFee < arbitrationCost) { // The claimant still has to pay.
        // This can also happens if he has paid, but arbitrationCost has increased.
            status = Status.WaitingClaimant;
            emit HasToPayFee(Party.Claimant);
        } else { // The claimant has also paid the fee. We create the dispute
            raiseDispute(arbitrationCost);
        }
    }

    /** @dev Pay the arbitration fee to raise a dispute. To be called by the claimant. UNTRUSTED.
     *  Note that this function mirror payArbitrationFeeByOwner.
     */
    function payArbitrationFeeByClaimant() public payable onlyClaimant {
        uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        claimantFee += msg.value;
        require(claimantFee == arbitrationCost); // Require that the total pay at least the arbitration cost.
        require(status<Status.DisputeCreated); // Make sure a dispute has not been created yet.

        lastInteraction = now;
        if (ownerFee < arbitrationCost) { // The owner still has to pay. This can also happens if he has paid, but arbitrationCost has increased.
            status = Status.WaitingOwner;
            emit HasToPayFee(Party.Claimant);
        } else { // The owner has also paid the fee. We create the dispute
            raiseDispute(arbitrationCost);
        }
    }

    /** @dev Create a dispute. UNTRUSTED.
     *  @param _arbitrationCost Amount to pay the arbitrator.
     */
    function raiseDispute(uint _arbitrationCost) internal {
        status = Status.DisputeCreated;
        disputeID = arbitrator.createDispute.value(_arbitrationCost)(AMOUNT_OF_CHOICES,arbitratorExtraData);
        emit Dispute(arbitrator, disputeID, 0);
    }

    /** @dev Reimburse owner if claimant fails to pay the fee.
     */
    function timeOutByOwner() public onlyOwner {
        require(status == Status.WaitingClaimant);
        require(now >= lastInteraction+timeout);

        executeRuling(disputeID,OWNER_WINS);
    }

    /** @dev Pay claimant if owner fails to pay the fee.
     */
    function timeOutByClaimant() public onlyClaimant {
        require(status == Status.WaitingOwner);
        require(now >= lastInteraction+timeout);

        executeRuling(disputeID, CLAIMANT_WINS);
    }

    /** @dev Execute a ruling of a dispute. Pays parties respective amounts based on ruling.
     *  This needs to be extended by contract inheriting from it.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. 1 : Allow owner deposit. 2 : Pay claimant.
     */
    function executeRuling(uint _disputeID, uint _ruling) internal {
        require(_disputeID == disputeID);
        require(_ruling <= AMOUNT_OF_CHOICES);

        if (_ruling == OWNER_WINS) {
            owner.transfer(amount + claimAmount);
            claimant.transfer(claimResponseAmount);
        } else if (_ruling == CLAIMANT_WINS)
            claimant.transfer(amount);
        amount = 0;
    }
}
