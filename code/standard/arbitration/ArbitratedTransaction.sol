/**
 *  @title Arbitrated Transaction
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */


pragma solidity ^0.4.16;
import "./ArbitrationStandard.sol";


/** @title Arbitrated Transaction
 *  This is a a contract for an arbitrated transaction which can be reversed by the arbitrator.
 *  This can be used for buying goods, services and for paying freelancers.
 *  TODO: Implement appeals.
 */
contract ArbitratedTransaction is Arbitrable {
    uint public timeout;
    address public payer;
    address public payee;
    uint public payerFee; // Fee paid by the payer.
    uint public payeeFee; // Fee paid by the payee.
    bytes public arbitratorExtraData;
    uint public lastInteraction; // Last interaction for the dispute procedure.
    uint public disputeID;
    enum Status {NoDispute, WaitingPayee, WaitingPayer, DisputeCreated}
    Status public status;
    
    uint8 constant AMOUNT_OF_CHOICES = 2;
    uint8 constant REIMBURSE_PAYER = 1;
    uint8 constant PAY_PAYEE = 1;
    string constant RULING_OPTIONS = "Reimburse Payer;Pay Payee";
    
    modifier onlyPayer{ require(msg.sender==payer); _; }
    modifier onlyPayee{ require(msg.sender==payee); _; }
    
    enum Party {Payer, Payee}
    
    /** @dev Indicate that a party has to pay a fee or would otherwise be considered as loosing.
     *  @param _party The party who has to pay.
     */
    event HasToPayFee(Party _party);
    
    /** @dev Constructor. Choose the arbitrator.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _timeout Time after which a party automatically loose a dispute.
     *  @param _payee The recipient of the transaction.
     *  @param _arbitratorExtraData Extra data for the arbitrator.
     */
    function ArbitratedTransaction(Arbitrator _arbitrator, uint _timeout, address _payee, bytes _arbitratorExtraData) Arbitrable(_arbitrator) payable {
        timeout=_timeout;
        payer=msg.sender;
        payee=_payee;
        arbitratorExtraData=_arbitratorExtraData;
    }
    
    /** @dev Pay the payee. To be called when the good is delivered or the service rendered.
     */
    function pay() onlyPayer {
        payee.transfer(this.balance);
    }
    
    /** @dev Reimburse the payer. To be called if the good or service can't be fully provided.
     *  @param _amount Amount to reimburse in wei. If this is above the total amount the contract has, reimburse everything.
     */
    function reimburse(uint _amount) onlyPayee {
        payer.transfer(_amount>this.balance ? this.balance : _amount);
    }
    
    
    /** @dev Pay the arbitration fee to raise a dispute. To be called by the payer. UNTRUSTED.
     *  Note that the arbitrator can have createDispute throw, which will make this function throw and therefore lead to a party being timed-out.
     *  This is not a vulnerability as the arbitrator can rule in favor of one party anyway.
     */
    function payArbitrationFeeByPayer() payable onlyPayer {
        uint arbitrationCost=arbitrator.arbitrationCost(arbitratorExtraData);
        require(msg.value+payerFee == arbitrationCost); // Require that the total pay at least the arbitration cost.
        require(status<Status.DisputeCreated); // Make sure a dispute has not been created yet.
        
        lastInteraction=now;
        if (payeeFee < arbitrationCost) { // The payee still has to pay. This can also happens if he has paid, but arbitrationCost has increased.
            status=Status.WaitingPayee;
            HasToPayFee(Party.Payee);
        } else { // The payee has also paid the fee. We create the dispute
            payerFee+=msg.value-arbitrationCost; // Note that the right part will undeflow, but the result will still be correct.    
            payeeFee-=arbitrationCost;
            raiseDispute(arbitrationCost);
        }
    }
    
    
    /** @dev Pay the arbitration fee to raise a dispute. To be called by the payee. UNTRUSTED.
     *  Note that this functio mirror payArbitrationFeePayer.
     */
    function payArbitrationFeeByPayee() payable onlyPayee {
        uint arbitrationCost=arbitrator.arbitrationCost(arbitratorExtraData);
        require(msg.value+payeeFee == arbitrationCost); // Require that the total pay at least the arbitration cost.
        require(status<Status.DisputeCreated); // Make sure a dispute has not been created yet.
        
        lastInteraction=now;
        if (payerFee < arbitrationCost) { // The payer still has to pay. This can also happens if he has paid, but arbitrationCost has increased.
            status=Status.WaitingPayer;
            HasToPayFee(Party.Payer);
        } else { // The payer has also paid the fee. We create the dispute
            payeeFee+=msg.value-arbitrationCost; // Note that the right part will undeflow, but the result will still be correct.    
            payerFee-=arbitrationCost;
            raiseDispute(arbitrationCost);
        }
    }
    
    /** @dev Create a dispute.
     *  @param _arbitrationCost Amount to pay the arbitrator.
     */
    function raiseDispute(uint _arbitrationCost) internal {
        status=Status.DisputeCreated;
        disputeID=arbitrator.createDispute.value(_arbitrationCost)(AMOUNT_OF_CHOICES,arbitratorExtraData);
        Dispute(arbitrator,disputeID,RULING_OPTIONS);
    }
    
    /** @dev Reimburse payer if payee fails to pay the fee.
     */
    function timeOutByPayer() onlyPayer {
        require(status==Status.WaitingPayee);
        require(now>=lastInteraction+timeout);
        
        executeRuling(disputeID,REIMBURSE_PAYER);
    }
    
    /** @dev Pay payee if payer fails to pay the fee.
     */
    function timeOutByPayee() onlyPayer {
        require(status==Status.WaitingPayer);
        require(now>=lastInteraction+timeout);
        
        executeRuling(disputeID,PAY_PAYEE);
    }
    
    /** @dev Submit a reference to evidence. EVENT.
     *  @param _evidence A link to an evidence using its URI.
     */
    function submitEvidence(string _evidence) {
        require(status>=Status.DisputeCreated);
        require(msg.sender==payer || msg.sender==payee);
        Evidence(arbitrator,disputeID,msg.sender,_evidence);
    }
    
    /** @dev Execute a ruling of a dispute.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. 1 : Reimburse the payer. 2 : Pay the payee.
     */
    function executeRuling(uint _disputeID, uint _ruling) internal {
        require(_disputeID==disputeID);
        require(_ruling<=AMOUNT_OF_CHOICES);
        
        // Give all the value present in this contract. Note that this means arbitration fees are reimbursed for the winning party.
        if (_ruling == REIMBURSE_PAYER)
            payer.transfer(this.balance);
        else if (_ruling == PAY_PAYEE)
            payee.transfer(this.balance);
    }
    
    /** @dev Allow the payer to paid additional money without recreating a contract.
     */
    function () payable {}

    
}
