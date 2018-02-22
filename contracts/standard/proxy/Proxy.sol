pragma solidity ^0.4.15;

/**
 *  @title Proxy
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @notice A base proxy contract that forwards all calls to the 'implementation' contract and optionally keeps all storage.
 */
 contract Proxy {
    /* Storage */

    bool public storageIsEternal;
    address public implementation;

    /* Constructor */

    /**
     * @notice Constructs the proxy with the eternal storage flag and an initial 'implementation' contract address.
     * @param _storageIsEternal Wether this contract should store all storage. I.e. Use 'delegatecall'.
     * @param _implementation The initial 'implementation' contract address.
     */
    function Proxy(bool _storageIsEternal, address _implementation) public {
        storageIsEternal = _storageIsEternal;
        implementation = _implementation;
    }

    /* Fallback */

    /**
     * @notice The fallback function that forwards calls to the 'implementation' contract.
     * @return The result of calling the requested function on the 'implementation' contract.
     */
    function () payable external {
        require(implementation != address(0)); // Make sure address is valid

        // Store necessary data for assembly in local memory
        bool _storageIsEternal = storageIsEternal;
        bytes memory data = msg.data;
        address _implementation = getImplementation(msg.sig, data);

        // Return data
        bytes memory retData;

        assembly {
            // Start of payload raw data (skip over size slot)
            let dataPtr := add(data, 0x20)
            
            // Payload's size
            let dataSize := mload(data)

            // Figure out what OPCODE to use and forward call
            let result
            switch _storageIsEternal
            case 0 { // Not eternal, use implementation's storage
                result := call(gas, _implementation, callvalue, dataPtr, dataSize, 0, 0)
            }
            default { // Eternal, use current contract's storage
                result := delegatecall(gas, _implementation, dataPtr, dataSize, 0, 0)
            }

            // Size of the returned data
            let retSize := returndatasize

            let retPtr := mload(0x40) // Start of free memory
            let retDataPtr := add(retPtr, 0x20) // Make space for 'bytes' size
    
            // Build `retData` 'bytes'
            mstore(retPtr, retSize) // Copy size
            returndatacopy(retDataPtr, 0, retSize) // Copy returned data
    
            // Figure out wether to revert or continue with the returned data
            switch result
            case 0 { // Error
                revert(retDataPtr, retSize)
            }
            default { // Success
                retData := retPtr
            }
        }

        // Call on-chain handler
        handleProxySuccess(msg.sig, data, retData);

        assembly {
            return(add(retData, 0x20), mload(retData)) // Return returned data
        }
    }

    /* Private */

    /**
     * @notice On-chain handler that gets called with call data and the 'implementation' contract's return data after a call is successfully proxied.
     * @dev Overwrite this function to handle the results of proxied calls in this contract.
     * @param sig The function signature of the called function.
     * @param data The data passed into the call.
     * @param retData The return data of the 'implementation' contract for the proxied call.
     */
    function handleProxySuccess(bytes4 sig, bytes data, bytes retData) private {}

    /* Private Views */

    /**
     * @notice Function for dynamically getting the 'implementation' contract address.
     * @dev Overwrite this function to implement custom resolving logic based on the function being called and the data passed in.
     * @param sig The function signature of the called function.
     * @param data The data passed into the call.
     * @return The resolved 'implementation' contract address.
     */
    function getImplementation(bytes4 sig, bytes data) private view returns (address) { return implementation; }
}
