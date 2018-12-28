pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/token/ERC20/StandardBurnableToken.sol";
import "openzeppelin-solidity/contracts/token/ERC20/MintableToken.sol";

// mock class using ERC20
contract ERC20Mock is MintableToken, StandardBurnableToken {
    constructor(address initialAccount, uint256 initialBalance) public {
        mint(initialAccount, initialBalance);
    }
}
