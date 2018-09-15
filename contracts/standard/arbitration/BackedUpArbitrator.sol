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
    mapping(uint => uint) public creationTimes;

    /* Constructor */

    /** @dev Constructs the BackedUpArbitrator contract.
     *  @param _backUp The back up arbitrator.
     */
    constructor(Arbitrator _backUp) public {
        backUp = _backUp;
    }

    /* External */



    /* External Views */



    /* Public */



    /* Public Views */



    /* Internal */



    /* Internal Views */



    /* Private */



    /* Private Views */



}
