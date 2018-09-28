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
const EnhancedAppealableArbitrator = artifacts.require(
  './standard/arbitration/EnhancedAppealableArbitrator.sol'
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
    const enhancedAppealableArbitrator = await EnhancedAppealableArbitrator.new(
      arbitrationPrice, // _arbitrationPrice
      governor, // _arbitrator
      null, // _arbitratorExtraData
      timeOut // _timeOut
    )
    await enhancedAppealableArbitrator.changeArbitrator(
      enhancedAppealableArbitrator.address
    )

    // Generate and create payments
    const evidence = 'https://kleros.io'
    const receiver = accounts[1]
    const receiverBalance = web3.eth.getBalance(receiver)
    const timeOutTime = 60
    const keepRuling = 1
    const sendRuling = 2
    const payments = [
      {
        // Payment time out
        ID: '0x01',
        arbitrationFeesWaitingTime: -1,
        timeOut: timeOutTime,
        value: 10,
        contributionsPerSide: [],
        expectedRuling: sendRuling
      },
      {
        // Arbitration fees time out
        ID: '0x02',
        arbitrationFeesWaitingTime: 2 * timeOutTime,
        timeOut: 0,
        value: 20,
        contributionsPerSide: [
          [halfOfArbitrationPrice - 1, halfOfArbitrationPrice - 1]
        ],
        expectedRuling: keepRuling
      },
      {
        // Arbitration fees time out, sender pays more
        ID: '0x03',
        arbitrationFeesWaitingTime: 3 * timeOutTime,
        timeOut: 0,
        value: 30,
        contributionsPerSide: [
          [halfOfArbitrationPrice, halfOfArbitrationPrice - 1]
        ],
        expectedRuling: keepRuling
      },
      {
        // Arbitration fees time out, receiver pays more
        ID: '0x04',
        arbitrationFeesWaitingTime: 4 * timeOutTime,
        timeOut: 0,
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
        timeOut: 0,
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
        timeOut: 0,
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
        timeOut: 0,
        value: 70,
        arbitrationPriceDiff: halfOfArbitrationPrice,
        contributionsPerSide: [
          [halfOfArbitrationPrice, halfOfArbitrationPrice],
          [halfOfArbitrationPrice, halfOfArbitrationPrice],
          [halfOfArbitrationPrice, halfOfArbitrationPrice],
          [halfOfArbitrationPrice, halfOfArbitrationPrice]
        ],
        expectedRuling: sendRuling
      },
      {
        // Direct appeals
        ID: '0x08',
        arbitrationFeesWaitingTime: -1,
        timeOut: 0,
        directAppeal: true,
        value: 80,
        contributionsPerSide: [
          [halfOfArbitrationPrice, halfOfArbitrationPrice],
          [arbitrationPrice, 0],
          [arbitrationPrice - 1, 0]
        ],
        expectedRuling: sendRuling
      }
    ]
    for (const payment of payments) {
      const arbitratorAddress = payment.directAppeal
        ? enhancedAppealableArbitrator.address
        : appealableArbitrator.address
      await expectThrow(
        // Should throw without value
        twoPartyArbitrableEscrowPayment.createPayment(
          payment.ID,
          evidence,
          receiver,
          payment.arbitrationFeesWaitingTime,
          arbitratorAddress,
          payment.timeOut
        )
      )
      await twoPartyArbitrableEscrowPayment.createPayment(
        payment.ID,
        evidence,
        receiver,
        payment.arbitrationFeesWaitingTime,
        arbitratorAddress,
        payment.timeOut,
        { value: payment.value }
      )
    }
    await expectThrow(
      // Should throw when ID is already being used
      twoPartyArbitrableEscrowPayment.createPayment(
        payments[0].ID,
        evidence,
        receiver,
        payments[0].arbitrationFeesWaitingTime,
        payments[0].directAppeal
          ? enhancedAppealableArbitrator.address
          : appealableArbitrator.address,
        payments[0].timeOut
      )
    )

    // Payment time outs
    await expectThrow(
      // Should throw for non-existent payments
      twoPartyArbitrableEscrowPayment.executePayment('0x00')
    )
    for (const payment of payments)
      if (payment.timeOut > 0) {
        await expectThrow(
          // Should throw when not enough time has passed
          twoPartyArbitrableEscrowPayment.executePayment(payment.ID)
        )
        await increaseTime(timeOutTime)
        await twoPartyArbitrableEscrowPayment.executePayment(payment.ID)
        await expectThrow(
          // Should throw when already executed
          twoPartyArbitrableEscrowPayment.executePayment(payment.ID)
        )
      }
  })
)
