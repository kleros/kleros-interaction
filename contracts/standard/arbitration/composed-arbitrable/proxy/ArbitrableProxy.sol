pragma solidity ^0.4.24;

import "../../Arbitrator.sol";

/**
 *  @title ArbitrableProxy
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Base contract for arbitrable proxies.
 */
contract ArbitrableProxy {
    /* External */

    /** @dev Creates an agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _metaEvidence The meta evidence of the agreement.
     *  @param _parties The `parties` value of the agreement.
     *  @param _numberOfChoices The `numberOfChoices` value of the agreement.
     *  @param _extraData The `extraData` value of the agreement.
     *  @param _arbitrationFeesWaitingTime The `arbitrationFeesWaitingTime` value of the agreement.
     *  @param _arbitrator The `arbitrator` value of the agreement.
     */
    function createAgreement(
        bytes32 _agreementID,
        string _metaEvidence,
        address[] _parties,
        uint _numberOfChoices,
        bytes _extraData,
        uint _arbitrationFeesWaitingTime,
        Arbitrator _arbitrator) external;
    
    /* External Views */

    /** @dev Gets the info on the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @return The info.
     */
    function getAgreementInfo(bytes32 _agreementID) external view returns(
        address creator,
        address[] parties,
        uint numberOfChoices,
        bytes extraData,
        uint arbitrationFeesWaitingTime,
        Arbitrator arbitrator,
        uint disputeID,
        bool disputed,
        bool appealed,
        uint ruling,
        bool executed);

    function getFeesInfo(
        bytes32 _agreementID
    ) external view returns(
        uint[] ruling,
        uint[] _stake,
        uint[] totalValue,
        uint[2][] totalContributedPerSide,
        bool[] loserFullyFunded);

    /** @dev Gets the contributions by the specified contributor in the specified round of the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _round The round.
     *  @param _contributor The address of the contributor.
     *  @return The contributions.
     */
    function getContributions(bytes32 _agreementID, uint _round, address _contributor) external view returns(uint[2] contributions);
}
