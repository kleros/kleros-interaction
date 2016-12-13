pragma solidity ^0.4.6;

// Note, we assume totalSupply < 2^256-1
contract Court is Token {
    /** Distribute tokens on initialization.
     *  To be replaced by a crowdfunding.
     */
    function Court(address[] accounts, uint256[] tokens){
        if (accounts.length!=tokens.length)
            throw;
        for (uint256 i = 0; i < accounts.length; i++){
            balances[accounts[i]]+=tokens[i];
            totalSupply+=tokens[i];
        }
        
        session=1; // Sessions starts at 1 in order to keep 0 as a special value.
        
        // Push a null dispute in order to make dispute starts at 1.
        // This allows interacting contracts to assume that the default value 0 indicates that there is no dispute yet.
        // This will save more gaz than the gaz overhead in the constructor which will only be called once.
        disputes.length++;
        
    }
    
    function transfer(address _to, uint256 _value) returns (bool success) {
        // Note that (balances[msg.sender] >= _value + atStake[msg.sender]) is not sufficient as it could overflow.
        if (balances[msg.sender] >= _value && _value > 0 && !blocked(msg.sender) && balances[msg.sender] >= _value + atStake[msg.sender]) {
            balances[msg.sender] -= _value;
            balances[_to] += _value;
            Transfer(msg.sender, _to, _value);
            return true;
        } else { return false; }
    }

    function transferFrom(address _from, address _to, uint256 _value)  returns (bool success) {
        if (balances[_from] >= _value && allowed[_from][msg.sender] >= _value && _value > 0 && !blocked(_from) && balances[_from] >= _value + atStake[_from]) {
            balances[_to] += _value;
            balances[_from] -= _value;
            allowed[_from][msg.sender] -= _value;
            Transfer(_from, _to, _value);
            return true;
        } else { return false; }
    }

    function balanceOf(address _owner) constant returns (uint256 balance) {
        return balances[_owner];
    }

    function approve(address _spender, uint256 _value) returns (bool success) {
        allowed[msg.sender][_spender] = _value;
        Approval(msg.sender, _spender, _value);
        return true;
    }

    function allowance(address _owner, address _spender) constant returns (uint256 remaining) {
      return allowed[_owner][_spender];
    }

    mapping (address => uint256) balances;
    mapping (address => mapping (address => uint256)) allowed;
    
    mapping (address => uint256) public atStake; // Max number of tokens which can be lost. Those tokens are blocked
    
    uint256 public session; // Current session of the court
    uint256 public endLastSession; // Time when last session finished
    
    mapping (address => uint256) public arbitralSession;       // Last session the tokens were activated for arbitration.
    mapping (address => uint256) public arbitralSegementStart; // Start of the segment of tokens for arbitration during arbitralSession.
    mapping (address => uint256) public arbitralSegementEnd;   // End of the segment of tokens for arbitration during arbitralSession.
    uint256 public arbitralSegmentPosition;                    // Last position used in the arbitral token circle.
    
    mapping (address => uint256) public jurySession;           // Last session the tokens were activated for jury.
    mapping (address => uint256) public jurySegementStart;     // Start of the segment of tokens for jury during arbitralSession.
    mapping (address => uint256) public jurySegementEnd;       // End of the segment of tokens for jury during arbitralSession.
    uint256 public jurySegmentPosition;                        // Last position used in the jury token circle.
    
    // WARNING those values are for test purpose only
    uint256 public minArbitralToken=1000;                      // Minimum number of tokens to be arbitrator.
    uint256 public minJuryToken=1000;                          // Minimum of tokens drawn for jury.
    uint256 public timeToAppeal=60;                            // Time to appeal (in seconds).
    uint256 public partAtStakeDivisor=5;                       // (1/partAtStakeDivisor) is the maximum proportion of tokens which can be lost.
    
    struct Dispute {
        Arbitrable arbitratedContract; // Contract to be arbitrated.
        uint256 session; // Session for the dispute to be resolved. High values are special values.
        uint256 appeals; // Number of appeals for the dispute.
        uint256 r; // Random number for the dispute.
        uint256 voteA;
        uint256 voteB;
        Vote[][] voters; // In the form of voters[appeals][votePosition].
        mapping (address => uint256) hasVoted; // Last session the account has voted.
    }
    // Special values for dispute session
    uint256 EXECUTABLE = uint256(-1);
    uint256 EXECUTED   = uint256(-2);
    
    // TO DO: Replace appeals with voters.length if it consumes less gaz.
    
    struct Vote {
        address account;
        uint256 stakeA;
        uint256 stakeB;
    }
    
    
    Dispute[] public disputes;

    // TO DO: Verify and set the right types
    
    
    
    /** Return true if the tokens of account are blocked.
     *  Tokens are blocked if they are activated for arbitration or for the jury system in the current session.
     *  @param account The account to be checked if blocked.
     */
    function blocked(address account) constant returns(bool){
        if (session == arbitralSession[account] || session == jurySession[account])
            return true;
        else
            return false;
    }
    
    /** TO BE IMPLEMENTED
     *  For now can be called by anyone.
     */
    function nextSession() {
        session++; // Open a new session.
        arbitralSegmentPosition=0; // Reset the positions for both jury and arbiters
        jurySegmentPosition=0;
        endLastSession=now;
    }
    
    /** TO BE IMPLEMENTED
     *  For now it is always open.
     *  In the future, it will only be opened at the begining of sessions.
     */
    function activationOpen() constant returns(bool) {
        return true;
    }
    
    /** TO BE IMPLEMENTED
     *  For now it is always open.
     *  In the future, it will be only opened after the activation is closed.
     */
    function disputeOpen() constant returns(bool) {
        return true;
    }
    
    /** Active the tokens for arbitration.
     *  Tokens must not have already be activated for arbitration during this session.
     *  The activation must be open.
     *  The account calling the function must have the tokens it wants to activate.
     *  The number account calling this function must have at least minArbitralToken.
     *  @param tokens Number of tokens to be activated.
     */
    function activateTokensForArbitration(uint256 tokens){
        if (arbitralSession[msg.sender]==session || !activationOpen() || balances[msg.sender]<tokens || tokens<minArbitralToken) // Verify that the tokens can be activated
            throw;
            
        arbitralSession[msg.sender]=session; // The tokens are activated for this session.
        
        arbitralSegementStart[msg.sender]=arbitralSegmentPosition; // Update the positions.
        arbitralSegmentPosition+=tokens;
        arbitralSegementEnd[msg.sender]=arbitralSegmentPosition;
    }
    
    /** Active the tokens for the jury system.
     *  Tokens must not have already be activated for the jury system during this session.
     *  The activation must be open.
     *  The account calling the function must have the tokens it wants to activate.
     *  The minimum number of tokens to be activated is minJuryToken. This is to avoid vote flooding which would lead to increased gaz cost.
     *  @param tokens Number of tokens to be activated.
     */
    function activateTokensForJury(uint256 tokens){
        if (jurySession[msg.sender]==session || !activationOpen() || balances[msg.sender]<tokens || tokens < minJuryToken) // Verify that the tokens can be activated
            throw; 
            
        jurySession[msg.sender]=session; // The tokens are activated for this session.
        
        jurySegementStart[msg.sender]=jurySegmentPosition; // Update the positions.
        jurySegmentPosition+=tokens;
        jurySegementEnd[msg.sender]=jurySegmentPosition;
    }    
    
    /** Return true if account is the arbiter of the dispute.
     *  @param account Account which could be a member of the dispute.
     *  @param r       Random number of the dispute.
     *  Note that the function throws if arbitralSegmentPosition==0 which happens when no tokens have been activated for arbitration. 
     */
    function drawnArbiter(address account, uint256 r) constant returns(bool){
        if (arbitralSession[msg.sender]!=session) // No tokens activated for this session
            return false;
        uint256 drawnPosition=r % arbitralSegmentPosition;
        if (arbitralSegementStart[account]<=drawnPosition && drawnPosition<arbitralSegementEnd[account])
            return true;
        else
            return false;
    }
    
    /** Return the number of drawn tokens belonging to account.
     *  @param account Account to be return the number of drawn tokens.
     *  @param r       Random number of the dispute.
     *  @param t       Total number of tokens to be drawn for the appeal.
     *  Note that the function throws if jurySegmentPosition==0 which happens when no tokens have been activated for the jury system.
     */
    function drawnTokens(address account, uint256 r, uint256 t) constant returns(uint256) {
        if (jurySession[msg.sender]!=session) // No tokens activated for this session
            return 0;
        if (t>=jurySegmentPosition) // All the court is drawn
            return jurySegementEnd[account]-jurySegementStart[account];
            
        uint256 startDrawnSegment=r % jurySegmentPosition;
        uint256 endDrawnSegment=startDrawnSegment+t;
        uint256 leftIntersection;
        uint256 rightIntersection;
        if (endDrawnSegment<=jurySegmentPosition){  // We don't wrap arround
            leftIntersection=(jurySegementEnd[account] < endDrawnSegment ? jurySegementEnd[account] : endDrawnSegment);
            rightIntersection=(jurySegementStart[account] > startDrawnSegment ? jurySegementStart[account] : startDrawnSegment);
            return (leftIntersection < rightIntersection ? rightIntersection - leftIntersection : 0);
        }
        else { // We wrap arround
            endDrawnSegment-=jurySegmentPosition;
            leftIntersection=(jurySegementStart[account] > startDrawnSegment ? jurySegementStart[account] : startDrawnSegment);
            rightIntersection=(jurySegementEnd[account] < jurySegmentPosition ? jurySegementEnd[account] : jurySegmentPosition);
            return (leftIntersection < rightIntersection ? rightIntersection - leftIntersection : 0)
            + (endDrawnSegment > jurySegementStart[account] ? endDrawnSegment-jurySegementStart[account] : 0);
        }
    }
    
    /** To be called by Arbitrable contracts.
     *  @param r Random seed given by the arbitrable contract.
     *  @return disputeID The ID of the dispute. Notice that it starts at 1.
     *  TO BE IMPLEMENTED: Payment of the arbitration fees.
     */
    function createDispute(uint256 r) payable returns(uint256 disputeID) {
        if (!disputeOpen()) // Can't create a dispute now.
            throw;
        disputeID=disputes.length++;
        Dispute dispute=disputes[disputeID];
        dispute.arbitratedContract=Arbitrable(msg.sender);
        dispute.session=session;
        dispute.r=r;
        dispute.voters.length++;
        
        return disputeID;
    }
    
    /** Arbitrate a dispute.
     *  @param disputeID ID of the dispute to be arbitrated.
     *  @param voteA True to rule A. False to rule B.
     */
    function arbitrate(uint256 disputeID, bool voteA){
        Dispute dispute=disputes[disputeID];
        uint256 stake=minArbitralToken/partAtStakeDivisor;
        
        if (!drawnArbiter(msg.sender,dispute.r)// Verify that the sender was the drawn arbiter.
            || dispute.voteA > 0 // Verify that it hasn't been ruled yet.
            || dispute.voteB > 0
            || dispute.appeals != 0 // Verify it is a first instance
            || dispute.session != session)  // Verify that the dispute is a dispute of this session.
            throw;
        
        
        atStake[msg.sender]+=stake; // Add tokens at Stake.
        dispute.voters[dispute.appeals].push(Vote({  // Add it in the list of voters.
            account:msg.sender,
            stakeA:voteA ? stake : 0,
            stakeB:voteA ? 0 : stake
        }));
        // Cast the decision of the arbiter  
        if (voteA)
            dispute.voteA=1;
        else
            dispute.voteB=1;

    }
    
    /** Execute the ruling given by the court. 
     *  The ruling must be executable.
     *  @param disputeID ID of the dispute to have its ruling enforced.
     */
    function executeRuling(uint256 disputeID){
        Dispute dispute=disputes[disputeID];
        if (dispute.session != EXECUTABLE)
            throw;
        dispute.session=EXECUTED; // Indicates that the dispute is resovled.
        
        if (dispute.voteA>dispute.voteB) // A wins.
            dispute.arbitratedContract.ruleA(disputeID);
        else // B wins
            dispute.arbitratedContract.ruleB(disputeID);
    }
    
    /** Appeal a ruling.
     *  TO BE IMPLEMENTED: Payment of the arbitration fees.
     *  @param disputeID ID of the dispute to be appealed.
     */
    function appealRuling(uint256 disputeID, uint256 r) payable {
        Dispute dispute=disputes[disputeID];
        if (dispute.session != session-1 // The dispute was not ruled before this session.
            || now-endLastSession >= timeToAppeal  // It's too late to appeal.
            || dispute.arbitratedContract != msg.sender // Not called by the arbitrated contract.
            || minJuryToken * (2**(dispute.appeals+1)) > jurySegmentPosition) // Number of drawn tokens would be more than twice the number of activated tokens. No more appeal possible.
            throw;
        
        dispute.voteA=0; // Reset votes.
        dispute.voteB=0;
        dispute.session=session; // Dispute will be arbitrable for this new session
        dispute.appeals+=1;
        dispute.voters.length++;
    }
    
    /** Make a ruling as a jury member.
     *  @param disputeID ID of the dispute to be arbitrated.
     *  @param voteA True to rule A. False to rule B.
     *  TO DO: Switch to a system with committed votes.
     */
    function voteRuling(uint256 disputeID, bool voteA) {
        Dispute dispute=disputes[disputeID];
        uint256 stake;
        if (dispute.hasVoted[msg.sender]==session) // Has already voted for the session
            throw;
            
        uint256 votingRights=drawnTokens(msg.sender,dispute.r,(2**(dispute.appeals)) * minJuryToken);
        dispute.hasVoted[msg.sender]=session; // Has voted
        if (voteA)
            dispute.voteA+=votingRights;
        else
            dispute.voteB+=votingRights;
            
        stake=votingRights/partAtStakeDivisor;
        atStake[msg.sender]+=stake; // Add tokens at stake
        
        dispute.voters[dispute.appeals].push(Vote({  // Add it in the list of voters.
            account:msg.sender,
            stakeA:voteA ? stake : 0,
            stakeB:voteA ? 0 : stake
        }));
    }
    
    /** Execute the repartition of tokens.
     *  This function works in 1 shot.
     *  minJuryToken is here to make it impossible for an attacker to make this function run out of gaz on purpose.
     *  However it can happen in cas of an high number of appeal.
     *  @param disputeID ID of the dispute.
     *  TO DO: Implement function doing it in multiple shot in order to avoid being blocked by the gaz limit.
     */
    function executeTokenRepartition(uint256 disputeID){
        Dispute dispute=disputes[disputeID];
        if (dispute.session >= session // The dispute was not solved before this session or is in a special state.
            || now-endLastSession < timeToAppeal // The time to appeal has not passed yet.
            || dispute.voteA == dispute.voteB)   // The vote is tied or the arbiter was inactive.
            throw;
            
        bool winnerA = dispute.voteA > dispute.voteB;
        
        // Token repartition for jury members
        for (;dispute.voters.length>1;--dispute.voters.length){
            uint256 j;
            uint256 divider=0;
            uint256 totalToSplit=0;
            uint256 remainingToSplit=0;
            uint256 stake=0;
            uint256 lostStake=0;
            uint256 wonStake=0;
            Vote vote;
            
            for (j=0;j<dispute.voters[dispute.voters.length-1].length;++j){ // Compute the parts
                vote=dispute.voters[dispute.voters.length-1][j];
                stake=vote.stakeA+vote.stakeB;
                atStake[vote.account]-=stake; // Remove tokens at Stake such that they can be moved again.
                if (winnerA){
                    divider+=vote.stakeA;
                    lostStake=vote.stakeB<balances[vote.account] ? vote.stakeB : balances[vote.account]; // Can't loose more tokens than they have.
                    
                } else {
                    divider+=vote.stakeB;
                    lostStake=vote.stakeA<balances[vote.account] ? vote.stakeA : balances[vote.account];
                }
                balances[vote.account]-=lostStake; // Remove the lost tokens. Note that it can't underflow due to taking the minimum.
                totalToSplit+=lostStake; // And put them in a common pot.
            }
            remainingToSplit=totalToSplit;
            
            if (divider!=0) // If divider is 0, there is nothing to give and we split this loop to avoid dividing by 0.
                for (j=0;j<dispute.voters[dispute.voters.length-1].length;++j){
                    vote=dispute.voters[dispute.voters.length-1][j];
                    if (winnerA)
                        wonStake=(vote.stakeA*totalToSplit)/divider; // TO DO: Make sure that it can't overflow.
                    else 
                        wonStake=(vote.stakeB*totalToSplit)/divider;
                    remainingToSplit-=wonStake;
                    balances[vote.account]+=wonStake;
                }
            balances[this]+=remainingToSplit; // Give the remaining tokens due to division to the court itself in order to keep the number of token fixed.
        }
        
        // Token repartition for arbiter.
        vote=dispute.voters[0][0];
        if (winnerA)
            lostStake=vote.stakeB<balances[vote.account] ? vote.stakeB : balances[vote.account];
        else
            lostStake=vote.stakeA<balances[vote.account] ? vote.stakeA : balances[vote.account];
            
        atStake[vote.account]-=vote.stakeA+vote.stakeB; // Remove tokens at Stake such that they can be moved again.
        balances[vote.account]-=lostStake; // For now just give it to the court as the fee system is not there yet.
        balances[this]+=lostStake;
        
        --dispute.voters.length;// Clean up in order to get some gaz back.
        
        dispute.session=EXECUTABLE; // Now the ruling can be executed.
    }
    
    
    // Constant Getters //
    
    /** Get the number of appeals of a dispute.
     *  Notice that it can throw if disputeID does not exist.
     *  @param disputeID ID of the dispute.
     */
    function getAppeals(uint256 disputeID) constant returns (uint256) {
        return disputes[disputeID].appeals;
    }
    
}

/*
Virtual Contract to be artibrated by the court.
*/
contract Arbitrable {
    Court court;
    function Arbitrable(Court _court){
        court=_court;
    }
    
    modifier onlyCourt {if (msg.sender!=address(court)) throw; _;}
    
    /** Function the court will call to execute ruling A.
     *  In most cases, this function should have the modifier onlyCourt.
     */
    function ruleA(uint256 disputeID);
    
    /** Function the court will call to execute ruling B.
     *  In most cases, this function should have the modifier onlyCourt.
     */
    function ruleB(uint256 disputeID);
    
}
