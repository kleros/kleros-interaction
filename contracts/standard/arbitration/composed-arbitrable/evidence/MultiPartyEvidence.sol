pragma solidity ^0.4.24;

import "../agreement/MultiPartyAgreements.sol";

/**
 *  @title MultiPartyEvidence
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Evidence part of a composed arbitrable contract. Only allows evidence submission from parties involved in the agreement and in the first round.
 */
contract MultiPartyEvidence is MultiPartyAgreements {
    /* Public */

    /** @dev Submits evidence for a dispute arising from the specified agreement.
     *  @param _agreementID The agreement's ID.
     *  @param _evidence The evidence.
     */
    function submitEvidence(bytes32 _agreementID, string _evidence) public {
        require(agreements[_agreementID].creator != address(0), "The specified agreement does not exist.");
        require(agreements[_agreementID].disputed, "The specified agreement is not disputed.");
        require(!agreements[_agreementID].appealed, "The specified agreement has already been appealed.");
        bool _senderIsInvolved = false;
        for (uint i = 0; i < agreements[_agreementID].parties.length; i++)
            if (agreements[_agreementID].parties[i] == msg.sender) _senderIsInvolved = true;
        require(_senderIsInvolved, "The sender is not a party in the specified agreement.");
        emit Evidence(agreements[_agreementID].arbitrator, agreements[_agreementID].disputeID, msg.sender, _evidence);
    }
}
