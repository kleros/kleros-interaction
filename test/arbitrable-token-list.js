/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

const BigNumber = web3.BigNumber
const shouldFail = require('openzeppelin-solidity/test/helpers/shouldFail')
const time = require('openzeppelin-solidity/test/helpers/time')

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
  const t2clGovernor = accounts[9]
  const arbitratorExtraData = 0x08575
  const challengeReward = 10 ** 10
  const arbitrationPrice = 100
  const halfOfArbitrationPrice = arbitrationPrice / 2
  const timeToChallenge = 0
  const metaEvidence = 'evidence'
  const feeStake = 10
  const arbitrationFeesWaitingTime = 1000
  const appealPeriodDuration = 1000

  let appealableArbitrator
  let enhancedAppealableArbitrator
  let arbitrableTokenList

  const ITEM_STATUS = {
    ABSENT: 0,
    CLEARED: 1,
    RESUBMITTED: 2,
    REGISTERED: 3,
    SUBMITTED: 4,
    CLEARING_REQUESTED: 5,
    PREVENTIVE_CLEARING_REQUESTED: 6
  }

  const RULING = { OTHER: 0, ACCEPT: 1, REFUSE: 2 }
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
      arbitrator.address, // fee governor
      feeStake,
      t2clGovernor,
      arbitrationFeesWaitingTime,
      challengeReward,
      timeToChallenge
    )
  }

  describe('queryItems', () => {
    before('setup contract for each test', async () => {
      await deployArbitrators()
      await deployArbitrableTokenList(appealableArbitrator)
    })

    before('populate the list', async () => {
      await arbitrableTokenList.requestRegistration(TOKEN_ID, metaEvidence, {
        from: partyA,
        value: challengeReward
      })
    })

    it('should succesfully retrieve mySubmissions', async function() {
      const cursor = 0
      const count = 1

      const disputed = false
      const absent = false
      const cleared = false
      const submitted = false
      const resubmitted = false
      const clearingRequested = false
      const preventiveClearingRequested = false
      const mySubmissions = true
      const myChallenges = false

      const filter = [
        disputed,
        absent,
        cleared,
        submitted,
        resubmitted,
        clearingRequested,
        preventiveClearingRequested,
        mySubmissions,
        myChallenges
      ]
      const sort = true
      const item = (await arbitrableTokenList.queryItems(
        cursor,
        count,
        filter,
        sort,
        { from: partyA }
      ))[0]

      assert.equal(web3.toUtf8(item[0]), TOKEN_ID)
    })

    it('should succesfully retrieve submitted', async function() {
      const cursor = 0
      const count = 1

      const disputed = false
      const absent = false
      const cleared = false
      const submitted = true
      const resubmitted = false
      const clearingRequested = false
      const preventiveClearingRequested = false
      const mySubmissions = false
      const myChallenges = false

      const filter = [
        disputed,
        absent,
        cleared,
        submitted,
        resubmitted,
        clearingRequested,
        preventiveClearingRequested,
        mySubmissions,
        myChallenges
      ]
      const sort = true
      const item = (await arbitrableTokenList.queryItems(
        cursor,
        count,
        filter,
        sort,
        { from: partyA }
      ))[0]

      assert.equal(web3.toUtf8(item[0]), TOKEN_ID)
    })

    it('should revert when not cursor < itemsList.length', async function() {
      const cursor = 1
      const count = 1

      const disputed = false
      const absent = false
      const cleared = false
      const submitted = true
      const resubmitted = false
      const clearingRequested = false
      const preventiveClearingRequested = false
      const mySubmissions = false
      const myChallenges = false

      const filter = [
        disputed,
        absent,
        cleared,
        submitted,
        resubmitted,
        clearingRequested,
        preventiveClearingRequested,
        mySubmissions,
        myChallenges
      ]
      const sort = true

      await shouldFail.reverting(
        arbitrableTokenList.queryItems(cursor, count, filter, sort, {
          from: partyA
        })
      )
    })
  })

  describe('governance', async () => {
    beforeEach(async () => {
      await deployArbitrators()
      await deployArbitrableTokenList(appealableArbitrator)
    })

    describe('caller is t2clGovernor', () => {
      beforeEach(async () => {
        assert.notEqual(
          partyB,
          t2clGovernor,
          'partyB and t2clGovernor should be different for this test'
        )
      })

      it('should update t2clGovernor', async () => {
        const challengeRewardBefore = await arbitrableTokenList.t2clGovernor()
        await arbitrableTokenList.changeT2CLGovernor(partyB, {
          from: t2clGovernor
        })

        const challengeRewardAfter = await arbitrableTokenList.t2clGovernor()
        assert.notEqual(
          challengeRewardAfter,
          challengeRewardBefore,
          't2clGovernor should have changed'
        )
        assert.equal(
          challengeRewardAfter,
          partyB,
          't2clGovernor should be partyB'
        )
      })

      it('should update challengeReward', async () => {
        const challengeRewardBefore = await arbitrableTokenList.challengeReward()
        const newChallengeReward = challengeRewardBefore.toNumber() + 1000

        await arbitrableTokenList.changeChallengeReward(newChallengeReward, {
          from: t2clGovernor
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
            from: t2clGovernor
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
          from: t2clGovernor
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

    describe('caller is not t2clGovernor', () => {
      beforeEach(async () => {
        assert.notEqual(
          partyA,
          t2clGovernor,
          'partyA and t2clGovernor should be different for this test'
        )
      })

      it('should not update t2clGovernor', async () => {
        const t2clGovernorBefore = await arbitrableTokenList.t2clGovernor()
        await shouldFail.reverting(
          arbitrableTokenList.changeT2CLGovernor(partyB, {
            from: partyB
          })
        )

        const t2clGovernorAfter = await arbitrableTokenList.t2clGovernor()
        assert.equal(
          t2clGovernorAfter,
          t2clGovernorBefore,
          't2clGovernor should not have changed'
        )
        assert.notEqual(
          t2clGovernorAfter,
          partyB,
          't2clGovernor should not be partyB'
        )
      })

      it('should not update challengeReward', async () => {
        const challengeRewardBefore = await arbitrableTokenList.challengeReward()
        const newChallengeReward = challengeRewardBefore.toNumber() + 1000

        await shouldFail.reverting(
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

        await shouldFail.reverting(
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

        await shouldFail.reverting(
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

    describe('requestRegistration', () => {
      beforeEach(async () => {
        await deployArbitrableTokenList(appealableArbitrator)
        assert.equal(
          (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
          0,
          'initial contract balance should be zero for this test'
        )

        let item = await arbitrableTokenList.items(TOKEN_ID)
        assert.equal(
          item[3].toNumber(),
          0,
          'item.challengeReward should have be 0 initially'
        )

        await arbitrableTokenList.requestRegistration(TOKEN_ID, metaEvidence, {
          from: partyA,
          value: challengeReward
        })
        item = await arbitrableTokenList.items(TOKEN_ID)

        if (challengeReward > 0)
          assert.equal(
            item[3].toNumber(),
            challengeReward,
            'item.challengeReward should === challengeReward'
          )

        assert.equal(
          (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
          challengeReward,
          'contract should have challengeReward'
        )
      })

      it('should decrease contract balance', async () => {
        await time.increase(1)
        await arbitrableTokenList.executeRequest(TOKEN_ID, { from: partyA })

        assert.equal(
          (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
          0,
          'contract should have returned the reward to the submitter'
        )
      })

      it('should change item and agreement state for each submission phase', async () => {
        const firstAgreementId = (await arbitrableTokenList.items(TOKEN_ID))[4]
        const agreementBefore = await arbitrableTokenList.getAgreementInfo(
          firstAgreementId
        )

        assert.equal(agreementBefore[0], partyA, 'partyA should be the creator')
        assert.equal(
          agreementBefore[6].toNumber(),
          0,
          'there should be no disputes'
        )
        assert.equal(agreementBefore[7], false, 'there should be no disputes')
        assert.equal(
          agreementBefore[9].toNumber(),
          0,
          'there should be no ruling'
        )
        assert.equal(
          agreementBefore[10],
          false,
          'request should not have executed yet'
        )

        const itemBefore = await arbitrableTokenList.items(TOKEN_ID)
        assert.equal(
          itemBefore[0].toNumber(),
          ITEM_STATUS.SUBMITTED,
          'item should be in submitted state'
        )
        assert.isAbove(
          itemBefore[1].toNumber(),
          0,
          'time of last action should be above zero'
        )
        assert.equal(
          itemBefore[2].toNumber(),
          challengeReward,
          'item balance should be equal challengeReward'
        )

        await time.increase(1) // Increase time to test item.lastAction
        await arbitrableTokenList.executeRequest(TOKEN_ID)
        const agreementAfter = await arbitrableTokenList.getAgreementInfo(
          firstAgreementId
        )
        assert.equal(agreementAfter[0], partyA, 'partyA should be the creator')
        assert.equal(
          agreementAfter[6].toNumber(),
          0,
          'there should be no disputes'
        )
        assert.equal(agreementAfter[7], false, 'there should be no disputes')
        assert.equal(
          agreementAfter[9].toNumber(),
          0,
          'there should be no ruling'
        )
        assert.equal(agreementAfter[10], true, 'request should have executed')

        const itemAfter = await arbitrableTokenList.items(TOKEN_ID)
        assert.equal(
          itemAfter[0].toNumber(),
          ITEM_STATUS.REGISTERED,
          'item should be in registered state'
        )
        assert.isAbove(
          itemAfter[1].toNumber(),
          itemBefore[1].toNumber(),
          'time of last action should be after previous'
        )
        assert.equal(
          itemAfter[2].toNumber(),
          0,
          'challengeRewards should have been sent back to submitter'
        )

        await shouldFail.reverting(
          // should not allow calling executeRequestAgain
          arbitrableTokenList.executeRequest(TOKEN_ID)
        )
      })

      describe('both sides fully fund, dispute is raised', () => {
        beforeEach(async () => {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await arbitrableTokenList.fundDispute(agreementID, 1, {
            from: partyB,
            value: halfOfArbitrationPrice + challengeReward
          })
          assert.equal(
            (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
            challengeReward * 2 + halfOfArbitrationPrice,
            'contract shoulld have challengeReward * 2 + halfOfArbitrationPrice'
          )
          await arbitrableTokenList.fundDispute(agreementID, 0, {
            from: partyA,
            value: halfOfArbitrationPrice
          })
          assert.equal(
            (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
            challengeReward * 2,
            'contract should only hold challengeReward * 2'
          )
          const agreementBefore = await arbitrableTokenList.getAgreementInfo(
            agreementID
          )
          assert.equal(
            agreementBefore[1][0],
            partyA,
            'side 0 should be party A'
          )
          assert.equal(
            agreementBefore[1][1],
            partyB,
            'side 1 should be party B'
          )
          assert.isTrue(agreementBefore[7], 'agreement should be disputed')
          assert.isFalse(agreementBefore[8], 'agreement should not be appealed')
          assert.isFalse(
            agreementBefore[10],
            'agreement should have not been executed yet'
          )
          const itemBefore = await arbitrableTokenList.items(TOKEN_ID)
          assert.equal(
            itemBefore[0].toNumber(),
            ITEM_STATUS.SUBMITTED,
            'item should be submitted'
          )
          assert.equal(
            itemBefore[2].toNumber(),
            challengeReward * 2,
            'item balance should hold funds from party A and B'
          )
          await shouldFail.reverting(arbitrableTokenList.executeRequest(TOKEN_ID)) // should fail since item is disputed
        })

        describe('arbitrator rules in favor of partyA', () => {
          beforeEach(async () => {
            const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
            const agreementBefore = await arbitrableTokenList.getAgreementInfo(
              agreementID
            )

            // Rule in favor of partyA
            await appealableArbitrator.giveRuling(
              agreementBefore[6],
              RULING.ACCEPT
            )
          })

          it('no appeals, item should be registered', async () => {
            const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
            const agreementBefore = await arbitrableTokenList.getAgreementInfo(
              agreementID
            )
            const partyABalanceBefore = (await web3.eth.getBalance(
              partyA
            )).toNumber()
            const partyBBalanceBefore = (await web3.eth.getBalance(
              partyB
            )).toNumber()
            await time.increase(appealPeriodDuration + 1)
            await appealableArbitrator.giveRuling(
              agreementBefore[6],
              RULING.ACCEPT
            )

            agreement = await arbitrableTokenList.getAgreementInfo(agreementID)
            assert.equal(
              (await web3.eth.getBalance(
                arbitrableTokenList.address
              )).toNumber(),
              0,
              'contract should hold no balance'
            )
            const agreementAfter = await arbitrableTokenList.getAgreementInfo(
              agreementID
            )
            assert.equal(
              agreementAfter[1][0],
              partyA,
              'side 0 should still be party A'
            )
            assert.equal(
              agreementAfter[1][1],
              partyB,
              'side 1 should still be party B'
            )
            assert.isTrue(
              agreementAfter[7],
              'agreement still be disputed to maintain history'
            )
            assert.isFalse(
              agreementAfter[8],
              'agreement should not be appealed'
            )
            assert.isTrue(
              agreementAfter[10],
              'agreement should have been executed'
            )

            const itemAfter = await arbitrableTokenList.items(TOKEN_ID)
            assert.equal(
              itemAfter[0].toNumber(),
              ITEM_STATUS.REGISTERED,
              'item should be registered'
            )
            assert.equal(
              itemAfter[2].toNumber(),
              0,
              'item balance should be empty'
            )

            const partyABalanceAfter = (await web3.eth.getBalance(
              partyA
            )).toNumber()
            const partyBBalanceAfter = (await web3.eth.getBalance(
              partyB
            )).toNumber()

            assert.isAtMost(
              partyBBalanceAfter,
              partyBBalanceBefore,
              'partyB should have not been rewarded'
            )
            assert.isAbove(
              partyABalanceAfter,
              partyABalanceBefore,
              'partyA should have been rewarded'
            )
            assert.equal(
              (await web3.eth.getBalance(
                arbitrableTokenList.address
              )).toNumber(),
              0,
              'contract funds should be 0'
            )
          })
        })

        describe('arbitrator rules in favor of partyB', () => {
          beforeEach(async () => {
            const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
            const agreementBefore = await arbitrableTokenList.getAgreementInfo(
              agreementID
            )

            // Rule in favor of partyB
            await appealableArbitrator.giveRuling(
              agreementBefore[6],
              RULING.REFUSE
            )
          })

          describe('no appeals', () => {
            it('should send funds to partyB', async () => {
              const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
              const agreementBefore = await arbitrableTokenList.getAgreementInfo(
                agreementID
              )
              const partyABalanceBefore = (await web3.eth.getBalance(
                partyA
              )).toNumber()
              const partyBBalanceBefore = (await web3.eth.getBalance(
                partyB
              )).toNumber()

              await time.increase(appealPeriodDuration + 1)
              await appealableArbitrator.giveRuling(
                agreementBefore[6],
                RULING.REFUSE
              )

              agreement = await arbitrableTokenList.getAgreementInfo(
                agreementID
              )
              assert.equal(
                (await web3.eth.getBalance(
                  arbitrableTokenList.address
                )).toNumber(),
                0,
                'contract should hold no balance'
              )
              const agreementAfter = await arbitrableTokenList.getAgreementInfo(
                agreementID
              )
              assert.equal(
                agreementAfter[1][0],
                partyA,
                'side 0 should be party A'
              )

              const partyABalanceAfter = (await web3.eth.getBalance(
                partyA
              )).toNumber()
              const partyBBalanceAfter = (await web3.eth.getBalance(
                partyB
              )).toNumber()

              assert.isAbove(
                partyBBalanceAfter,
                partyBBalanceBefore,
                'partyB should have been rewarded'
              )
              assert.isAtMost(
                partyABalanceAfter,
                partyABalanceBefore,
                'partyA should have not been rewarded'
              )
              assert.equal(
                (await web3.eth.getBalance(
                  arbitrableTokenList.address
                )).toNumber(),
                0,
                'contract funds should be 0'
              )
            })

            it('should revert to previous state, execute and resolve dispute', async () => {
              const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
              const agreementBefore = await arbitrableTokenList.getAgreementInfo(
                agreementID
              )

              await time.increase(appealPeriodDuration + 1)
              await appealableArbitrator.giveRuling(
                agreementBefore[6],
                RULING.REFUSE
              )

              agreement = await arbitrableTokenList.getAgreementInfo(
                agreementID
              )
              const agreementAfter = await arbitrableTokenList.getAgreementInfo(
                agreementID
              )
              assert.equal(
                agreementAfter[1][0],
                partyA,
                'side 0 should still be party A'
              )
              assert.equal(
                agreementAfter[1][1],
                partyB,
                'side 1 should still be party B'
              )
              assert.isTrue(
                agreementAfter[7],
                'agreement still be disputed to maintain history'
              )
              assert.isFalse(
                agreementAfter[8],
                'agreement should not be appealed'
              )
              assert.isTrue(
                agreementAfter[10],
                'agreement should have been executed'
              )

              const itemAfter = await arbitrableTokenList.items(TOKEN_ID)
              assert.equal(
                itemAfter[0].toNumber(),
                ITEM_STATUS.ABSENT,
                'should have reverted item state'
              )
            })
          })

          describe('partyA appeals', () => {
            describe('arbitrator rules in favor of partyB', () => {})
          })
        })
      })

      describe('sides fails to fully fund', () => {
        beforeEach(async () => {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await arbitrableTokenList.fundDispute(agreementID, 1, {
            from: partyB,
            value: halfOfArbitrationPrice + challengeReward - 2
          })
          assert.equal(
            (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
            challengeReward * 2 + halfOfArbitrationPrice - 2,
            'contract should have challengeReward * 2 + halfOfArbitrationPrice - 2'
          )
        })

        it('should register and reward submitter if he funds more', async () => {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          const itemBefore = await arbitrableTokenList.items(TOKEN_ID)
          await arbitrableTokenList.fundDispute(agreementID, 0, {
            from: partyA,
            value: halfOfArbitrationPrice - 1
          })

          const submitterBalanceBefore = await web3.eth.getBalance(partyA)

          await time.increase(arbitrationFeesWaitingTime + 1)
          const gasPrice = 100000000

          const tx = await arbitrableTokenList.fundDispute(agreementID, 0, {
            from: partyA,
            gasPrice
          })
          const consumed = tx.receipt.gasUsed * gasPrice
          const submitterBalanceAfter = await web3.eth.getBalance(partyA)

          const itemAfter = await arbitrableTokenList.items(TOKEN_ID)
          assert.equal(
            submitterBalanceAfter.toNumber(),
            submitterBalanceBefore.plus(challengeReward * 2).minus(consumed),
            'submitter should have received challengeReward * 2'
          )

          const agreementAfter = await arbitrableTokenList.getAgreementInfo(
            agreementID
          )
          assert.equal(
            itemAfter[0],
            ITEM_STATUS.REGISTERED,
            'item should be registered'
          )
          assert.isAbove(
            itemAfter[1].toNumber(),
            itemBefore[1].toNumber(),
            'last action should have increased'
          )
          assert.equal(
            itemAfter[2].toNumber(),
            0,
            'item balance should be zero'
          )
          assert.equal(
            agreementAfter[1][0],
            partyA,
            'side 0 should still be party A'
          )
          assert.equal(
            agreementAfter[1][1],
            partyB,
            'side 1 should still be party B'
          )
          assert.isFalse(agreementAfter[7], 'agreement should not be disputed')
          assert.isFalse(agreementAfter[8], 'agreement should not be appealed')
          assert.isTrue(
            agreementAfter[10],
            'agreement should have been executed'
          )
        })

        it('should clear item and reward challenger if he funds more', async () => {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          const itemBefore = await arbitrableTokenList.items(TOKEN_ID)
          await arbitrableTokenList.fundDispute(agreementID, 0, {
            from: partyA,
            value: halfOfArbitrationPrice - 3
          })

          const challengerBalanceBefore = await web3.eth.getBalance(partyB)

          await time.increase(arbitrationFeesWaitingTime + 1)
          const gasPrice = 100000000
          const tx = await arbitrableTokenList.fundDispute(agreementID, 0, {
            from: partyB,
            gasPrice
          })
          const consumed = tx.receipt.gasUsed * gasPrice
          challengerBalanceAfter = await web3.eth.getBalance(partyB)

          assert.equal(
            challengerBalanceAfter.toNumber(),
            challengerBalanceBefore
              .plus(challengeReward * 2)
              .minus(consumed)
              .toNumber(),
            'challenger should have received challengeReward * 2'
          )
          const itemAfter = await arbitrableTokenList.items(TOKEN_ID)
          const agreementAfter = await arbitrableTokenList.getAgreementInfo(
            agreementID
          )
          assert.equal(
            itemAfter[0],
            ITEM_STATUS.ABSENT,
            'item should be absent'
          )
          assert.isAbove(
            itemAfter[1].toNumber(),
            itemBefore[1].toNumber(),
            'last action should have increased'
          )
          assert.equal(
            itemAfter[2].toNumber(),
            0,
            'item balance should be zero'
          )
          assert.equal(
            agreementAfter[1][0],
            partyA,
            'side 0 should still be party A'
          )
          assert.equal(
            agreementAfter[1][1],
            partyB,
            'side 1 should still be party B'
          )
          assert.isFalse(agreementAfter[7], 'agreement should not be disputed')
          assert.isFalse(agreementAfter[8], 'agreement should not be appealed')
          assert.isTrue(
            agreementAfter[10],
            'agreement should have been executed'
          )
        })
      })
    })

    describe('requestClearing', () => {
      beforeEach(async () => {
        await deployArbitrableTokenList(appealableArbitrator)
        await arbitrableTokenList.requestRegistration(TOKEN_ID, metaEvidence, {
          from: partyA,
          value: challengeReward
        })
        await time.increase(1)
        await arbitrableTokenList.executeRequest(TOKEN_ID)
        const firstAgreementId = (await arbitrableTokenList.items(TOKEN_ID))[4]
        const agreementSetup = await arbitrableTokenList.getAgreementInfo(
          firstAgreementId
        )

        assert.equal(agreementSetup[0], partyA, 'partyA should be the creator')
        assert.equal(
          agreementSetup[6].toNumber(),
          0,
          'there should be no disputes'
        )
        assert.equal(agreementSetup[7], false, 'there should be no disputes')
        assert.equal(
          agreementSetup[9].toNumber(),
          0,
          'there should be no ruling'
        )
        assert.equal(agreementSetup[10], true, 'request should have executed')

        const itemSetup = await arbitrableTokenList.items(TOKEN_ID)
        assert.equal(
          itemSetup[0].toNumber(),
          ITEM_STATUS.REGISTERED,
          'item should be in registered state'
        )
        assert.isAbove(
          itemSetup[1].toNumber(),
          0,
          'time of last action should be above 0'
        )
        assert.equal(
          itemSetup[2].toNumber(),
          0,
          'challengeRewards should have been sent back to submitter'
        )
      })

      it('should change item and agreement state for each clearing phase', async () => {
        await arbitrableTokenList.requestClearing(TOKEN_ID, metaEvidence, {
          from: partyB,
          value: challengeReward
        })

        const agreementId = (await arbitrableTokenList.items(TOKEN_ID))[4]
        const agreementBefore = await arbitrableTokenList.getAgreementInfo(
          agreementId
        )
        assert.equal(agreementBefore[0], partyB, 'partyB should be the creator')
        assert.equal(
          agreementBefore[6].toNumber(),
          0,
          'there should be no disputes'
        )
        assert.equal(agreementBefore[7], false, 'there should be no disputes')
        assert.equal(
          agreementBefore[9].toNumber(),
          0,
          'there should be no ruling'
        )
        assert.equal(
          agreementBefore[10],
          false,
          'request should not have executed yet'
        )

        const itemBefore = await arbitrableTokenList.items(TOKEN_ID)
        assert.equal(
          itemBefore[0].toNumber(),
          ITEM_STATUS.CLEARING_REQUESTED,
          'item should be in clearing requested state'
        )
        assert.isAbove(
          itemBefore[1].toNumber(),
          0,
          'time of last action should be above zero'
        )
        assert.equal(
          itemBefore[2].toNumber(),
          challengeReward,
          'item balance should be equal challengeReward'
        )
      })

      it('should increase and decrease contract balance', async () => {
        assert.equal(
          (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
          0,
          'contract should have the request reward'
        )

        await arbitrableTokenList.requestClearing(TOKEN_ID, metaEvidence, {
          from: partyB,
          value: challengeReward
        })

        assert.equal(
          (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
          challengeReward,
          'contract should have the request reward'
        )

        await time.increase(1)
        await arbitrableTokenList.executeRequest(TOKEN_ID, { from: partyA })

        assert.equal(
          (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
          0,
          'contract should have returned the fees to the submitter'
        )
      })

      describe('dispute without appeal', () => {
        beforeEach(async () => {
          await arbitrableTokenList.requestClearing(TOKEN_ID, metaEvidence, {
            from: partyA,
            value: challengeReward
          })
        })

        it('partyA wins arbitration, item is cleared', async () => {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await arbitrableTokenList.fundDispute(agreementID, 1, {
            from: partyB,
            value: halfOfArbitrationPrice + challengeReward
          })
          assert.equal(
            (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
            challengeReward * 2 + halfOfArbitrationPrice,
            'contract shoulld have challengeReward * 2 + halfOfArbitrationPrice'
          )
          await arbitrableTokenList.fundDispute(agreementID, 0, {
            from: partyA,
            value: halfOfArbitrationPrice
          })
          assert.equal(
            (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
            challengeReward * 2,
            'contract should only hold challengeReward * 2'
          )
          const agreementBefore = await arbitrableTokenList.getAgreementInfo(
            agreementID
          )
          assert.equal(
            agreementBefore[1][0],
            partyA,
            'side 0 should be party A'
          )
          assert.equal(
            agreementBefore[1][1],
            partyB,
            'side 1 should be party B'
          )
          assert.isTrue(agreementBefore[7], 'agreement should be disputed')
          assert.isFalse(agreementBefore[8], 'agreement should not be appealed')
          assert.isFalse(
            agreementBefore[10],
            'agreement should have not been executed yet'
          )

          const itemBefore = await arbitrableTokenList.items(TOKEN_ID)
          assert.equal(
            itemBefore[0].toNumber(),
            ITEM_STATUS.CLEARING_REQUESTED,
            'item should have status of clearing requested'
          )
          assert.equal(
            itemBefore[2].toNumber(),
            challengeReward * 2,
            'item balance should hold funds from party A and B'
          )

          const partyABalanceBefore = (await web3.eth.getBalance(
            partyA
          )).toNumber()
          const partyBBalanceBefore = (await web3.eth.getBalance(
            partyB
          )).toNumber()

          await shouldFail.reverting(arbitrableTokenList.executeRequest(TOKEN_ID)) // should fail since item is disputed

          // Rule in favor of partyA
          await appealableArbitrator.giveRuling(
            agreementBefore[6],
            RULING.ACCEPT
          )
          await time.increase(appealPeriodDuration + 1)
          await appealableArbitrator.giveRuling(
            agreementBefore[6],
            RULING.ACCEPT
          )

          agreement = await arbitrableTokenList.getAgreementInfo(agreementID)
          assert.equal(
            (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
            0,
            'contract should hold no balance'
          )
          const agreementAfter = await arbitrableTokenList.getAgreementInfo(
            agreementID
          )
          assert.equal(
            agreementAfter[1][0],
            partyA,
            'side 0 should still be party A'
          )
          assert.equal(
            agreementAfter[1][1],
            partyB,
            'side 1 should still be party B'
          )
          assert.isTrue(
            agreementAfter[7],
            'agreement still be disputed to maintain history'
          )
          assert.isFalse(agreementAfter[8], 'agreement should not be appealed')
          assert.isTrue(
            agreementAfter[10],
            'agreement should have been executed'
          )

          const itemAfter = await arbitrableTokenList.items(TOKEN_ID)
          assert.equal(
            itemAfter[0].toNumber(),
            ITEM_STATUS.CLEARED,
            'item should be cleared'
          )
          assert.equal(
            itemAfter[2].toNumber(),
            0,
            'item balance should be empty'
          )

          const partyABalanceAfter = (await web3.eth.getBalance(
            partyA
          )).toNumber()
          const partyBBalanceAfter = (await web3.eth.getBalance(
            partyB
          )).toNumber()

          assert.isAtMost(
            partyBBalanceAfter,
            partyBBalanceBefore,
            'partyB should have not been rewarded'
          )
          assert.isAbove(
            partyABalanceAfter,
            partyABalanceBefore,
            'partyA should have been rewarded'
          )
          assert.equal(
            (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
            0,
            'contract funds should be 0'
          )
        })

        it('partyA looses arbitration, item is kept', async () => {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await arbitrableTokenList.fundDispute(agreementID, 1, {
            from: partyB,
            value: halfOfArbitrationPrice + challengeReward
          })
          assert.equal(
            (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
            challengeReward * 2 + halfOfArbitrationPrice,
            'contract should have challengeReward * 2 + halfOfArbitrationPrice'
          )
          await arbitrableTokenList.fundDispute(agreementID, 0, {
            from: partyA,
            value: halfOfArbitrationPrice
          })
          assert.equal(
            (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
            challengeReward * 2,
            'contract should only hold challengeReward * 2'
          )
          const agreementBefore = await arbitrableTokenList.getAgreementInfo(
            agreementID
          )
          assert.equal(
            agreementBefore[1][0],
            partyA,
            'side 0 should be party A'
          )
          assert.equal(
            agreementBefore[1][1],
            partyB,
            'side 1 should be party B'
          )
          assert.isTrue(agreementBefore[7], 'agreement should be disputed')
          assert.isFalse(agreementBefore[8], 'agreement should not be appealed')
          assert.isFalse(
            agreementBefore[10],
            'agreement should have not been executed yet'
          )

          const itemBefore = await arbitrableTokenList.items(TOKEN_ID)
          assert.equal(
            itemBefore[0].toNumber(),
            ITEM_STATUS.CLEARING_REQUESTED,
            'item should have status of clearing requested'
          )
          assert.equal(
            itemBefore[2].toNumber(),
            challengeReward * 2,
            'item balance should hold funds from party A and B'
          )

          const partyABalanceBefore = (await web3.eth.getBalance(
            partyA
          )).toNumber()
          const partyBBalanceBefore = (await web3.eth.getBalance(
            partyB
          )).toNumber()

          await shouldFail.reverting(arbitrableTokenList.executeRequest(TOKEN_ID)) // should fail since item is disputed

          // Rule in favor of partyB
          await appealableArbitrator.giveRuling(
            agreementBefore[6],
            RULING.REFUSE
          )
          await time.increase(appealPeriodDuration + 1)
          await appealableArbitrator.giveRuling(
            agreementBefore[6],
            RULING.REFUSE
          )

          agreement = await arbitrableTokenList.getAgreementInfo(agreementID)
          assert.equal(
            (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
            0,
            'contract should hold no balance'
          )
          const agreementAfter = await arbitrableTokenList.getAgreementInfo(
            agreementID
          )
          assert.equal(
            agreementAfter[1][0],
            partyA,
            'side 0 should still be party A'
          )
          assert.equal(
            agreementAfter[1][1],
            partyB,
            'side 1 should still be party B'
          )
          assert.isTrue(
            agreementAfter[7],
            'agreement still be disputed to maintain history'
          )
          assert.isFalse(agreementAfter[8], 'agreement should not be appealed')
          assert.isTrue(
            agreementAfter[10],
            'agreement should have been executed'
          )

          const itemAfter = await arbitrableTokenList.items(TOKEN_ID)
          assert.equal(
            itemAfter[0].toNumber(),
            ITEM_STATUS.REGISTERED,
            'item should be registered'
          )
          assert.equal(
            itemAfter[2].toNumber(),
            0,
            'item balance should be empty'
          )

          const partyABalanceAfter = (await web3.eth.getBalance(
            partyA
          )).toNumber()
          const partyBBalanceAfter = (await web3.eth.getBalance(
            partyB
          )).toNumber()

          assert.isAbove(
            partyBBalanceAfter,
            partyBBalanceBefore,
            'partyB should have been rewarded'
          )
          assert.isAtMost(
            partyABalanceAfter,
            partyABalanceBefore,
            'partyA should have not been rewarded'
          )
          assert.equal(
            (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
            0,
            'contract funds should be 0'
          )
        })
      })
    })

    describe('item management and disputes without appeal', async () => {
      beforeEach(async () => {
        arbitrableTokenList = await ArbitrableTokenList.new(
          appealableArbitrator.address, // arbitrator
          arbitratorExtraData,
          appealableArbitrator.address, // fee governor
          feeStake,
          t2clGovernor,
          arbitrationFeesWaitingTime,
          challengeReward,
          timeToChallenge
        )
      })

      it('should be constructed correctly', async () => {
        assert.equal(
          await arbitrableTokenList.arbitrator(),
          appealableArbitrator.address
        )
        assert.equal(
          await arbitrableTokenList.arbitratorExtraData(),
          arbitratorExtraData
        )
        assert.equal(
          await arbitrableTokenList.challengeReward(),
          challengeReward
        )
        assert.equal(
          await arbitrableTokenList.timeToChallenge(),
          timeToChallenge
        )
      })

      describe('msg.value restrictions', async () => {
        it('requestRegistration', async () => {
          await shouldFail.reverting(
            arbitrableTokenList.requestRegistration(TOKEN_ID, metaEvidence, {
              value: challengeReward - 1
            })
          )
        })

        it('requestClearing', async () => {
          await shouldFail.reverting(
            arbitrableTokenList.requestClearing(TOKEN_ID, metaEvidence, {
              value: challengeReward - 1
            })
          )
        })

        it('challenge agreement', async () => {
          await arbitrableTokenList.requestRegistration(
            TOKEN_ID,
            metaEvidence,
            {
              value: challengeReward
            }
          )
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await shouldFail.reverting(
            arbitrableTokenList.fundDispute(agreementID, 1, {
              value: challengeReward - 1
            })
          )
        })
      })

      describe('When item.disputed', function() {
        beforeEach(
          'prepare pre-conditions to satisfy other requirements',
          async function() {
            await arbitrableTokenList.requestRegistration(
              TOKEN_ID,
              metaEvidence,
              {
                value: challengeReward
              }
            ) // To satisfy `require(item.status==ItemStatus.Resubmitted || item.status==ItemStatus.Submitted)`

            const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
            await arbitrableTokenList.fundDispute(agreementID, 1, {
              value: challengeReward + halfOfArbitrationPrice
            })
            await arbitrableTokenList.fundDispute(agreementID, 0, {
              value: halfOfArbitrationPrice
            }) // To dissatisfy `require(!item.disputed)`
          }
        )

        beforeEach('assert pre-conditions', async function() {
          assert.ok(
            (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber() ===
              ITEM_STATUS.SUBMITTED ||
              (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber() ===
                ITEM_STATUS.RESUBMITTED
          )

          const agreement = await arbitrableTokenList.getAgreementInfo(
            (await arbitrableTokenList.items(TOKEN_ID))[4]
          )
          assert.equal(agreement[7], true, 'agreement should be disputed')
        })

        it('registration dispute', async () => {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await shouldFail.reverting(
            arbitrableTokenList.fundDispute(agreementID, 1, {
              value: challengeReward + halfOfArbitrationPrice
            })
          )
        })

        it('clearing dispute', async () => {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await shouldFail.reverting(
            arbitrableTokenList.fundDispute(agreementID, 1, {
              value: challengeReward + halfOfArbitrationPrice
            })
          )
        })
      })

      describe('When !(item.status==ItemStatus.ClearingRequested || item.status==ItemStatus.PreventiveClearingRequested))', function() {
        beforeEach('assert pre-conditions', async function() {
          assert.ok(
            (await arbitrableTokenList.items(TOKEN_ID))[0] <
              ITEM_STATUS.CLEARING_REQUESTED
          )
        })

        it('registration dispute', async function() {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await shouldFail.reverting(
            arbitrableTokenList.fundDispute(agreementID, 1, {
              value: challengeReward + halfOfArbitrationPrice
            })
          )
        })

        it('clearing dispute', async function() {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await shouldFail.reverting(
            arbitrableTokenList.fundDispute(agreementID, 1, {
              value: challengeReward + halfOfArbitrationPrice
            })
          )
        })
      })

      describe('When item in absent state', function() {
        beforeEach('assert pre-conditions', async function() {
          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0],
            ITEM_STATUS.ABSENT
          )
        })

        it('calling isPermitted should return false', async () => {
          assert.equal(await arbitrableTokenList.isPermitted(TOKEN_ID), false)
        })

        it('calling requestRegistration should move item into the submitted state', async () => {
          await arbitrableTokenList.requestRegistration(
            TOKEN_ID,
            metaEvidence,
            {
              value: challengeReward
            }
          )

          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0],
            ITEM_STATUS.SUBMITTED
          )
        })

        it('calling requestClearing should move item into the preventive clearing requested state', async () => {
          await arbitrableTokenList.requestClearing(TOKEN_ID, metaEvidence, {
            value: challengeReward
          })

          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
            ITEM_STATUS.PREVENTIVE_CLEARING_REQUESTED
          )
        })

        it('calling funding a dispute should revert', async () => {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await shouldFail.reverting(
            arbitrableTokenList.fundDispute(agreementID, 1, {
              value: challengeReward + halfOfArbitrationPrice
            })
          )
        })

        it('calling challengeClearing should revert', async () => {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await shouldFail.reverting(
            arbitrableTokenList.fundDispute(agreementID, 1, {
              value: challengeReward + halfOfArbitrationPrice
            })
          )
        })

        it('calling executeRequest should revert', async () => {
          await shouldFail.reverting(arbitrableTokenList.executeRequest(TOKEN_ID))
        })
      })

      describe('When item in cleared state', function() {
        beforeEach('prepare pre-conditions', async function() {
          await arbitrableTokenList.requestRegistration(
            TOKEN_ID,
            metaEvidence,
            {
              value: challengeReward
            }
          )
          await time.increase(1)
          await arbitrableTokenList.executeRequest(TOKEN_ID)
          await arbitrableTokenList.requestClearing(TOKEN_ID, metaEvidence, {
            value: challengeReward
          })
          await time.increase(1)
          await arbitrableTokenList.executeRequest(TOKEN_ID)
        })

        beforeEach('assert pre-conditions', async function() {
          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0],
            ITEM_STATUS.CLEARED
          )
        })

        it('calling isPermitted should return false', async () => {
          assert.equal(await arbitrableTokenList.isPermitted(TOKEN_ID), false)
        })

        it('calling requestRegistration should move item into the resubmitted state', async () => {
          await arbitrableTokenList.requestRegistration(
            TOKEN_ID,
            metaEvidence,
            {
              value: challengeReward
            }
          )

          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
            ITEM_STATUS.RESUBMITTED
          )
        })

        it('calling requestClearing should revert', async () => {
          await shouldFail.reverting(
            arbitrableTokenList.requestClearing(TOKEN_ID, metaEvidence, {
              value: challengeReward
            })
          )
        })

        it('calling challengeClearing should revert', async () => {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await shouldFail.reverting(
            arbitrableTokenList.fundDispute(agreementID, 1, {
              value: challengeReward + halfOfArbitrationPrice
            })
          )
        })

        it('calling executeRequest should revert', async () => {
          await shouldFail.reverting(arbitrableTokenList.executeRequest(TOKEN_ID))
        })
      })

      describe('When item in resubmitted state', function() {
        beforeEach('prepare pre-conditions', async function() {
          await arbitrableTokenList.requestRegistration(
            TOKEN_ID,
            metaEvidence,
            {
              from: partyA,
              value: challengeReward
            }
          )
          await time.increase(1)
          await arbitrableTokenList.executeRequest(TOKEN_ID, {
            from: partyA
          })
          await arbitrableTokenList.requestClearing(TOKEN_ID, metaEvidence, {
            from: partyB,
            value: challengeReward
          })
          await time.increase(1)
          await arbitrableTokenList.executeRequest(TOKEN_ID, {
            from: partyB
          })
          await arbitrableTokenList.requestRegistration(
            TOKEN_ID,
            metaEvidence,
            {
              from: partyA,
              value: challengeReward
            }
          )
        })

        beforeEach('assert pre-conditions', async function() {
          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
            ITEM_STATUS.RESUBMITTED
          )
        })

        it('calling isPermitted should return true', async () => {
          assert.equal(await arbitrableTokenList.isPermitted(TOKEN_ID), false)
        })

        it('calling requestRegistration should revert', async () => {
          await shouldFail.reverting(
            arbitrableTokenList.requestRegistration(TOKEN_ID, metaEvidence, {
              value: challengeReward
            })
          )
        })

        it('calling requestClearing should revert', async function() {
          await shouldFail.reverting(
            arbitrableTokenList.requestClearing(TOKEN_ID, metaEvidence, {
              value: challengeReward
            })
          )
        })

        it('calling fundDispute should create a dispute', async function() {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })
          await arbitrableTokenList.fundDispute(agreementID, 0, {
            value: halfOfArbitrationPrice
          })

          const agreement = await arbitrableTokenList.getAgreementInfo(
            (await arbitrableTokenList.items(TOKEN_ID))[4]
          )
          assert.equal(agreement[1][1].toString(), governor)
          assert.equal(agreement[7], true, 'agreement should be disputed')
          assert.equal(
            web3.toUtf8(
              await arbitrableTokenList.agreementIDToItemID(agreementID)
            ),
            TOKEN_ID
          )
        })

        describe('executeRuling', async function() {
          let disputeID

          beforeEach('create a dispute', async function() {
            const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
            await arbitrableTokenList.fundDispute(agreementID, 1, {
              value: challengeReward + halfOfArbitrationPrice,
              from: partyB
            })
            await arbitrableTokenList.fundDispute(agreementID, 0, {
              value: halfOfArbitrationPrice
            })
            const agreement = await arbitrableTokenList.getAgreementInfo(
              (await arbitrableTokenList.items(TOKEN_ID))[4]
            )

            disputeID = agreement[6].toNumber()

            assert.notEqual(
              agreement[1][0],
              agreement[1][1],
              'subitter and challenger should be different'
            )
          })

          it('calling executeRuling with ACCEPT should send item.balance to submitter', async function() {
            const agreement = await arbitrableTokenList.getAgreementInfo(
              (await arbitrableTokenList.items(TOKEN_ID))[4]
            )
            const submitter = agreement[1][0]
            const submitterBalance = web3.eth.getBalance(submitter)
            const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

            await appealableArbitrator.giveRuling(disputeID, RULING.ACCEPT)
            await time.increase(appealPeriodDuration + 1)
            await appealableArbitrator.giveRuling(disputeID, RULING.ACCEPT)

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            const expectedBalanceOfSubmitter = submitterBalance.plus(
              itemBalance
            )

            assert(
              actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter),
              'Difference: ' +
                actualBalanceOfSubmitter
                  .minus(expectedBalanceOfSubmitter)
                  .toNumber()
            )
            assert.equal(
              (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
              ITEM_STATUS.REGISTERED
            )
          })

          it('calling executeRuling with REFUSE should send item.balance to challenger', async function() {
            const agreement = await arbitrableTokenList.getAgreementInfo(
              (await arbitrableTokenList.items(TOKEN_ID))[4]
            )
            const challenger = agreement[1][1]
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

            await appealableArbitrator.giveRuling(disputeID, RULING.REFUSE)
            await time.increase(appealPeriodDuration + 1)
            await appealableArbitrator.giveRuling(disputeID, RULING.REFUSE)

            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfChallenger = itemBalance.plus(
              challengerBalance
            )

            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger),
              'Difference: ' +
                actualBalanceOfChallenger
                  .minus(expectedBalanceOfChallenger)
                  .toNumber()
            )

            assert.equal(
              (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
              ITEM_STATUS.CLEARED
            )
          })

          it('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the cleared state', async function() {
            const agreement = await arbitrableTokenList.getAgreementInfo(
              (await arbitrableTokenList.items(TOKEN_ID))[4]
            )
            const submitter = agreement[1][0]
            const challenger = agreement[1][1]
            const submitterBalance = web3.eth.getBalance(submitter)
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

            await appealableArbitrator.giveRuling(disputeID, RULING.OTHER)
            await time.increase(appealPeriodDuration + 1)
            await appealableArbitrator.giveRuling(disputeID, RULING.OTHER)

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfSubmitter = itemBalance
              .dividedBy(new BigNumber(2))
              .plus(submitterBalance)

            const expectedBalanceOfChallenger = itemBalance
              .dividedBy(new BigNumber(2))
              .plus(challengerBalance)

            assert(
              actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter),
              'Actual: ' +
                actualBalanceOfSubmitter +
                '\t0Expected: ' +
                expectedBalanceOfSubmitter
            )
            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger),
              '1Differece: ' +
                actualBalanceOfChallenger.minus(expectedBalanceOfChallenger)
            )

            assert.equal(
              (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
              ITEM_STATUS.CLEARED
            )
          })
        })
      })

      describe('When item in registered state', function() {
        beforeEach('prepare pre-conditions', async function() {
          await arbitrableTokenList.requestRegistration(
            TOKEN_ID,
            metaEvidence,
            {
              value: challengeReward
            }
          )
          await time.increase(1)
          await arbitrableTokenList.executeRequest(TOKEN_ID)
        })

        beforeEach('assert pre-conditions', async function() {
          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0],
            ITEM_STATUS.REGISTERED
          )
          const agreement = await arbitrableTokenList.getAgreementInfo(
            (await arbitrableTokenList.items(TOKEN_ID))[4]
          )
          assert.isTrue(agreement[10], 'agreement should be executed')
        })

        it('calling isPermitted should return true', async () => {
          assert.equal(await arbitrableTokenList.isPermitted(TOKEN_ID), true)
        })

        it('calling requestRegistration should revert', async () => {
          await shouldFail.reverting(
            arbitrableTokenList.requestRegistration(TOKEN_ID, metaEvidence, {
              value: challengeReward
            })
          )
        })

        it('calling requestClearing should move item into the clearing requested state', async () => {
          await arbitrableTokenList.requestClearing(TOKEN_ID, metaEvidence, {
            value: challengeReward
          })

          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
            ITEM_STATUS.CLEARING_REQUESTED
          )
        })

        it('calling fund dispute over executed agreement should revert', async () => {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await shouldFail.reverting(
            arbitrableTokenList.fundDispute(agreementID, 1, {
              value: challengeReward + halfOfArbitrationPrice
            })
          )
        })

        it('calling clearing dispute should revert', async () => {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await shouldFail.reverting(
            arbitrableTokenList.fundDispute(agreementID, 1, {
              value: challengeReward + halfOfArbitrationPrice
            })
          )
        })

        it('calling executeRequest should revert', async function() {
          await shouldFail.reverting(arbitrableTokenList.executeRequest(TOKEN_ID))
        })
      })

      describe('When item in submitted state', function() {
        beforeEach('prepare pre-conditions', async function() {
          await arbitrableTokenList.requestRegistration(
            TOKEN_ID,
            metaEvidence,
            {
              value: challengeReward,
              from: partyA
            }
          )
        })

        beforeEach('assert pre-conditions', async function() {
          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
            ITEM_STATUS.SUBMITTED
          )
        })

        it('calling isPermitted should return false', async () => {
          assert.equal(await arbitrableTokenList.isPermitted(TOKEN_ID), false)
        })

        it('calling requestRegistration should revert', async () => {
          await shouldFail.reverting(
            arbitrableTokenList.requestRegistration(TOKEN_ID, metaEvidence, {
              value: challengeReward
            })
          )
        })

        it('calling requestClearing should move item into the clearing requested state', async () => {
          await shouldFail.reverting(
            arbitrableTokenList.requestClearing(TOKEN_ID, metaEvidence, {
              value: challengeReward
            })
          )
        })

        it('calling funding a dispute should revert', async function() {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })
          await arbitrableTokenList.fundDispute(agreementID, 0, {
            value: halfOfArbitrationPrice
          })

          const agreement = await arbitrableTokenList.getAgreementInfo(
            (await arbitrableTokenList.items(TOKEN_ID))[4]
          )

          assert.equal(agreement[1][1], governor)
          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[2].toNumber(),
            challengeReward * 2
          )
          assert.equal(agreement[7], true, 'item should be disputed')
          assert.equal(
            web3.toUtf8(
              await arbitrableTokenList.agreementIDToItemID(agreementID)
            ),
            TOKEN_ID
          )
        })

        it('calling executeRequest should move item into the registered state', async function() {
          await time.increase(1)
          await arbitrableTokenList.executeRequest(TOKEN_ID)

          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
            ITEM_STATUS.REGISTERED
          )
        })

        describe('executeRuling', async function() {
          let disputeID

          beforeEach('create a dispute', async function() {
            const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
            await arbitrableTokenList.fundDispute(agreementID, 1, {
              value: challengeReward + halfOfArbitrationPrice,
              from: partyB
            })
            await arbitrableTokenList.fundDispute(agreementID, 0, {
              value: halfOfArbitrationPrice,
              from: partyA
            })

            disputeID = (await arbitrableTokenList.getAgreementInfo(
              (await arbitrableTokenList.items(TOKEN_ID))[4]
            ))[6].toNumber()
          })

          beforeEach('assert pre-conditions', async () => {
            const agreement = await arbitrableTokenList.getAgreementInfo(
              (await arbitrableTokenList.items(TOKEN_ID))[4]
            )
            assert.notEqual(
              agreement[1][0],
              agreement[1][1],
              'subitter and challenger should be different'
            )
          })

          it('calling executeRuling with ACCEPT should send item.balance to submitter', async function() {
            const agreement = await arbitrableTokenList.getAgreementInfo(
              (await arbitrableTokenList.items(TOKEN_ID))[4]
            )
            const submitter = agreement[0]
            const submitterBalance = web3.eth.getBalance(submitter)
            const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

            await appealableArbitrator.giveRuling(disputeID, RULING.ACCEPT)
            await time.increase(appealPeriodDuration + 1)
            await appealableArbitrator.giveRuling(disputeID, RULING.ACCEPT)

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            const expectedBalanceOfSubmitter = itemBalance.plus(
              submitterBalance
            )

            const expectedItemStatus = ITEM_STATUS.REGISTERED

            assert(
              actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter),
              'Actual: ' +
                actualBalanceOfSubmitter +
                '\tExpected: ' +
                expectedBalanceOfSubmitter
            )

            assert.equal(
              (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
              expectedItemStatus
            )
          })

          it('calling executeRuling with REFUSE should send item.balance to challenger', async function() {
            const agreement = await arbitrableTokenList.getAgreementInfo(
              (await arbitrableTokenList.items(TOKEN_ID))[4]
            )
            const challenger = agreement[1][1]
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

            await appealableArbitrator.giveRuling(disputeID, RULING.REFUSE)
            await time.increase(appealPeriodDuration + 1)
            await appealableArbitrator.giveRuling(disputeID, RULING.REFUSE)

            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfChallenger = challengerBalance.plus(
              itemBalance
            )

            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger),
              'Actual: ' +
                actualBalanceOfChallenger +
                '\tExpected: ' +
                expectedBalanceOfChallenger
            )

            assert.equal(
              (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
              ITEM_STATUS.ABSENT,
              'should have reverted item state'
            )
          })

          it('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the absent state', async function() {
            const agreement = await arbitrableTokenList.getAgreementInfo(
              (await arbitrableTokenList.items(TOKEN_ID))[4]
            )
            const submitter = agreement[1][0]
            const challenger = agreement[1][1]
            const submitterBalance = web3.eth.getBalance(submitter)
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]
            const disputeID = agreement[6]

            await appealableArbitrator.giveRuling(disputeID, RULING.OTHER)
            await time.increase(appealPeriodDuration + 1)
            await appealableArbitrator.giveRuling(disputeID, RULING.OTHER)

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfSubmitter = itemBalance
              .dividedBy(new BigNumber(2))
              .plus(submitterBalance)

            const expectedBalanceOfChallenger = itemBalance
              .dividedBy(new BigNumber(2))
              .plus(challengerBalance)

            assert(
              actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter),
              'Actual: ' +
                actualBalanceOfSubmitter +
                '\tExpected: ' +
                expectedBalanceOfSubmitter
            )
            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger),
              'Actual: ' +
                actualBalanceOfChallenger +
                '\tExpected: ' +
                expectedBalanceOfChallenger
            )
            assert.equal(
              (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
              ITEM_STATUS.ABSENT
            )
          })
        })
      })

      describe('When item in clearing requested state', function() {
        beforeEach('prepare pre-conditions', async function() {
          await arbitrableTokenList.requestRegistration(
            TOKEN_ID,
            metaEvidence,
            {
              from: partyA,
              value: challengeReward
            }
          )
          await time.increase(1)
          await arbitrableTokenList.executeRequest(TOKEN_ID, {
            from: partyA
          })
          await arbitrableTokenList.requestClearing(TOKEN_ID, metaEvidence, {
            from: partyB,
            value: challengeReward
          })
        })

        beforeEach('assert pre-conditions', async function() {
          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
            ITEM_STATUS.CLEARING_REQUESTED
          )
        })

        it('calling isPermitted should return true', async () => {
          assert.equal(await arbitrableTokenList.isPermitted(TOKEN_ID), true)
        })

        it('calling requestRegistration should revert', async () => {
          await shouldFail.reverting(
            arbitrableTokenList.requestRegistration(TOKEN_ID, metaEvidence, {
              from: partyA,
              value: challengeReward
            })
          )
        })

        it('calling requestClearing should revert', async function() {
          await shouldFail.reverting(
            arbitrableTokenList.requestClearing(TOKEN_ID, metaEvidence, {
              from: partyB,
              value: challengeReward
            })
          )
        })

        it('calling challengeClearing should create a dispute', async function() {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await arbitrableTokenList.fundDispute(agreementID, 1, {
            from: partyA,
            value: challengeReward + halfOfArbitrationPrice
          })
          await arbitrableTokenList.fundDispute(agreementID, 0, {
            from: partyB,
            value: halfOfArbitrationPrice
          })

          const agreement = await arbitrableTokenList.getAgreementInfo(
            agreementID
          )

          assert.equal(agreement[1][1], partyA)
          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[2].toNumber(),
            challengeReward * 2
          )
          assert.equal(agreement[7], true)
          assert.equal(
            web3.toUtf8(
              await arbitrableTokenList.agreementIDToItemID(agreementID)
            ),
            TOKEN_ID
          )
        })

        it('calling executeRequest should move item into the cleared state', async function() {
          await time.increase(1)
          await arbitrableTokenList.executeRequest(TOKEN_ID, {
            from: partyA
          })

          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
            ITEM_STATUS.CLEARED
          )
        })

        describe('executeRuling', async function() {
          let disputeID

          beforeEach('create a dispute', async function() {
            const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
            await arbitrableTokenList.fundDispute(agreementID, 1, {
              value: challengeReward + halfOfArbitrationPrice,
              from: partyA
            })
            await arbitrableTokenList.fundDispute(agreementID, 0, {
              value: halfOfArbitrationPrice
            })
            const agreement = await arbitrableTokenList.getAgreementInfo(
              agreementID
            )
            disputeID = agreement[6].toNumber()
          })

          it('calling executeRuling with REFUSE should send item.balance to challenger', async function() {
            const agreement = await arbitrableTokenList.getAgreementInfo(
              (await arbitrableTokenList.items(TOKEN_ID))[4]
            )
            const challenger = agreement[1][1]
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

            await appealableArbitrator.giveRuling(disputeID, RULING.REFUSE)
            await time.increase(appealPeriodDuration + 1)
            await appealableArbitrator.giveRuling(disputeID, RULING.REFUSE)

            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfChallenger = challengerBalance.plus(
              itemBalance
            )

            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger),
              'Difference: ' +
                actualBalanceOfChallenger.minus(expectedBalanceOfChallenger)
            )

            assert.equal(
              (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
              ITEM_STATUS.REGISTERED
            )
          })

          it('calling executeRuling with ACCEPT should send item.balance to submitter', async function() {
            const agreement = await arbitrableTokenList.getAgreementInfo(
              (await arbitrableTokenList.items(TOKEN_ID))[4]
            )
            const submitter = agreement[1][0]
            const submitterBalance = web3.eth.getBalance(submitter)
            const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

            await appealableArbitrator.giveRuling(disputeID, RULING.ACCEPT)
            await time.increase(appealPeriodDuration + 1)
            await appealableArbitrator.giveRuling(disputeID, RULING.ACCEPT)

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            const expectedBalanceOfSubmitter = submitterBalance.plus(
              itemBalance
            )

            assert(
              actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter),
              'Difference: ' +
                actualBalanceOfSubmitter.minus(expectedBalanceOfSubmitter)
            )

            assert.equal(
              (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
              ITEM_STATUS.CLEARED
            )
          })

          it('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the registered state', async function() {
            const agreement = await arbitrableTokenList.getAgreementInfo(
              (await arbitrableTokenList.items(TOKEN_ID))[4]
            )
            const submitter = agreement[1][0]
            const challenger = agreement[1][1]
            const submitterBalance = web3.eth.getBalance(submitter)
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]
            const disputeID = agreement[6]

            await appealableArbitrator.giveRuling(disputeID, RULING.OTHER)
            await time.increase(appealPeriodDuration + 1)
            await appealableArbitrator.giveRuling(disputeID, RULING.OTHER)

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfSubmitter = itemBalance
              .dividedBy(2)
              .plus(submitterBalance)
            const expectedBalanceOfChallenger = itemBalance
              .dividedBy(2)
              .plus(challengerBalance)

            assert(
              actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter),
              'Difference: ' +
                actualBalanceOfSubmitter.minus(expectedBalanceOfSubmitter)
            )
            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger),
              'Difference: ' +
                actualBalanceOfChallenger.minus(expectedBalanceOfChallenger)
            )

            assert.equal(
              (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
              ITEM_STATUS.REGISTERED
            )
          })
        })
      })

      describe('When item in preventive clearing requested state', function() {
        beforeEach('prepare pre-conditions', async function() {
          await arbitrableTokenList.requestClearing(TOKEN_ID, metaEvidence, {
            from: partyB,
            value: challengeReward
          })
        })

        beforeEach('assert pre-conditions', async function() {
          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
            ITEM_STATUS.PREVENTIVE_CLEARING_REQUESTED
          )
        })

        it('calling isPermitted on a not-disputed item should return false', async () => {
          assert.equal(await arbitrableTokenList.isPermitted(TOKEN_ID), false)
        })

        it('calling isPermitted on a disputed item should return false', async () => {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })
          await arbitrableTokenList.fundDispute(agreementID, 0, {
            value: halfOfArbitrationPrice
          }) // To satisfy disputed pre-condition

          assert.equal(await arbitrableTokenList.isPermitted(TOKEN_ID), false)
        })

        it('calling requestRegistration should revert', async () => {
          await shouldFail.reverting(
            arbitrableTokenList.requestRegistration(TOKEN_ID, metaEvidence, {
              from: partyA,
              value: challengeReward
            })
          )
        })

        it('calling requestClearing should revert', async function() {
          await shouldFail.reverting(
            arbitrableTokenList.requestClearing(TOKEN_ID, metaEvidence, {
              from: partyB,
              value: challengeReward
            })
          )
        })

        it('calling challengeClearing should create a dispute', async function() {
          const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
          await arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice,
            from: partyA
          })
          await arbitrableTokenList.fundDispute(agreementID, 0, {
            value: halfOfArbitrationPrice
          })

          const agreement = await arbitrableTokenList.getAgreementInfo(
            agreementID
          )

          assert.equal(agreement[1][1], partyA)
          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[2].toNumber(),
            challengeReward * 2
          )
          assert.equal(agreement[7], true)
          assert.equal(
            web3.toUtf8(
              await arbitrableTokenList.agreementIDToItemID(agreementID)
            ),
            TOKEN_ID
          )
        })

        it('calling executeRequest should move item into the cleared state', async function() {
          await time.increase(1)
          await arbitrableTokenList.executeRequest(TOKEN_ID)

          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
            ITEM_STATUS.CLEARED
          )
        })

        describe('executeRuling', async function() {
          let disputeID

          beforeEach('create a dispute', async function() {
            const agreementID = (await arbitrableTokenList.items(TOKEN_ID))[4]
            const agreement = await arbitrableTokenList.getAgreementInfo(
              agreementID
            )
            await arbitrableTokenList.fundDispute(agreementID, 1, {
              value: challengeReward + halfOfArbitrationPrice,
              from: partyA
            })
            await arbitrableTokenList.fundDispute(agreementID, 0, {
              value: halfOfArbitrationPrice
            })

            disputeID = agreement[6].toNumber()
          })

          it('calling executeRuling with REFUSE should send item.balance to challenger', async function() {
            const agreement = await arbitrableTokenList.getAgreementInfo(
              (await arbitrableTokenList.items(TOKEN_ID))[4]
            )
            const challenger = agreement[1][1]
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

            await appealableArbitrator.giveRuling(disputeID, RULING.REFUSE)
            await time.increase(appealPeriodDuration + 1)
            await appealableArbitrator.giveRuling(disputeID, RULING.REFUSE)

            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfChallenger = challengerBalance.plus(
              itemBalance
            )

            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger)
            )
            assert.equal(
              (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
              ITEM_STATUS.ABSENT,
              'should revert item state'
            )
          })

          it('calling executeRuling with ACCEPT should send item.balance to submitter', async function() {
            const agreement = await arbitrableTokenList.getAgreementInfo(
              (await arbitrableTokenList.items(TOKEN_ID))[4]
            )
            const submitter = agreement[1][0]
            const submitterBalance = web3.eth.getBalance(submitter)
            const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

            await appealableArbitrator.giveRuling(disputeID, RULING.ACCEPT)
            await time.increase(appealPeriodDuration + 1)
            await appealableArbitrator.giveRuling(disputeID, RULING.ACCEPT)

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            const expectedBalanceOfSubmitter = itemBalance.plus(
              submitterBalance
            )

            assert(actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter))
            assert.equal(
              (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
              ITEM_STATUS.CLEARED
            )
          })

          it('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the absent state', async function() {
            const agreement = await arbitrableTokenList.getAgreementInfo(
              (await arbitrableTokenList.items(TOKEN_ID))[4]
            )
            const submitter = agreement[1][0]
            const challenger = agreement[1][1]
            const submitterBalance = web3.eth.getBalance(submitter)
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]
            const disputeID = agreement[6]

            await appealableArbitrator.giveRuling(disputeID, RULING.OTHER)
            await time.increase(appealPeriodDuration + 1)
            await appealableArbitrator.giveRuling(disputeID, RULING.OTHER)

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfSubmitter = itemBalance
              .dividedBy(2)
              .plus(submitterBalance)

            const expectedBalanceOfChallenger = itemBalance
              .dividedBy(2)
              .plus(challengerBalance)

            assert(
              actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter),
              'Difference: ' +
                actualBalanceOfSubmitter.minus(expectedBalanceOfSubmitter)
            )
            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger),
              'Difference: ' +
                actualBalanceOfChallenger.minus(expectedBalanceOfChallenger)
            )

            assert.equal(
              (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
              ITEM_STATUS.ABSENT
            )
          })
        })
      })
    })
  })
})
