pragma solidity ^0.4.15;

/**
 *  @title Proxy
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @notice A proxy contract that forwards all calls to 'implementation' and optionally keeps all storage.
 */
 contract Proxy {
    /* Storage */

    bool public storageIsEternal;
    address public implementation;

    /* Constructor */

    function Proxy(bool _storageIsEternal, address _implementation) public {
        storageIsEternal = _storageIsEternal;
        implementation = _implementation;
    }

    /* Fallback */

    function () payable external {
        require(implementation != address(0)); // Make sure address is valid

        // Store necessary data for assembly in local memory
        bool _storageIsEternal = storageIsEternal;
        address _implementation = implementation;
        bytes memory data = msg.data;

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

            let retSize := returndatasize // Size of data returned
            let retPtr := mload(0x40) // Start of free memory
    
            returndatacopy(retPtr, 0, retSize) // Copy returned data to free memory
    
            // Figure out wether ro revert or return with the returned data
            switch result
            case 0 { // Error
                revert(retPtr, retSize)
            }
            default { // Success
                return(retPtr, retSize)
            }
        }
    }
}
