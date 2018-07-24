/**
 *  @title Arbitrable Kitty
 *  @author Matheus Alencar - <mtsalenc@gmail.com>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */


pragma solidity ^0.4.24;
import "./TwoPartyArbitrable.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "./CriptoKitties/KittyCore.sol";
import "./CriptoKitties/Auction/SiringClockAuction.sol";
import "./CriptoKitties/Auction/SaleClockAuction.sol";


/** @title Arbitrable Kitty
 *  @author Matheus Alencar - <mtsalenc@gmail.com>
 *  @dev A marriage-like contract for managing cryptokitty ownership by two parties.
 *  Allows arbitration in case of divorce and shared custody.
 */
contract ArbitrableKitty is TwoPartyArbitrable{
    using SafeMath for uint256;

    KittyCore public kittyCore;
    SiringClockAuction public siringAuction;
    SaleClockAuction public saleAuction;

    enum RulingResult {NoResult, PartyA, PartyB, SharedCustody}
    RulingResult public rulingResult;

    struct SellConsent{
        uint256 startingPrice;
        uint256 endPrice;
        uint256 duration;
        bool partyConsents;
    }

    struct TransferConsent{
        address recipient;
        bool partyConsents;
    }

    mapping(address => mapping(uint256 => SellConsent)) public sellConsents;    
    mapping(address => mapping(uint256 => TransferConsent)) public transferConsents;

    string constant RULING_OPTIONS = "Give to partyA;Give to partyB;Grant shared custody";    
    uint8 constant SHARED_CUSTODY = 3;
    uint8 constant AMOUNT_OF_CHOICES = 3; // The number of ruling options available.

    uint256 constant CUSTODY_TIME = 1 weeks;
    address public winner;    
    uint256 public rulingTime;

    /** @dev Indicate that shared custody has been granted.
     */
    event SharedCustodyHasBeenGranted();

    /** @dev Indicate that a `_party` won full custody.
     *  @param _party The party that won full custody.
     */
    event PartyWonCustody(address _party);

    /** @dev Indicate that a `_party` revoked transfer consent.
     *  @param _party The party who revoked consent.
     *  @param _kittyID The affected kitty.
     */
    event PartyRevokedTransferConsent(address _party, uint256 _kittyID);

    /** @dev Indicate that `_party` consents to transfer kitty.
     *  @param _kittyID The party who consented to transfer.
     *  @param _recipient The party elegible to receive the kitty.
     */
    event PartyConsentsToTransfer(uint256 _kittyID, address _recipient);

    /** @dev Indicate that a `_party` revoked sell consent.
     *  @param _party The party who revoked consent.
     *  @param _kittyID The affected kitty.
     */
    event PartyRevokedSellConsent(address _party, uint256 _kittyID);

    /** @dev Indicate that `_party` consents to sell the kitty with the given parameters.
     *  @param _kittyID The id of the kitty which may be sold.
     *  @param _startingPrice The consented starting price.
     *  @param _endPrice The consented ending price.
     *  @param _duration The consented duration.
     */
    event PartyConsentsToSell(
        uint256 _kittyID,  
        uint256 _startingPrice,  
        uint256 _endPrice,  
        uint256 _duration
    );

    modifier contractOwnsKitty(uint256 _kittyID) {
        address kittyOwner = kittyCore.ownerOf(_kittyID); 
        require(this==kittyOwner); 
        _;  
    }

    modifier noDisputeOrResolved() {
        require(status == Status.NoDispute || status == Status.Resolved);
        _;  
    }

    /** @dev Requires that a dispute has not been resolved with full custody to a party.
     *  If a party won full custody from a dispute, they should transfer the kitties
     *  to themselves instead of using them through the contract.
     */
    modifier didNotGrantFullCustody() {
        require(rulingResult != RulingResult.PartyA || rulingResult != RulingResult.PartyB);
        _;
    }

    /** @dev Constructor. Choose the arbitrator. Should be called by party A.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _kittyCore CriptoKitty core smart contract.
     *  @param _partyB The partner sharing the kitty.
     *  @param _timeout Time after which a party automatically loose a dispute.     
     *  @param _arbitratorExtraData Extra data for the arbitrator.
     *  @param _metaEvidence Link to the meta-evidence.
     */
    constructor(
        Arbitrator _arbitrator,
        KittyCore _kittyCore,
        address _partyB,
        uint _timeout,        
        bytes _arbitratorExtraData,
        string _metaEvidence
    ) 
    TwoPartyArbitrable(
        _arbitrator,
        _timeout,
        _partyB,
        AMOUNT_OF_CHOICES,
        _arbitratorExtraData,
        _metaEvidence
    ) 
        payable 
        public
    {        
        kittyCore = KittyCore(_kittyCore);
        siringAuction = SiringClockAuction(address(kittyCore.siringAuction()));
        saleAuction = SaleClockAuction(address(kittyCore.saleAuction()));
    }

    /** @dev Returns true if the party consents to transfer kitty to a given address. 
     *  @param _party The party which we want to verify consent.
     *  @param _recipient The address that will receive the kitty.
     *  @param _kittyID The id of the kitty to be transfered.
     */
    function partyConsentsToTransfer(address _party, address _recipient, uint256 _kittyID) 
        view 
        public   
        returns (bool)
    {
        TransferConsent memory transferConsent = transferConsents[_party][_kittyID];
        return transferConsent.partyConsents && transferConsent.recipient == _recipient;
    }

    /** @dev Returns true if the party consents to place the kitty 
     *  for sale with the given parameters.
     *  @param _party The party which we want to verify consent.
     *  @param _kittyID The id of the kitty that will be auctioned.
     *  @param _startingPrice The starting for the auction.
     *  @param _endPrice The ending price for the auction.
     *  @param _duration The duration of the auction.
     */
    function partyConsentsToSell(
        address _party,
        uint256 _kittyID,
        uint256 _startingPrice,
        uint256 _endPrice,
        uint256 _duration
    )
        view 
        public 
        returns (bool)
    {
        SellConsent memory sellConsent = sellConsents[_party][_kittyID];
        bool partyConsentsToParameters = 
            sellConsent.partyConsents && 
            sellConsent.startingPrice == _startingPrice &&
            sellConsent.endPrice == _endPrice &&
            sellConsent.duration == _duration;

        return partyConsentsToParameters;            
    }

    /** @dev Places kitty on a siring auction. UNTRUSTED.     
     *  @param _kittyID The id of the kitty to be put up for siring.
     *  @param _startingPrice The starting for the auction.
     *  @param _endPrice The ending price for the auction.
     *  @param _duration The duration of the auction.
     */
    function createSiringAuction(
        uint256 _kittyID, 
        uint256 _startingPrice,  
        uint256 _endPrice,  
        uint256 _duration
    )        
        external
        contractOwnsKitty(_kittyID)
        onlyParty
        noDisputeOrResolved
        didNotGrantFullCustody
    {
        if(status == Status.NoDispute) {
            kittyCore.createSiringAuction(_kittyID, _startingPrice, _endPrice, _duration);
            return;
        }

        if(rulingResult == RulingResult.SharedCustody){
            require(underSendersCustody());
            kittyCore.createSiringAuction(_kittyID, _startingPrice, _endPrice, _duration);
            return;
        }
    }

    /** @dev Cancels a siring auction. UNTRUSTED.     
     *  @param _kittyID The id of the kitty to be put up for siring.     
     */
    function cancelSiringAuction(uint256 _kittyID) onlyParty noDisputeOrResolved external {
        if(status == Status.NoDispute) {
            siringAuction.cancelAuction(_kittyID);
            return;
        }

        if(rulingResult == RulingResult.PartyA || rulingResult == RulingResult.PartyB) {
            require(msg.sender == winner);
            siringAuction.cancelAuction(_kittyID);
            return;
        }

        if(rulingResult == RulingResult.SharedCustody){
            require(underSendersCustody());
            siringAuction.cancelAuction(_kittyID);
            return;
        }
    }

    /** @dev Bids on a siring auction. UNTRUSTED.     
     *  @param _sireID The id of the kitty available for siring.    
     *  @param _matronID The id of the kitty owned by the bidder.
     */
    function bidOnSiringAuction(
        uint256 _sireID,  
        uint256 _matronID
    ) 
        payable
        external
        contractOwnsKitty(_matronID)
        onlyParty
        noDisputeOrResolved
        didNotGrantFullCustody
    {
        if(status == Status.NoDispute) {
            kittyCore.bidOnSiringAuction.value(msg.value)(_sireID, _matronID);
            return;
        }

        if(rulingResult == RulingResult.SharedCustody){
            require(underSendersCustody());
            kittyCore.bidOnSiringAuction.value(msg.value)(_sireID, _matronID);
            return;
        }
    }
    
    /** @dev Breeds two kitties owned by this contract. UNTRUSTED.     
     *  @param _sireID The id of the sire kitty owned by this contract.
     *  @param _matronID The id of the matron kitty owned by this contract.
     */
    function breedWithAuto(uint256 _matronID, uint256 _sireID) 
        payable
        external 
        onlyParty
        noDisputeOrResolved
        didNotGrantFullCustody
        contractOwnsKitty(_matronID)
        contractOwnsKitty(_sireID) 
    {
        if(status == Status.NoDispute) {
            kittyCore.breedWithAuto.value(msg.value)(_matronID, _sireID);
            return;
        }

        if(rulingResult == RulingResult.SharedCustody){
            require(underSendersCustody());
            kittyCore.breedWithAuto.value(msg.value)(_matronID, _sireID);
            return;
        }
    }

    /** @dev Gives birth to a pregnant kitty if it is ready. UNTRUSTED.     
     *  @param _kittyID The id of the pregnant kitty.
     */
    function giveBirth(uint256 _kittyID) 
        external 
        onlyParty 
        contractOwnsKitty(_kittyID) 
        noDisputeOrResolved 
        didNotGrantFullCustody
    {
        if(status == Status.NoDispute) {
            kittyCore.giveBirth(_kittyID);
            return;
        }

        if(rulingResult == RulingResult.SharedCustody){
            require(underSendersCustody());
            kittyCore.giveBirth(_kittyID);
            return;
        }
    }

    /** @dev Stores a consent to transfer the kitty to a given recipient.
     *  @param _kittyID The id of the kitty to be transfered.
     *  @param _recipient The address that we are granting consent to transfer to.
     */
    function consentToTransfer(uint256 _kittyID, address _recipient) 
        external
        onlyParty
        noDisputeOrResolved
        didNotGrantFullCustody
    {        
        TransferConsent storage transferConsent = transferConsents[msg.sender][_kittyID];
        transferConsent.recipient = _recipient;
        transferConsent.partyConsents = true;
        emit PartyConsentsToTransfer(_kittyID, _recipient);
    }

    /** @dev Clears transfer consent by a given party.
     *  @param _kittyID The id of the kitty to have transfer consent revoked.     
     */
    function revokeConsentToTransfer(uint256 _kittyID)
        external
        onlyParty
        noDisputeOrResolved
        didNotGrantFullCustody
    {
        delete transferConsents[msg.sender][_kittyID];
        emit PartyRevokedTransferConsent(msg.sender,_kittyID);
    }

    /** @dev Transfers the kitty if msg.sender has full custody. Otherwise, 
     *  consent by the other party is required. UNTRUTED.
     *  @param _recipient The address that will receive the kitty.
     *  @param _kittyID The id of the kitty to be transfered.
     */
    function transfer(address _recipient, uint256 _kittyID) 
        external 
        onlyParty 
        contractOwnsKitty(_kittyID)
        noDisputeOrResolved
    {
        if(rulingResult == RulingResult.PartyA || rulingResult == RulingResult.PartyB) {
            // Granted full custody to either party
            require(msg.sender == winner);
            kittyCore.transfer(_recipient, _kittyID);
            return;
        }

        // No dispute or shared custody
        address otherParty = msg.sender == partyA ? partyB : partyA;
        require(partyConsentsToTransfer(otherParty, _recipient, _kittyID));        

        delete transferConsents[otherParty][_kittyID];
        kittyCore.transfer(_recipient, _kittyID);
    }

    /** @dev Places kitty for sale with the given parameters if both parties consent. UNTRUSTED.
     *  If a party was granted full custody, they should transfer the kitty to themselves 
     *  instead of using the kitty through the contract.
     *  @param _kittyID The id of the kitty that will be auctioned.
     *  @param _startingPrice The starting for the auction.
     *  @param _endPrice The ending price for the auction.
     *  @param _duration The duration of the auction.
     */
    function createSaleAuction(
        uint256 _kittyID,  
        uint256 _startingPrice,  
        uint256 _endPrice,  
        uint256 _duration
    ) 
        external
        onlyParty 
        contractOwnsKitty(_kittyID)
        noDisputeOrResolved
        didNotGrantFullCustody
    {
        address otherParty = msg.sender == partyA ? partyB : partyA;        
        require(partyConsentsToSell(otherParty, _kittyID, _startingPrice, _endPrice, _duration));
        delete transferConsents[otherParty][_kittyID];
        kittyCore.createSaleAuction(_kittyID, _startingPrice, _endPrice, _duration);
    }    

    /** @dev Consents to place kitty up for sale with the given parameters.     
     *  @param _kittyID The id of the kitty that will be auctioned.
     *  @param _startingPrice The starting for the auction.
     *  @param _endPrice The ending price for the auction.
     *  @param _duration The duration of the auction.
     */
    function consentToSell(
        uint256 _kittyID,  
        uint256 _startingPrice,  
        uint256 _endPrice,  
        uint256 _duration
    ) 
        external
        onlyParty
        noDisputeOrResolved
        didNotGrantFullCustody
    {        
        SellConsent storage sellConsent = sellConsents[msg.sender][_kittyID];
        sellConsent.startingPrice = _startingPrice;
        sellConsent.endPrice = _endPrice;
        sellConsent.duration = _duration;
        sellConsent.partyConsents = true;

        emit PartyConsentsToSell(_kittyID, _startingPrice, _endPrice, _duration);
    }

    /** @dev Removes consent to sell the kitty of id _kittyID.
     *  @param _kittyID The id of the kitty to have the sell consent revoked.     
     */
    function revokeConsentToSell(uint256 _kittyID)
        external
        onlyParty
        noDisputeOrResolved
        didNotGrantFullCustody
    {
        delete sellConsents[msg.sender][_kittyID];
        emit PartyRevokedSellConsent(msg.sender,_kittyID);
    }

    /** @dev Cancels a running sale auction. UNTRUSTED.
     *  @param _kittyID The id of the kitty tobe removed from sale auction.
     */
    function cancelSaleAuction(uint256 _kittyID) 
        external 
        onlyParty
        noDisputeOrResolved
    {
        if(status == Status.NoDispute) {
            saleAuction.cancelAuction(_kittyID);
            return;
        }

        if(rulingResult == RulingResult.PartyA || rulingResult == RulingResult.PartyB) {
            // Arbitrator granted full custody.
            require(msg.sender == winner);
            saleAuction.cancelAuction(_kittyID);
            return;
        }
    }

    /** @dev Execute a ruling of a dispute. It reimburses the fee to the winning party.
     *  Overrides method in TwoPartyArbitrable to account for third ruling option: SHARED_CUSTODY
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. 
     *  - 1 : Grant full custody to and reimburse partyA.
     *  - 2 : Grant full custody to and reimburse partyA.
     *  - 3 : Grant shared custody and split biggest fee among parties.
     */
    function executeRuling(uint _disputeID, uint _ruling) internal {
        super.executeRuling(_disputeID,_ruling);
        
        if (_ruling==PARTY_A_WINS) {
            rulingResult = RulingResult.PartyA;
            winner = partyA;
            emit PartyWonCustody(winner);
        } else if (_ruling==PARTY_B_WINS) {
            rulingResult = RulingResult.PartyB;
            winner = partyB;
            emit PartyWonCustody(winner);
        } else if (_ruling==SHARED_CUSTODY) {
            rulingResult = RulingResult.SharedCustody;
            rulingTime = now;
            
            // Give the arbitration fee back.
            // Note that we use send to prevent a party from blocking the execution.
            // We send the highest amount paid to avoid ETH to be stuck in 
            // the contract if the arbitrator lowers its fee.
            uint256 largestFee = partyAFee > partyBFee ? partyAFee : partyBFee;
            uint256 halfFees = largestFee.div(2);

            partyA.send(halfFees);
            partyB.send(halfFees);

            emit SharedCustodyHasBeenGranted();
        }        
    }

    function underSendersCustody() view public onlyParty returns (bool) {
        require(status==Status.Resolved);
        require(rulingResult==RulingResult.SharedCustody);
        if(now<=rulingTime){
            return false;
        }

        RulingResult custody = custodyTurn(rulingTime,now,CUSTODY_TIME);
        if(custody==RulingResult.PartyA && msg.sender==partyA){
            return true;
        } else if(custody==RulingResult.PartyB && msg.sender==partyB){
            return true;
        }

        return false;
    }

    function custodyTurn(
        uint256 _rulingTime, 
        uint256 _currentTime, 
        uint256 _duration
    ) public pure returns (RulingResult){
        require(_currentTime>_rulingTime);

        uint256 delta = _currentTime.sub(_rulingTime);
        uint256 period = delta.div(_duration);
        if(modulus(period,2) == 0){
            return RulingResult.PartyA;
        } else {
            return RulingResult.PartyB;
        }
    }

    function modulus(uint256 num, uint256 den) pure public returns (uint256){
        if(num.div(den) == 0) {
            return num;
        } else {
            return num.sub((num.div(den)).mul(den));
        }
    }

}