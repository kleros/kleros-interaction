pragma solidity ^0.4.24;

/**
 *  @title ComposedArbitrableProxyUser
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev A base contract for contracts that use a composed arbitrable proxy.
 */
contract ComposedArbitrableProxyUser {
    /* Public */

    /** @dev Executes the ruling on the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _ruling The ruling.
     */
    function executeAgreementRuling(bytes32 _agreementID, uint _ruling) public payable;
}
