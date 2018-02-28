pragma solidity ^0.4.15;

import "../arbitration/Arbitrator.sol";

import "./VersioningProxy.sol";

/**
 *  @title ArbitratorVersioningProxy
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @notice A proxy that only exposes methods in the Arbitrator spec.
 */
 contract ArbitratorVersioningProxy is VersioningProxy {
    /* Storage */

    mapping (uint256 => address) public disputes;

    /* Modifiers */

    modifier onlyIfDisputeExists(uint256 _disputeID) {
        require(disputes[_disputeID] != address(0));
        _;
    }

    /* Constructor */

    /**
     * @notice Constructs the arbitrator versioning proxy with the first arbitrator contract version address and tags it v0.0.1.
     * @param _firstAddress The address of the first arbitrator contract version.
     */
    function ArbitratorVersioningProxy(address _firstAddress) VersioningProxy("0.0.1", _firstAddress) public {}

    /* Public */

    function createDispute(uint256 _choices, bytes _extraData) public payable returns(uint256 _disputeID) {
        _disputeID = Arbitrator(implementation).createDispute(_choices, _extraData);
        disputes[_disputeID] = implementation; // Remember arbitrator
        return _disputeID;
    }

    function appeal(uint256 _disputeID, bytes _extraData) public payable onlyIfDisputeExists(_disputeID) returns(uint256 _newDisputeID) {
        if (disputes[_disputeID] != implementation) // Arbitrator has been upgraded, create a new dispute in the new arbitrator
            return createDispute((Arbitrator(disputes[_disputeID]).disputes(_disputeID).choices), _extraData);
        
        Arbitrator(implementation).appeal(_disputeID, _extraData);
        return _disputeID;
    }

    /* Public Views */

    function arbitrationCost(bytes _extraData) public view returns(uint256 _fees) {
        return Arbitrator(implementation).arbitrationCost(_extraData);
    }

    function appealCost(uint256 _disputeID, bytes _extraData) public view returns(uint256 _fees) {
        return Arbitrator(implementation).appealCost(_disputeID, _extraData);
    }

    function currentRuling(uint256 _disputeID) public view onlyIfDisputeExists(_disputeID) returns(uint256 _ruling) {
        return Arbitrator(disputes[_disputeID]).currentRuling(_disputeID);
    }

    function disputeStatus(uint256 _disputeID) public view onlyIfDisputeExists(_disputeID) returns(Arbitrator.DisputeStatus _status) {
        return Arbitrator(disputes[_disputeID]).disputeStatus(_disputeID);
    }
}
