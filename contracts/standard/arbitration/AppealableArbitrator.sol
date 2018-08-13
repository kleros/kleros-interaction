/**
 *  @title AppealableArbitrator
 *  @author Ferit Tunçer - <ferit@cryptolab.net>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.24;

import "./CentralizedArbitrator.sol";
import "./Arbitrable.sol";
import "./Arbitrator.sol";

/** @title Centralized Arbitrator
 *  This is an appealable arbitrator which can be appealed to another arbitrator
 *  if it doesn't rule in time.
 */
contract AppealableArbitrator is CentralizedArbitrator, Arbitrable {
    uint blocksToTimeout;
    mapping (uint => uint) public rulingBlockNumbers;


    constructor(Arbitrator _superior,
      uint _arbitrationPrice,
      bytes _arbitratorExtraData,
      uint _blocksToTimeout)
      CentralizedArbitrator(_arbitrationPrice)
      Arbitrable(_superior, _arbitratorExtraData) {
        blocksToTimeout = _blocksToTimeout;
        owner = msg.sender;
    }

    function appealCost(uint _disputeID, bytes _extraData) public view returns(uint fee) {
        return arbitrator.appealCost(_disputeID, _extraData);
    }

    function giveRuling(uint _disputeID, uint _ruling) public onlyOwner {
        DisputeStruct dispute = disputes[_disputeID];

        require(_ruling<=dispute.choices);

        dispute.ruling = _ruling;
        rulingBlockNumbers[_disputeID] = block.number;

        dispute.status = DisputeStatus.Appealable;
        emit AppealPossible(_disputeID);

        uint fee = dispute.fee;
        dispute.fee = 0;
        msg.sender.transfer(fee);
    }

    function rule(uint _disputeID, uint _ruling) public onlyOwner {
        require(block.number > rulingBlockNumbers[_disputeID] + blocksToTimeout);
        emit Ruling(Arbitrator(msg.sender),_disputeID,_ruling);

        executeRuling(_disputeID,_ruling);
    }

    function appeal(uint _disputeID, bytes _extraData) public payable {
        DisputeStruct dispute = disputes[_disputeID];

        require(msg.value >= appealCost(_disputeID, _extraData));
        require(dispute.arbitrated == msg.sender);
        require(dispute.status == DisputeStatus.Appealable);

        super.appeal(_disputeID,_extraData);

        arbitrator.createDispute(disputes[_disputeID].choices, _extraData);

        delete disputes[_disputeID];
    }

    function executeRuling(uint _disputeID, uint _ruling) internal {
        disputes[_disputeID].status = DisputeStatus.Solved;

        disputes[_disputeID].arbitrated.rule(_disputeID, _ruling);
    }

}
