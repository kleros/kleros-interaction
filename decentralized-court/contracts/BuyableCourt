import "./Court.sol";

pragma solidity ^0.4.10;

// Allow buying tokens by sending ETH.
contract BuyableCourt is Court{
    function BuyableCourt(address[] accounts, uint256[] tokens) Court(accounts,tokens) {}
    
    function buyTokens() payable {
        uint amountBought=msg.value/(5*paymentPerToken);
        balances[msg.sender]+=amountBought;
        totalSupply+=amountBought;
    }
}
