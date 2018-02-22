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

    mapping (uint256 => address) public disputes;

    /* Modifiers */



    /* Constructor */

    /**
     * @notice Constructs the arbitrator versioning proxy with the first arbitrator contract version address and tags it v0.0.1.
     * @param firstAddress The address of the first arbitrator contract version.
     */
    function ArbitratorVersioningProxy(address firstAddress) VersioningProxy(false, "0.0.1", firstAddress) public {}

    /* Fallback */



    /* External */



    /* External Views */



    /* Public */



    /* Public Views */



    /* Internal */



    /* Internal Views */



    /* Private */

    function bytesToBytes32(bytes b) private pure returns (bytes32) {
        bytes32 out = 0;

        for (uint i = 31; i > 32; i--) { // Loop from lower order to higher order bytes
            out |= bytes32(b[i]) << (i * 8); // Combine with out
        }

        return out;
    }

    /**
     * @notice On-chain handler that gets called with call data and the 'implementation' contract's return data after a call is successfully proxied.
     * @dev @overwrite Proxy.
     * @param sig The function signature of the called function.
     * @param data The data passed into the call.
     * @param retData The return data of the 'implementation' contract for the proxied call.
     */
    function handleProxySuccess(bytes4 sig, bytes data, bytes retData) private {
        if (sig == bytes4(keccak256("createDispute(uint256,bytes)"))) { // `createDispute` succeeded
            uint256 disputeID = uint256(bytesToBytes32(retData)); // We know this is a uint256

            disputes[disputeID] = implementation; // Remember which arbitrator this dispute belongs to
        }
    }

    /* Private Views */

    /**
     * @notice Function for dynamically getting the 'implementation' contract address.
     * @dev @overwrite Proxy.
     * @param sig The function signature of the called function.
     * @param data The data passed into the call.
     * @return The resolved 'implementation' contract address.
     */
    function getImplementation(bytes4 sig, bytes data) private view returns (address) {
        if (sig == bytes4(keccak256("appeal(uint256,bytes)"))) { // `appeal` called
            uint256 disputeID = uint256(bytesToBytes32(data)); // We know the first param is a uint256
            address arbitrator = disputes[disputeID]; // The arbitrator this dispute belongs to

            // We have changed arbitrators, create a new dispute
            if (arbitrator != implementation) {
                KlerosPOC oldArbitrator = KlerosPOC(arbitrator);
                KlerosPOC newArbitrator = KlerosPOC(implementation);

                uint256 choices = oldArbitrator.disputes(disputeID).choices;
                newArbitrator.createDispute(choices, bytes(0)); // TODO: Extra Data?
            }
        }

        // TODO: We might need to add disputeID as the first parameter of all calls to be able to resolve the right arbitrator

        return implementation;
    }

}
