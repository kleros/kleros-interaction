/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')

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
  const feeStake = 101
  const timeToChallenge = 0
  const metaEvidence = 'evidence'
  const arbitrationFeesWaitingTime = 1001
  const appealPeriodDuration = 1001

  let appealableArbitrator
  let enhancedAppealableArbitrator
  let arbitrableTokenList

  const ITEM_STATUS = {
    ABSENT: 0,
    REGISTERED: 1,
    SUBMITTED: 2,
    CLEARING_REQUESTED: 3
  }

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

  describe('governance', async () => {
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

  describe('appeal period disabled', () => {
    beforeEach(async () => {
      await deployArbitrators()
    })

    describe('request registration', () => {
      beforeEach(async () => {
        await deployArbitrableTokenList(appealableArbitrator)
        assert.equal(
          (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
          0,
          'initial contract balance should be zero for this test'
        )

        const item = await arbitrableTokenList.items(TOKEN_ID)
        assert.equal(
          item[2].toNumber(),
          0,
          'item.challengeReward should have be 0 initially'
        )

        assert.equal(
          item[0].toNumber(),
          ITEM_STATUS.ABSENT,
          'item should be in absent state initially'
        )
      })
    })
  })
})
