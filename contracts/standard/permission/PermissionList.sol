/**
 *  @title Permission List
 *  @author Enrique Piqueras - <enrique@kleros.io>
 */

pragma solidity ^0.4.15;

import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import "./PermissionInterface.sol";

/**
 *  @title Permission List
 *  This is a permission list for arbitrary values. The owner can add or remove values.
 */
contract PermissionList is Ownable, PermissionInterface {
    /* Storage */

    bool blacklist; // True if the list should function as a blacklist, false if it should function as a whitelist.
    mapping(bytes32 => bool) list; // True if the value is registered.

    /* Constructor */

    /**
     *  @dev Constructs the permission list and sets the type.
     *  @param _blacklist True if the list should function as a blacklist, false if it should function as a whitelist.
     */
    constructor(bool _blacklist) public {
        blacklist = _blacklist;
    }

    /* Public */

    function add(bytes32 _value) public onlyOwner {
        list[_value] = true;
    }

    function remove(bytes32 _value) public onlyOwner {
        list[_value] = false;
    }

    /* Public Views */

    /**
     *  @dev Return true if the value is allowed.
     *  @param _value The value we want to check.
     *  @return allowed True if the value is allowed, false otherwise.
     */
    function isPermitted(bytes32 _value) public view returns (bool allowed) {
        return list[_value];
    }
}
