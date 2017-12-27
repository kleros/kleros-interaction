 /**
 *  @title Mini Me Token ERC20
 *  Overwrite the MiniMeToken to make it follow ERC20 recommendation.
 *  This is required because the base token reverts when approve is used with the non zero value while allowed is non zero (which not recommended by the standard, see https://github.com/ethereum/EIPs/blob/master/EIPS/eip-20-token-standard.md).
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.15;

import "minimetoken/contracts/MiniMeToken.sol";

contract MiniMeTokenERC20 is MiniMeToken {
    
    /** @notice `msg.sender` approves `_spender` to spend `_amount` tokens on its behalf.
      * This is a ERC20 compliant version.
      * @param _spender The address of the account able to transfer the tokens
      * @param _amount The amount of tokens to be approved for transfer
      * @return True if the approval was successful
      */
    function approve(address _spender, uint256 _amount) public returns (bool success) {
        require(transfersEnabled);
        // Alerts the token controller of the approve function call
        if (isContract(controller)) {
            require(TokenController(controller).onApprove(msg.sender, _spender, _amount));
        }
    }
}
