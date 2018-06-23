// ONLY FOR TESTING PURPOSES

pragma solidity ^0.4.18;

import "./ArbitrableBlacklist.sol";

contract ExposedArbitrableBlacklist is ArbitrableBlacklist {
  function _executeRuling(uint _disputeID, uint _ruling) public {
      return executeRuling(_disputeID, _ruling);
  }

  function ExposedArbitrableBlacklist(Arbitrator _arbitrator, bytes _arbitratorExtraData, bytes32 _contractHash, uint _stake, uint _timeToChallenge) ArbitrableBlacklist(_arbitrator, _arbitratorExtraData, _contractHash, _stake, _timeToChallenge) public {

  }

}
