// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import {IRNG} from "./IRNG.sol";
import {RLPReader} from "../../libraries/RLPReader.sol";

/**
 * @title Random Number Generator using `prevrandao` from the historical beacon chain block headers.
 * @dev The random numbers are provided in the RLP-encoded block headers and validated onchain against the block hashes.
 *      Adapted from kevincharm's  https://github.com/kevincharm/randao-accessor/blob/312637b99be8d85f1afc6ca878c84adbb78fc7a6/contracts/RandaoAccessor.sol
 */
contract BeaconHistoricalRNG is IRNG {
    using RLPReader for bytes;
    using RLPReader for RLPReader.RLPItem;

    uint256 public constant LOOKAHEAD = 132; // Number of blocks that has to pass before obtaining the random number. 4 epochs + 4 slots, according to EIP-4399.

    IRNG public blockhashRNGFallback; // Address of blockhashRNGFallback to fall back on.
    mapping(uint256 blockNumber => uint256 randomNumber) public randomNumbers; // The random number for this block, 0 otherwise.

    /**
     * @dev Emitted when a block header is requested.
     * @param _blockNumber The block number of the header requested.
     */
    event Request(uint256 _blockNumber);

    /**
     * @dev Constructor.
     * @param _blockhashRNGFallback The blockhash RNG deployed contract address.
     */
    constructor(IRNG _blockhashRNGFallback) {
        blockhashRNGFallback = _blockhashRNGFallback;
    }

    function contribute(uint256 _block) public payable override {} // Not used

    /**
     * @dev Request a random number.
     * @param _block Block number of the header requested for verification by `verifyRecent()`.
     */
    function requestRN(uint256 _block) public payable override {
        emit Request(_block + LOOKAHEAD);
    }

    /**
     * @dev Return the random number. If it has not been saved and is still computable compute it.
     * @param _block Block number requested.
     * @return rn Random Number. If the number is not ready or has not been requested 0 instead.
     */
    function getRN(uint256 _block) public override returns (uint256 rn) {
        if (block.difficulty <= 2**64) {
            // Pre-Merge
            rn = blockhashRNGFallback.getRN(_block);
        } else {
            // Post-Merge
            if (block.number > _block + LOOKAHEAD) {
                rn = randomNumbers[_block + LOOKAHEAD];
            }
        }
    }

    /**
     * @dev Get an uncorrelated random number.
     * @param _block Block number requested.
     * @return rn Random Number. If the number is not ready or has not been required 0 instead.
     */
    function getUncorrelatedRN(uint256 _block) public override returns (uint256 rn) {
        rn = getRN(_block);
        if (rn != 0) {
            rn = uint256(keccak256(abi.encodePacked(msg.sender, rn)));
        }
    }

    /**
     * @notice Verify a recent block header and return the prevrandao value
     * @param _blockHeaderRLP RLP-encoded block header
     * @return Verified prevrandao
     */
    function verifyRecent(bytes calldata _blockHeaderRLP) public returns (uint256) {
        RLPReader.RLPItem[] memory blockHeader = _blockHeaderRLP.readList();
        uint256 _inputBlockNumber = blockHeader[8].readUint256();
        require(
            _inputBlockNumber < block.number,
            "Input block must be older than current"
        );
        require(
            (_inputBlockNumber >= (block.number - 256)) &&
                (_inputBlockNumber < block.number),
            "Block too old"
        );
        bytes32 targetBlockHash = blockhash(_inputBlockNumber);
        require(
            targetBlockHash == keccak256(_blockHeaderRLP),
            "RLP does not match blockhash"
        );
        uint256 randao = blockHeader[13].readUint256();
        randomNumbers[_inputBlockNumber] = randao;
        return randao;
    }
}
