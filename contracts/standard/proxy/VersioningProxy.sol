pragma solidity ^0.4.15;

import "./Proxy.sol";

/**
 *  @title VersioningProxy
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @notice A base contract derived from Proxy for managing the deployment of versions of another contract, the managed contract.
 */
contract VersioningProxy is Proxy {
    /* Structs */

    struct Deployment {
        bytes32 tag;
        address _address;
    }

    /* Events */

    /**
     * @notice Called whenever 'stable' changes for off-chain handling.
     * @param prevTag The previous 'stable' managed contract version tag.
     * @param prevAddress The previous 'stable' managed contract address.
     * @param nextTag The next 'stable' managed contract version tag.
     * @param nextAddress The next 'stable' managed contract address.
     */
    event OnStableChange(bytes32 prevTag, address prevAddress, bytes32 nextTag, address nextAddress);

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
     *  @dev Makes a function only callable by the owner of this contract.
     */
    modifier onlyOwner {
        require(owner == msg.sender);
        _;
    }

    /* Constructor */

    /**
     *  @notice Constructs the versioning proxy with the proxy eternal storage flag and the first version of the managed contract, `firstTag`, at `firstAddress`.
     *  @param storageIsEternal Wether this contract should store all storage. I.e. Use 'delegatecall'.
     *  @param firstTag The version tag of the first version of the managed contract.
     *  @param firstAddress The address of the first verion of the managed contract.
     */
    function VersioningProxy(bool storageIsEternal, bytes32 firstTag, address firstAddress) Proxy(storageIsEternal, firstAddress) public {
        publish(firstTag, firstAddress);
    }

    /* External */

    /**
     * @notice Rolls back 'stable' to the previous deployment, and returns true, if one exists, returns false otherwise.
     * @return True if there was a previous version and the rollback succeeded, false otherwise.
     */
    function rollback() external onlyOwner returns(bool) {
        uint256 tagsLen = tags.length;
        if (tagsLen <= 2) // We don't have a previous deployment, return false
            return false;

        // Roll back and return true
        bytes32 prevTag = tags[tagsLen - 2];
        setStable(prevTag);
        return true;
    }

    /* External Views */

    /**
     * @notice Returns all deployed version tags.
     * @return All of the deployed version tags.
     */
    function allTags() external view returns(bytes32[]) {
        return tags;
    }

    /* Public */

    /**
     *  @notice Publishes the next version of the managed contract, `nextTag`, at `nextAddress`.
     *  @param nextTag The next version tag.
     *  @param nextAddress The next address of the managed contract.
     */
    function publish(bytes32 nextTag, address nextAddress) public onlyOwner {
        // Publish
        tags.push(nextTag); // Push next tag
        addresses[nextTag] = nextAddress; // Set next address

        // Set 'stable'
        setStable(nextTag);
    }

    /**
     *  @notice Sets the value of 'stable' to the address of `nextTag`.
     *  @param nextTag The already published version tag.
     */
    function setStable(bytes32 nextTag) public onlyOwner {
        // Make sure this version has already been published
        address nextAddress = addresses[nextTag];
        require(nextAddress != address(0));

        // Save current tag and address for handlers
        bytes32 prevTag = stable.tag;
        address prevAddress = stable._address;
    
        // Set 'stable'
        stable = Deployment({tag: nextTag, _address: nextAddress});

        // Call handler and fire event
        handleStableChange(prevTag, prevAddress, nextTag, nextAddress); // on-chain
        OnStableChange(prevTag, prevAddress, nextTag, nextAddress); // off-chain

        // Change proxy target
        implementation = nextAddress;
    }

    /* Private */

    /**
     * @notice Called whenever 'stable' changes for on-chain handling.
     * @dev Overwrite this function to handle 'stable' changes on-chain.
     * @param prevTag The previous 'stable' managed contract version tag.
     * @param prevAddress The previous 'stable' managed contract address.
     * @param nextTag The next 'stable' managed contract version tag.
     * @param nextAddress The next 'stable' managed contract address.
     */
    function handleStableChange(bytes32 prevTag, address prevAddress, bytes32 nextTag, address nextAddress) private {}
}
