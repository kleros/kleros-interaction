/**
 *  @title Arbitration Standard
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.16;

/** @title Arbitrable
 *  Arbitrable abstract contract.
 *  When developing arbitrable contracts, we need to:
 *  -Define the action taken when a ruling is received by the contract. We should do so in executeRuling.
 *  -Allow dispute creation. For this a function must:
 *      -Call arbitrator.createDispute.value(_fee)(_choices,_extraData);
 *      -Create the event Dispute(_arbitrator,_disputeID,_rulingOptions);
 */
contract Arbitrable{
    Arbitrator public arbitrator;
    
    modifier onlyArbitrator {require(msg.sender==address(arbitrator)); _;}
    
    /** @dev To be raised when a dispute is created. The main purpose of this event is to let the arbitrator know the meaning ruling IDs.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _rulingOptions Map ruling IDs to short description of the ruling in a CSV format using ";" as a delimiter. Note that ruling IDs start a 1. For example "Send funds to buyer;Send funds to seller", means that ruling 1 will make the contract send funds to the buyer and 2 to the seller.
     */
    event Dispute(Arbitrator indexed _arbitrator, uint indexed _disputeID, string _rulingOptions);
    
    /** @dev Constructor. Choose the arbitrator.
     *  @param _arbitrator The arbitrator of the contract.
     */
    function Arbitrable(Arbitrator _arbitrator) {
        arbitrator=_arbitrator;
    }
    
    /** @dev Give a ruling for a dispute. Must be call by the arbitrator.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function rule(uint _disputeID, uint _ruling) onlyArbitrator {
        executeRuling(_disputeID,_ruling);
    }
    
    
    /** @dev Execute a ruling of a dispute.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function executeRuling(uint _disputeID, uint _ruling) internal;
}

/** @title Arbitrator
 *  Arbitrator abstract contract.
 *  When developing arbitrator contracts we need to:
 *  -Define the functions for dispute creation (createDispute) and appeal (appeal). Don't forget to store the arbitrated contract and the disputeID (which should be unique, use nbDisputes).
 *  -Define the functions for cost display (arbitrationCost and appealCost).
 *  -Allow giving rulings. For this a function must call arbitrable.rule(disputeID,ruling).
 */
contract Arbitrator{
    
    modifier requireArbitrationFee(bytes _extraData) {require(msg.value>=arbitrationCost(_extraData)); _;}
    modifier requireAppealFee(uint _disputeID, bytes _extraData) {require(msg.value>=appealCost(_disputeID, _extraData)); _;}
    
    /** @dev Create a dispute. Must be called by the arbitrable contract.
     *  Must be paid at least arbitrationCost().
     *  @param _choices Amount of choices the arbitrator can make in this dispute. When ruling ruling<=choices.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return disputeID ID of the dispute created.
     */
    function createDispute(uint _choices, bytes _extraData) requireArbitrationFee(_extraData) payable returns(uint disputeID)  {}
    
    /** @dev Compute the cost of arbitration. It is recommended not to increase it often, as it can be higly time and gas consuming for the arbitrated contracts to cope with fee augmentation.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return fee Amount to be paid.
     */
    function arbitrationCost(bytes _extraData) constant returns(uint fee);
    
    /** @dev Appeal a ruling. Note that it has to be called before the arbitrator contract calls rule.
     *  @param _disputeID ID of the dispute to be appealed.
     *  @param _extraData Can be used to give extra info on the appeal.
     */
    function appeal(uint _disputeID, bytes _extraData) requireAppealFee(_disputeID,_extraData) payable {}
    
    /** @dev Compute the cost of appeal. It is recommended not to increase it often, as it can be higly time and gas consuming for the arbitrated contracts to cope with fee augmentation.
     *  @param _disputeID ID of the dispute to be appealed.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return fee Amount to be paid.
     */
    function appealCost(uint _disputeID, bytes _extraData) constant returns(uint fee);
}
