/**
 *  @title WhitelistInterface
 *  @author Clément Lesaege - <clement@lesaege.com>
 */

pragma solidity ^0.4.15;

/**
 *  @title WhitelistInterface
 *  This is a White
 */
interface WhitelistInterface{
    /** @dev Return true is the value is allowed.
     *  @param _value The value we want to know if allowed.
     *  @return allowed True if the value is allowed, false otherwize.
     */
    function isAllowed(bytes32 _value) public returns (bool allowed);
}
