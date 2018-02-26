pragma solidity ^0.4.15;

import "kleros/contracts/KlerosPOC.sol";

import "./VersioningProxy.sol";

/**
 *  @title SimpleArbitratorVersioningProxy
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @notice A simpler ArbitratorVersioningProxy that only exposes methods in the Arbitrator spec.
 */
 contract SimpleArbitratorVersioningProxy is VersioningProxy {
    /* Storage */

    mapping (uint256 => address) public disputes;

    /* Modifiers */

    modifier onlyIfDisputeExists {
        require(disputes[_disputeID] != address(0));
        _;
    }

    /* Constructor */

    /**
     * @notice Constructs the arbitrator versioning proxy with the first arbitrator contract version address and tags it v0.0.1.
     * @param firstAddress The address of the first arbitrator contract version.
     */
    function SimpleArbitratorVersioningProxy(address firstAddress) VersioningProxy(false, "0.0.1", firstAddress) public {}

    /* Fallback */

    /**
     * @notice Overwrites default Proxy behavior.
     * @dev @overwrite Proxy.
     */
    function() private {}

    /* Public */

    function createDispute(bytes _extraData) public payable returns(uint256 disputeID) {
        uint256 disputeID = KlerosPOC(stable._address).createDispute(_extraData);
        disputes[disputeID] = stable._address; // Remember arbitrator
        return disputeID;
    }

    function appeal(uint _disputeID, bytes _extraData) public payable onlyIfDisputeExists returns(uint256 disputeID) {
        if (disputes[_disputeID] != stable._address) // Arbitrator has been upgraded, create a new dispute in the new arbitrator
            return createDispute(_extraData);
        
        return KlerosPOC(stable._address).appeal(_disputeID, _extraData);
    }

    /* Public Views */

    function arbitrationCost(bytes _extraData) public view returns(uint256 fees) {
        return KlerosPOC(stable._address).arbitrationCost(_extraData);
    }

    function appealCost(uint256 _disputeID, bytes _extraData) public view returns(uint256 fees) {
        return KlerosPOC(stable._address).appealCost(_disputeID, _extraData);
    }

    function currentRuling(uint _disputeID) public view onlyIfDisputeExists returns (uint ruling) {
        return KlerosPOC(disputes[_disputeID]).currentRuling(_disputeID);
    }

    function disputeStatus(uint _disputeID) public view onlyIfDisputeExists returns (DisputeStatus status) {
        return KlerosPOC(disputes[_disputeID]).disputeStatus(_disputeID);
    }
}
