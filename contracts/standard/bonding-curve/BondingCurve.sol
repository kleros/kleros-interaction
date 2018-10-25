/**
 *  @title BondingCurve
 *  @author Yushi Huang - <huang@kleros.io>
 *  This contract implements a bonding curve to provide liquidity to a token-ether market.
 *  The token in question is an ERC20 token and will be referred to as "TKN" below.
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { MiniMeTokenERC20 as TokenContract } from "../arbitration/ArbitrableTokens/MiniMeTokenERC20.sol";
import { ApproveAndCallFallBack } from "minimetoken/contracts/MiniMeToken.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";

contract BondingCurve is ApproveAndCallFallBack {

    using SafeMath for uint;

    // **************************** //
    // *    Contract variables    * //
    // **************************** //

    // Variables which should not change after initialization.
    TokenContract public tokenContract;

    // Variables which are subject to the governance mechanism.
    // Spread factor charged when buying and selling. Divided by SPREAD_DIVISOR.
    // For example, 100 means 100/10000 = 1% spread.
    uint public spread; 
    uint constant SPREAD_DIVISOR = 10000;
    address public governor; // Address of the governor contract.

    // Variables changing during day to day interaction.
    uint public totalETH; // The amount of Ether the bonding curve owns.
    uint public totalTKN; // The amount of bonded token the bonding curve owns.

    uint public totalDepositPoints;
    mapping (address=>uint) public depositPointMap; // Contribution of each market maker. Invariant: sum of all values == totalDepositPoints.

    // **************************** //
    // *         Modifiers        * //
    // **************************** //

    modifier onlyBy(address _account) {require(msg.sender == _account, "Wrong caller."); _;}
    modifier onlyGovernor() {require(msg.sender == governor, "Only callable by the governor."); _;}

    /** @dev Constructor.
     *  @param _tokenContract The address of the token contract.
     *  @param _governor The address of the governor contract.
     *  @param _spread Spread.
     */
    constructor(TokenContract _tokenContract, address _governor, uint _spread) public {
        tokenContract = _tokenContract;
        governor = _governor;
        spread = _spread;
    }

    
    // ******************************** //
    // *     Market Maker Functions   * //
    // ******************************** //
    /** @dev Deposit ETH and TKN. The transaction value is the intended amount of ETH. A parameter designates the intended amount of TKN. The caller must have approved of at least this amount of TKN to this contract (using approve() method of ERC20 interface). The actually amount of ETH and TKN taken must be of certain ratio. If intended TKN is excessive, only the proper portion of the approved amount is take. If inteded ETH is excessive, it is refunded, in which case the caller account must accept payment. TRUSTED.
     *  @param _tkn Intended amount of TKN to be deposited.
     */
    function deposit(uint _tkn) external payable {
        uint _eth = msg.value;

        // The actually deposited amounts of ETH and TKN must satisfy:
        // p / e = totalTKN / totalETH
        // We expect the numbers to be within a range in which the multiplications won't overflow uint256.
        uint actualETH; // Actual amount of ETH to be deposited.
        uint actualTKN; // Actual amount of TKN to be deposited.
        uint refundETH = 0; // Amount of ETH to be refunded.

        if (_tkn.mul(totalETH) == _eth.mul(totalTKN)) {
            // Note that initially totalETH==totalTKN==0 so the first deposit is handled here where it allows any amounts of TKN and ETH to be deposited. We expect the ratio to reflect the market price at the moment because otherwise there is an immediate arbitrage opportunity.
            actualETH = _eth;
            actualTKN = _tkn;
        } else if (_tkn.mul(totalETH) > _eth.mul(totalTKN)) {
            // There is excessive TKN.
            actualETH = _eth;
            actualTKN = _eth.mul(totalTKN).div(totalETH);
        } else {
            // There is excessive ETH.
            actualTKN = _tkn;
            actualETH = _tkn.mul(totalETH).div(totalTKN);
            refundETH = _eth.sub(actualETH);
        }              

        require(tokenContract.transferFrom(msg.sender, this, actualTKN), "TKN transfer failed.");
        totalETH += actualETH;
        totalTKN += actualTKN;

        totalDepositPoints += actualETH;
        depositPointMap[msg.sender] += actualETH;

        // Refund ETH if necessary. No need to refund TKN because we transferred the actual amount.
        if (refundETH > 0) {
            msg.sender.transfer(refundETH);
        }
    }

    /** @dev Withdraw ETH and TKN deposited by the caller. 
     *  Maintain the ratio of totalETH / totalTKN unchanged. TRUSTED.
     */
    function withdraw() external {
        uint depositPoints = depositPointMap[msg.sender];

        uint ethWithdraw = totalETH.mul(depositPoints).div(totalDepositPoints);
        uint tknWithdraw = totalTKN.mul(depositPoints).div(totalDepositPoints);

        depositPointMap[msg.sender] = 0;
        totalDepositPoints -= depositPoints;

        require(tokenContract.transfer(msg.sender, tknWithdraw), "TKN transfer failed.");
        msg.sender.transfer(ethWithdraw);
    }

    // ************************ //
    // *     User Functions   * //
    // ************************ //
    /** @dev Buy TKN with ETH. TRUSTED.
     *  @param _receiver The account the bought TKN is accredited to.
     *  @param _minTKN Minimum amount of TKN expected in return. If the price of TKN relative to ETH hikes so much before the transaction is mined that the contract could not give minTKN TKN to the buyer, it will revert.
     */
    function buy(address _receiver, uint _minTKN) external payable {
        // Calculate the amount of TKN that should be paid to the buyer:
        // To maintain (totalETH+msg.value)*(totalTKN-tkn) == totalETH*totalTKN 
        // we get tkn = msg.value * totalTKN / (totalETH+msg.value), then we charge the spread.
        uint tkn = msg.value.mul(totalTKN).mul(SPREAD_DIVISOR)
            .div(totalETH.add(msg.value)).div(SPREAD_DIVISOR.add(spread));

        require(tkn >= _minTKN, "Price exceeds limit.");
        require(tokenContract.transfer(_receiver, tkn), "TKN transfer failed.");
        totalETH += msg.value;
        totalTKN -= tkn;
    }

    // To sell TKN, the user must call approveAndCall() on the token account, with parameters: (address _spender, uint256 _amount, bytes _extraData).
    // _spender must be this contract.
    // _amount is the amount of TKN the user wishes to sell.
    // _extraData 0~3 bytes must be the string "bcs1".
    //            4~23 bytes is the recipient address of ETH.
    //            24~55 bytes is an uint256 representing the minimum amount of ETH the seller wishes to receive. If by the time the transaction is mined the price of TKN drops so that the contract could not give the seller at least this amount, the transaction is reverted.
    /** @dev Callback of approveAndCall - the only use case is to sell TKN. Should be called by the token contract. TRUSTED.
     *  @param _from The address of seller.
     *  @param _amount The amount of TKN to sell.
     * @param _extraData Packed bytes according to above spec.
     */
    function receiveApproval(address _from, uint _amount, address, bytes _extraData) public onlyBy(tokenContract) {
        require(_extraData.length == 56, "extraData length is incorrect.");

        // solium-disable-next-line indentation
        require(_extraData[0]==0x62 && // 'b'
            _extraData[1]==0x63 &&     // 'c'
            _extraData[2]==0x73 &&     // 's'
            _extraData[3]==0x31,       // '1'
            "Expect magic number.");

        address recipient = BytesLib.toAddress(_extraData, 4);
        uint minETH = BytesLib.toUint(_extraData, 24);

        // Calculate the amount of ETH that should be paid to seller:
        // To maintain (totalETH - eth)*(totalTKN+_amount) == totalETH*totalTKN
        // we get eth = totalETH * _amount / (totalTKN + _amount)
        // Then charge a spread. 
        uint eth = totalETH.mul(_amount).mul(SPREAD_DIVISOR)
            .div(totalTKN.add(_amount)).div(SPREAD_DIVISOR.add(spread));

        require(eth >= minETH, "TKN price must be above minimum expected value.");
        recipient.transfer(eth);
        require(tokenContract.transferFrom(_from, this, _amount), "Bonded token transfer failed.");

        totalETH -= eth;
        totalTKN += _amount;          
    }

    // **************************** //
    // *     Governor Functions   * //
    // **************************** //

    /** @dev Setter for spread.
      * @param _spread The spread.
      */
    function setSpread(uint _spread) external onlyGovernor {
        spread = _spread;
    }

    /** @dev Setter for governor.
     *  @param _governor The address of the governor contract.
     */
    function setGovernor(address _governor) external onlyGovernor {
        governor = _governor;
    }

}
