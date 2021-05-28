/**
 *  @authors: [@MerlinEgalite]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */
pragma solidity ^0.6.6;

import "@chainlink/contracts/src/v0.6/VRFConsumerBase.sol";
import "./RNG.sol";

/**
 * @title Random Number Generator using Chainlink Verifiable Randomness Mechanism
 * @author Merlin Egalite - <egalite.merlin@gmail.com>
 *
 * @dev This contract implements the RNG standard and inherits from VRFConsumerBase to use Chainlink Verifiable Randomness Mechanism.
 * @dev It allows to store the random number associated to the requests made.
 * @dev Note that to make requests to Chainlink, the contract needs to be funded with some LINK.
 * @dev Chainlink documentation: https://docs.chain.link/docs/chainlink-vrf/
 * @dev For SECURITY CONSIDERATIONS, you might also have look to: https://github.com/smartcontractkit/chainlink/blob/master/evm-contracts/src/v0.6/VRFConsumerBase.sol
 */
contract ChainlinkRNG is RNG, VRFConsumerBase {

    /* Storage */

    bytes32 internal keyHash; // The key hash to use for Chainlink's VRFCoordinator.
    uint256 internal fee; // The fee to pay to Chainlink.
    address public owner; // The owner of the contract.

    mapping (bytes32 => uint256) public randomNumber; // randomNumber[requestId] is the random number for the requestId, 0 otherwise.

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
    }

    /* Constructor */

    /**
     * @dev Constructs the ChainlinkRNG contract.
     * @param _vrfCoordinator Address of VRFCoordinator contract.
     * @param _link Address of LINK token contract.
     * @param _keyHash The _keyHash for the VRF Coordinator.
     * @param _fee The amount of LINK to send with a request.
     *
     * @dev https://docs.chain.link/docs/link-token-contracts
     */
    constructor(address _vrfCoordinator, address _link, bytes32 _keyHash, uint256 _fee)
        VRFConsumerBase(_vrfCoordinator, _link) public
    {
        keyHash = _keyHash;
        fee = _fee;
        owner = msg.sender;
    }

    /**
     * @dev Withdraws all LINK tokens locked in this contract.
     */
    function withdrawLink() external onlyOwner {
        require(LINK.transfer(msg.sender, LINK.balanceOf(address(this))), "Unable to transfer");
    }

    /**
     * @dev Changes the fee used when requesting a new random number.
     */
    function changeFee(uint256 _newFee) external onlyOwner {
        fee = _newFee;
    }

    /**
     * @dev Requests a random number.
     * @dev The _seed parameter is vestigial, and is kept only for API
     * @dev compatibility with older versions. It can't *hurt* to mix in some of
     * @dev your own randomness, here, but it's not necessary because the VRF
     * @dev oracle will mix the hash of the block containing your request into the
     * @dev VRF seed it ultimately uses.
     * @param _seed seed mixed into the input of the VRF.
     * @return requestId unique ID for this request.
     */
    function requestRN(uint _seed) public returns (uint256 requestId) {
        require(LINK.balanceOf(address(this)) >= fee, "Not enough LINK to pay the fee");
        return requestRandomness(keyHash, fee, _seed);
    }

    /**
     * @dev Returns the random number associatd to a request Id.
     * @param _requestId The Id initially returned by requestRN.
     * @return RN Random Number. If the number is not ready or has not been required it returns 0.
     */
    function getRN(bytes32 _requestId) public returns (uint256 RN) {
        return randomNumber[_requestId];
    }

    /**
     * @dev Stores the random number given by the VRF Coordinator.
     * @dev This is the callback function used by the VRF Coordinator.
     * @param _requestId The Id initially returned by requestRN.
     * @param _randomness the VRF output.
     */
    function fulfillRandomness(bytes32 _requestId, uint256 _randomness) internal override {
        randomNumber[_requestId] = _randomness;
    }
}