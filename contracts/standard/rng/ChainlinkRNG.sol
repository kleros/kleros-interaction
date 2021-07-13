/**
 *  @authors: [@MerlinEgalite]
 *  @reviewers: [@shalzz]
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */
pragma solidity ^0.6.6;

import "@chainlink/contracts/src/v0.6/VRFConsumerBase.sol";

interface IKlerosLiquid {
    function passPhase() external;
}


/**
 * @title Random Number Generator using Chainlink Verifiable Randomness Mechanism on Polygon
 * @author Merlin Egalite - <egalite.merlin@gmail.com>
 *
 * @dev This contract implements the RNG standard and inherits from VRFConsumerBase to use Chainlink Verifiable Randomness Mechanism.
 * @dev It allows to store the random number associated to the requests made.
 * @dev Note that to make requests to Chainlink, the contract needs to be funded with some LINK.
 * @dev Chainlink documentation: https://docs.chain.link/docs/chainlink-vrf/
 * @dev For SECURITY CONSIDERATIONS, you might also have look to: https://github.com/smartcontractkit/chainlink/blob/master/evm-contracts/src/v0.6/VRFConsumerBase.sol
 */
contract ChainlinkRNG is VRFConsumerBase {

    /* Storage */

    IKlerosLiquid public kleros; // The address of Kleros Liquid.
    bytes32 internal keyHash; // The key hash for the VRF Coordinator.
    uint256 internal fee; // The amount of LINK to send with a request.
    mapping(bytes32 => uint256) public randomNumber; // randomNumber[requestId] is the random number for the requestId, 0 otherwise.

    /* Modifier */

    modifier onlyByKleros() {
        require(msg.sender == address(kleros), "ChainlinkRNG: not called by Kleros");
        _;
    }

    /* Constructor */

    /**
     * @dev Constructs the ChainlinkRNG contract.
     * @param _vrfCoordinator The address of VRFCoordinator contract.
     * @param _link The address of LINK token contract.
     * @param _kleros The address of Kleros Liquid's contract.
     * @param _keyHash The key hash for the VRF Coordinator.
     * @param _fee The amount of LINK to send with a request.
     *
     * @dev https://docs.chain.link/docs/link-token-contracts
     */
    constructor(
        address _vrfCoordinator,
        address _link,
        IKlerosLiquid _kleros,
        bytes32 _keyHash,
        uint256 _fee
    )
        VRFConsumerBase(_vrfCoordinator, _link)
        public
    {
        keyHash = _keyHash;
        kleros = _kleros;
        fee = _fee;
    }

    /* External */

    /**
     * @dev Withdraws all LINK tokens locked in this contract.
     */
    function withdrawLink() external onlyByKleros {
        require(LINK.transfer(msg.sender, LINK.balanceOf(address(this))), "ChainlinkRNG: unable to transfer LINK tokens");
    }

    /**
     * @dev Changes the `fee` storage variable.
     * @param _newFee The new value for the `fee` storage variable.
     */
    function changeFee(uint256 _newFee) external onlyByKleros {
        fee = _newFee;
    }

    /**
     * @dev Changes the `kleros` storage variable.
     * @param _newKleros The new value for the `kleros` storage variable.
     */
    function changeKleros(IKlerosLiquid _newKleros) external onlyByKleros {
        kleros = _newKleros;
    }

    /**
     * @dev Requests a random number.
     * @return requestId unique ID for this request.
     */
    function requestRN() external onlyByKleros returns (bytes32 requestId) {
        require(LINK.balanceOf(address(this)) >= fee, "ChainlinkRNG: not enough LINK to pay the fee");
        return requestRandomness(keyHash, fee);
    }

    /**
     * @dev Gets the random number associated to a `_requestId`.
     * @param _requestId The request Id initially returned by requestRN.
     * @return RN Random Number. If the number is not ready or has not been required it returns 0.
     */
    function getRN(bytes32 _requestId) external view returns (uint256 RN) {
        return randomNumber[_requestId];
    }

    /* Internal */

    /**
     * @dev Stores the random number given by the VRF Coordinator and calls passPhase function on Kleros Liquid.
     * @dev This is the callback function used by the VRF Coordinator.
     * @param _requestId The request Id initially returned by requestRN.
     * @param _randomness the VRF output.
     */
    function fulfillRandomness(bytes32 _requestId, uint256 _randomness) internal override {
        randomNumber[_requestId] = _randomness;
        IKlerosLiquid(kleros).passPhase();
    }
}
