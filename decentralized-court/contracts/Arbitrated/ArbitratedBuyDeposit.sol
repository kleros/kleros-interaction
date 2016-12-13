/* 
Contract Implementing the following workflow:

	• Seller and buyer agree on contract and arbiter.
	• Seller stores the contract on IPFS, make a smart contract giving it a deposit of 10% and the hash of the document on IPFS
	• Buyer sends the price and a 10% deposit. Before the buyer has paid, the seller can cancel the contract and get back his deposit.
	• If anything works fine, the buyer confirm the recepetion, gets his deposit back, seller get the payment and deposit back.
	• Anytime, the seller can lower the amount of Ether asked as a compensation for things like partial damages or delay. The buyer has to accept it.
	• Either buyer or seller can start a dispute by sending message to contract.
	• Parties can submit questions and supporting evidence to IPFS.
	• The arbitrator can take the deposit value and split the remaining to the buyer and seller.
*/

pragma solidity ^0.4.6;

contract ArbitratedBuyDeposit {
    address public buyer;
    address public seller;
    address public arbitrator;
    uint256 public deposit; // Deposit for each party is 1/10 the price
    uint256 public pendingReturnBuyer;
    uint256 public pendingReturnSeller;
    uint256 public sellerProposedValue; // Value to be given to the seller. Seller can lower it. Buyer can accept it.
    bool    public settled;
    bool    public disputed;
    
    event DocumentSubmitted(address submiter,string hashDocumentIPFS);
    
    modifier notSettled() {if (settled) throw; _;}
    modifier onlyBy(address _account) { if (msg.sender != _account) throw; _;}


    /** Create the contract and put the amount needed in it.
     * @param _arbitrator Party who will be able to arbitrate the contract.
     * @param hashContractIPFS IPFS address of the contract.
     */
    function ArbitratedBuyDeposit(address _arbitrator, string hashContractIPFS) payable {
        seller=msg.sender;
        arbitrator=_arbitrator;
        deposit = msg.value; 
        DocumentSubmitted(seller,hashContractIPFS);
        sellerProposedValue = 11 * deposit;
    }
    
    /** Pay the product and a 10% deposit */
    function pay() payable {
        if (msg.value!=deposit * 11 || buyer!=0) // Verify the price is right and it hasn't been paid yet.
            throw;
        buyer=msg.sender;
    }
    
    /** Confirm the reception: Give the deposit back to the buyer, allow seller to get the remaining funds.
     * Note that it is necessary even with confirmImperfectReception because this function makes sure the buyer is always able to at least get his deposit back (unless settled by the arbitrator).
     */
    function confirmPerfectReception() onlyBy(buyer) notSettled {
        pendingReturnSeller=this.balance-deposit;
        settled=true;
        if (!buyer.send(deposit))
            throw;
    }
    
    /** Cancel the sell offer, can only be done before it is paid. */
    function cancelSellOffer() onlyBy(seller) {
        if (buyer!=0) // Not possible if there is a buyer
            throw;
        if (!seller.send(this.balance))
            throw;
    }
    
    
    /** Change the proposed amount to be given.
     * Can only be called by the seller.
     * This is used by the seller to refund some value to the buyer in case of delay or partial damage.
     * @param _sellerProposedValue The value the seller is asking.
     */
    function changeSellerProposedValue(uint256 _sellerProposedValue) onlyBy(seller) {
        sellerProposedValue=_sellerProposedValue;
    }


    /** Confirm the reception and agree to pay valueToSeller, the buyer gets the remaining Ether.
     * @param valueToSeller Value to be given to the seller. Must match sellerProposedValue.
     */
    function confirmImperfectReception(uint256 valueToSeller) onlyBy(buyer) notSettled {
        if (valueToSeller>this.balance) // You can't give more than what there is in the contract
            throw;
        if (valueToSeller!=sellerProposedValue) // buyer must agree with the seller for this function to be called
            throw;
        
        settled=true;
        pendingReturnSeller=valueToSeller;
        if (!buyer.send(this.balance-valueToSeller))
            throw;
    }
    
    /** Withdraw pending return. */
    function withdraw(){
        uint256 amountToBeSend;
        
        if (msg.sender==buyer){
            amountToBeSend=pendingReturnBuyer;
            pendingReturnBuyer=0;
        }else if (msg.sender==seller){
            amountToBeSend=pendingReturnSeller;
            pendingReturnSeller=0;
        }
        else
            throw;
            
        if(!msg.sender.send(amountToBeSend))
            throw;
    }
    
    /** Create a dispute, this allows the arbiter to decide how funds are splitted and get the deposit of the loosing party */
    function createDispute() {
        if (msg.sender!=buyer && msg.sender!=seller)
            throw;
        disputed=true;
    }
    
    /** The arbitrator can decide to split the funds on the contract.
     * @param buyerShare The amount to be awarded to the buyer.
     * @param sellerShare The amount to be awarded to the seller.
     * @param hashDecisionIPFS IPFS address of decision motives.
     */
    function decideSplit(uint256 buyerShare,uint256 sellerShare, string hashDecisionIPFS) onlyBy(arbitrator) notSettled {
        if (!disputed)
            throw;
        if (buyerShare+sellerShare!=this.balance-deposit) // Verify that all the ether (except a deposit) are splitted
            throw;
        pendingReturnBuyer=buyerShare;
        pendingReturnSeller=sellerShare;
        settled=true;
        
        DocumentSubmitted(arbitrator,hashDecisionIPFS);
        if(!arbitrator.send(deposit)) // Give a deposit to the arbitrator
            throw;
    }
    
    /** Submit documents relative to the dispute. 
     * Note that anyone can submit them, this allows third parties to give supporting documents.
     * @param hashDocumentIPFS IPFS address of the document.
     */
    function submit(string hashDocumentIPFS){
        DocumentSubmitted(msg.sender,hashDocumentIPFS);
    }
    
    function getBalance() returns (uint256) {return this.balance;}
}






