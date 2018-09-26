pragma solidity ^0.4.24;

import "../agreement/MultiPartyAgreements.sol";

/**
 *  @title MultiPartyInsurableFees
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Fee part of a composed arbitrable contract. Handles crowdinsured arbitration and appeal fees.
 */
contract MultiPartyInsurableFees is MultiPartyAgreements {
    /* Structs */

    struct PaidFees {
        uint firstContributionTime; // The time the first contribution was made at.
        uint[] ruling; // The ruling for each round.
        uint[] stake; // The stake required for each round.
        uint[] totalValue; // The current held value for each round.
        uint[2][] totalContributedPerSide; // The total amount contributed per side for each round.
        bool[] loserFullyFunded; // Wether the loser fully funded the appeal for each round.
        mapping(address => uint[2])[] contributions; // The contributions for each round.
    }

    /* Events */

    /** @dev Emitted when a contribution is made.
     *  @param _agreementID The ID of the agreement that the contribution was made to.
     *  @param _round The round of the agreement that the contribution was made to.
     *  @param _contributor The address that sent the contribution.
     *  @param _value The value of the contribution.
     */
    event Contribution(bytes32 indexed _agreementID, uint indexed _round, address indexed _contributor, uint _value);

    /* Storage */

    address public feeGovernor;
    uint public stake;
    mapping(bytes32 => PaidFees) public paidFees;

    /* Constructor */

    /** @dev Constructs the `MultiPartyInsurableFees` contract.
     *  @param _feeGovernor The governor of this contract.
     *  @param _stake The stake parameter for sharing fees.
     */
    constructor(address _feeGovernor, uint _stake) public {
        feeGovernor = _feeGovernor;
        stake = _stake;
    }

    /* Public */

    /** @dev Changes the `feeGovernor` storage variable.
     *  @param _feeGovernor The new `feeGovernor` storage variable.
     */
    function changeFeeGovernor(address _feeGovernor) public {
        require(msg.sender == feeGovernor, "The caller is not the fee governor.");
        feeGovernor = _feeGovernor;
    }

    /** @dev Changes the `stake` storage variable.
     *  @param _stake The new `stake` storage variable.
     */
    function changeStake(uint _stake) public {
        require(msg.sender == feeGovernor, "The caller is not the fee governor.");
        stake = _stake;
    }

    /** @dev Funds the specified side of a dispute for the specified agreement or times out the dispute if it is taking too long to fund.
     *  @param _agreementID The ID of the agreement.
     *  @param _side The side. 0 for the side that lost the previous round, if any, and 1 for the one that won.
     */
    function fundDispute(bytes32 _agreementID, uint _side) public payable {
        Agreement storage agreement = agreements[_agreementID];
        PaidFees storage _paidFees = paidFees[_agreementID];
        require(agreement.creator != address(0), "The specified agreement does not exist.");
        require(
            !agreement.disputed || agreement.arbitrator.disputeStatus(agreement.disputeID) == Arbitrator.DisputeStatus.Appealable,
            "The agreement is already disputed and is not appealable."
        );
        require(_side <= 1, "There are only two sides.");
        require(msg.value > 0, "The value of the contribution cannot be zero.");

        // Prepare storage for first call.
        if (_paidFees.firstContributionTime == 0) {
            _paidFees.firstContributionTime = now;
            _paidFees.ruling.push(0);
            _paidFees.stake.push(stake);
            _paidFees.totalValue.push(0);
            _paidFees.totalContributedPerSide.push([0, 0]);
            _paidFees.loserFullyFunded.push(false);
            _paidFees.contributions.length++;
        }

        // Check time outs and requirements.
        uint _cost;
        if (_paidFees.stake.length == 1) { // First round.
            _cost = agreement.arbitrator.arbitrationCost(agreement.extraData);

            // Arbitration fees time out.
            if (now - _paidFees.firstContributionTime > agreement.arbitrationFeesWaitingTime) {
                executeAgreementRuling(_agreementID, 0);
                return;
            }
        } else { // Appeal.
            _cost = agreement.arbitrator.appealCost(agreement.disputeID, agreement.extraData);

            bool _appealing = true;
            (uint _appealPeriodStart, uint _appealPeriodEnd) = agreement.arbitrator.appealPeriod(agreement.disputeID);
            bool _appealPeriodSupported = _appealPeriodStart != 0 && _appealPeriodEnd != 0;
            if (_appealPeriodSupported) {
                if (now < _appealPeriodStart + ((_appealPeriodEnd - _appealPeriodStart) / 2)) // In the first half of the appeal period.
                    require(_side == 0, "It is the losing side's turn to fund the appeal.");
                else // In the second half of the appeal period.
                    require(
                        _side == 1 && _paidFees.loserFullyFunded[_paidFees.loserFullyFunded.length - 1],
                        "It is the winning side's turn to fund the appeal, only if the losing side already fully funded it."
                    );
            } else require(msg.value >= _cost, "Fees must be paid in full if the arbitrator does not support `appealPeriod`.");
        }

        // Compute required value.
        uint _requiredValueForSide;
        if (_side == 0) // Losing side.
            _requiredValueForSide = !_appealing ? _cost / 2 : _cost + (2 * _paidFees.stake[_paidFees.stake.length - 1]);
        else { // Winning side.
            uint _expectedValue = _paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][0] - _paidFees.stake[_paidFees.stake.length - 1];
            _requiredValueForSide = _cost > _paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][0] + _expectedValue ? _cost - _paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][0] : _expectedValue;
        }

        // Take contribution.
        uint _stillRequiredValueForSide;
        if (_paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][_side] >= _requiredValueForSide)
            _stillRequiredValueForSide = 0;
        else 
            _stillRequiredValueForSide = _requiredValueForSide - _paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][_side];
        uint _keptValue = _stillRequiredValueForSide >= msg.value ? msg.value : _stillRequiredValueForSide;
        uint _refundedValue = msg.value - _keptValue;
        if (_keptValue > 0) {
            _paidFees.totalValue[_paidFees.totalValue.length - 1] += _keptValue;
            _paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][_side] += _keptValue;
            _paidFees.contributions[_paidFees.contributions.length - 1][msg.sender][_side] += _keptValue;
        }
        if (_refundedValue > 0) msg.sender.transfer(_refundedValue);
        emit Contribution(_agreementID, _paidFees.stake.length - 1, msg.sender, _keptValue);

        // Check if enough funds have been gathered and act accordingly.
        if (
            _paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][_side] >= _requiredValueForSide ||
            (_appealing && !_appealPeriodSupported)
        ) {
            if (_side == 0 && !(_appealing && !_appealPeriodSupported)) { // Losing side and not direct appeal.
                if (!_paidFees.loserFullyFunded[_paidFees.loserFullyFunded.length - 1])
                    _paidFees.loserFullyFunded[_paidFees.loserFullyFunded.length - 1] = true;
            } else { // Winning side or direct appeal.
                if (!_appealing) { // First round.
                    agreement.disputeID = agreement.arbitrator.createDispute.value(_cost)(agreement.numberOfChoices, agreement.extraData);
                    agreement.disputed = true;
                    emit Dispute(agreement.arbitrator, agreement.disputeID, uint(_agreementID));
                } else { // Appeal.
                    _paidFees.ruling[_paidFees.ruling.length - 1] = agreement.arbitrator.currentRuling(agreement.disputeID);
                    agreement.arbitrator.appeal.value(_cost)(agreement.disputeID, agreement.extraData);
                    if (!agreement.appealed) agreement.appealed = true;
                }

                // Update the total value.
                _paidFees.totalValue[_paidFees.totalValue.length - 1] -= _cost;

                // Prepare for the next round.
                _paidFees.ruling.push(0);
                _paidFees.stake.push(stake);
                _paidFees.totalValue.push(0);
                _paidFees.totalContributedPerSide.push([0, 0]);
                _paidFees.loserFullyFunded.push(false);
                _paidFees.contributions.length++;
            }
        }
    }

    /** @dev Withdraws the caller's reward for funding the specified round of the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _round The round.
     */
    function withdrawReward(bytes32 _agreementID, uint _round) public {
        Agreement storage agreement = agreements[_agreementID];
        PaidFees storage _paidFees = paidFees[_agreementID];
        require(agreement.creator != address(0), "The specified agreement does not exist.");
        require(
            !agreement.disputed || agreement.arbitrator.disputeStatus(agreement.disputeID) == Arbitrator.DisputeStatus.Solved,
            "The agreement is still disputed."
        );
        require(_round < _paidFees.stake.length, "The specified round of the specified agreement does not exist.");

        uint _reward;
        if (_round == 0 || _round == _paidFees.stake.length - 1) { // First or last round.
            require(_round != 0 || !agreement.disputed, "There is nothing to withdraw from the first round if the dispute was raised.");
            _reward = _paidFees.contributions[_round][msg.sender][0] + _paidFees.contributions[_round][msg.sender][1];
        } else { // Appeal.
            uint _winningSide = _paidFees.ruling[_round] != agreement.ruling ? 0 : 1;
            _reward = ((_paidFees.totalValue[_round] * _paidFees.contributions[_round][msg.sender][_winningSide]) / _paidFees.totalContributedPerSide[_round][_winningSide]);
        }

        msg.sender.transfer(_reward);
    }

    /* Public Views */

    /** @dev Gets the info on fees paid for the specified round of the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _round The round.
     *  @return The info.
     */
    function getRoundInfo(
        bytes32 _agreementID,
        uint _round
    ) public view returns(
        uint ruling,
        uint _stake,
        uint totalValue,
        uint[2] totalContributedPerSide,
        bool loserFullyFunded
    ) {
        PaidFees storage _paidFees = paidFees[_agreementID];
        ruling = _paidFees.ruling[_round];
        _stake = _paidFees.stake[_round];
        totalValue = _paidFees.totalValue[_round];
        totalContributedPerSide = _paidFees.totalContributedPerSide[_round];
        loserFullyFunded = _paidFees.loserFullyFunded[_round];
    }

    /** @dev Gets the contributions by the specified contributor in the specified round of the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _round The round.
     *  @param _contributor The address of the contributor.
     *  @return The contributions.
     */
    function getContributions(bytes32 _agreementID, uint _round, address _contributor) public view returns(uint[2] contributions) {
        contributions = paidFees[_agreementID].contributions[_round][_contributor];
    }
}
