/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

// const BigNumber = web3.BigNumber
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

  const blacklist = false
  const appendOnly = false
  const rechallengePossible = false

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
      blacklist,
      appendOnly,
      rechallengePossible,
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

  describe('requestRegistration dispute', () => {
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
      assert.equal(agreementBefore[1][1], partyB, 'side 0 should be party B')
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
      assert.equal(agreementAfter[1][1], partyB, 'side 0 should be party B')
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
  })
})
