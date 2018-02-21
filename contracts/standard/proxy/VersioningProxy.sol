pragma solidity ^0.4.15;

/**
 *  @title VersioningProxy
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @notice A base contract for managing the deployment of versions of another contract.
 */
contract VersioningProxy {
    /* Enums */



    /* Structs */

    struct Deployment {
        bytes32 tag;
        address _address;
    }

    /* Events */



    /* Storage */

    // Owner and Creation Metadata
    address public owner = msg.sender;
    uint256 public creationTime = now;

    // Deployments
    bytes32[] public tags; // We keep this so we can iterate over versions
    mapping (bytes32 => address) public addresses;
    Deployment public stable;

    /* Modifiers */

    /**
     *  @dev Makes a function only callable by the owner of the contract.
     */
    modifier onlyOwner {
        require(owner == msg.sender);
        _;
    }

    /* Constructor */

    /**
     *  @notice Constructs the version proxy with the first version of the contract, `firstTag`, at `firstAddress`.
     *  @param firstTag The version tag of the first version of the contract you are versioning.
     *  @param firstAddress The address of the associated contract.
     */
    function VersioningProxy(bytes32 firstTag, address firstAddress) public {
        publish(firstTag, firstAddress);
    }

    /* Fallback */



    /* External */

    /**
     * @notice Rolls back 'stable' to the previous deployment, and returns true, if one exists, returns false otherwise.
     */
    function rollback() external onlyOwner returns(bool) {
        uint256 tagsLen = tags.length;
        if (tagsLen <= 2)
            return false;

        bytes32 prevTag = tags[tagsLen - 2];
        setStable(prevTag);
        return true;
    }

    /* External Views */

    /**
     * @notice Returns all deployed version tags.
     */
    function allTags() external view returns(bytes32[]) {
        return tags;
    }

    /* Public */

    /**
     *  @notice Publishes a new version, `newTag`, at `newAddress`.
     *  @param newTag The new version tag.
     *  @param newAddress The address of the associated contract.
     */
    function publish(bytes32 newTag, address newAddress) public onlyOwner {
        tags.push(newTag);
        addresses[newTag] = newAddress;
        stable = Deployment({tag: newTag, _address: newAddress});
    }

    /**
     *  @notice Sets the value of stable to the address of `publishedTag`.
     *  @param publishedTag The already published version tag.
     */
    function setStable(bytes32 publishedTag) public onlyOwner {
        address _address = addresses[publishedTag];
        require(_address != address(0)); // Throw if not published
    
        stable = Deployment({tag: publishedTag, _address: _address});
    }

    /* Public Views */



    /* Internal */



    /* Internal Views */



    /* Private */



    /* Private Views */



}
