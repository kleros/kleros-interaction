/**
 *  @title Address Whitelist Interface
 *  @author Clément Lesaege - <clement@lesaege.com>
 */

pragma solidity ^0.4.15;

/**
 *  @title Address Whitelist Interface
 *  This is a Whitelist interface for addresses.
 */
interface AddressWhitelistInterface{
    /** @dev Return true is the address is allowed.
     *  @param _value The address we want to know if allowed.
     *  @return allowed True if the address is allowed, false otherwize.
     */
    function isPermitted(address _value) public returns (bool allowed);
}
