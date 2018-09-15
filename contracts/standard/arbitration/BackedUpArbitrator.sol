pragma solidity ^0.4.24;

import "./CentralizedArbitrator.sol";

/**
 *  @title BackedUpArbitrator
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev A centralized arbitrator that can be appealed when not responsive.
 */
contract BackedUpArbitrator is CentralizedArbitrator, Arbitrable {
    /* Storage */

    Arbitrator public backUp;
    uint public timeOut;
    mapping(uint => uint) public creationTimes;

    /* Constructor */

    /** @dev Constructs the BackedUpArbitrator contract.
     *  @param _backUp The back up arbitrator.
     *  @param _timeOut The time that needs to pass for a pending dispute to be appealable.
     */
    constructor(Arbitrator _backUp, uint _timeOut) public {
        backUp = _backUp;
        timeOut = _timeOut;
    }

    /* External */

    /** @dev Changes the back up arbitrator.
     *  @param _backUp The new back up arbitrator.
     */
    function changeBackUp(Arbitrator _backUp) external onlyOwner {
        backUp = _backUp;
    }

    /** @dev Changes the time out.
     *  @param _timeOut The new time out.
     */
    function changeTimeOut(uint _timeOut) external onlyOwner {
        timeOut = _timeOut;
    }

    /* External Views */



    /* Public */



    /* Public Views */



    /* Internal */



    /* Internal Views */



    /* Private */



    /* Private Views */



}
