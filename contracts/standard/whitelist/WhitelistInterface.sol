/**
 *  @title Whitelist Interface
 *  @author Clément Lesaege - <clement@lesaege.com>
 */

pragma solidity ^0.4.15;

/**
 *  @title Whitelist Interface
 *  This is a Whitelist for arbitrary values. The values can be cast to the required types. If the type is less than 32 bytes, you may want to use a particular type of whitelist.
 */
interface WhitelistInterface{
    /** @dev Return true is the value is allowed.
     *  @param _value The value we want to know if allowed.
     *  @return allowed True if the value is allowed, false otherwize.
     */
    function isAllowed(bytes32 _value) public returns (bool allowed);
}
