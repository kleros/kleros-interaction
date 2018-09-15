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

    /* Modifiers */



    /* Constructor */



    /* Fallback */



    /* External */



    /* External Views */



    /* Public */



    /* Public Views */



    /* Internal */



    /* Internal Views */



    /* Private */



    /* Private Views */



}
