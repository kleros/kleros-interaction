/**
 *  @title Bonding curve.
 *  @author Yushi Huang - <huang@kleros.io>
 *  This code implements a bonding curve to provide liquidity to a PNK/ETH market.
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { MiniMeTokenERC20 as Pinakion } from "../arbitration/ArbitrableTokens/MiniMeTokenERC20.sol";
import { ApproveAndCallFallBack } from "minimetoken/contracts/MiniMeToken.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";

contract BondingCurve is ApproveAndCallFallBack {

    using SafeMath for uint;

    // **************************** //
    // *    Contract variables    * //
    // **************************** //

    // Variables which should not change after initialization.
    Pinakion public pinakion;

    // Variables which will subject to the governance mechanism.
    // Spread factor charged when buying and selling when divided by SPREAD_DIVISOR. 
    // For example 100 means 100/10000 = 1% spread.
    uint public spread; 
    uint constant SPREAD_DIVISOR = 10000;
    address public governor; // Address of the governor contract.

    // Variables changing during day to day interaction.
    uint public totalEth; // Amount of ETH the bonding curve owns.
    uint public totalPnk; // Amount of PNK the bonding curve owns.

    uint public totalDepositPoints;
    mapping (address=>uint) public depositPointMap; // contribution of each market maker. Invariant: sum of all values == totalDepositPoints.

    // **************************** //
    // *         Modifiers        * //
    // **************************** //

    modifier onlyBy(address _account) {require(msg.sender == _account, "Wrong caller."); _;}
    modifier onlyGovernor() {require(msg.sender == governor, "Only callable by the governor."); _;}

    /** @dev Constructor.
     *  @param _pinakion The address of the pinakion contract.
     *  @param _governor Address of the governor contract.
     *  @param _spread Spread.
     */
    constructor(Pinakion _pinakion, address _governor, uint _spread) public {
        pinakion = _pinakion;
        governor = _governor;
        spread = _spread;
    }

    
    // ******************************** //
    // *     Market maker Functions   * //
    // ******************************** //
    /** @dev Deposit ETH and PNK. The transaction value is the intended amount of ETH. A parameter designates the intended amount of PNK. The caller must have approved of at least this amount of PNK to this contract (using approve() method of ERC20 interface). The actually amount of ETH and PNK taken must be of certain ratio. If intended PNK is excessive, only the proper portion of the approved amount is take. If inteded ETH is excessive, it is refunded, in which case the caller account must accept payment. TRUSTED.
     *  @param _pnk Intended amount of PNK to be deposited.
     */
    function deposit(uint _pnk) public payable {
        uint _eth = msg.value;

        // The actually deposited amounts of ETH and PNK must satisfy:
        // p / e = totalPnk / totalEth
        // We expect the numbers to be within a range in which the multiplications won't overflow unit256.
        uint actualEth; // Actual amount of Eth to be deposited.
        uint actualPnk; // Actual amount of Pnk to be deposited.
        uint refundEth = 0; // Amount of Eth to be refunded.

        if (_pnk.mul(totalEth) == _eth.mul(totalPnk)) {
            // Note that initally totalEth==totalPnk==0 so the first deposit is handled here where it allows any amounts of PNK and ETH to be deposited. We expect the ratio to reflect the market price at the moment because otherwise there is an immediate arbitrage opportunity.
            actualEth = _eth;
            actualPnk = _pnk;
        } else if (_pnk.mul(totalEth) > _eth.mul(totalPnk)) {
            // There is excessive PNK
            actualEth = _eth;
            actualPnk = _eth.mul(totalPnk).div(totalEth);
        } else {
            // There is excessive ETH
            actualPnk = _pnk;
            actualEth = _pnk.mul(totalEth).div(totalPnk);
            refundEth = _eth.sub(actualEth);
        }              

        require(pinakion.transferFrom(msg.sender, this, actualPnk), "PNK transfer failed.");
        totalEth += actualEth;
        totalPnk += actualPnk;

        totalDepositPoints += actualEth;
        depositPointMap[msg.sender] += actualEth;

        // Refund ETH if necessary. No need to refund PNK because we transferred only actual amount.
        if (refundEth > 0) {
            msg.sender.transfer(refundEth);
        }
    }

    /** @dev Withdraw ETH and PNK deposited by caller. TRUSTED
     *  Maintain the ratio of totalEth / totalPnk unchanged.
     */
    function withdraw() public {
        uint depositPoints = depositPointMap[msg.sender];

        uint ethWithdraw = totalEth.mul(depositPoints).div(totalDepositPoints);
        uint pnkWithdraw = totalPnk.mul(depositPoints).div(totalDepositPoints);

        depositPointMap[msg.sender] = 0;
        totalDepositPoints -= depositPoints;

        require(pinakion.transfer(msg.sender, pnkWithdraw), "PNK transfer failed.");
        msg.sender.transfer(ethWithdraw);
    }

    // ************************ //
    // *     User Functions   * //
    // ************************ //
    /** @dev Buy PNK with ETH. TRUSTED
     *  @param receiver The account the brought PNK is accredited to.
     *  @param minPnk Minimum amount of PNK expected in return. If the price of PNK relative to ETH hikes so much before the transaction is mined that the contract could not give minPnk PNK to the buyer, it will fail.
     */
    function buy(address receiver, uint minPnk) public payable {
        // Calculate the amount of PNK that should be paid to buyer:
        // To maintain (totalEth+msg.value)*(totalPnk-pnk) == totalEth*totalPnk 
        // we get pnk = msg.value * totalPnk / (totalEth+msg.value), then we charge the spread
        uint pnk = msg.value.mul(totalPnk).mul(SPREAD_DIVISOR)
            .div(totalEth.add(msg.value)).div(SPREAD_DIVISOR.add(spread));

        require(pnk > minPnk, "Price exceeds limit.");
        require(pinakion.transfer(receiver, pnk), "PNK transfer failed.");
        totalEth += msg.value;
        totalPnk -= pnk;
    }

    // To sell PNK, the user must call approveAndCall() of the Pinakion token account, whose parameter list is: (address _spender, uint256 _amount, bytes _extraData).
    // _spender must be this contract.
    // _amount is the amount of PNK the user wishes to sell.
    // _extraData 0~3 bytes must be the string "bcs1".
    //            4~23 bytes is recipient address of ETH.
    //            24~55 bytes is an uint256 representing the minimum amount of ETH the seller wishes the receive. If by the time the transaction is mined the price of PNK drops so that the contract could not give the seller this amount, the transaction is aborted.
    /** @dev Callback of approveAndCall - the only use case is to sell PNK. Should be called by the pinakion contract. TRUSTED.
     *  @param _from The address of seller.
     *  @param _amount Amount of PNK to sell .
     * @param _extraData Packed bytes according to above spec.
     */
    function receiveApproval(address _from, uint _amount, address, bytes _extraData) public onlyBy(pinakion) {
        require(_extraData.length == 56, "extraData length is incorrect.");

        // solium-disable-next-line indentation
        require(_extraData[0]==0x62 && // 'b'
            _extraData[1]==0x63 &&     // 'c'
            _extraData[2]==0x73 &&     // 's'
            _extraData[3]==0x31,       // '1'
            "Expect magic number.");

        address recipient = BytesLib.toAddress(_extraData, 4);
        uint minEth = BytesLib.toUint(_extraData, 24);

        // Calculate the amount of ETH that should be paid to seller:
        // To maintain (totalEth - eth)*(totalPnk+_amount) == totalEth*totalPnk
        // we get eth = totalEth * _amount / (totalPnk + _amount)
        // Then charge a spread. 
        uint eth = totalEth.mul(_amount).mul(SPREAD_DIVISOR)
            .div(totalPnk.add(_amount)).div(SPREAD_DIVISOR.add(spread));

        require(eth >= minEth, "PNK price must be above minimum expected value.");
        recipient.transfer(eth);
        require(pinakion.transferFrom(_from, this, _amount), "PNK transfer failed.");

        totalEth -= eth;
        totalPnk += _amount;          
    }

    // **************************** //
    // *     Governor Functions   * //
    // **************************** //

    /** @dev Setter for spread.
      * @param _spread Spread.
      */
    function setSpread(uint _spread) public onlyGovernor {
        spread = _spread;
    }

    /** @dev Setter for governor.
     *  @param _governor Address of the governor contract.
     */
    function setGovernor(address _governor) public onlyGovernor {
        governor = _governor;
    }

}
