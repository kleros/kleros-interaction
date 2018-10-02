/**
 *  @title Arbitrable Token List
 *  @author Matheus Alencar - <mtsalenc@gmail.com>
 */

pragma solidity 0.4.24;

import "../../../permission/ArbitrablePermissionList.sol";
import "../fee/MultiPartyInsurableFees.sol";
import "../agreement/MultiPartyAgreements.sol";


/**
 *  @title Arbitrable Token List
 *  This is a T2CL list for tokens. Token submissions can be submitted and challenged.
 */
contract ArbitrableTokenList is ArbitrablePermissionList, MultiPartyAgreements, MultiPartyInsurableFees {

    /* Constructor */

    /**
     *  @dev Constructs the arbitrable permission list and sets the type.
     *  @param _arbitrator The chosen arbitrator.
     *  @param _arbitratorExtraData Extra data for the arbitrator contract.
     *  @param _feeGovernor The governor of this contract.
     *  @param _feeStake The stake parameter for sharing fees.
     *  @param _metaEvidence The URL of the meta evidence object.
     *  @param _blacklist True if the list should function as a blacklist, false if it should function as a whitelist.
     *  @param _appendOnly True if the list should be append only.
     *  @param _rechallengePossible True if it is possible to challenge again a submission which has won a dispute.
     *  @param _itemStake The amount in Weis of deposit required for a submission or a challenge in addition of the arbitration fees.
     *  @param _timeToChallenge The time in seconds, other parties have to challenge.
     */
    constructor(
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        address _feeGovernor,
        uint _feeStake,
        string _metaEvidence,
        bool _blacklist,
        bool _appendOnly,
        bool _rechallengePossible,
        uint _itemStake,
        uint _timeToChallenge
    ) public MultiPartyAgreements(_arbitrator, _arbitratorExtraData) MultiPartyInsurableFees(_feeGovernor, _feeStake) ArbitrablePermissionList(_arbitrator, _arbitratorExtraData, _metaEvidence, _blacklist, _appendOnly, _rechallengePossible, _itemStake, _timeToChallenge ) {}
}
