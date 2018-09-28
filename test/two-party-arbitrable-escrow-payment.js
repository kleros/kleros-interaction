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

// Helpers
const checkOnlyByGovernor = async (
  getter,
  value,
  method,
  nextValue,
  invalidFrom,
  nextFrom
) => {
  await method(nextValue) // Set the next value
  expect(await getter()).to.deep.equal(
    nextValue === Number(nextValue) ? web3.toBigNumber(nextValue) : nextValue
  ) // Check it was set properly
  await expectThrow(method(value, { from: invalidFrom })) // Throw when setting from a non governor address
  await method(value, nextFrom && { from: nextFrom }) // Set back to the original value
}

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

    // Test governance
    await checkOnlyByGovernor(
      twoPartyArbitrableEscrowPayment.feeGovernor,
      governor,
      twoPartyArbitrableEscrowPayment.changeFeeGovernor,
      accounts[1],
      accounts[2],
      accounts[1]
    )
    await checkOnlyByGovernor(
      twoPartyArbitrableEscrowPayment.stake,
      stake,
      twoPartyArbitrableEscrowPayment.changeStake,
      0,
      accounts[2]
    )

    // Generate and create payments
    const evidence = 'https://kleros.io'
    const receiver = accounts[1]
    // const receiverBalance = web3.eth.getBalance(receiver)
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
        arbitrationFeesWaitingTime: 60,
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
        arbitrationFeesWaitingTime: 60,
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
    let accTimeOut = 0
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
        (accTimeOut += payment.timeOut),
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
          // Should throw when not disputed
          twoPartyArbitrableEscrowPayment.submitEvidence(payment.ID, evidence)
        )
        await expectThrow(
          // Should throw when not enough time has passed
          twoPartyArbitrableEscrowPayment.executePayment(payment.ID)
        )
        await increaseTime(payment.timeOut + 1)
        await twoPartyArbitrableEscrowPayment.executePayment(payment.ID)
        await expectThrow(
          // Should throw when already executed
          twoPartyArbitrableEscrowPayment.executePayment(payment.ID)
        )
      }

    // Arbitration fee time outs
    const arbitrationFeesTimeoutPayment = payments.find(
      p => p.arbitrationFeesWaitingTime >= 0
    )
    await expectThrow(
      // Should throw for non-existent payments
      twoPartyArbitrableEscrowPayment.fundDispute('0x00', 0, {
        value: halfOfArbitrationPrice
      })
    )
    await expectThrow(
      // Should throw for invalid sides
      twoPartyArbitrableEscrowPayment.fundDispute(
        arbitrationFeesTimeoutPayment.ID,
        2,
        {
          value: halfOfArbitrationPrice
        }
      )
    )
    await expectThrow(
      // Should throw without value
      twoPartyArbitrableEscrowPayment.fundDispute(
        arbitrationFeesTimeoutPayment.ID,
        0
      )
    )
    for (const payment of payments)
      if (payment.arbitrationFeesWaitingTime >= 0) {
        for (let i = 0; i < payment.contributionsPerSide[0].length; i++)
          await twoPartyArbitrableEscrowPayment.fundDispute(payment.ID, i, {
            value: payment.contributionsPerSide[0][i]
          })
        await increaseTime(payment.arbitrationFeesWaitingTime + 1)
        await twoPartyArbitrableEscrowPayment.fundDispute(payment.ID, 0, {
          value: payment.contributionsPerSide[0][0]
        })
        await expectThrow(
          // Should throw for already executed payments
          twoPartyArbitrableEscrowPayment.fundDispute(payment.ID, 0, {
            value: payment.contributionsPerSide[0][0]
          })
        )
      }

    // Appeal time outs
    for (const payment of payments) // Raise disputes
      if (
        payment.timeOut <= 0 &&
        payment.arbitrationFeesWaitingTime < 0 &&
        !payment.directAppeal
      )
        for (let i = 0; i < payment.contributionsPerSide[0].length; i++)
          await twoPartyArbitrableEscrowPayment.fundDispute(payment.ID, i, {
            value: payment.contributionsPerSide[0][i]
          })

    // Submit evidence
    const appealTimeOutPayment = payments.find(
      p => p.timeOut <= 0 && p.arbitrationFeesWaitingTime < 0 && !p.directAppeal
    )
    await expectThrow(
      // Should throw when payment is disputed
      twoPartyArbitrableEscrowPayment.executePayment(appealTimeOutPayment.ID)
    )
    await twoPartyArbitrableEscrowPayment.submitEvidence(
      appealTimeOutPayment.ID,
      evidence
    )
    await expectThrow(
      // Should throw for non-existent payments
      twoPartyArbitrableEscrowPayment.submitEvidence('0x00', evidence)
    )
    await expectThrow(
      // Should throw when sent from a party that is not involved in the payment
      twoPartyArbitrableEscrowPayment.submitEvidence(
        appealTimeOutPayment.ID,
        evidence,
        { from: accounts[2] }
      )
    )

    // Rule
    const rulingDisputeID = Number(
      (await twoPartyArbitrableEscrowPayment.agreements(
        appealTimeOutPayment.ID
      )).disputeID
    )
    await appealableArbitrator.giveRuling(rulingDisputeID, 0)
    await increaseTime(timeOut + 1)
    await expectThrow(
      // Should throw when not sent from the arbitrator
      twoPartyArbitrableEscrowPayment.rule(rulingDisputeID, 0)
    )
    await expectThrow(
      // Should throw for a non-existent dispute
      appealableArbitrator.giveRuling(-1, 0)
    )

    for (const payment of payments) // Raise appeals
      if (
        payment.timeOut <= 0 &&
        payment.arbitrationFeesWaitingTime < 0 &&
        !payment.directAppeal
      ) {
      }
  })
)
