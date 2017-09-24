/**
 *  @title Arbitration Standard
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.15;

import "./Arbitrator.sol";

/** @title Centralized Arbitrator
 *  This is a centralized arbitrator deciding alone of the result of disputes.
 *  No appeals are possible.
 */
contract CentralizedArbitrator is Arbitrator {
    
    address public owner=msg.sender;
    uint arbitrationPrice; // Not public because arbitrationCost already acts as an accessor.
    uint constant NOT_PAYABLE_VALUE = (2**256-2)/2; // High value to be sure that the appeal is too expensive.
    
    struct Dispute {
        Arbitrable arbitrated;
        uint choices;
        uint fee;
    }
    
    modifier onlyOwner {require(msg.sender==owner); _;}
    
    Dispute[] public disputes;
    
    /** @dev Constructor. Set the initial arbitration price.
     *  @param _arbitrationPrice Amount to be paid for arbitration.
     */
    function CentralizedArbitrator(uint _arbitrationPrice) {
        arbitrationPrice = _arbitrationPrice;
    }
    
    /** @dev Set the arbitration price. Only callable by the owner.
     *  @param _arbitrationPrice Amount to be paid for arbitration.
     */
    function setArbitrationPrice(uint _arbitrationPrice) onlyOwner {
        arbitrationPrice = _arbitrationPrice;
    }
    
    /** @dev Cost of arbitration. Accessor to arbitrationPrice.
     *  @param _extraData Not used by this contract.
     *  @return fee Amount to be paid.
     */
    function arbitrationCost(bytes _extraData) constant returns(uint fee) {
        return arbitrationPrice;
    }
    
    /** @dev Cost of appeal. Since it is not possible, it's a high value which can never be paid.
     *  @param _disputeID ID of the dispute to be appealed. Not used by this contract.
     *  @param _extraData Not used by this contract.
     *  @return fee Amount to be paid.
     */
    function appealCost(uint _disputeID, bytes _extraData) constant returns(uint fee) {
        return NOT_PAYABLE_VALUE;
    }
    
    /** @dev Create a dispute. Must be called by the arbitrable contract.
     *  Must be paid at least arbitrationCost().
     *  @param _choices Amount of choices the arbitrator can make in this dispute. When ruling ruling<=choices.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return disputeID ID of the dispute created.
     */
    function createDispute(uint _choices, bytes _extraData) payable returns(uint disputeID)  {
        super.createDispute(_choices,_extraData);
        return disputes.push(Dispute({
            arbitrated: Arbitrable(msg.sender),
            choices: _choices,
            fee: msg.value
        })) - 1; // Create the dispute and return its number.
    }
    
    /** @dev Give a ruling. UNTRUSTED.
     *  @param _disputeID ID of the dispute to rule.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 means "Not able/wanting to make a decision".
     */
    function giveRuling(uint _disputeID, uint _ruling) {
        Dispute dispute = disputes[_disputeID];
        require(_ruling<=dispute.choices);
        
        uint fee = dispute.fee;
        dispute.arbitrated=Arbitrable(0x0); // Clean up to get gas back and prevent calling it again.
        dispute.choices=0;
        dispute.fee=0;
        
        
        msg.sender.transfer(fee);
        dispute.arbitrated.rule(_disputeID,_ruling);
    }
    
}

