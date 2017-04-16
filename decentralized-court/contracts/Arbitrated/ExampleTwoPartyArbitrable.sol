/// This contract is a simple example where arbitration only change a state varible
contract ExampleTwoPartyArbitrable is TwoPartyArbitrable {
    enum State {created, ruledA, ruledB}
    State public state; // The state can be set by the court.
    
    function ExampleTwoPartyArbitrable(Court _court, address _partyB, uint256 _timeToReac) TwoPartyArbitrable(_court,msg.sender,_partyB,_timeToReac) {}
    
    function actionA(uint256 _disputeID) private {state=State.ruledA;}
    function actionB(uint256 _disputeID) private {state=State.ruledB;}
}
