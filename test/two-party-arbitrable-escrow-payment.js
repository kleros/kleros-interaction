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
    const halfOfArbitrationPrice = arbitrationPrice / 2
    const timeOut = 1000
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationPrice, // _arbitrationPrice
      governor, // _arbitrator
      null, // _arbitratorExtraData
      timeOut // _timeOut
    )
    await appealableArbitrator.changeArbitrator(appealableArbitrator.address)

    // Generate and create payments
    const evidence = 'https://kleros.io'
    const receiver = accounts[1]
    const receiverBalance = web3.eth.getBalance(receiver)
    const keepRuling = 1
    const sendRuling = 2
    const payments = [
      {
        // Payment time out
        ID: '0x01',
        arbitrationFeesWaitingTime: -1,
        timeOut: 60,
        value: 10,
        contributionsPerSide: [],
        expectedRuling: sendRuling
      },
      {
        // Arbitration fees time out
        ID: '0x02',
        arbitrationFeesWaitingTime: 60,
        timeOut: -1,
        value: 20,
        contributionsPerSide: [
          [halfOfArbitrationPrice - 1, halfOfArbitrationPrice - 1]
        ],
        expectedRuling: keepRuling
      },
      {
        // Arbitration fees time out, sender pays more
        ID: '0x03',
        arbitrationFeesWaitingTime: 60,
        timeOut: -1,
        value: 30,
        contributionsPerSide: [
          [halfOfArbitrationPrice, halfOfArbitrationPrice - 1]
        ],
        expectedRuling: keepRuling
      },
      {
        // Arbitration fees time out, receiver pays more
        ID: '0x04',
        arbitrationFeesWaitingTime: 60,
        timeOut: -1,
        value: 40,
        contributionsPerSide: [
          [halfOfArbitrationPrice - 1, halfOfArbitrationPrice]
        ],
        expectedRuling: sendRuling
      },
      {
        // Sender fails to fully fund appeal
        ID: '0x05',
        arbitrationFeesWaitingTime: -1,
        timeOut: -1,
        value: 50,
        contributionsPerSide: [
          [halfOfArbitrationPrice, halfOfArbitrationPrice],
          [halfOfArbitrationPrice - 1, 0]
        ],
        expectedRuling: sendRuling
      },
      {
        // Sender fully funds appeal and pays more
        ID: '0x06',
        arbitrationFeesWaitingTime: -1,
        timeOut: -1,
        value: 60,
        contributionsPerSide: [
          [halfOfArbitrationPrice, halfOfArbitrationPrice],
          [halfOfArbitrationPrice, halfOfArbitrationPrice],
          [halfOfArbitrationPrice, halfOfArbitrationPrice - 1]
        ],
        expectedRuling: keepRuling
      },
      {
        // Sender fully funds appeal and pays the same amount as the receiver
        ID: '0x07',
        arbitrationFeesWaitingTime: -1,
        timeOut: -1,
        value: 70,
        arbitrationPriceDiff: halfOfArbitrationPrice,
        contributionsPerSide: [
          [halfOfArbitrationPrice, halfOfArbitrationPrice],
          [halfOfArbitrationPrice, halfOfArbitrationPrice],
          [halfOfArbitrationPrice, halfOfArbitrationPrice],
          [halfOfArbitrationPrice, halfOfArbitrationPrice]
        ],
        expectedRuling: sendRuling
      }
    ]
    for (const payment of payments) {
      await expectThrow(
        // Should throw without value
        twoPartyArbitrableEscrowPayment.createPayment(
          payment.ID,
          evidence,
          receiver,
          payment.arbitrationFeesWaitingTime,
          appealableArbitrator.address,
          payment.timeOut
        )
      )
      await twoPartyArbitrableEscrowPayment.createPayment(
        payment.ID,
        evidence,
        receiver,
        payment.arbitrationFeesWaitingTime,
        appealableArbitrator.address,
        payment.timeOut,
        { value: payment.value }
      )
    }
  })
)
