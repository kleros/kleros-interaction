/**
 *  @title Arbitration Standard
 *  @author Clément Lesaege - <clement@lesaege.com>
 */

pragma solidity ^0.4.13;

contract Arbitrable{
    Arbitrator public arbitrator;
    
    modifier onlyArbitrator {require(msg.sender==address(arbitrator)); _;}
    
    /** @dev Give a ruling for a dispute. Must be call by the arbitrator.
     *  The arbitrable smart contract determines the consequences of this ruling.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator.
     */
    function rule(uint _disputeID, uint _ruling) onlyArbitrator {}
}


contract Arbitrator{
    
    /** @dev Create a dispute. Must be called by the arbitrable contract.
     *  Must be paid at least arbitrationCost().
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return disputeID ID of the dispute created.
     */
    function createDispute(bytes _extraData) payable returns(uint disputeID)  {
        require(msg.value>=arbitrationCost(_extraData)); // Require that the arbitration cost be paid.
    }
    
    /** @dev Compute the cost of arbitration.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return fee Amount to be paid.
     */
    function arbitrationCost(bytes _extraData) constant returns(uint fee);
    
    /** @dev Appeal a ruling. Note that it has to be called before the arbitrator contract calls rule.
     *  @param _disputeID ID of the dispute to be appealed.
     *  @param _extraData Can be used to give extra info on the appeal.
     */
    function appeal(uint _disputeID, bytes _extraData) payable {
        require(msg.value>=appealCost(_disputeID, _extraData)); // Require the appeal cost to be paid.
        
    }
    
    /** @dev Compute the cost of appeal.
     *  @param _disputeID ID of the dispute to be appealed.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return fee Amount to be paid.
     */
    function appealCost(uint _disputeID, bytes _extraData) constant returns(uint fee);
}






