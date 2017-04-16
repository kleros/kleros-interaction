/// Contract for the demo.
contract DemoArbitrable is Arbitrable {
    address public owner;
    address[] public partiesA;
    address[] public partiesB;
    mapping(uint256 => uint256) public disputeIDToRound;
    mapping(uint256 => uint256) public roundTodisputeID;
    uint public payout;
    uint public currentRound;
    
    modifier onlyOwner() { require(owner==msg.sender); _; }
    
    function DemoArbitrable(Court _court, address[] _partiesA, address[] _partiesB) Arbitrable(_court) {
        owner=msg.sender;
        require(_partiesA.length==_partiesB.length);
        for (uint i; i<_partiesA.length;++i) {
            partiesA.push(_partiesA[i]);
            partiesB.push(_partiesB[i]);
        }
    }
    
    function addPayout() payable {payout+=(msg.value)/(partiesA.length-currentRound);}
    
    function executeDemo() onlyOwner {
        // Go to the next session.
        court.nextSession();
        
        // Create the dispute for next round.
        if (currentRound<partiesA.length) {
            uint disputeID=court.createDispute(uint(block.blockhash(block.number-1)));
            disputeIDToRound[disputeID]=currentRound;
            roundTodisputeID[currentRound]=disputeID;
        }
        
        // Appeal the dispute of the previous round.
        if (currentRound>0 && roundTodisputeID[currentRound-1]!=0) {
            court.appealRuling(roundTodisputeID[currentRound-1],uint(block.blockhash(block.number-1)));
        }
        
        // Execute the ruling of two rounds ago.
        if (currentRound>1 && roundTodisputeID[currentRound-2]!=0) {
            court.executeTokenRepartition(roundTodisputeID[currentRound-2]); // Execute repartition.
            court.untrustedExecuteRuling(roundTodisputeID[currentRound-2]);// Execute the ruling.
        }
        
        currentRound+=1;
    }
    
    // Send money to party A.
    function ruleA(uint256 disputeID) onlyCourt {
        partiesA[disputeIDToRound[disputeID]].transfer(payout);
    }
    
    // Send money to party B.
    function ruleB(uint256 disputeID) onlyCourt {
        partiesB[disputeIDToRound[disputeID]].transfer(payout);
    }
    
} 
