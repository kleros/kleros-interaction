/** Can collect funds which will be given to either A or B depending of the result of the court.
 */
contract ArbitrateOutOfTwo is TwoPartyArbitrable {
    function ArbitrateOutOfTwo(Court _court, address _partyA, address _partyB, uint _timeToReac) TwoPartyArbitrable(_court,_partyA,_partyB,_timeToReac) {}
    function () payable {}
    function actionA(uint256 _disputeID) private {partyA.transfer(this.balance);}
    function actionB(uint256 _disputeID) private {partyB.transfer(this.balance);}
}
