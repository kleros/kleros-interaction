/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const ArbitrableTokenList = artifacts.require('./ArbitrableTokenList.sol')
const AppealableArbitrator = artifacts.require(
  './standard/arbitration/AppealableArbitrator.sol'
)
const EnhancedAppealableArbitrator = artifacts.require(
  './standard/arbitration/EnhancedAppealableArbitrator.sol'
)

contract('ArbitrableTokenList', function(accounts) {
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
  const metaEvidence = 'evidence'
  const arbitrationFeesWaitingTime = 1001
  const appealPeriodDuration = 1001

  let appealableArbitrator
  let enhancedAppealableArbitrator
  let arbitrableTokenList
  let MULTIPLIER_PRECISION
  let tokenID

  const TOKEN_STATUS = {
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

  const deployArbitrableTokenList = async arbitrator => {
    arbitrableTokenList = await ArbitrableTokenList.new(
      arbitrator.address, // arbitrator
      arbitratorExtraData,
      metaEvidence,
      governor, // governor
      arbitrationFeesWaitingTime,
      challengeReward,
      challengePeriodDuration,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier
    )

    MULTIPLIER_PRECISION = await arbitrableTokenList.MULTIPLIER_PRECISION()
  }

  describe('registration request', () => {
    const requesterPrefund = 1000
    beforeEach(async () => {
      await deployArbitrators()
      await deployArbitrableTokenList(enhancedAppealableArbitrator)

      it('should require deposit', async () => {
        await expectThrow(
          arbitrableTokenList.requestStatusChange(
            'OmiseGO',
            'OMG',
            0x0,
            'omg',
            { from: partyA }
          )
        )
      })

      const tx = await arbitrableTokenList.requestStatusChange(
        'Pinakion',
        'PNK',
        0x1,
        '/ipfs/Qmb6C5JximTDgvzYGzkbgitcBLDC3X28X8wTSnfEXNuxza',
        'ETH',
        { from: partyA, value: challengeReward + requesterPrefund }
      )
      tokenID = tx.logs[0].args._tokenID
    })

    it('request should have been placed', async () => {
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        challengeReward + requesterPrefund
      )

      const token = await arbitrableTokenList.getTokenInfo(tokenID)
      assert.equal(token[0], 'Pinakion')
      assert.equal(token[1], 'PNK')
      assert.equal(token[2], 0x1)
      assert.equal(
        token[3],
        '/ipfs/Qmb6C5JximTDgvzYGzkbgitcBLDC3X28X8wTSnfEXNuxza'
      )
      assert.equal(token[4], 'ETH')
      assert.equal(token[5].toNumber(), TOKEN_STATUS.RegistrationRequested)

      const request = await arbitrableTokenList.getRequestInfo(tokenID, 0)
      assert.isFalse(request[0])
      assert.equal(request[5].toNumber(), 0)
      assert.equal(request[8][PARTY.Requester].toNumber(), requesterPrefund)
      assert.equal(
        await web3.eth.getBalance(arbitrableTokenList.address),
        challengeReward + requesterPrefund
      )
      assert.equal(request[8][PARTY.Requester].toNumber(), requesterPrefund)
    })

    it('should execute request and allow submitter to withdraw if no one challenges', async () => {
      await expectThrow(
        // time to challenge did not pass yet.
        arbitrableTokenList.timeout(tokenID, { frogitm: partyA })
      )
      await increaseTime(challengePeriodDuration + 1)
      await arbitrableTokenList.timeout(tokenID, { from: partyA })
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        requesterPrefund
      )
      await arbitrableTokenList.withdrawFeesAndRewards(tokenID, 0, {
        from: partyA
      })
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        0
      )
    })

    describe('challenge registration', () => {
      const challengerPrefund = 1001
      beforeEach(async () => {
        await expectThrow(
          arbitrableTokenList.challengeRequest(tokenID, { from: partyB })
        )

        await arbitrableTokenList.challengeRequest(tokenID, {
          from: partyB,
          value: challengeReward + challengerPrefund
        })

        assert.equal(
          (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
          challengeReward * 2 + requesterPrefund + challengerPrefund
        )
        const request = await arbitrableTokenList.getRequestInfo(tokenID, 0)
        assert.isFalse(request[0]) // Should not be disputed.
        assert.isAbove(
          request[4].toNumber(),
          0,
          'deposit time should be above 0'
        )
      })

      describe('requester fails to fund his side in time', () => {
        it('should rule in favor of challenger', async () => {
          const sharedRequiredStake =
            ((await arbitrableTokenList.sharedStakeMultiplier()).toNumber() *
              arbitrationCost) /
            MULTIPLIER_PRECISION

          await arbitrableTokenList.fundPotDispute(tokenID, PARTY.Challenger, {
            from: partyB,
            value: arbitrationCost + sharedRequiredStake - challengerPrefund
          })

          await increaseTime(arbitrationFeesWaitingTime + 1)
          await expectThrow(
            arbitrableTokenList.fundPotDispute(tokenID, PARTY.Requester, {
              from: partyA,
              value: arbitrationCost + sharedRequiredStake - requesterPrefund
            })
          )
          await arbitrableTokenList.timeout(tokenID)
          const token = await arbitrableTokenList.getTokenInfo(tokenID)
          const request = await arbitrableTokenList.getRequestInfo(tokenID, 0)

          assert.equal(token[5].toNumber(), TOKEN_STATUS.Absent)
          assert.isTrue(request[6]) // i.e. request.resolved == true

          const partyAContributionsBefore = (await arbitrableTokenList.getContributions(
            tokenID,
            0,
            partyA
          ))[PARTY.Requester].toNumber()
          const partyBContributionsBefore = (await arbitrableTokenList.getContributions(
            tokenID,
            0,
            partyB
          ))[PARTY.Challenger].toNumber()
          assert.isAbove(partyBContributionsBefore, partyAContributionsBefore)

          await arbitrableTokenList.withdrawFeesAndRewards(tokenID, 0, {
            from: partyA
          })
          await arbitrableTokenList.withdrawFeesAndRewards(tokenID, 0, {
            from: partyB
          })

          const partyAContributionsAfter = (await arbitrableTokenList.getContributions(
            tokenID,
            0,
            partyA
          ))[PARTY.Requester].toNumber()
          const partyBContributionsAfter = (await arbitrableTokenList.getContributions(
            tokenID,
            0,
            partyB
          ))[PARTY.Challenger].toNumber()
          assert.equal(partyAContributionsAfter, 0)
          assert.equal(partyBContributionsAfter, 0)
        })
      })

      describe('fully fund both sides, rule in favor of challenger', () => {
        beforeEach(async () => {
          const token = await arbitrableTokenList.getTokenInfo(tokenID)
          assert.equal(token[5].toNumber(), TOKEN_STATUS.RegistrationRequested)

          let request = await arbitrableTokenList.getRequestInfo(tokenID, 0)
          assert.isFalse(request[0])

          const sharedRequiredStake =
            (sharedStakeMultiplier * arbitrationCost) / MULTIPLIER_PRECISION

          await arbitrableTokenList.fundPotDispute(tokenID, PARTY.Requester, {
            from: partyA,
            value: arbitrationCost + sharedRequiredStake
          })

          request = await arbitrableTokenList.getRequestInfo(tokenID, 0)
          let round = await arbitrableTokenList.getRoundInfo(tokenID, 0, 0)

          await arbitrableTokenList.fundLatestRound(tokenID, PARTY.Challenger, {
            from: partyB,
            value: arbitrationCost + sharedRequiredStake
          })
          request = await arbitrableTokenList.getRequestInfo(tokenID, 0)
          round = await arbitrableTokenList.getRoundInfo(tokenID, 0, 0)

          assert.equal(request[8][PARTY.Requester].toNumber(), requesterPrefund)
          assert.equal(request[8][PARTY.Challenger].toNumber(), 0)
          assert.equal(
            round[2][PARTY.Requester].toNumber(),
            round[3][PARTY.Requester].toNumber()
          )
          assert.equal(
            round[2][PARTY.Challenger].toNumber(),
            round[3][PARTY.Challenger].toNumber()
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
          let request = await arbitrableTokenList.getRequestInfo(tokenID, 0)
          const appealCost = (await enhancedAppealableArbitrator.appealCost(
            request[1].toNumber(),
            arbitratorExtraData
          )).toNumber()
          const loserRequiredStake =
            (loserStakeMultiplier * appealCost) / MULTIPLIER_PRECISION
          let round = await arbitrableTokenList.getRoundInfo(tokenID, 0, 1)

          await arbitrableTokenList.fundLatestRound(tokenID, PARTY.Requester, {
            from: partyA,
            value: appealCost + loserRequiredStake
          })

          request = await arbitrableTokenList.getRequestInfo(tokenID, 0)
          round = await arbitrableTokenList.getRoundInfo(tokenID, 0, 1)
          assert.equal(
            round[2][PARTY.Requester].toNumber(),
            round[3][PARTY.Requester].toNumber()
          )
          assert.isFalse(round[0])

          await increaseTime(appealPeriodDuration + 1)
          await enhancedAppealableArbitrator.giveRuling(
            request[1],
            RULING_OPTIONS.Refuse
          )

          const token = await arbitrableTokenList.getTokenInfo(tokenID)
          assert.equal(token[5].toNumber(), TOKEN_STATUS.Registered)
        })

        it('should raise an appeal if both parties fund appeal', async () => {
          let request = await arbitrableTokenList.getRequestInfo(tokenID, 0)

          const appealCost = (await enhancedAppealableArbitrator.appealCost(
            request[1].toNumber(),
            arbitratorExtraData
          )).toNumber()
          const winnerRequiredStake =
            ((await arbitrableTokenList.winnerStakeMultiplier()).toNumber() *
              appealCost) /
            MULTIPLIER_PRECISION
          const loserRequiredStake =
            ((await arbitrableTokenList.loserStakeMultiplier()).toNumber() *
              appealCost) /
            MULTIPLIER_PRECISION

          await arbitrableTokenList.fundPotAppeal(tokenID, PARTY.Requester, {
            from: partyA,
            value: appealCost + loserRequiredStake
          })

          await arbitrableTokenList.fundPotAppeal(tokenID, PARTY.Challenger, {
            from: partyB,
            value: appealCost + winnerRequiredStake
          })

          request = await arbitrableTokenList.getRequestInfo(tokenID, 0)
          let round = await arbitrableTokenList.getRoundInfo(tokenID, 0, 1)
          assert.isTrue(round[0], 'dispute should be appealed')
          round = await arbitrableTokenList.getRoundInfo(tokenID, 0, 2)

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
          const token = await arbitrableTokenList.getTokenInfo(tokenID)
          assert.equal(token[5].toNumber(), TOKEN_STATUS.Registered)
        })
      })
    })
  })

  describe('governance', () => {
    beforeEach(async () => {
      await deployArbitrators()
      await deployArbitrableTokenList(appealableArbitrator)
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
        const governorBefore = await arbitrableTokenList.governor()
        await arbitrableTokenList.changeGovernor(partyB, { from: governor })

        const governorAfter = await arbitrableTokenList.governor()
        assert.notEqual(
          governorAfter,
          governorBefore,
          'governor should have changed'
        )
        assert.equal(governorAfter, partyB, 'governor should be partyB')
      })

      it('should update challengeReward', async () => {
        const challengeRewardBefore = await arbitrableTokenList.challengeReward()
        const newChallengeReward = challengeRewardBefore.toNumber() + 1000

        await arbitrableTokenList.changeChallengeReward(newChallengeReward, {
          from: governor
        })

        const challengeRewardAfter = await arbitrableTokenList.challengeReward()
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

      it('should update arbitrationFeesWaitingTime', async () => {
        const arbitrationFeesWaitingTimeBefore = await arbitrableTokenList.arbitrationFeesWaitingTime()
        const newarbitrationFeesWaitingTime =
          arbitrationFeesWaitingTimeBefore.toNumber() + 1000

        await arbitrableTokenList.changeArbitrationFeesWaitingTime(
          newarbitrationFeesWaitingTime,
          {
            from: governor
          }
        )

        const arbitrationFeesWaitingTimeAfter = await arbitrableTokenList.arbitrationFeesWaitingTime()
        assert.notEqual(
          arbitrationFeesWaitingTimeAfter,
          arbitrationFeesWaitingTimeBefore,
          'arbitrationFeesWaitingTime should have changed'
        )
        assert.equal(
          arbitrationFeesWaitingTimeAfter.toNumber(),
          newarbitrationFeesWaitingTime,
          'arbitrationFeesWaitingTime should have changed'
        )
      })

      it('should update challengePeriodDuration', async () => {
        const challengePeriodDurationBefore = await arbitrableTokenList.challengePeriodDuration()
        const newTimeToChallenge =
          challengePeriodDurationBefore.toNumber() + 1000

        await arbitrableTokenList.changeTimeToChallenge(newTimeToChallenge, {
          from: governor
        })

        const challengePeriodDurationAfter = await arbitrableTokenList.challengePeriodDuration()
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
        const governorBefore = await arbitrableTokenList.governor()
        await expectThrow(
          arbitrableTokenList.changeGovernor(partyB, {
            from: partyB
          })
        )

        const governorAfter = await arbitrableTokenList.governor()
        assert.equal(
          governorAfter,
          governorBefore,
          'governor should not have changed'
        )
        assert.notEqual(governorAfter, partyB, 'governor should not be partyB')
      })

      it('should not update challengeReward', async () => {
        const challengeRewardBefore = await arbitrableTokenList.challengeReward()
        const newChallengeReward = challengeRewardBefore.toNumber() + 1000

        await expectThrow(
          arbitrableTokenList.changeChallengeReward(newChallengeReward, {
            from: partyB
          })
        )

        const challengeRewardAfter = await arbitrableTokenList.challengeReward()
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

      it('should not update arbitrationFeesWaitingTime', async () => {
        const arbitrationFeesWaitingTimeBefore = await arbitrableTokenList.arbitrationFeesWaitingTime()
        const newArbitrationFeesWaitingTime =
          arbitrationFeesWaitingTimeBefore.toNumber() + 1000

        await expectThrow(
          arbitrableTokenList.changeArbitrationFeesWaitingTime(
            newArbitrationFeesWaitingTime,
            {
              from: partyB
            }
          )
        )

        const arbitrationFeesWaitingTimeAfter = await arbitrableTokenList.arbitrationFeesWaitingTime()
        assert.equal(
          arbitrationFeesWaitingTimeAfter.toNumber(),
          arbitrationFeesWaitingTimeBefore.toNumber(),
          'arbitrationFeesWaitingTime should not have changed'
        )
        assert.notEqual(
          arbitrationFeesWaitingTimeAfter.toNumber(),
          newArbitrationFeesWaitingTime,
          'arbitrationFeesWaitingTime should not have changed'
        )
      })

      it('should not update challengePeriodDuration', async () => {
        const challengePeriodDurationBefore = await arbitrableTokenList.challengePeriodDuration()
        const newTimeToChallenge =
          challengePeriodDurationBefore.toNumber() + 1000

        await expectThrow(
          arbitrableTokenList.changeTimeToChallenge(newTimeToChallenge, {
            from: partyA
          })
        )

        const challengePeriodDurationAfter = await arbitrableTokenList.challengePeriodDuration()
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
