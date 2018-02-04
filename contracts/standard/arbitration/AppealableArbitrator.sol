/**
 *  @title Arbitration Standard *  @author Mahadevan K - <mahadevan.k@gmail.com>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.15;

import "./CentralizedArbitrator.sol";

/** @title Appealable Arbitrator
 *  This is a single arbitrator deciding alone of the result of disputes, but appeals are possible unlike in CentralizedArbitrator
 */
contract AppealableArbitrator is CentralizedArbitrator {
    /** @dev Cost of appeal, as of now just multiplying this by two to create increasing cost for appeals
     *  @param _disputeID ID of the dispute to be appealed. Not used by this contract.
     *  @param _extraData Not used by this contract.
     *  @return fee Amount to be paid.
     */
    function appealCost(uint _disputeID, bytes _extraData) public constant returns(uint fee) {
        return arbitrationPrice*2.0;
    }

    /**
     * @dev - remove owner as arbitrator since appeal was successful, this function assumes that the arbitrable is reassigned by Arbitrable
     * @param _disputeID ID of the dispute to remove
     */
    function appealSuccessful(uint _disputeID) public {
        Dispute dispute = disputes[_disputeID];
        require(dispute.status==DisputeStatus.Appealable);
        delete disputes[_disputeID];
    }

    /** @dev Give a ruling. UNTRUSTED.
     *  @param _disputeID ID of the dispute to rule.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 means "Not able/wanting to make a decision".
     */
    function giveRuling(uint _disputeID, uint _ruling) public onlyOwner {
        Dispute dispute = disputes[_disputeID];
        require(_ruling<=dispute.choices);
        
        uint fee = dispute.fee;
        Arbitrable arbitrated = dispute.arbitrated;
        dispute.arbitrated=Arbitrable(0x0); // Clean up to get gas back and prevent calling it again.
        dispute.fee=0;
        dispute.ruling=_ruling;
        if(_ruling==0) {
            dispute.status=DisputeStatus.Appealable;
        } else {
            dispute.status=DisputeStatus.Solved;
            msg.sender.transfer(fee);
        }
        
        arbitrated.rule(_disputeID,_ruling);
    }
 
 
}
