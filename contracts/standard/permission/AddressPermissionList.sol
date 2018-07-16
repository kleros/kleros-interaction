/**
 *  @title Address Permission List
 *  @author Clément Lesaege - <clement@lesaege.com>
 */

pragma solidity ^0.4.15;

import "./PermissionList.sol";

/**
 *  @title Address Permission List
 *  This is a permission list for addresses. The owner can add or remove addresses.
 */
contract AddressPermissionList is PermissionList {
    /* Storage */

    mapping(address => bool) list; // True if the address is registered.

    /* Constructor */

    /**
     *  @dev Constructs the address permission list and sets the type.
     *  @param _blacklist True if the list should function as a blacklist, false if it should function as a whitelist.
     */
    constructor(bool _blacklist) PermissionList(_blacklist) public {}

    /* Public Views */

    /**
     *  @dev Return true if the address is allowed.
     *  @param _value The address we want to check.
     *  @return allowed True if the address is allowed, false otherwise.
     */
    function isPermitted(address _value) public view returns (bool allowed) {
        return list[_value];
    }
}
