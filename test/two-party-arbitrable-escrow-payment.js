/* globals artifacts, contract, expect, web3 */
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')

const TwoPartyArbitrableEscrowPayment = artifacts.require(
  './standard/arbitration/composed-arbitrable/example/TwoPartyArbitrableEscrowPayment.sol'
)
const AppealableArbitrator = artifacts.require(
  './standard/arbitration/AppealableArbitrator.sol'
)

contract('TwoPartyArbitrableEscrowPayment', accounts =>
  it('Should function as an arbitrable escrow service with crowdinsured fee payments.', async () => {
    // Deploy contracts
    const governor = accounts[0]
    const stake = 10
    const twoPartyArbitrableEscrowPayment = await TwoPartyArbitrableEscrowPayment.new(
      governor, // _arbitrator
      null, // _arbitratorExtraData
      governor, // _feeGovernor
      stake // _stake
    )
    const arbitrationPrice = 100
    const timeOut = 1000
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationPrice, // _arbitrationPrice
      governor, // _arbitrator
      null, // _arbitratorExtraData
      timeOut // _timeOut
    )
    await appealableArbitrator.changeArbitrator(appealableArbitrator.address)
  })
)
