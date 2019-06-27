/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const AddressTCR = artifacts.require('./AddressTCR.sol')
const AppealableArbitrator = artifacts.require(
  './standard/arbitration/AppealableArbitrator.sol'
)
const EnhancedAppealableArbitrator = artifacts.require(
  './standard/arbitration/EnhancedAppealableArbitrator.sol'
)

contract('AddressTCR', function(accounts) {
  const governor = accounts[0]
  const partyA = accounts[2]
  const partyB = accounts[8]
  const arbitratorExtraData = 0x08575
  const baseDeposit = 10 ** 10
  const arbitrationCost = 1000
  const sharedStakeMultiplier = 10000
  const winnerStakeMultiplier = 20000
  const loserStakeMultiplier = 2 * winnerStakeMultiplier
  const challengePeriodDuration = 5
  const registrationMetaEvidence = 'registrationMetaEvidence.json'
  const clearingMetaEvidence = 'clearingMetaEvidence.json'
  const appealPeriodDuration = 1001
  const submissionAddr = 0x0

  let appealableArbitrator
  let enhancedAppealableArbitrator
  let addressTCR
  let MULTIPLIER_DIVISOR
  let submissionAddress

  const ADDRESS_STATUS = {
    Absent: 0,
    Registered: 1,
    RegistrationRequested: 2,
    ClearingRequested: 3
  }

  const DISPUTE_STATUS = {
    Waiting: 0,
    Appealable: 1,
    Solved: 2
  }

  const RULING_OPTIONS = { Other: 0, Accept: 1, Refuse: 2 }
  const PARTY = { None: 0, Requester: 1, Challenger: 2 }

  const deployArbitrators = async () => {
    appealableArbitrator = await AppealableArbitrator.new(
      arbitrationCost, // _arbitrationCost
      governor, // _arbitrator
      null, // _arbitratorExtraData
      appealPeriodDuration // _appealPeriodDuration
    )
    await appealableArbitrator.changeArbitrator(appealableArbitrator.address)

    enhancedAppealableArbitrator = await EnhancedAppealableArbitrator.new(
      arbitrationCost, // _arbitrationCost
      governor, // _arbitrator
      null, // _arbitratorExtraData
      appealPeriodDuration // _timeOut
    )
    await enhancedAppealableArbitrator.changeArbitrator(
      enhancedAppealableArbitrator.address
    )
  }

  const deployArbitrableAddressList = async arbitrator => {
    addressTCR = await AddressTCR.new(
      arbitrator.address, // arbitrator
      arbitratorExtraData,
      registrationMetaEvidence,
      clearingMetaEvidence,
      governor, // governor
      baseDeposit,
      baseDeposit,
      challengePeriodDuration,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier
    )

    MULTIPLIER_DIVISOR = await addressTCR.MULTIPLIER_DIVISOR()
  }

  describe('registration request', () => {
    beforeEach(async () => {
      await deployArbitrators()
      await deployArbitrableAddressList(enhancedAppealableArbitrator)

      it('should require deposit', async () => {
        await expectThrow(
          addressTCR.requestStatusChange(submissionAddr, {
            from: partyA
          })
        )
      })

      const tx = await addressTCR.requestStatusChange(submissionAddr, {
        from: partyA,
        value:
          baseDeposit +
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000
      })

      submissionAddress = tx.logs[0].args._address
    })

    it('request should have been placed', async () => {
      assert.equal(
        (await web3.eth.getBalance(addressTCR.address)).toNumber(),
        baseDeposit +
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000
      )

      const addr = await addressTCR.getAddressInfo(submissionAddress)
      assert.equal(addr[0].toNumber(), ADDRESS_STATUS.RegistrationRequested)

      const request = await addressTCR.getRequestInfo(submissionAddress, 0)
      // TODO: add test for `round`
      // const round = await addressTCR.getRoundInfo(
      //   submissionAddress,
      //   0,
      //   0
      // )
      assert.isFalse(request[0])
      assert.equal(
        await web3.eth.getBalance(addressTCR.address),
        baseDeposit +
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000
      )
    })

    it('should execute request and allow submitter to withdraw if no one challenges', async () => {
      await expectThrow(
        // time to challenge did not pass yet.
        addressTCR.executeRequest(submissionAddress, {
          frogitm: partyA
        })
      )
      await increaseTime(challengePeriodDuration + 1)
      await addressTCR.executeRequest(submissionAddress, {
        from: partyA
      })
      await addressTCR.withdrawFeesAndRewards(partyA, submissionAddress, 0, 0)
      assert.equal(
        (await web3.eth.getBalance(addressTCR.address)).toNumber(),
        0
      )
    })

    describe('challenge registration', () => {
      beforeEach(async () => {
        await expectThrow(
          addressTCR.challengeRequest(submissionAddress, '', {
            from: partyB
          })
        )

        await addressTCR.challengeRequest(submissionAddress, '', {
          from: partyB,
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        })

        const request = await addressTCR.getRequestInfo(submissionAddress, 0)
        assert.isAbove(
          request[2].toNumber(),
          0,
          'deposit time should be above 0'
        )
      })

      describe('fully fund both sides, rule in favor of challenger', () => {
        beforeEach(async () => {
          const addr = await addressTCR.getAddressInfo(submissionAddress)
          assert.equal(addr[0].toNumber(), ADDRESS_STATUS.RegistrationRequested)

          let request = await addressTCR.getRequestInfo(submissionAddress, 0)

          request = await addressTCR.getRequestInfo(submissionAddress, 0)

          request = await addressTCR.getRequestInfo(submissionAddress, 0)
          round = await addressTCR.getRoundInfo(submissionAddress, 0, 0)

          assert.isTrue(request[0], 'request should be disputed')

          await enhancedAppealableArbitrator.giveRuling(
            request[1],
            RULING_OPTIONS.Refuse
          )
          const dispute = await enhancedAppealableArbitrator.disputes(
            request[1].toNumber()
          )

          assert.equal(dispute[3].toNumber(), RULING_OPTIONS.Refuse)
          assert.equal(dispute[4].toNumber(), DISPUTE_STATUS.Appealable)
        })

        it(`winner doesn't fund appeal, rule in favor of looser`, async () => {
          let request = await addressTCR.getRequestInfo(submissionAddress, 0)
          const appealCost = (await enhancedAppealableArbitrator.appealCost(
            request[1].toNumber(),
            arbitratorExtraData
          )).toNumber()
          const loserRequiredStake =
            (loserStakeMultiplier * appealCost) / MULTIPLIER_DIVISOR
          let round = await addressTCR.getRoundInfo(submissionAddress, 0, 1)

          await addressTCR.fundAppeal(submissionAddress, PARTY.Requester, {
            from: partyA,
            value: appealCost + loserRequiredStake
          })

          request = await addressTCR.getRequestInfo(submissionAddress, 0)
          round = await addressTCR.getRoundInfo(submissionAddress, 0, 1)
          assert.isFalse(round[0])

          await increaseTime(appealPeriodDuration + 1)
          await enhancedAppealableArbitrator.giveRuling(
            request[1],
            RULING_OPTIONS.Refuse
          )

          const addr = await addressTCR.getAddressInfo(submissionAddress)
          assert.equal(addr[0].toNumber(), ADDRESS_STATUS.Registered)
        })

        it('should raise an appeal if both parties fund appeal', async () => {
          let request = await addressTCR.getRequestInfo(submissionAddress, 0)

          const appealCost = (await enhancedAppealableArbitrator.appealCost(
            request[1].toNumber(),
            arbitratorExtraData
          )).toNumber()
          const winnerRequiredStake =
            ((await addressTCR.winnerStakeMultiplier()).toNumber() *
              appealCost) /
            MULTIPLIER_DIVISOR
          const loserRequiredStake =
            ((await addressTCR.loserStakeMultiplier()).toNumber() *
              appealCost) /
            MULTIPLIER_DIVISOR

          await addressTCR.fundAppeal(submissionAddress, PARTY.Requester, {
            from: partyA,
            value: appealCost + loserRequiredStake
          })

          await addressTCR.fundAppeal(submissionAddress, PARTY.Challenger, {
            from: partyB,
            value: appealCost + winnerRequiredStake
          })

          request = await addressTCR.getRequestInfo(submissionAddress, 0)
          let round = await addressTCR.getRoundInfo(submissionAddress, 0, 1)
          assert.isTrue(round[0], 'dispute should be appealed')
          round = await addressTCR.getRoundInfo(submissionAddress, 0, 2)

          const appeal = await enhancedAppealableArbitrator.appealDisputes(
            request[1].toNumber()
          )
          await enhancedAppealableArbitrator.giveRuling(
            appeal[2],
            RULING_OPTIONS.Accept
          )

          await increaseTime(appealPeriodDuration + 1)
          const dispute = await enhancedAppealableArbitrator.disputes(
            appeal[2].toNumber()
          )
          assert.equal(dispute[3].toNumber(), RULING_OPTIONS.Accept)
          assert.equal(dispute[4].toNumber(), DISPUTE_STATUS.Appealable)

          await enhancedAppealableArbitrator.giveRuling(
            appeal[2], // disputeID
            RULING_OPTIONS.Accept
          )
          const addr = await addressTCR.getAddressInfo(submissionAddress)
          assert.equal(addr[0].toNumber(), ADDRESS_STATUS.Registered)
        })

        it('should reimburse parties if the crowdfunding fails', async () => {
          const tokenID1 = accounts[5]
          await addressTCR.requestStatusChange(tokenID1, {
            from: partyA, // Requester
            value:
              baseDeposit +
              arbitrationCost +
              (sharedStakeMultiplier * arbitrationCost) / 10000
          })
          const tx = await addressTCR.challengeRequest(
            tokenID1,
            'evidence_tokenID1',
            {
              from: partyB, // Challenger
              value:
                arbitrationCost +
                (sharedStakeMultiplier * arbitrationCost) / 10000 +
                baseDeposit
            }
          )
          const disputeID = tx.logs[0].args._disputeID.toString()
          // Give a ruling in favor the requester
          await enhancedAppealableArbitrator.giveRuling(
            disputeID,
            1, // Requester wins the dispute
            { from: governor }
          )
          const appealCost = (await enhancedAppealableArbitrator.appealCost(
            0,
            0x00
          )).toNumber()
          const loserRequiredStake =
            (loserStakeMultiplier * appealCost) / MULTIPLIER_DIVISOR
          const { BigNumber } = web3
          await addressTCR.fundAppeal(
            tokenID1,
            2, // Challenger
            {
              from: partyB,
              value: appealCost + loserRequiredStake // 5000. Loser fully funds
            }
          )
          // Winner does not fully fund
          const requesterContribution = appealCost // Missing winner stake.
          await addressTCR.fundAppeal(
            tokenID1,
            1, // Requester
            {
              from: partyA,
              value: requesterContribution
            }
          )
          await increaseTime(appealPeriodDuration + 1)
          await enhancedAppealableArbitrator.giveRuling(
            disputeID,
            2, // Challenger wins the dispute
            { from: governor }
          )
          const oldChalengerBalance = new BigNumber(
            await web3.eth.getBalance(partyB)
          )
          const oldRequesterBalance = new BigNumber(
            await web3.eth.getBalance(partyA)
          )
          await addressTCR.withdrawFeesAndRewards(
            partyB,
            tokenID1,
            0, // request
            1 // round
          )
          await addressTCR.withdrawFeesAndRewards(
            partyA,
            tokenID1,
            0, // request
            1 // round
          )
          const newChalengerBalance = new BigNumber(
            await web3.eth.getBalance(partyB)
          )
          const newRequesterBalance = new BigNumber(
            await web3.eth.getBalance(partyA)
          )
          assert.equal(
            oldChalengerBalance.add(5000).toNumber(),
            newChalengerBalance.toNumber(),
            'Challenger must be corectly refunded.'
          )
          assert.equal(
            oldRequesterBalance.add(requesterContribution).toNumber(),
            newRequesterBalance.toNumber(),
            'Requester must be corectly refunded.'
          )
        })
      })
    })
  })

  describe('governance', () => {
    beforeEach(async () => {
      await deployArbitrators()
      await deployArbitrableAddressList(appealableArbitrator)
    })

    describe('caller is governor', () => {
      beforeEach(async () => {
        assert.notEqual(
          partyB,
          governor,
          'partyB and governor should be different for this test'
        )
      })

      it('should update governor', async () => {
        const governorBefore = await addressTCR.governor()
        await addressTCR.changeGovernor(partyB, { from: governor })

        const governorAfter = await addressTCR.governor()
        assert.notEqual(
          governorAfter,
          governorBefore,
          'governor should have changed'
        )
        assert.equal(governorAfter, partyB, 'governor should be partyB')
      })

      it('should update baseDeposit', async () => {
        const baseDepositBefore = await addressTCR.requesterBaseDeposit()
        const newChallengeReward = baseDepositBefore.toNumber() + 1000

        await addressTCR.changeRequesterBaseDeposit(newChallengeReward, {
          from: governor
        })

        const baseDepositAfter = await addressTCR.requesterBaseDeposit()
        assert.notEqual(
          baseDepositAfter,
          baseDepositBefore,
          'baseDeposit should have changed'
        )
        assert.equal(
          baseDepositAfter.toNumber(),
          newChallengeReward,
          'baseDeposit should have changed'
        )
      })

      it('should update challengePeriodDuration', async () => {
        const challengePeriodDurationBefore = await addressTCR.challengePeriodDuration()
        const newTimeToChallenge =
          challengePeriodDurationBefore.toNumber() + 1000

        await addressTCR.changeTimeToChallenge(newTimeToChallenge, {
          from: governor
        })

        const challengePeriodDurationAfter = await addressTCR.challengePeriodDuration()
        assert.notEqual(
          challengePeriodDurationAfter.toNumber(),
          challengePeriodDurationBefore.toNumber(),
          'challengePeriodDuration should have changed'
        )
        assert.equal(
          challengePeriodDurationAfter.toNumber(),
          newTimeToChallenge,
          'challengePeriodDuration should have changed'
        )
      })
    })

    describe('caller is not governor', () => {
      beforeEach(async () => {
        assert.notEqual(
          partyA,
          governor,
          'partyA and governor should be different for this test'
        )
      })

      it('should not update governor', async () => {
        const governorBefore = await addressTCR.governor()
        await expectThrow(
          addressTCR.changeGovernor(partyB, {
            from: partyB
          })
        )

        const governorAfter = await addressTCR.governor()
        assert.equal(
          governorAfter,
          governorBefore,
          'governor should not have changed'
        )
        assert.notEqual(governorAfter, partyB, 'governor should not be partyB')
      })

      it('should not update baseDeposit', async () => {
        const baseDepositBefore = await addressTCR.requesterBaseDeposit()
        const newChallengeReward = baseDepositBefore.toNumber() + 1000

        await expectThrow(
          addressTCR.changeRequesterBaseDeposit(newChallengeReward, {
            from: partyB
          })
        )

        const baseDepositAfter = await addressTCR.requesterBaseDeposit()
        assert.equal(
          baseDepositAfter.toNumber(),
          baseDepositBefore.toNumber(),
          'baseDeposit should not have changed'
        )
        assert.notEqual(
          baseDepositAfter.toNumber(),
          newChallengeReward,
          'baseDeposit should not have changed'
        )
      })

      it('should not update challengePeriodDuration', async () => {
        const challengePeriodDurationBefore = await addressTCR.challengePeriodDuration()
        const newTimeToChallenge =
          challengePeriodDurationBefore.toNumber() + 1000

        await expectThrow(
          addressTCR.changeTimeToChallenge(newTimeToChallenge, {
            from: partyA
          })
        )

        const challengePeriodDurationAfter = await addressTCR.challengePeriodDuration()
        assert.equal(
          challengePeriodDurationAfter.toNumber(),
          challengePeriodDurationBefore.toNumber(),
          'challengePeriodDuration should not have changed'
        )
        assert.notEqual(
          challengePeriodDurationAfter.toNumber(),
          newTimeToChallenge,
          'challengePeriodDuration should not have changed'
        )
      })
    })
  })
})
