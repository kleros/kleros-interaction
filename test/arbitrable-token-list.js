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
  const arbitrationPrice = 101
  const feeStake = 1001
  const timeToChallenge = 5
  const metaEvidence = 'evidence'
  const arbitrationFeesWaitingTime = 1001
  const appealPeriodDuration = 1001

  let appealableArbitrator
  let enhancedAppealableArbitrator
  let arbitrableTokenList

  const TOKEN_ID = 'pnk'

  const deployArbitrators = async () => {
    appealableArbitrator = await AppealableArbitrator.new(
      arbitrationPrice, // _arbitrationPrice
      governor, // _arbitrator
      null, // _arbitratorExtraData
      appealPeriodDuration // _appealPeriodDuration
    )
    await appealableArbitrator.changeArbitrator(appealableArbitrator.address)

    enhancedAppealableArbitrator = await EnhancedAppealableArbitrator.new(
      arbitrationPrice, // _arbitrationPrice
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
      timeToChallenge,
      feeStake
    )
  }

  describe('registration request', () => {
    before(async () => {
      await deployArbitrators()
      await deployArbitrableTokenList(appealableArbitrator)

      it('should require deposit', async () => {
        await expectThrow(
          arbitrableTokenList.requestStatusChange(
            'omg',
            'OmiseGO',
            'OMG',
            0x0,
            {
              from: partyA
            }
          )
        )
      })

      await arbitrableTokenList.requestStatusChange(
        TOKEN_ID,
        'Pinakion',
        'PNK',
        0x1,
        { from: partyA, value: challengeReward }
      )
    })

    it('request should have been placed', async () => {
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        challengeReward
      )

      const token = await arbitrableTokenList.tokens(TOKEN_ID)
      assert.equal(token[1], 'Pinakion')
      assert.equal(token[2], 0x1)
      assert.equal(token[3], 'PNK')
      assert.isAbove(token[4].toNumber(), 0)

      const request = await arbitrableTokenList.getRequestInfo(TOKEN_ID, 0)
      assert.equal(request[3].toNumber(), arbitrationFeesWaitingTime)
      assert.equal(request[4].toNumber(), timeToChallenge)
      assert.equal(request[5].toNumber(), challengeReward)
      assert.equal(request[6].toNumber(), challengeReward)
      assert.equal(request[7][1], partyA)
    })

    it.skip('should execute request if no one challenges', async () => {
      await expectThrow(
        // time to challenge did not pass yet.
        arbitrableTokenList.executeRequest(TOKEN_ID, { from: partyA })
      )
      await increaseTime(timeToChallenge + 100)
      await arbitrableTokenList.executeRequest(TOKEN_ID, { from: partyA })
    })

    describe('challenge registration', () => {
      before(async () => {
        it('should require deposit', async () => {
          await expectThrow(
            arbitrableTokenList.fundChallenger(TOKEN_ID, { from: partyB })
          )
        })

        await arbitrableTokenList.fundChallenger(TOKEN_ID, {
          from: partyB,
          value: challengeReward
        })
        assert.equal(
          (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
          challengeReward * 2
        )
      })

      describe('requester fails to fund his side', () => {
        before(async () => {
          await arbitrableTokenList.fundChallenger(TOKEN_ID, {
            from: partyB,
            value: arbitrationPrice + feeStake
          })
        })
      })

      describe('partially fund both sides', () => {
        before(async () => {
          await arbitrableTokenList.fundRequester(TOKEN_ID, {
            from: partyA,
            value: arbitrationPrice + feeStake - 1
          })
          await arbitrableTokenList.fundChallenger(TOKEN_ID, {
            from: partyB,
            value: arbitrationPrice + feeStake - 2
          })
        })
      })

      describe('fully fund both sides', () => {
        describe('arbitrator rules in favor of challenger', () => {
          describe('winner fails to fully fund', () => {})
          describe('partially fund both sides', () => {})
          describe('fully fund both sides', () => {})
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
        const challengeRewardBefore = await arbitrableTokenList.governor()
        await arbitrableTokenList.changeGovernor(partyB, {
          from: governor
        })

        const challengeRewardAfter = await arbitrableTokenList.governor()
        assert.notEqual(
          challengeRewardAfter,
          challengeRewardBefore,
          'governor should have changed'
        )
        assert.equal(challengeRewardAfter, partyB, 'governor should be partyB')
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

      it('should update timeToChallenge', async () => {
        const timeToChallengeBefore = await arbitrableTokenList.timeToChallenge()
        const newTimeToChallenge = timeToChallengeBefore.toNumber() + 1000

        await arbitrableTokenList.changeTimeToChallenge(newTimeToChallenge, {
          from: governor
        })

        const timeToChallengeAfter = await arbitrableTokenList.timeToChallenge()
        assert.notEqual(
          timeToChallengeAfter.toNumber(),
          timeToChallengeBefore.toNumber(),
          'timeToChallenge should have changed'
        )
        assert.equal(
          timeToChallengeAfter.toNumber(),
          newTimeToChallenge,
          'timeToChallenge should have changed'
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

      it('should not update timeToChallenge', async () => {
        const timeToChallengeBefore = await arbitrableTokenList.timeToChallenge()
        const newTimeToChallenge = timeToChallengeBefore.toNumber() + 1000

        await expectThrow(
          arbitrableTokenList.changeTimeToChallenge(newTimeToChallenge, {
            from: partyA
          })
        )

        const timeToChallengeAfter = await arbitrableTokenList.timeToChallenge()
        assert.equal(
          timeToChallengeAfter.toNumber(),
          timeToChallengeBefore.toNumber(),
          'timeToChallenge should not have changed'
        )
        assert.notEqual(
          timeToChallengeAfter.toNumber(),
          newTimeToChallenge,
          'timeToChallenge should not have changed'
        )
      })
    })
  })
})
