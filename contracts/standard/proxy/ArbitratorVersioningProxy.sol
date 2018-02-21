pragma solidity ^0.4.15;

import "https://github.com/kleros/kleros/contracts/KlerosPOC.sol";

import "./VersioningProxy.sol";

/**
 *  @title ArbitratorVersioningProxy
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @notice A contract derived from VersioningProxy to manage the deployment of new versions of an Arbitrator contract.
 */
 contract ArbitratorVersioningProxy is VersioningProxy {
    /* Enums */



    /* Structs */



    /* Events */



    /* Storage */



    /* Modifiers */



    /* Constructor */



    /* Fallback */



    /* External */



    /* External Views */



    /* Public */



    /* Public Views */



    /* Internal */



    /* Internal Views */



    /* Private */

    /**
     * @notice Called whenever 'stable' changes. We use it to transfer open disputes to the new Arbitrator contract.
     * @param prevAddress The previous 'stable' contract address.
     * @param nextAddress The next 'stable' contract address.
     */
    function handleStableChange(address prevAddress, address nextAddress) private {
        KlerosPOC prevArbitrator = KlerosPOC(prevAddress);
        KlerosPOC nextArbitrator = KlerosPOC(nextAddress);

        
    }

    /* Private Views */



}
