/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

/**
 * NOTE: Tests were adapted from arbitrable-permission-list. As of 04/10/18 t2cr spec, the
 * contract is a white list, not append-only and rechallenges are not possible.
 *
 * Tests that checked for other combinations were removed.
 *
 * TODO: Write tests for other combination of constructor parameters’
 */

// const BigNumber = web3.BigNumber
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')

const ArbitrableTokenList = artifacts.require('./ArbitrableTokenList.sol')
const CentralizedArbitrator = artifacts.require('./CentralizedArbitrator.sol')

contract('ArbitrableTokenList', function(accounts) {
  const arbitrator = accounts[1]
  const partyA = accounts[2]
  // const partyB = accounts[3]
  const arbitratorExtraData = 0x08575
  const arbitrationFee = 4
  const stake = 10
  const timeToChallenge = 0
  const metaEvidence = 'evidence'
  const feeGovernor = accounts[1]
  const feeStake = 10
  const halfOfArbitrationPrice = arbitrationFee / 2

  let centralizedArbitrator
  let arbitrableTokenList
  let arbitrationCost

  // const ITEM_STATUS = {
  //   ABSENT: 0,
  //   CLEARED: 1,
  //   RESUBMITTED: 2,
  //   REGISTERED: 3,
  //   SUBMITTED: 4,
  //   CLEARING_REQUESTED: 5,
  //   PREVENTIVE_CLEARING_REQUESTED: 6
  // }

  // const RULING = {
  //   OTHER: 0,
  //   REGISTER: 1,
  //   CLEAR: 2
  // }

  const ARBITRARY_STRING = 'abc'

  const REQUEST = {
    ID: ARBITRARY_STRING,
    arbitrationFeesWaitingTime: 60,
    timeOut: 60,
    contributionsPerSide: [
      [halfOfArbitrationPrice - 1, halfOfArbitrationPrice - 1]
    ]
  }

  const blacklist = false
  const appendOnly = false
  const rechallengePossible = false

  describe('queryItems', function() {
    before('setup contract for each test', async () => {
      centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {
        from: arbitrator
      })

      arbitrableTokenList = await ArbitrableTokenList.new(
        centralizedArbitrator.address,
        arbitratorExtraData,
        metaEvidence,
        blacklist,
        appendOnly,
        rechallengePossible,
        stake,
        timeToChallenge,
        feeGovernor,
        feeStake,
        {
          from: arbitrator
        }
      )

      arbitrationCost = (await centralizedArbitrator.arbitrationCost.call(
        'as',
        {
          from: arbitrator
        }
      )).toNumber()
    })

    before('populate the list', async function() {
      await arbitrableTokenList.requestRegistration(
        ARBITRARY_STRING,
        metaEvidence,
        REQUEST.arbitrationFeesWaitingTime,
        centralizedArbitrator.address,
        {
          from: partyA,
          value: stake + arbitrationCost
        }
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
        {
          from: partyA
        }
      ))[0]

      assert.equal(web3.toUtf8(item[0]), ARBITRARY_STRING)
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
        {
          from: partyA
        }
      ))[0]

      assert.equal(web3.toUtf8(item[0]), ARBITRARY_STRING)
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
})
