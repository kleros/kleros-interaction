pragma solidity ^0.4.24;

import "../Arbitrable.sol";

/**
 *  @title ComposedArbitrableProxyUser
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev A base contract for contracts that use a composed arbitrable proxy.
 */
contract ComposedArbitrableProxyUser {
    /* Storage */

    Arbitrable arbitrableProxy;

    /* Constructor */

    /** @dev Constructs the `ComposedArbitrableProxyUser` contract.
     *  @param _arbitrableProxy The arbitrable proxy to use.
     */
    constructor(Arbitrable _arbitrableProxy) public {
        arbitrableProxy = _arbitrableProxy;
    }

    /* Public */

    /** @dev Executes the ruling on the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _ruling The ruling.
     */
    function executeAgreementRuling(bytes32 _agreementID, uint _ruling) public payable;
}
