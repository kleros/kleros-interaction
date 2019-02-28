/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const ArbitrableAddressList = artifacts.require('./ArbitrableAddressList.sol')
const AppealableArbitrator = artifacts.require(
  './standard/arbitration/AppealableArbitrator.sol'
)
const EnhancedAppealableArbitrator = artifacts.require(
  './standard/arbitration/EnhancedAppealableArbitrator.sol'
)

contract('ArbitrableAddressList', function(accounts) {
  const governor = accounts[0]
  const partyA = accounts[2]
  const partyB = accounts[8]
  const arbitratorExtraData = 0x08575
  const challengeReward = 10 ** 10
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
  let arbitrableAddressList
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
    arbitrableAddressList = await ArbitrableAddressList.new(
      arbitrator.address, // arbitrator
      arbitratorExtraData,
      registrationMetaEvidence,
      clearingMetaEvidence,
      governor, // governor
      challengeReward,
      challengePeriodDuration,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier
    )

    MULTIPLIER_DIVISOR = await arbitrableAddressList.MULTIPLIER_DIVISOR()
  }

  describe('registration request', () => {
    beforeEach(async () => {
      await deployArbitrators()
      await deployArbitrableAddressList(enhancedAppealableArbitrator)

      it('should require deposit', async () => {
        await expectThrow(
          arbitrableAddressList.requestStatusChange(submissionAddr, {
            from: partyA
          })
        )
      })

      const tx = await arbitrableAddressList.requestStatusChange(
        submissionAddr,
        {
          from: partyA,
          value:
            challengeReward +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )

      submissionAddress = tx.logs[0].args._address
    })

    it('request should have been placed', async () => {
      assert.equal(
        (await web3.eth.getBalance(arbitrableAddressList.address)).toNumber(),
        challengeReward +
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000
      )

      const addr = await arbitrableAddressList.getAddressInfo(submissionAddress)
      assert.equal(addr[0].toNumber(), ADDRESS_STATUS.RegistrationRequested)

      const request = await arbitrableAddressList.getRequestInfo(
        submissionAddress,
        0
      )
      const round = await arbitrableAddressList.getRoundInfo(
        submissionAddress,
        0,
        0
      )
      assert.isFalse(request[0])
      assert.equal(
        await web3.eth.getBalance(arbitrableAddressList.address),
        challengeReward +
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000
      )
    })

    it('should execute request and allow submitter to withdraw if no one challenges', async () => {
      await expectThrow(
        // time to challenge did not pass yet.
        arbitrableAddressList.executeRequest(submissionAddress, {
          frogitm: partyA
        })
      )
      await increaseTime(challengePeriodDuration + 1)
      await arbitrableAddressList.executeRequest(submissionAddress, {
        from: partyA
      })
      await arbitrableAddressList.withdrawFeesAndRewards(
        partyA,
        submissionAddress,
        0,
        0
      )
      assert.equal(
        (await web3.eth.getBalance(arbitrableAddressList.address)).toNumber(),
        0
      )
    })

    describe('challenge registration', () => {
      beforeEach(async () => {
        await expectThrow(
          arbitrableAddressList.challengeRequest(submissionAddress, '', {
            from: partyB
          })
        )

        await arbitrableAddressList.challengeRequest(submissionAddress, '', {
          from: partyB,
          value:
            challengeReward +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        })

        const request = await arbitrableAddressList.getRequestInfo(
          submissionAddress,
          0
        )
        assert.isAbove(
          request[2].toNumber(),
          0,
          'deposit time should be above 0'
        )
      })

      describe('fully fund both sides, rule in favor of challenger', () => {
        beforeEach(async () => {
          const addr = await arbitrableAddressList.getAddressInfo(
            submissionAddress
          )
          assert.equal(addr[0].toNumber(), ADDRESS_STATUS.RegistrationRequested)

          let request = await arbitrableAddressList.getRequestInfo(
            submissionAddress,
            0
          )

          const sharedRequiredStake =
            (sharedStakeMultiplier * arbitrationCost) / MULTIPLIER_DIVISOR

          request = await arbitrableAddressList.getRequestInfo(
            submissionAddress,
            0
          )
          let round = await arbitrableAddressList.getRoundInfo(
            submissionAddress,
            0,
            0
          )

          request = await arbitrableAddressList.getRequestInfo(
            submissionAddress,
            0
          )
          round = await arbitrableAddressList.getRoundInfo(
            submissionAddress,
            0,
            0
          )

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
          let request = await arbitrableAddressList.getRequestInfo(
            submissionAddress,
            0
          )
          const appealCost = (await enhancedAppealableArbitrator.appealCost(
            request[1].toNumber(),
            arbitratorExtraData
          )).toNumber()
          const loserRequiredStake =
            (loserStakeMultiplier * appealCost) / MULTIPLIER_DIVISOR
          let round = await arbitrableAddressList.getRoundInfo(
            submissionAddress,
            0,
            1
          )

          await arbitrableAddressList.fundAppeal(
            submissionAddress,
            PARTY.Requester,
            {
              from: partyA,
              value: appealCost + loserRequiredStake
            }
          )

          request = await arbitrableAddressList.getRequestInfo(
            submissionAddress,
            0
          )
          round = await arbitrableAddressList.getRoundInfo(
            submissionAddress,
            0,
            1
          )
          assert.isFalse(round[0])

          await increaseTime(appealPeriodDuration + 1)
          await enhancedAppealableArbitrator.giveRuling(
            request[1],
            RULING_OPTIONS.Refuse
          )

          const addr = await arbitrableAddressList.getAddressInfo(
            submissionAddress
          )
          assert.equal(addr[0].toNumber(), ADDRESS_STATUS.Registered)
        })

        it('should raise an appeal if both parties fund appeal', async () => {
          let request = await arbitrableAddressList.getRequestInfo(
            submissionAddress,
            0
          )

          const appealCost = (await enhancedAppealableArbitrator.appealCost(
            request[1].toNumber(),
            arbitratorExtraData
          )).toNumber()
          const winnerRequiredStake =
            ((await arbitrableAddressList.winnerStakeMultiplier()).toNumber() *
              appealCost) /
            MULTIPLIER_DIVISOR
          const loserRequiredStake =
            ((await arbitrableAddressList.loserStakeMultiplier()).toNumber() *
              appealCost) /
            MULTIPLIER_DIVISOR

          await arbitrableAddressList.fundAppeal(
            submissionAddress,
            PARTY.Requester,
            {
              from: partyA,
              value: appealCost + loserRequiredStake
            }
          )

          await arbitrableAddressList.fundAppeal(
            submissionAddress,
            PARTY.Challenger,
            {
              from: partyB,
              value: appealCost + winnerRequiredStake
            }
          )

          request = await arbitrableAddressList.getRequestInfo(
            submissionAddress,
            0
          )
          let round = await arbitrableAddressList.getRoundInfo(
            submissionAddress,
            0,
            1
          )
          assert.isTrue(round[0], 'dispute should be appealed')
          round = await arbitrableAddressList.getRoundInfo(
            submissionAddress,
            0,
            2
          )

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
          const addr = await arbitrableAddressList.getAddressInfo(
            submissionAddress
          )
          assert.equal(addr[0].toNumber(), ADDRESS_STATUS.Registered)
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
        const governorBefore = await arbitrableAddressList.governor()
        await arbitrableAddressList.changeGovernor(partyB, { from: governor })

        const governorAfter = await arbitrableAddressList.governor()
        assert.notEqual(
          governorAfter,
          governorBefore,
          'governor should have changed'
        )
        assert.equal(governorAfter, partyB, 'governor should be partyB')
      })

      it('should update challengeReward', async () => {
        const challengeRewardBefore = await arbitrableAddressList.challengeReward()
        const newChallengeReward = challengeRewardBefore.toNumber() + 1000

        await arbitrableAddressList.changeChallengeReward(newChallengeReward, {
          from: governor
        })

        const challengeRewardAfter = await arbitrableAddressList.challengeReward()
        assert.notEqual(
          challengeRewardAfter,
          challengeRewardBefore,
          'challengeReward should have changed'
        )
        assert.equal(
          challengeRewardAfter.toNumber(),
          newChallengeReward,
          'challengeReward should have changed'
        )
      })

      it('should update challengePeriodDuration', async () => {
        const challengePeriodDurationBefore = await arbitrableAddressList.challengePeriodDuration()
        const newTimeToChallenge =
          challengePeriodDurationBefore.toNumber() + 1000

        await arbitrableAddressList.changeTimeToChallenge(newTimeToChallenge, {
          from: governor
        })

        const challengePeriodDurationAfter = await arbitrableAddressList.challengePeriodDuration()
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
        const governorBefore = await arbitrableAddressList.governor()
        await expectThrow(
          arbitrableAddressList.changeGovernor(partyB, {
            from: partyB
          })
        )

        const governorAfter = await arbitrableAddressList.governor()
        assert.equal(
          governorAfter,
          governorBefore,
          'governor should not have changed'
        )
        assert.notEqual(governorAfter, partyB, 'governor should not be partyB')
      })

      it('should not update challengeReward', async () => {
        const challengeRewardBefore = await arbitrableAddressList.challengeReward()
        const newChallengeReward = challengeRewardBefore.toNumber() + 1000

        await expectThrow(
          arbitrableAddressList.changeChallengeReward(newChallengeReward, {
            from: partyB
          })
        )

        const challengeRewardAfter = await arbitrableAddressList.challengeReward()
        assert.equal(
          challengeRewardAfter.toNumber(),
          challengeRewardBefore.toNumber(),
          'challengeReward should not have changed'
        )
        assert.notEqual(
          challengeRewardAfter.toNumber(),
          newChallengeReward,
          'challengeReward should not have changed'
        )
      })

      it('should not update challengePeriodDuration', async () => {
        const challengePeriodDurationBefore = await arbitrableAddressList.challengePeriodDuration()
        const newTimeToChallenge =
          challengePeriodDurationBefore.toNumber() + 1000

        await expectThrow(
          arbitrableAddressList.changeTimeToChallenge(newTimeToChallenge, {
            from: partyA
          })
        )

        const challengePeriodDurationAfter = await arbitrableAddressList.challengePeriodDuration()
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
