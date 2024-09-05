// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IRNG {
    /**
     * @dev Contribute to the reward of a random number.
     * @param _block Block the random number is linked to.
     */
    function contribute(uint256 _block) external payable;

    /**
     * @dev Request a random number.
     * @param _block Block linked to the request.
     */
    function requestRN(uint256 _block) external payable;

    /**
     * @dev Get the random number.
     * @param _block Block the random number is linked to.
     * @return RN Random Number. If the number is not ready or has not been required 0 instead.
     */
    function getRN(uint256 _block) external returns (uint256);

    /**
     * @dev Get a uncorrelated random number. Act like getRN but give a different number for each sender.
     *      This is to prevent users from getting correlated numbers.
     * @param _block Block the random number is linked to.
     * @return RN Random Number. If the number is not ready or has not been required 0 instead.
     */
    function getUncorrelatedRN(uint256 _block) external returns (uint256);
}
