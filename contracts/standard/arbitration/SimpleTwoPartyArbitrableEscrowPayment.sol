pragma solidity ^0.4.24;

import "./Arbitrable.sol";

contract SimpleTwoPartyArbitrableEscrowPayment is Arbitrable {
    address public sender;
    address public receiver;
    uint public value;
    bytes public extraData;
    Arbitrator public arbitrator;
    uint public disputeID;
    bool public disputed;
    bool public appealed;
    bool public executed;
    uint public createdAt;
    uint public timeOut;

    modifier onlySenderOrReceiver{
        require(msg.sender == sender || msg.sender == receiver, "Can only be called by the sender or the receiver.");
        _;
    }

    constructor(address _receiver, bytes _extraData, Arbitrator _arbitrator, uint _timeOut, string _metaEvidence) public payable {
        sender = msg.sender;
        receiver = _receiver;
        value = msg.value;
        extraData = _extraData;
        arbitrator = _arbitrator;
        createdAt = now;
        timeOut = _timeOut;
        emit MetaEvidence(0, _metaEvidence);
    }

    function raiseDispute() public payable onlySenderOrReceiver {
        disputeID = arbitrator.createDispute.value(msg.value)(2, extraData);
        emit Dispute(arbitrator, disputeID, 0, 0);
    }

    function submitEvidence(string _evidence) public onlySenderOrReceiver {
        require(disputed, "The payment has to be disputed.");
        require(!appealed, "The payment can not be appealed.");
        emit Evidence(arbitrator, 0, msg.sender, _evidence);
    }

    function appeal() public payable onlySenderOrReceiver {
        arbitrator.appeal.value(msg.value)(disputeID, extraData);
        if (!appealed) appealed = true;
    }

    function executePayment() public onlySenderOrReceiver {
        require(now - createdAt > timeOut, "The timeout time has not passed yet.");
        require(!disputed, "The payment is disputed.");
        require(!executed, "The payment was already executed.");
        executed = true;
        receiver.send(value);
    }

    function executeRuling(uint _disputeID, uint _ruling) internal {
        require(disputed, "The payment is not disputed.");
        require(_disputeID == disputeID, "Wrong dispute ID.");
        require(!executed, "The payment was already executed.");
        executed = true;
        if (_ruling == 2) receiver.send(value);
        else sender.send(value);
        emit Ruling(arbitrator, disputeID, _ruling);
    }
}
