/**
 *  @title Arbitrable
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.15;

import "./Arbitrator.sol";

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
    
    /** @dev To be raised when evidence are submitted. Should point to the ressource (evidences are not to be stored on chain due tp gas considerations).
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _party The address of the party submiting the evidence. Note that 0 is kept for evidences not submitted by any party.
     *  @param _evidence A link to evidence. Can be web link ("http://X"), IPFS ("ipfs:/X") or another storing service (using the URI, see https://en.wikipedia.org/wiki/Uniform_Resource_Identifier ).
     */
    event Evidence(Arbitrator indexed _arbitrator, uint indexed _disputeID, address _party, string _evidence);
    
    
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


