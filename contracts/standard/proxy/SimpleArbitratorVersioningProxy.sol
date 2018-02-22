pragma solidity ^0.4.15;

import "https://github.com/kleros/kleros/contracts/KlerosPOC.sol";

import "./VersioningProxy.sol";

/**
 *  @title SimpleArbitratorVersioningProxy
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @notice A simpler ArbitratorVersioningProxy that only exposes methods in the Arbitrator spec.
 */
 contract SimpleArbitratorVersioningProxy is VersioningProxy {
    /* Enums */



    /* Structs */



    /* Events */



    /* Storage */



    /* Modifiers */



    /* Constructor */

    /**
     * @notice Constructs the arbitrator versioning proxy with the first arbitrator contract version address and tags it v0.0.1.
     * @param firstAddress The address of the first arbitrator contract version.
     */
    function ArbitratorVersioningProxy(address firstAddress) VersioningProxy(false, "0.0.1", firstAddress) public {}

    /* Fallback */

    /**
     * @notice Overwrites default Proxy behavior.
     * @dev @overwrite Proxy.
     */
    function() private {}

    /* External */



    /* External Views */



    /* Public */



    /* Public Views */



    /* Internal */



    /* Internal Views */



    /* Private */



    /* Private Views */



}
