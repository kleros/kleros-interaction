/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

const BigNumber = web3.BigNumber
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const ARBITRABLE_PERMISSION_LIST = artifacts.require('ArbitrablePermissionList')
const CENTRALIZED_ARBITRATOR = artifacts.require('CentralizedArbitrator')
const MINIME_TOKEN = artifacts.require('MiniMeToken')
const MINIME_TOKEN_FACTORY = artifacts.require('MiniMeTokenFactory')
const ConstantNG = artifacts.require('ConstantNG')
const ARBITRATOR_VERSIONING_PROXY = artifacts.require('ArbitratorVersioningProxy')
const APPEALABLE_ARBITRATOR = artifacts.require('AppealableArbitrator')

contract('ArbitrableVersioningProxy', function(accounts) {
  const PROPOSAL_QUORUM = 60
  const QUORUM_DIVIDE_TIME = 100
  const VOTING_TIME = 1000

  const CREATOR = accounts[1]
  const GOVERNOR = accounts[2]
  const ARBITRATOR_EXTRA_DATA = '0x707574546F566F74650000000000000000000000'
  const ARBITRATION_FEE = 4
  const STAKE = 10
  const TIME_TO_CHALLENGE = 0
  const META_EVIDENCE = 'evidence'
  const BLACKLIST = false
  const APPEND_ONLY = true
  const RECHALLENGE_POSSIBLE = false
  const TIMEOUT = 100

  const MIN_STAKING_TIME = 1
  const MAX_DRAWINNG_TIME = 1

  let governance
  let arbitrablePermissionList
  let centralizedArbitrator
  let pinakion
  let appealableArbitrator
  let tokenFactory
  let RNG
  let arbitratorVersioningProxy

  const PROPOSAL_STATE = {
    NEW: 0,
    PUT_TO_SUPPORT: 1,
    PUT_TO_VOTE: 2,
    DECIDED: 3
  }

  beforeEach('setup contract for each test', async function() {
    centralizedArbitrator = await CENTRALIZED_ARBITRATOR.new(ARBITRATION_FEE, {
      from: CREATOR
    })

    arbitrablePermissionList = await ARBITRABLE_PERMISSION_LIST.new(
      centralizedArbitrator.address,
      ARBITRATOR_EXTRA_DATA,
      META_EVIDENCE,
      BLACKLIST,
      APPEND_ONLY,
      RECHALLENGE_POSSIBLE,
      STAKE,
      TIME_TO_CHALLENGE,
      {
        from: CREATOR
      }
    )

    tokenFactory = await MINIME_TOKEN_FACTORY.new({ from: CREATOR })

    pinakion = await MINIME_TOKEN.new(
      tokenFactory.address,
      0x0,
      0,
      'Pinakion',
      18,
      'PNK',
      true,
      {
        from: CREATOR
      }
    )

    appealableArbitrator = await APPEALABLE_ARBITRATOR.new(
      ARBITRATION_FEE,
      GOVERNOR,
      ARBITRATOR_EXTRA_DATA,
      TIMEOUT
    )

    arbitratorVersioningProxy = await ARBITRATOR_VERSIONING_PROXY.new(appealableArbitrator.address, {from: GOVERNOR})

  })

  it('should be possible to retrieve all the tags', async function() {
    const ALL_TAGS = await arbitratorVersioningProxy.allTags()
    assert.equal(web3.toUtf8(ALL_TAGS[0]), "0.0.1")
  })

  it('should be possible to publish a new version', async function() {
    const NEXT_TAG = "NEXT_TAG"

    const NEW_VERSION = await APPEALABLE_ARBITRATOR.new(ARBITRATION_FEE + 1, accounts[9], "NEW_EXTRA_DATA", 0, {from: accounts[8]})
    await arbitratorVersioningProxy.publish(NEXT_TAG, NEW_VERSION.address, {from: GOVERNOR})

    const IMPLEMENTATION = await arbitratorVersioningProxy.implementation()

    assert.equal(await arbitratorVersioningProxy.addresses(NEXT_TAG), IMPLEMENTATION)
  })

  it('should be possible to rollback to the previous version', async function(){
    const PREV_IMPLEMENTATION = await arbitratorVersioningProxy.implementation()


    const NEXT_TAG = "NEXT_TAG"

    const NEW_VERSION = await APPEALABLE_ARBITRATOR.new(ARBITRATION_FEE + 1, accounts[9], "NEW_EXTRA_DATA", 0, {from: accounts[8]})
    await arbitratorVersioningProxy.publish(NEXT_TAG, NEW_VERSION.address, {from: GOVERNOR})

    await arbitratorVersioningProxy.rollback({from: GOVERNOR})

    const CURRENT_IMPLEMENTATION = await arbitratorVersioningProxy.implementation()

    assert.equal(CURRENT_IMPLEMENTATION, PREV_IMPLEMENTATION)
  })

  it('should be possible to set the stable version to a previously published version', async function(){
    const PREV_IMPLEMENTATION = await arbitratorVersioningProxy.implementation()
    const PREV_TAG = (await arbitratorVersioningProxy.allTags())[0]

    const NEXT_TAG = "NEXT_TAG"

    const NEW_VERSION = await APPEALABLE_ARBITRATOR.new(ARBITRATION_FEE + 1, accounts[9], "NEW_EXTRA_DATA", 0, {from: accounts[8]})
    await arbitratorVersioningProxy.publish(NEXT_TAG, NEW_VERSION.address, {from: GOVERNOR})

    await arbitratorVersioningProxy.setStable(PREV_TAG ,{from: GOVERNOR})

    const CURRENT_IMPLEMENTATION = await arbitratorVersioningProxy.implementation()

    assert.equal(CURRENT_IMPLEMENTATION, PREV_IMPLEMENTATION)
  })

  it('should be possible to create a dispute', async function(){
    await arbitratorVersioningProxy.createDispute(217, "EXTRA_DATA", {value: 10000000})

    const IMPLEMENTATION_ADDRESS = await arbitratorVersioningProxy.implementation()

    const ARBITRATOR = APPEALABLE_ARBITRATOR.at(IMPLEMENTATION_ADDRESS)

    assert.equal((await ARBITRATOR.disputes(0))[1].toNumber(), 217)
  })

  it('should be possible to give a ruling to a dispute', async function(){
    const CHOICES = 217 // Arbitrary

    await arbitratorVersioningProxy.createDispute(CHOICES, "EXTRA_DATA", {value: 10000000})

    const IMPLEMENTATION_ADDRESS = await arbitratorVersioningProxy.implementation()

    const ARBITRATOR = APPEALABLE_ARBITRATOR.at(IMPLEMENTATION_ADDRESS)

    const DISPUTE_ID = 0 // First dispute has the ID 0
    const RULING = CHOICES - 1 // Arbitrary


    await ARBITRATOR.giveRuling(DISPUTE_ID, RULING)

    const RULING_INDEX = 3 // Ruling field index in DisputeStruct

    assert.equal((await ARBITRATOR.disputes(DISPUTE_ID))[RULING_INDEX].toNumber(), RULING)
  })

  it.only('should be possible to appeal a dispute', async function(){
    const CHOICES = 217 // Arbitrary
    const EXTRA_DATA = "EXTRA_DATA"

    await arbitratorVersioningProxy.createDispute(CHOICES, EXTRA_DATA, {value: 1000000})

    const IMPLEMENTATION_ADDRESS = await arbitratorVersioningProxy.implementation()

    const ARBITRATOR = APPEALABLE_ARBITRATOR.at(IMPLEMENTATION_ADDRESS)

    const DISPUTE_ID = 0 // First dispute has the ID 0
    const RULING = CHOICES - 1 // Arbitrary


    await ARBITRATOR.giveRuling(DISPUTE_ID, RULING)

    const RULING_INDEX = 3 // Ruling field index in DisputeStruct

    //await increaseTime(10000)

    console.log((await ARBITRATOR.disputes(0))[4].toNumber())
    //await arbitratorVersioningProxy.appeal(DISPUTE_ID, EXTRA_DATA, {gas: 1000000, value: 1})

<<<<<<< HEAD
    //await ARBITRATOR.appeal(DISPUTE_ID, EXTRA_DATA, {gas: 1000000, value: 100000000})
=======
  })

  it('should retrieve dispute status', async function(){
    const CHOICES = 217 // Arbitrary
    const EXTRA_DATA = "EXTRA_DATA"

    await arbitratorVersioningProxy.createDispute(CHOICES, EXTRA_DATA, {value: 1000000})

    const IMPLEMENTATION_ADDRESS = await arbitratorVersioningProxy.implementation()

    const ARBITRATOR = APPEALABLE_ARBITRATOR.at(IMPLEMENTATION_ADDRESS)

    const DISPUTE_ID = 0 // First dispute has the ID 0
    const RULING = CHOICES - 1 // Arbitrary

    const EXPECTED = await ARBITRATOR.disputeStatus(DISPUTE_ID)
    const ACTUAL = await arbitratorVersioningProxy.disputeStatus(DISPUTE_ID)

    assert(ACTUAL.equals(EXPECTED))
  })

  it('should appeal even when contract gets upgraded during the process', async function(){ // THIS IS REVERTING, COULDN'T FIND WHY
    const CHOICES = Math.floor((Math.random() * 100) + 1); // Arbitrary
    const CHOISES_INDEX = 1
    const EXTRA_DATA = "EXTRA_DATA"
    const DISPUTE_ID = 0 // First dispute has the ID 0
    const RULING = CHOICES - 1 // Arbitrary

    await arbitratorVersioningProxy.createDispute(CHOICES, EXTRA_DATA, {value: 5})

    let implementation_address = await arbitratorVersioningProxy.implementation()
    let arbitrator = APPEALABLE_ARBITRATOR.at(implementation_address)

    await arbitrator.giveRuling(DISPUTE_ID, RULING)

    const ORIGINAL_DISPUTE = await arbitrator.disputes(DISPUTE_ID)
>>>>>>> 477129e... test(proxy): finish tests, 1 fails when upgrade in-between

    await ARBITRATOR.appealCost(DISPUTE_ID, EXTRA_DATA) // Why does this revert?
  })

<<<<<<< HEAD
=======
  // it('should rule', async function(){
  //   const CHOICES = Math.floor((Math.random() * 100) + 1); // Arbitrary
  //   const CHOISES_INDEX = 1
  //   const EXTRA_DATA = "EXTRA_DATA"
  //   const DISPUTE_ID = 0 // First dispute has the ID 0
  //   const RULING = CHOICES - 1 // Arbitrary
  //
  //   await arbitratorVersioningProxy.createDispute(CHOICES, EXTRA_DATA, {value: 5})
  //
  //   let implementation_address = await arbitratorVersioningProxy.implementation()
  //   let arbitrator = APPEALABLE_ARBITRATOR.at(implementation_address)
  //
  //   await arbitratorVersioningProxy.rule(DISPUTE_ID, RULING)  // Only the implementation can call it, not testable.
  // })
>>>>>>> 477129e... test(proxy): finish tests, 1 fails when upgrade in-between

})
