/* 
This is a buying contract which will be used as an example of contract to be arbitrated by the decentralized arbitration court.
WARNING: This code has been developped during a hackathon, this implies fast development. We can't guarantee it is secure. 
Before deploying code which handle significant values, don't forget to check for security vulnerabilities, organize a red team exercise and propose a bounty for exploit discovery.

The funds are released to the seller if:
-The buyer fail to oppose after daysToOppose days (this avoid the problem of buyer never confirming)
-The buyer release the funds
-The arbitrator rule in favor of the seller

The funds are released to the buyer if:
-The arbitrator rule in favor of the buyer
-The seller accept to refund the buyer

This contract only handle paiement in ether. (Support for tokens is planed for futur versions)
*/

pragma solidity ^0.4.4;

contract ArbitratedBuy {
    address public buyer;
    address public seller;
    address public arbitrator;
    uint32  public daysToOppose; // Number of days after which the ether are automaticaly given to the seller if no opposition
    uint256 public price;
    uint256 public timePayment;
    bytes32 public blindedContract; // A hash of the plain English contract. The plain English contract should at least contain the good sold, the quantity and the maximum delivery time (which should be lower than daysToOppose).
    
    enum State {New, Paid, Blocked}
    State public state;
    
    /// Create the contract and put the amount needed in it.
    function ArbitratedBuy(uint256 _price, uint32 _daysToOppose, address _arbitrator, bytes32 _blindedContract) {
        seller=msg.sender;
        arbitrator=_arbitrator;
        price=_price;
        daysToOppose=_daysToOppose;
        blindedContract=_blindedContract;
    }
    
    function pay() payable {
        if (msg.value!=price || state!=State.New) // Verify the price is right and it hasn't been paid yet.
            throw;
        buyer=msg.sender;
        timePayment=now;
    }
    
    function releaseToSeller() {
        if (msg.sender==buyer || msg.sender==arbitrator) // Only buyer and arbitrator can release.
        {
            if (!seller.send(this.balance))
                throw;
        }
        else
            throw;
    }
    
    function releaseToBuyer() {
        if (msg.sender==seller || msg.sender==arbitrator) // Only seller and arbitrator can release.
        {
            if (!buyer.send(this.balance))
                throw;
        }
        else
            throw;
    }
    
    /// If the buyer hasn't receive the product by the deadline he can call this function to prevent the buyer from being able to withdraw the funds
    function block() {
        if (msg.sender!=buyer)
            throw;
        state=State.Blocked;
    }
    
    function withdrawAfterTime() {
        if (msg.sender!=seller)
            throw;
        if (state!=State.Paid)
            throw;
        if (now < timePayment+daysToOppose * 1 days)
            throw;
        if(!seller.send(this.balance))
            throw; 
    }
    
}



