pragma solidity ^0.4.24;

import "./ArbitrableProxy.sol";

/**
 *  @title ArbitrableProxyUser
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Base contract for contracts that use a composed arbitrable proxy.
 */
contract ArbitrableProxyUser {
    /* Storage */

    ArbitrableProxy public arbitrableProxy;

    /* Constructor */

    /** @dev Constructs the `ArbitrableProxyUser` contract.
     *  @param _arbitrableProxy The arbitrable proxy to use.
     */
    constructor(ArbitrableProxy _arbitrableProxy) public {
        arbitrableProxy = _arbitrableProxy;
    }

    /* Public */

    /** @dev Executes the ruling on the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _ruling The ruling.
     */
    function executeAgreementRuling(bytes32 _agreementID, uint _ruling) public {
        require(ArbitrableProxy(msg.sender) == arbitrableProxy, "The caller must be the arbitrable proxy.");
    }
}
