pragma solidity ^0.4.24;

import "./CentralizedArbitrator.sol";

/* @title BackupedArbitrator
 * This is a centralized arbitrator that keeps a list of backup addresses (heirs).
 * In case the contract becomes unresposive, one of the heirs can take it over.
 */
contract BackupedArbitrator is CentralizedArbitrator {
  uint public timeout; // The time of inactivity after which this arbitrator can be taken over
  uint public lastTakenOver; // The last time this contract changed owner
  mapping(address => bool) public heirs; // The list of possible heirs of this contract
  mapping(uint => uint) public timers; // We keep the creation time of all disputes here

  /** @dev Constructor.
   *  @param _timeout The timeout after which owner can be changed.
   *  @param _heirs The list of possible heirs in case of a timeout.
   */
  constructor(uint _timeout, address[] _heirs){
    timeout = _timeout;
    addHeirs(_heirs);
    lastTakenOver = now;
  }

  /** @dev Create a dispute. Must be called by the arbitrable contract.
   *  Must be paid at least arbitrationCost().
   *  @param _choices Amount of choices the arbitrator can make in this dispute. When ruling ruling<=choices.
   *  @param _extraData Can be used to give additional info on the dispute to be created.
   *  @return disputeID ID of the dispute created.
   */
  function createDispute(uint _choices, bytes _extraData) public payable returns(uint disputeID)  {
      super.createDispute(_choices,_extraData);
      disputeID = disputes.push(Dispute({
          arbitrated: Arbitrable(msg.sender),
          choices: _choices,
          fee: msg.value,
          ruling: 0,
          status: DisputeStatus.Waiting
      })) - 1; // Create the dispute and return its number.
      timers[disputeID] = now; // set the timer for this dispute

      DisputeCreation(disputeID, Arbitrable(msg.sender));
      return disputeID;
  }

  /** @dev Append a list of new heirs. Lists of one are acceptable.
   *  With n being the number of heirs, the complexity is O(n).
   *  @param _heirs The list of possible heirs to this contract
   */
  function addHeirs(address[] _heirs) public onlyOwner {
    for (uint i=0; i < _heirs.length; i++){
      heirs[_heirs[i]] = true;
    }
  }

  /** @dev Remove a list of heirs. Lists of one are acceptible.
   *  With n being the number of heirs, the complexity is O(n).
   *  @param _heirs the address of the heir you want to remove.
   */
  function removeHeirs(address[] _heirs) public onlyOwner {
    for (uint i=0; i < _heirs.length; i++){
      heirs[_heirs[i]] = false;
    }
  }

  /** @dev Prove that a dispute has timed out and take over the contract.
   *  Must be called by a heir.
   *  @param _disputeID The ID of the dispute which has timed out.
   */
  function takeOver(uint _disputeID) public {
    require(heirs[msg.sender]); // msg.sender must be a heir.
    require(disputes[_disputeID].status == DisputeStatus.Waiting); // The dispute must be stall.
    require(lastTakenOver + timeout <= now); // Prevent attacks from other heirs.
    require(timers[_disputeID] + timeout <= now); // The dispute has to be timed out.

    lastTakenOver = now; // Prevent the other heirs from forcibly taking over the contract soon after the owner has changed.
    owner = msg.sender;
  }
}
