/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

const BigNumber = web3.BigNumber
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

contract('ArbitrableTokenList', function(accounts) {
  const governor = accounts[0]
  const partyA = accounts[2]
  const partyB = accounts[8]
  const arbitratorExtraData = 0x08575
  const challengeReward = 10 ** 10
  const arbitrationPrice = 100
  const halfOfArbitrationPrice = arbitrationPrice / 2
  const timeToChallenge = 0
  const metaEvidence = 'evidence'
  const feeStake = 10
  const timeOut = 1000

  let appealableArbitrator
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

  const RULING = { OTHER: 0, REGISTER: 1, CLEAR: 2 }
  const TOKEN_ID = 'pnk'

  const REQUEST = {
    ID: TOKEN_ID,
    arbitrationFeesWaitingTime: 60,
    timeOut: 60,
    contributionsPerSide: [
      [halfOfArbitrationPrice - 1, halfOfArbitrationPrice - 1]
    ]
  }

  const deployContracts = async () => {
    const timeOut = 1000
    appealableArbitrator = await AppealableArbitrator.new(
      arbitrationPrice, // _arbitrationPrice
      governor, // _arbitrator
      null, // _arbitratorExtraData
      timeOut // _timeOut
    )
    await appealableArbitrator.changeArbitrator(appealableArbitrator.address)

    arbitrableTokenList = await ArbitrableTokenList.new(
      appealableArbitrator.address, // arbitrator
      arbitratorExtraData,
      metaEvidence,
      challengeReward,
      timeToChallenge,
      appealableArbitrator.address, // fee governor
      feeStake
    )
  }

  describe('queryItems', () => {
    before('setup contract for each test', deployContracts)

    before('populate the list', async function() {
      await arbitrableTokenList.requestRegistration(
        TOKEN_ID,
        metaEvidence,
        REQUEST.arbitrationFeesWaitingTime,
        appealableArbitrator.address,
        { from: partyA, value: challengeReward }
      )
    })

    it('should succesfully retrieve mySubmissions', async function() {
      const cursor = 0
      const count = 1

      const pending = false
      const challenged = false
      const accepted = false
      const rejected = false
      const mySubmissions = true
      const myChallenges = false

      const filter = [
        pending,
        challenged,
        accepted,
        rejected,
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

    it('should succesfully retrieve pending', async function() {
      const cursor = 0
      const count = 1

      const pending = true
      const challenged = false
      const accepted = false
      const rejected = false
      const mySubmissions = false
      const myChallenges = false

      const filter = [
        pending,
        challenged,
        accepted,
        rejected,
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

      const pending = true
      const challenged = false
      const accepted = false
      const rejected = false
      const mySubmissions = false
      const myChallenges = false

      const filter = [
        pending,
        challenged,
        accepted,
        rejected,
        mySubmissions,
        myChallenges
      ]
      const sort = true

      await expectThrow(
        arbitrableTokenList.queryItems(cursor, count, filter, sort, {
          from: partyA
        })
      )
    })
  })

  describe('requestRegistration', () => {
    beforeEach(async () => {
      await deployContracts()
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        0,
        'initial contract balance should be zero for this test'
      )

      await arbitrableTokenList.requestRegistration(
        TOKEN_ID,
        metaEvidence,
        REQUEST.arbitrationFeesWaitingTime,
        appealableArbitrator.address,
        {
          from: partyA,
          value: challengeReward
        }
      )
    })

    it('should increase and decrease contract balance', async () => {
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        challengeReward,
        'contract should have the request reward and arbitration fees'
      )

      await arbitrableTokenList.executeRequest(TOKEN_ID, { from: partyA })

      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        0,
        'contract should have returned the fees to the submitter'
      )
    })

    it('should change item and agreement state for each submission phase', async () => {
      const firstAgreementId = await arbitrableTokenList.latestAgreementId(
        TOKEN_ID
      )
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

      increaseTime(1) // Increase time to test item.lastAction

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
      assert.equal(agreementAfter[9].toNumber(), 0, 'there should be no ruling')
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

      await expectThrow(
        // should not allow calling executeRequestAgain
        arbitrableTokenList.executeRequest(TOKEN_ID)
      )
    })
  })

  describe('requestClearing', () => {
    beforeEach(async () => {
      await deployContracts()
      await arbitrableTokenList.requestRegistration(
        TOKEN_ID,
        metaEvidence,
        REQUEST.arbitrationFeesWaitingTime,
        appealableArbitrator.address,
        {
          from: partyA,
          value: challengeReward
        }
      )
      await arbitrableTokenList.executeRequest(TOKEN_ID)
      const firstAgreementId = await arbitrableTokenList.latestAgreementId(
        TOKEN_ID
      )
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
      assert.equal(agreementSetup[9].toNumber(), 0, 'there should be no ruling')
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
      await arbitrableTokenList.requestClearing(
        TOKEN_ID,
        metaEvidence,
        REQUEST.arbitrationFeesWaitingTime,
        appealableArbitrator.address,
        { from: partyB, value: challengeReward }
      )

      const agreementId = await arbitrableTokenList.latestAgreementId(TOKEN_ID)
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

      increaseTime(1)
    })

    it('should increase and decrease contract balance', async () => {
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        0,
        'contract should have the request reward and arbitration fees'
      )

      await arbitrableTokenList.requestClearing(
        TOKEN_ID,
        metaEvidence,
        REQUEST.arbitrationFeesWaitingTime,
        appealableArbitrator.address,
        { from: partyB, value: challengeReward }
      )

      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        challengeReward,
        'contract should have the request reward and arbitration fees'
      )

      await arbitrableTokenList.executeRequest(TOKEN_ID, { from: partyA })

      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        0,
        'contract should have returned the fees to the submitter'
      )
    })
  })

  describe('requestRegistration dispute without appeal', () => {
    beforeEach(async () => {
      await deployContracts()
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        0,
        'initial contract balance should be zero for this test'
      )

      await arbitrableTokenList.requestRegistration(
        TOKEN_ID,
        metaEvidence,
        REQUEST.arbitrationFeesWaitingTime,
        appealableArbitrator.address,
        {
          from: partyA,
          value: challengeReward
        }
      )
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        challengeReward,
        'contract shoulld have challengeReward'
      )
    })

    it('partyA wins arbitration, item is registered', async () => {
      const agreementID = await arbitrableTokenList.latestAgreementId(TOKEN_ID)
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
      assert.equal(agreementBefore[1][0], partyA, 'side 0 should be party A')
      assert.equal(agreementBefore[1][1], partyB, 'side 1 should be party B')
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

      const partyABalanceBefore = (await web3.eth.getBalance(partyA)).toNumber()
      const partyBBalanceBefore = (await web3.eth.getBalance(partyB)).toNumber()

      await expectThrow(arbitrableTokenList.executeRequest(TOKEN_ID)) // should fail since item is disputed

      // Rule in favor of partyA
      await appealableArbitrator.giveRuling(agreementBefore[6], RULING.REGISTER)
      await increaseTime(timeOut + 1)
      await appealableArbitrator.giveRuling(agreementBefore[6], RULING.REGISTER)

      agreement = await arbitrableTokenList.getAgreementInfo(agreementID)
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        0,
        'contract should hold no balance'
      )
      const agreementAfter = await arbitrableTokenList.getAgreementInfo(
        agreementID
      )
      assert.equal(agreementAfter[1][0], partyA, 'side 0 should be party A')
      assert.equal(agreementAfter[1][1], 0x0, 'side 1 should be cleared')
      assert.isFalse(
        agreementAfter[7],
        'agreement should no be disputed anymore'
      )
      assert.isFalse(agreementAfter[8], 'agreement should not be appealed')
      assert.isTrue(agreementAfter[10], 'agreement should have been executed')

      const itemAfter = await arbitrableTokenList.items(TOKEN_ID)
      assert.equal(
        itemAfter[0].toNumber(),
        ITEM_STATUS.REGISTERED,
        'item should be registered'
      )
      assert.equal(itemAfter[2].toNumber(), 0, 'item balance should be empty')

      const partyABalanceAfter = (await web3.eth.getBalance(partyA)).toNumber()
      const partyBBalanceAfter = (await web3.eth.getBalance(partyB)).toNumber()

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

    it('partyA looses arbitration, item is cleared', async () => {
      const agreementID = await arbitrableTokenList.latestAgreementId(TOKEN_ID)
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
      assert.equal(agreementBefore[1][0], partyA, 'side 0 should be party A')
      assert.equal(agreementBefore[1][1], partyB, 'side 1 should be party B')
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

      const partyABalanceBefore = (await web3.eth.getBalance(partyA)).toNumber()
      const partyBBalanceBefore = (await web3.eth.getBalance(partyB)).toNumber()

      await expectThrow(arbitrableTokenList.executeRequest(TOKEN_ID)) // should fail since item is disputed

      // Rule in favor of partyB
      await appealableArbitrator.giveRuling(agreementBefore[6], RULING.CLEAR)
      await increaseTime(timeOut + 1)
      await appealableArbitrator.giveRuling(agreementBefore[6], RULING.CLEAR)

      agreement = await arbitrableTokenList.getAgreementInfo(agreementID)
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        0,
        'contract should hold no balance'
      )
      const agreementAfter = await arbitrableTokenList.getAgreementInfo(
        agreementID
      )
      assert.equal(agreementAfter[1][0], partyA, 'side 0 should be party A')
      assert.equal(agreementAfter[1][1], 0x0, 'side 1 should be cleared')
      assert.isFalse(
        agreementAfter[7],
        'agreement should no be disputed anymore'
      )
      assert.isFalse(agreementAfter[8], 'agreement should not be appealed')
      assert.isTrue(agreementAfter[10], 'agreement should have been executed')

      const itemAfter = await arbitrableTokenList.items(TOKEN_ID)
      assert.equal(
        itemAfter[0].toNumber(),
        ITEM_STATUS.CLEARED,
        'item should be cleared'
      )
      assert.equal(itemAfter[2].toNumber(), 0, 'item balance should be empty')

      const partyABalanceAfter = (await web3.eth.getBalance(partyA)).toNumber()
      const partyBBalanceAfter = (await web3.eth.getBalance(partyB)).toNumber()

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

  describe('requestClearing dispute without appeal', () => {
    beforeEach(async () => {
      await deployContracts()
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        0,
        'initial contract balance should be zero for this test'
      )

      await arbitrableTokenList.requestRegistration(
        TOKEN_ID,
        metaEvidence,
        REQUEST.arbitrationFeesWaitingTime,
        appealableArbitrator.address,
        {
          from: partyA,
          value: challengeReward
        }
      )

      await arbitrableTokenList.executeRequest(TOKEN_ID)

      const item = await arbitrableTokenList.items(TOKEN_ID)
      assert.equal(
        item[0].toNumber(),
        ITEM_STATUS.REGISTERED,
        'item should be registered for this test'
      )
      assert.isAbove(
        item[1].toNumber(),
        0,
        'item should have a last action time'
      )
      assert.equal(
        item[2].toNumber(),
        0,
        'item should have no rewards since there is no request in place'
      )

      const agreement = await arbitrableTokenList.getAgreementInfo(
        await arbitrableTokenList.latestAgreementId(TOKEN_ID)
      )
      assert.equal(
        agreement[0],
        partyA,
        'partyA should be the agreement creator'
      )
      assert.equal(agreement[1][0], partyA, 'partyA should be side 0')
      assert.equal(agreement[1][1], 0x0, 'there should be no party in side 1')
      assert.equal(agreement[10], true, 'agreement should have been executed')

      await arbitrableTokenList.requestClearing(
        TOKEN_ID,
        metaEvidence,
        REQUEST.arbitrationFeesWaitingTime,
        appealableArbitrator.address,
        {
          from: partyA,
          value: challengeReward
        }
      )
    })

    it('partyA wins arbitration, item is cleared', async () => {
      const agreementID = await arbitrableTokenList.latestAgreementId(TOKEN_ID)
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
      assert.equal(agreementBefore[1][0], partyA, 'side 0 should be party A')
      assert.equal(agreementBefore[1][1], partyB, 'side 1 should be party B')
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

      const partyABalanceBefore = (await web3.eth.getBalance(partyA)).toNumber()
      const partyBBalanceBefore = (await web3.eth.getBalance(partyB)).toNumber()

      await expectThrow(arbitrableTokenList.executeRequest(TOKEN_ID)) // should fail since item is disputed

      // Rule in favor of partyA
      await appealableArbitrator.giveRuling(agreementBefore[6], RULING.CLEAR)
      await increaseTime(timeOut + 1)
      await appealableArbitrator.giveRuling(agreementBefore[6], RULING.CLEAR)

      agreement = await arbitrableTokenList.getAgreementInfo(agreementID)
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        0,
        'contract should hold no balance'
      )
      const agreementAfter = await arbitrableTokenList.getAgreementInfo(
        agreementID
      )
      assert.equal(agreementAfter[1][0], partyA, 'side 0 should be party A')
      assert.equal(agreementAfter[1][1], 0x0, 'side 1 should be cleared')
      assert.isFalse(
        agreementAfter[7],
        'agreement should no be disputed anymore'
      )
      assert.isFalse(agreementAfter[8], 'agreement should not be appealed')
      assert.isTrue(agreementAfter[10], 'agreement should have been executed')

      const itemAfter = await arbitrableTokenList.items(TOKEN_ID)
      assert.equal(
        itemAfter[0].toNumber(),
        ITEM_STATUS.CLEARED,
        'item should be cleared'
      )
      assert.equal(itemAfter[2].toNumber(), 0, 'item balance should be empty')

      const partyABalanceAfter = (await web3.eth.getBalance(partyA)).toNumber()
      const partyBBalanceAfter = (await web3.eth.getBalance(partyB)).toNumber()

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
      const agreementID = await arbitrableTokenList.latestAgreementId(TOKEN_ID)
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
      assert.equal(agreementBefore[1][0], partyA, 'side 0 should be party A')
      assert.equal(agreementBefore[1][1], partyB, 'side 1 should be party B')
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

      const partyABalanceBefore = (await web3.eth.getBalance(partyA)).toNumber()
      const partyBBalanceBefore = (await web3.eth.getBalance(partyB)).toNumber()

      await expectThrow(arbitrableTokenList.executeRequest(TOKEN_ID)) // should fail since item is disputed

      // Rule in favor of partyB
      await appealableArbitrator.giveRuling(agreementBefore[6], RULING.REGISTER)
      await increaseTime(timeOut + 1)
      await appealableArbitrator.giveRuling(agreementBefore[6], RULING.REGISTER)

      agreement = await arbitrableTokenList.getAgreementInfo(agreementID)
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        0,
        'contract should hold no balance'
      )
      const agreementAfter = await arbitrableTokenList.getAgreementInfo(
        agreementID
      )
      assert.equal(agreementAfter[1][0], partyA, 'side 0 should be party A')
      assert.equal(agreementAfter[1][1], 0x0, 'side 1 should be cleared')
      assert.isFalse(
        agreementAfter[7],
        'agreement should no be disputed anymore'
      )
      assert.isFalse(agreementAfter[8], 'agreement should not be appealed')
      assert.isTrue(agreementAfter[10], 'agreement should have been executed')

      const itemAfter = await arbitrableTokenList.items(TOKEN_ID)
      assert.equal(
        itemAfter[0].toNumber(),
        ITEM_STATUS.REGISTERED,
        'item should be registered'
      )
      assert.equal(itemAfter[2].toNumber(), 0, 'item balance should be empty')

      const partyABalanceAfter = (await web3.eth.getBalance(partyA)).toNumber()
      const partyBBalanceAfter = (await web3.eth.getBalance(partyB)).toNumber()

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

  describe('settings and item state transitions', async () => {
    beforeEach(async () => {
      const timeOut = 1000
      appealableArbitrator = await AppealableArbitrator.new(
        arbitrationPrice, // _arbitrationPrice
        governor, // _arbitrator
        null, // _arbitratorExtraData
        timeOut // _timeOut
      )
      await appealableArbitrator.changeArbitrator(appealableArbitrator.address)

      arbitrableTokenList = await ArbitrableTokenList.new(
        appealableArbitrator.address, // arbitrator
        arbitratorExtraData,
        metaEvidence,
        challengeReward,
        timeToChallenge,
        appealableArbitrator.address, // fee governor
        feeStake
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
      assert.equal(await arbitrableTokenList.challengeReward(), challengeReward)
      assert.equal(await arbitrableTokenList.timeToChallenge(), timeToChallenge)
    })

    describe('msg.value restrictions', async () => {
      it('requestRegistration', async () => {
        await expectThrow(
          arbitrableTokenList.requestRegistration(
            TOKEN_ID,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            appealableArbitrator.address,
            {
              value: challengeReward - 1
            }
          )
        )
      })

      it('requestClearing', async () => {
        await expectThrow(
          arbitrableTokenList.requestClearing(
            TOKEN_ID,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            appealableArbitrator.address,
            {
              value: challengeReward - 1
            }
          )
        )
      })

      it('challenge agreement', async () => {
        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
        await expectThrow(
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
            REQUEST.arbitrationFeesWaitingTime,
            appealableArbitrator.address,
            {
              value: challengeReward
            }
          ) // To satisfy `require(item.status==ItemStatus.Resubmitted || item.status==ItemStatus.Submitted)`

          const agreementID = await arbitrableTokenList.latestAgreementId(
            TOKEN_ID
          )
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
          await arbitrableTokenList.latestAgreementId(TOKEN_ID)
        )
        assert.equal(agreement[7], true, 'agreement should be disputed')
      })

      it('registration dispute', async () => {
        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
        await expectThrow(
          arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })
        )
      })

      it('clearing dispute', async () => {
        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
        await expectThrow(
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
        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
        await expectThrow(
          arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })
        )
      })

      it('clearing dispute', async function() {
        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
        await expectThrow(
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
          REQUEST.arbitrationFeesWaitingTime,
          appealableArbitrator.address,
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
        await arbitrableTokenList.requestClearing(
          TOKEN_ID,
          metaEvidence,
          REQUEST.arbitrationFeesWaitingTime,
          appealableArbitrator.address,
          {
            value: challengeReward
          }
        )

        assert.equal(
          (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
          ITEM_STATUS.PREVENTIVE_CLEARING_REQUESTED
        )
      })

      it('calling challangeBlacklisting should revert', async () => {
        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
        await expectThrow(
          arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })
        )
      })

      it('calling challangeClearing should revert', async () => {
        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
        await expectThrow(
          arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })
        )
      })

      it('calling executeRequest should revert', async () => {
        await expectThrow(arbitrableTokenList.executeRequest(TOKEN_ID))
      })
    })

    describe('When item in cleared state', function() {
      beforeEach('prepare pre-conditions', async function() {
        await arbitrableTokenList.requestRegistration(
          TOKEN_ID,
          metaEvidence,
          REQUEST.arbitrationFeesWaitingTime,
          appealableArbitrator.address,
          {
            value: challengeReward
          }
        )
        await arbitrableTokenList.executeRequest(TOKEN_ID)
        await arbitrableTokenList.requestClearing(
          TOKEN_ID,
          metaEvidence,
          REQUEST.arbitrationFeesWaitingTime,
          appealableArbitrator.address,
          {
            value: challengeReward
          }
        )
        await arbitrableTokenList.executeRequest(TOKEN_ID, {})
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
          REQUEST.arbitrationFeesWaitingTime,
          appealableArbitrator.address,
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
        await expectThrow(
          arbitrableTokenList.requestClearing(
            TOKEN_ID,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            appealableArbitrator.address,
            {
              value: challengeReward
            }
          )
        )
      })

      it('calling challangeBlacklisting should revert', async () => {
        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
        await expectThrow(
          arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })
        )
      })

      it('calling challangeClearing should revert', async () => {
        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
        await expectThrow(
          arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })
        )
      })

      it('calling executeRequest should revert', async () => {
        await expectThrow(arbitrableTokenList.executeRequest(TOKEN_ID, {}))
      })
    })

    describe('When item in resubmitted state', function() {
      beforeEach('prepare pre-conditions', async function() {
        await arbitrableTokenList.requestRegistration(
          TOKEN_ID,
          metaEvidence,
          REQUEST.arbitrationFeesWaitingTime,
          appealableArbitrator.address,
          {
            from: partyA,
            value: challengeReward
          }
        )
        await arbitrableTokenList.executeRequest(TOKEN_ID, {
          from: partyA
        })
        await arbitrableTokenList.requestClearing(
          TOKEN_ID,
          metaEvidence,
          REQUEST.arbitrationFeesWaitingTime,
          appealableArbitrator.address,
          {
            from: partyB,
            value: challengeReward
          }
        )
        await arbitrableTokenList.executeRequest(TOKEN_ID, {
          from: partyB
        })
        await arbitrableTokenList.requestRegistration(
          TOKEN_ID,
          metaEvidence,
          REQUEST.arbitrationFeesWaitingTime,
          appealableArbitrator.address,
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
        await expectThrow(
          arbitrableTokenList.requestRegistration(
            TOKEN_ID,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            appealableArbitrator.address,
            {
              value: challengeReward
            }
          )
        )
      })

      it('calling requestClearing should revert', async function() {
        await expectThrow(
          arbitrableTokenList.requestClearing(
            TOKEN_ID,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            appealableArbitrator.address,
            {
              value: challengeReward
            }
          )
        )
      })

      it('calling fundDispute should create a dispute', async function() {
        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
        await arbitrableTokenList.fundDispute(agreementID, 1, {
          value: challengeReward + halfOfArbitrationPrice
        })
        await arbitrableTokenList.fundDispute(agreementID, 0, {
          value: halfOfArbitrationPrice
        })

        const agreement = await arbitrableTokenList.getAgreementInfo(
          await arbitrableTokenList.latestAgreementId(TOKEN_ID)
        )
        assert.equal(agreement[1][1].toString(), governor)
        const disputeID = agreement[6]
        assert.equal(agreement[7], true, 'agreement should be disputed')
        assert.equal(
          web3.toUtf8(await arbitrableTokenList.disputeIDToItem(disputeID)),
          TOKEN_ID
        )
      })

      describe.skip('executeRuling', async function() {
        let disputeID

        beforeEach('create a dispute', async function() {
          const agreementID = await arbitrableTokenList.latestAgreementId(
            TOKEN_ID
          )
          await arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })
          await arbitrableTokenList.fundDispute(agreementID, 0, {
            value: halfOfArbitrationPrice
          })
          const agreement = await arbitrableTokenList.getAgreementInfo(
            await arbitrableTokenList.latestAgreementId(TOKEN_ID)
          )

          disputeID = agreement[6].toNumber()
        })

        it('calling executeRuling with REGISTER should send item.balance to submitter', async function() {
          const agreement = await arbitrableTokenList.getAgreementInfo(
            await arbitrableTokenList.latestAgreementId(TOKEN_ID)
          )
          const submitter = agreement[1][0]
          const submitterBalance = web3.eth.getBalance(submitter)
          const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

          await appealableArbitrator.giveRuling(disputeID, RULING.REGISTER, {})

          const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
          const expectedBalanceOfSubmitter = submitterBalance
            .plus(itemBalance)
            .minus(new BigNumber(challengeReward).mul(4))
            .minus(new BigNumber(arbitrationPrice).mul(3))

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

        it('calling executeRuling with CLEAR should send item.balance to challenger', async function() {
          const agreement = await arbitrableTokenList.getAgreementInfo(
            await arbitrableTokenList.latestAgreementId(TOKEN_ID)
          )
          const challenger = agreement[1][1]
          const challengerBalance = web3.eth.getBalance(challenger)
          const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

          await appealableArbitrator.giveRuling(disputeID, RULING.CLEAR, {})

          const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
          const expectedBalanceOfChallenger = itemBalance
            .plus(challengerBalance)
            .minus(new BigNumber(challengeReward).mul(4))
            .minus(new BigNumber(arbitrationPrice).mul(3))

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

        it.skip('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the cleared state', async function() {
          const agreement = await arbitrableTokenList.getAgreementInfo(
            await arbitrableTokenList.latestAgreementId(TOKEN_ID)
          )
          const submitter = agreement[1][0]
          const challenger = agreement[1][1]
          const submitterBalance = web3.eth.getBalance(submitter)
          const challengerBalance = web3.eth.getBalance(challenger)
          const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

          await appealableArbitrator.giveRuling(disputeID, RULING.OTHER, {})

          const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
          const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
          const expectedBalanceOfSubmitter = itemBalance
            .dividedBy(new BigNumber(2))
            .plus(submitterBalance)
          const expectedBalanceOfChallenger = itemBalance
            .dividedBy(new BigNumber(2))
            .plus(challengerBalance)
            .minus(new BigNumber(challengeReward).mul(2))
            .minus(new BigNumber(arbitrationPrice).mul(3).dividedBy(2))

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
          REQUEST.arbitrationFeesWaitingTime,
          appealableArbitrator.address,
          {
            value: challengeReward
          }
        )
        await arbitrableTokenList.executeRequest(TOKEN_ID, {})
      })

      beforeEach('assert pre-conditions', async function() {
        assert.equal(
          (await arbitrableTokenList.items(TOKEN_ID))[0],
          ITEM_STATUS.REGISTERED
        )
      })

      it('calling isPermitted should return true', async () => {
        assert.equal(await arbitrableTokenList.isPermitted(TOKEN_ID), true)
      })

      it('calling requestRegistration should revert', async () => {
        await expectThrow(
          arbitrableTokenList.requestRegistration(
            TOKEN_ID,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            appealableArbitrator.address,
            {
              value: challengeReward
            }
          )
        )
      })

      it('calling requestClearing should move item into the clearing requested state', async () => {
        await arbitrableTokenList.requestClearing(
          TOKEN_ID,
          metaEvidence,
          REQUEST.arbitrationFeesWaitingTime,
          appealableArbitrator.address,
          {
            value: challengeReward
          }
        )

        assert.equal(
          (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
          ITEM_STATUS.CLEARING_REQUESTED
        )
      })

      it('calling registration dispute should revert', async () => {
        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
        await expectThrow(
          arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })
        )
      })

      it('calling clearing dispute should revert', async () => {
        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
        await expectThrow(
          arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })
        )
      })

      it('calling executeRequest should revert', async function() {
        await expectThrow(arbitrableTokenList.executeRequest(TOKEN_ID, {}))
      })
    })

    describe('When item in submitted state', function() {
      beforeEach('prepare pre-conditions', async function() {
        await arbitrableTokenList.requestRegistration(
          TOKEN_ID,
          metaEvidence,
          REQUEST.arbitrationFeesWaitingTime,
          appealableArbitrator.address,
          {
            value: challengeReward
          }
        )
      })

      beforeEach('assert pre-conditions', async function() {
        assert.equal(
          (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
          ITEM_STATUS.SUBMITTED
        )
      })

      it('calling isPermitted should return true', async () => {
        assert.equal(await arbitrableTokenList.isPermitted(TOKEN_ID), true)
      })

      it('calling requestRegistration should revert', async () => {
        await expectThrow(
          arbitrableTokenList.requestRegistration(
            TOKEN_ID,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            appealableArbitrator.address,
            {
              value: challengeReward
            }
          )
        )
      })

      it('calling requestClearing should move item into the clearing requested state', async () => {
        await expectThrow(
          arbitrableTokenList.requestClearing(
            TOKEN_ID,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            appealableArbitrator.address,
            {
              value: challengeReward
            }
          )
        )
      })

      it('calling challangeBlacklisting should create a dispute', async function() {
        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
        await arbitrableTokenList.fundDispute(agreementID, 1, {
          value: challengeReward + halfOfArbitrationPrice
        })
        await arbitrableTokenList.fundDispute(agreementID, 0, {
          value: halfOfArbitrationPrice
        })

        const agreement = await arbitrableTokenList.getAgreementInfo(
          await arbitrableTokenList.latestAgreementId(TOKEN_ID)
        )
        const disputeID = agreement[6].toNumber()

        assert.equal(agreement[1][1], governor)
        assert.equal(
          (await arbitrableTokenList.items(TOKEN_ID))[2].toNumber(),
          challengeReward * 2
        )
        assert.equal(agreement[7], true, 'item should be disputed')
        assert.equal(
          web3.toUtf8(await arbitrableTokenList.disputeIDToItem(disputeID)),
          TOKEN_ID
        )
      })

      it('calling executeRequest should move item into the registered state', async function() {
        await arbitrableTokenList.executeRequest(TOKEN_ID)

        assert.equal(
          (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
          ITEM_STATUS.REGISTERED
        )
      })

      describe.skip('executeRuling', async function() {
        let disputeID

        beforeEach('create a dispute', async function() {
          const agreementID = await arbitrableTokenList.latestAgreementId(
            TOKEN_ID
          )
          await arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })
          await arbitrableTokenList.fundDispute(agreementID, 0, {
            value: halfOfArbitrationPrice
          })

          disputeID = (await arbitrableTokenList.getAgreementInfo(
            await arbitrableTokenList.latestAgreementId(TOKEN_ID)
          ))[6].toNumber()
        })

        it.skip('calling executeRuling with REGISTER should send item.balance to submitter', async function() {
          const agreement = await arbitrableTokenList.getAgreementInfo(
            await arbitrableTokenList.latestAgreementId(TOKEN_ID)
          )
          const submitter = agreement[0]
          const submitterBalance = web3.eth.getBalance(submitter)
          const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

          const hash = await appealableArbitrator.giveRuling(
            disputeID,
            RULING.REGISTER
          )
          const gasUsed = hash.receipt.gasUsed
          const gasCost = gasUsed * Math.pow(10, 11) // Test environment doesn't care what the gasPrice is, spent value is always gasUsed * 10^11

          const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
          const expectedBalanceOfSubmitter = submitterBalance
            .plus(itemBalance)
            .plus(arbitrationPrice)
            .minus(gasCost)

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

        it.skip('calling executeRuling with CLEAR should send item.balance to challenger', async function() {
          const agreement = await arbitrableTokenList.getAgreementInfo(
            await arbitrableTokenList.latestAgreementId(TOKEN_ID)
          )
          const challenger = agreement[1][1]
          const challengerBalance = web3.eth.getBalance(challenger)
          const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

          await appealableArbitrator.giveRuling(disputeID, RULING.CLEAR)

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
            ITEM_STATUS.CLEARED
          )
        })

        it.skip('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the absent state', async function() {
          const agreement = await arbitrableTokenList.getAgreementInfo(
            await arbitrableTokenList.latestAgreementId(TOKEN_ID)
          )
          const submitter = agreement[1][0]
          const challenger = agreement[1][1]
          const submitterBalance = web3.eth.getBalance(submitter)
          const challengerBalance = web3.eth.getBalance(challenger)
          const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[4]
          const disputeID = (await arbitrableTokenList.items(TOKEN_ID))[6]

          const hash = await appealableArbitrator.giveRuling(
            disputeID,
            RULING.OTHER
          )
          const gasUsed = hash.receipt.gasUsed
          const gasCost = gasUsed * Math.pow(10, 11) // Test environment doesn't care what the gasPrice is, spent value is always gasUsed * 10^11

          const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
          const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
          const expectedBalanceOfSubmitter = itemBalance
            .dividedBy(new BigNumber(2))
            .plus(submitterBalance)
            .plus(arbitrationPrice)
            .minus(gasCost)
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
          REQUEST.arbitrationFeesWaitingTime,
          appealableArbitrator.address,
          {
            from: partyA,
            value: challengeReward
          }
        )
        await arbitrableTokenList.executeRequest(TOKEN_ID, {
          from: partyA
        })
        await arbitrableTokenList.requestClearing(
          TOKEN_ID,
          metaEvidence,
          REQUEST.arbitrationFeesWaitingTime,
          appealableArbitrator.address,
          {
            from: partyB,
            value: challengeReward
          }
        )
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
        await expectThrow(
          arbitrableTokenList.requestRegistration(
            TOKEN_ID,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            appealableArbitrator.address,
            {
              from: partyA,
              value: challengeReward
            }
          )
        )
      })

      it('calling requestClearing should revert', async function() {
        await expectThrow(
          arbitrableTokenList.requestClearing(
            TOKEN_ID,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            appealableArbitrator.address,
            {
              from: partyB,
              value: challengeReward
            }
          )
        )
      })

      it('calling challangeClearing should create a dispute', async function() {
        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
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
        const disputeID = agreement[6].toNumber()

        assert.equal(agreement[1][1], partyA)
        assert.equal(
          (await arbitrableTokenList.items(TOKEN_ID))[2].toNumber(),
          challengeReward * 2
        )
        assert.equal(agreement[7], true)
        assert.equal(
          web3.toUtf8(await arbitrableTokenList.disputeIDToItem(disputeID)),
          TOKEN_ID
        )
      })

      it('calling executeRequest should move item into the cleared state', async function() {
        await arbitrableTokenList.executeRequest(TOKEN_ID, {
          from: partyA
        })

        assert.equal(
          (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
          ITEM_STATUS.CLEARED
        )
      })

      describe.skip('executeRuling', async function() {
        let disputeID

        beforeEach('create a dispute', async function() {
          const agreementID = await arbitrableTokenList.latestAgreementId(
            TOKEN_ID
          )
          await arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })

          disputeID = (await arbitrableTokenList.items(TOKEN_ID))[6].toNumber()
        })

        it('calling executeRuling with REGISTER should send item.balance to challenger', async function() {
          const agreement = await arbitrableTokenList.getAgreementInfo(
            await arbitrableTokenList.latestAgreementId(TOKEN_ID)
          )
          const challenger = agreement[1][1]
          const challengerBalance = web3.eth.getBalance(challenger)
          const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

          await appealableArbitrator.giveRuling(disputeID, RULING.REGISTER, {})

          const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
          const expectedBalanceOfChallenger = challengerBalance
            .plus(itemBalance)
            .minus(new BigNumber(challengeReward).mul(3))
            .minus(new BigNumber(arbitrationPrice).mul(2))

          assert(
            actualBalanceOfChallenger.equals(expectedBalanceOfChallenger),
            'Difference: ' +
              actualBalanceOfChallenger.minus(expectedBalanceOfChallenger)
          )

          // assert.equal(web3.eth.getBalance(challenger).toNumber(), challengerBalance + itemBalance);
          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
            ITEM_STATUS.REGISTERED
          )
        })

        it('calling executeRuling with CLEAR should send item.balance to submitter', async function() {
          const agreement = await arbitrableTokenList.getAgreementInfo(
            await arbitrableTokenList.latestAgreementId(TOKEN_ID)
          )
          const submitter = agreement[1][0]
          const submitterBalance = web3.eth.getBalance(submitter)
          const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

          await appealableArbitrator.giveRuling(disputeID, RULING.CLEAR, {})

          const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
          const expectedBalanceOfSubmitter = submitterBalance
            .plus(itemBalance)
            .minus(new BigNumber(challengeReward).mul(3))
            .minus(new BigNumber(arbitrationPrice).mul(2))

          assert(
            actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter),
            'Difference: ' +
              actualBalanceOfSubmitter.minus(expectedBalanceOfSubmitter)
          )

          // assert.equal(web3.eth.getBalance(submitter).toNumber(), submitterBalance + itemBalance);
          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
            ITEM_STATUS.CLEARED
          )
        })

        it('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the registered state', async function() {
          const agreement = await arbitrableTokenList.getAgreementInfo(
            await arbitrableTokenList.latestAgreementId(TOKEN_ID)
          )
          const submitter = agreement[1][0]
          const challenger = agreement[1][1]
          const submitterBalance = web3.eth.getBalance(submitter)
          const challengerBalance = web3.eth.getBalance(challenger)
          const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[4]
          const disputeID = (await arbitrableTokenList.items(TOKEN_ID))[6]

          await appealableArbitrator.giveRuling(disputeID, RULING.OTHER, {})

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

    describe.skip('When item in preventive clearing requested state', function() {
      beforeEach('prepare pre-conditions', async function() {
        await arbitrableTokenList.requestClearing(
          TOKEN_ID,
          metaEvidence,
          REQUEST.arbitrationFeesWaitingTime,
          appealableArbitrator.address,
          {
            from: partyB,
            value: challengeReward
          }
        )
      })

      beforeEach('assert pre-conditions', async function() {
        assert.equal(
          (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
          ITEM_STATUS.PREVENTIVE_CLEARING_REQUESTED
        )
      })

      it(
        'calling isPermitted on a not-disputed item should return ' + false,
        async () => {
          assert.equal(await arbitrableTokenList.isPermitted(TOKEN_ID), false)
        }
      )

      it(
        'calling isPermitted on a disputed item should return ' + false,
        async () => {
          const agreementID = await arbitrableTokenList.latestAgreementId(
            TOKEN_ID
          )
          await arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          }) // To satisfy disputed pre-condition

          assert.equal(await arbitrableTokenList.isPermitted(TOKEN_ID), true)
        }
      )

      it('calling requestRegistration should revert', async () => {
        await expectThrow(
          arbitrableTokenList.requestRegistration(
            TOKEN_ID,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            appealableArbitrator.address,
            {
              from: partyA,
              value: challengeReward
            }
          )
        )
      })

      it('calling requestClearing should revert', async function() {
        await expectThrow(
          arbitrableTokenList.requestClearing(
            TOKEN_ID,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            appealableArbitrator.address,
            {
              from: partyB,
              value: challengeReward
            }
          )
        )
      })

      it('calling registration dispute should revert', async () => {
        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
        await expectThrow(
          arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })
        )
      })

      it('calling challangeClearing should create a dispute', async function() {
        const itemBalance = (await arbitrableTokenList.items(
          TOKEN_ID
        ))[4].toNumber()

        const agreementID = await arbitrableTokenList.latestAgreementId(
          TOKEN_ID
        )
        await arbitrableTokenList.fundDispute(agreementID, 1, {
          value: challengeReward + halfOfArbitrationPrice
        })

        assert.equal(
          (await arbitrableTokenList.items(TOKEN_ID))[3].toString(),
          partyA
        )
        assert.equal(
          (await arbitrableTokenList.items(TOKEN_ID))[4].toNumber(),
          itemBalance + challengeReward
        )
        const disputeID = (await arbitrableTokenList.items(
          TOKEN_ID
        ))[6].toNumber()
        assert.equal((await arbitrableTokenList.items(TOKEN_ID))[5], true)
        assert.equal(
          web3.toUtf8(await arbitrableTokenList.disputeIDToItem(disputeID)),
          TOKEN_ID
        )
      })

      it('calling executeRequest should move item into the cleared state', async function() {
        await arbitrableTokenList.executeRequest(TOKEN_ID, {})

        assert.equal(
          (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
          ITEM_STATUS.CLEARED
        )
      })

      describe('executeRuling', async function() {
        let disputeID

        beforeEach('create a dispute', async function() {
          const agreementID = await arbitrableTokenList.latestAgreementId(
            TOKEN_ID
          )
          await arbitrableTokenList.fundDispute(agreementID, 1, {
            value: challengeReward + halfOfArbitrationPrice
          })

          disputeID = (await arbitrableTokenList.items(TOKEN_ID))[6].toNumber()
        })

        it('calling executeRuling with REGISTER should send item.balance to challenger', async function() {
          const agreement = await arbitrableTokenList.getAgreementInfo(
            await arbitrableTokenList.latestAgreementId(TOKEN_ID)
          )
          const challenger = agreement[1][1]
          const challengerBalance = web3.eth.getBalance(challenger)
          const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

          await appealableArbitrator.giveRuling(disputeID, RULING.REGISTER, {})

          const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
          const expectedBalanceOfChallenger = challengerBalance.plus(
            itemBalance
          )

          assert(actualBalanceOfChallenger.equals(expectedBalanceOfChallenger))
          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
            ITEM_STATUS.REGISTERED
          )
        })

        it('calling executeRuling with CLEAR should send item.balance to submitter', async function() {
          const agreement = await arbitrableTokenList.getAgreementInfo(
            await arbitrableTokenList.latestAgreementId(TOKEN_ID)
          )
          const submitter = agreement[1][0]
          const submitterBalance = web3.eth.getBalance(submitter)
          const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[2]

          await appealableArbitrator.giveRuling(disputeID, RULING.CLEAR, {})

          const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
          const expectedBalanceOfSubmitter = itemBalance.plus(submitterBalance)

          assert(actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter))
          assert.equal(
            (await arbitrableTokenList.items(TOKEN_ID))[0].toNumber(),
            ITEM_STATUS.CLEARED
          )
        })

        it('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the absent state', async function() {
          const agreement = await arbitrableTokenList.getAgreementInfo(
            await arbitrableTokenList.latestAgreementId(TOKEN_ID)
          )
          const submitter = agreement[1][0]
          const challenger = agreement[1][1]
          const submitterBalance = web3.eth.getBalance(submitter)
          const challengerBalance = web3.eth.getBalance(challenger)
          const itemBalance = (await arbitrableTokenList.items(TOKEN_ID))[4]
          const disputeID = (await arbitrableTokenList.items(TOKEN_ID))[6]

          await appealableArbitrator.giveRuling(disputeID, RULING.OTHER, {})

          const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
          const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
          const expectedBalanceOfSubmitter = itemBalance
            .dividedBy(2)
            .plus(submitterBalance)
            .plus(new BigNumber(challengeReward))
            .plus(new BigNumber(arbitrationPrice).dividedBy(2))
          const expectedBalanceOfChallenger = itemBalance
            .dividedBy(2)
            .plus(challengerBalance)
            .plus(new BigNumber(challengeReward))
            .plus(new BigNumber(arbitrationPrice).dividedBy(2))

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
