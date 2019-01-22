/**
 *  @authors: [@n1c01a5]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

/** @title Multiple Arbitrable ERC20 Token Transaction Factory
 *  This is a a contract to generate ArbitrableTokenPayment from a token contract.
 */

pragma solidity ^0.4.24;

import "../Arbitrator.sol";
import "../MultipleArbitrableTokenTransaction.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

contract MultipleArbitrableTokenTransactionFactory {
    
    // **************************** //
    // *    Contract variables    * //
    // **************************** //

    Arbitrator arbitrator; // Address of the arbitrator contract.
    bytes arbitratorExtraData; // Extra data to set up the arbitration.
    uint feeTimeout; // Time in seconds a party can take to pay arbitration fees before being considered unresponding and lose the dispute.

    uint public tokenCount; // Total count of the tokens registered;

    mapping(address => address) public token_to_arbitrable_token_payment;

    mapping(address => address) public arbitrable_token_payment_to_token;

    mapping(uint => address) public id_to_token;


    // **************************** //
    // *    Event                 * //
    // **************************** //

    /** @dev To be emitted when a new ArbitrableTokenPayment is created.
     *  @param _token Address of the token contract.
     *  @param _arbitrableTokenPayment Address of the arbitrableTokenPayment contract.
     */
    event NewArbitrableToken(address indexed _token, address indexed _arbitrableTokenPayment);


    // **************************** //
    // *         Function         * //
    // *    Modifying the state   * //
    // **************************** //

    /** @dev Setup the factory.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _arbitratorExtraData Extra data for the arbitrator.
     *  @param _feeTimeout Arbitration fee timeout for the parties.
     */
    constructor (
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        uint _feeTimeout
    ) public {
        arbitrator = _arbitrator;
        arbitratorExtraData = _arbitratorExtraData;
        feeTimeout = _feeTimeout;
    }

    /** @dev Create an arbitrable token contract.
     *  @param _token The address of the transacted token.
     *  @return The address of the arbitrable token contract.
     */
    function createArbitrableToken(address _token) public returns (address newArbitrableToken) {
        require(_token != 0x0, "Must be a valid token contract address.");
        require(token_to_arbitrable_token_payment[_token] == 0x0, "The token contract must not be already registered.");
        
        newArbitrableToken = new MultipleArbitrableTokenTransaction(
            ERC20(_token), 
            arbitrator,
            arbitratorExtraData,
            feeTimeout
        );

        token_to_arbitrable_token_payment[_token] = newArbitrableToken;
        arbitrable_token_payment_to_token[newArbitrableToken] = _token;

        id_to_token[tokenCount] = _token;
        ++tokenCount;

        emit NewArbitrableToken(_token, newArbitrableToken);
    }
}