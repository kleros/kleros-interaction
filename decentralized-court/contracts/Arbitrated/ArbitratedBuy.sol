/* 
This is a buying contract which will be used as an example of contract to be arbitrated by the decentralized arbitration court.
WARNING: This code has been developped during a hackathon, this implies fast development. We can't guarantee it is secure. 
Before deploying code which handle significant values, don't forget to check for security vulnerabilities, organize a red team exercise and propose a bounty for exploit discovery.

The funds are released to the seller if:
-The buyer fail to oppose after daysToOppose days (this avoid the problem of buyer never confirming)
-The buyer release the funds
-The court rule in favor of the seller

The funds are released to the buyer if:
-The court rule in favor of the buyer
-The seller accept to refund the buyer

This contract only handle paiement in ether. (Support for tokens is planed for futur versions)
*/

pragma solidity ^0.4.6;

import "../Court.sol";
import "./Arbitrated.sol";

contract arbitratedBuy is TwoPartyArbitrable {
    address public buyer;
    address public seller;
    uint32  public daysToOppose; // Number of days after which the ether are automaticaly given to the seller if no opposition
    uint256 public price;
    uint256 public timePayment;
    
    enum State {New, Paid, Blocked}
    State public state;
    
    /// Create the contract and put the amount needed in it.
    function arbitratedBuy(uint256 _price, uint32 _daysToOppose, Court _court, uint256 _timeToReac) TwoPartyArbitrable(_court,0,_timeToReac) {
        seller=msg.sender;
        price=_price;
        daysToOppose=_daysToOppose;
    }
    
    function pay() payable {
        if (msg.value!=price || state!=State.New) // Verify the price is right and it hasn't been paid yet.
            throw;
        buyer=msg.sender;
        partyB=msg.sender;
        timePayment=now;
    }
    
    /// Release the money to the buyer.
    function actionA(uint256 _disputeID) private {releaseToBuyer();}
    
    /// Release the money to the seller.
    function actionB(uint256 _disputeID) private {releaseToSeller();}
    
    function releaseToSeller() {
        if (msg.sender==buyer || msg.sender==address(court)) // Only buyer and arbitrator can release.
        {
            if (!seller.send(this.balance))
                throw;
        }
        else
            throw;
    }
    
    function releaseToBuyer() {
        if (msg.sender==seller || msg.sender==address(court)) // Only seller and arbitrator can release.
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


