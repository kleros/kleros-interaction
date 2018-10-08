/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

const BigNumber = web3.BigNumber
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const ArbitrablePermissionList = artifacts.require('ArbitrablePermissionList')
const CentralizedArbitrator = artifacts.require('CentralizedArbitrator')
const MiniMeToken = artifacts.require('MiniMeToken')
const MiniMeTokenFactory = artifacts.require('MiniMeTokenFactory')
const ConstantNG = artifacts.require('ConstantNG')
<<<<<<< HEAD
const ARBITRATOR_VERSIONING_PROXY = artifacts.require('ArbitratorVersioningProxy')
const APPEALABLE_ARBITRATOR = artifacts.require('AppealableArbitrator')
=======
const ArbitratorVersioningProxy = artifacts.require('ArbitratorVersioningProxy')
const AppealableArbitrator = artifacts.require('AppealableArbitrator')
const BackedUpArbitrator = artifacts.require('BackedUpArbitrator')
>>>>>>> 7a326e7... style(proxy-test): fix constant names

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
  let arbitrablePermissionListInstance
  let centralizedArbitrator
  let pinakion
  let appealableArbitrator
  let tokenFactory
  let RNG
  let proxy

  const PROPOSAL_STATE = {
    NEW: 0,
    PUT_TO_SUPPORT: 1,
    PUT_TO_VOTE: 2,
    DECIDED: 3
  }

  beforeEach('setup contract for each test', async function() {
    centralizedArbitrator = await CentralizedArbitrator.new(ARBITRATION_FEE, {
      from: CREATOR
    })

    arbitrablePermissionListInstance = await ArbitrablePermissionList.new(
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

    tokenFactory = await MiniMeTokenFactory.new({ from: CREATOR })

    pinakion = await MiniMeToken.new(
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

    appealableArbitrator = await AppealableArbitrator.new(
      ARBITRATION_FEE,
      GOVERNOR,
      ARBITRATOR_EXTRA_DATA,
      TIMEOUT
    )

<<<<<<< HEAD
    arbitratorVersioningProxy = await ARBITRATOR_VERSIONING_PROXY.new(appealableArbitrator.address, {from: GOVERNOR})

  })

  it('should be possible to retrieve all the tags', async function() {
    const ALL_TAGS = await arbitratorVersioningProxy.allTags()
    assert.equal(web3.toUtf8(ALL_TAGS[0]), "0.0.1")
  })

  it('should be possible to publish a new version', async function() {
    const NEXT_TAG = "NEXT_TAG"
=======
    await appealableArbitrator.changeArbitrator(appealableArbitrator.address)

    proxy = await ArbitratorVersioningProxy.new(appealableArbitrator.address, {
      from: GOVERNOR
    })
  })

  it('should retrieve all the tags', async function() {
    const allTags = await proxy.allTags()
    assert.equal(web3.toUtf8(allTags[0]), '0.0.1')
  })

  it('should publish a new version', async function() {
    const NEXT_TAG = 'NEXT_TAG'
>>>>>>> 7a326e7... style(proxy-test): fix constant names

    const newVersion = await AppealableArbitrator.new(
      ARBITRATION_FEE + 1,
      accounts[9],
      'NEW_EXTRA_DATA',
      0,
      { from: accounts[8] }
    )
    await proxy.publish(NEXT_TAG, newVersion.address, { from: GOVERNOR })

    const implementation = await proxy.implementation()

    assert.equal(await proxy.addresses(NEXT_TAG), implementation)
  })

<<<<<<< HEAD
  it('should be possible to rollback to the previous version', async function(){
    const PREV_IMPLEMENTATION = await arbitratorVersioningProxy.implementation()
=======
  it('should rollback to the previous version', async function() {
    const previousImplementation = await proxy.implementation()
>>>>>>> 7a326e7... style(proxy-test): fix constant names

    const NEXT_TAG = 'NEXT_TAG'

    const newVersion = await AppealableArbitrator.new(
      ARBITRATION_FEE + 1,
      accounts[9],
      'NEW_EXTRA_DATA',
      0,
      { from: accounts[8] }
    )
    await proxy.publish(NEXT_TAG, newVersion.address, { from: GOVERNOR })

    await proxy.rollback({ from: GOVERNOR })

    const currentImplementation = await proxy.implementation()

    assert.equal(currentImplementation, previousImplementation)
  })

<<<<<<< HEAD
  it('should be possible to set the stable version to a previously published version', async function(){
    const PREV_IMPLEMENTATION = await arbitratorVersioningProxy.implementation()
    const PREV_TAG = (await arbitratorVersioningProxy.allTags())[0]
=======
  it('should set the stable version to a previously published version', async function() {
    const previousImplementation = await proxy.implementation()
    const previousTag = (await proxy.allTags())[0]
>>>>>>> 7a326e7... style(proxy-test): fix constant names

    const NEXT_TAG = 'NEXT_TAG'

    const newVersion = await AppealableArbitrator.new(
      ARBITRATION_FEE + 1,
      accounts[9],
      'NEW_EXTRA_DATA',
      0,
      { from: accounts[8] }
    )
    await proxy.publish(NEXT_TAG, newVersion.address, { from: GOVERNOR })

    await proxy.setStable(previousTag, { from: GOVERNOR })

    const currentImplementation = await proxy.implementation()

    assert.equal(currentImplementation, previousImplementation)
  })

<<<<<<< HEAD
  it('should be possible to create a dispute', async function(){
    await arbitratorVersioningProxy.createDispute(217, "EXTRA_DATA", {value: 10000000})
=======
  it('should create a dispute', async function() {
    await proxy.createDispute(217, 'EXTRA_DATA', { value: 10000000 })
>>>>>>> 7a326e7... style(proxy-test): fix constant names

    const IMPLEMENTATION_ADDRESS = await proxy.implementation()

    const ARBITRATOR = AppealableArbitrator.at(IMPLEMENTATION_ADDRESS)

    assert.equal((await ARBITRATOR.disputes(0))[1].toNumber(), 217)
  })

<<<<<<< HEAD
  it('should be possible to give a ruling to a dispute', async function(){
=======
  it('should give a ruling to a dispute', async function() {
>>>>>>> 7a326e7... style(proxy-test): fix constant names
    const CHOICES = 217 // Arbitrary

    await proxy.createDispute(CHOICES, 'EXTRA_DATA', { value: 10000000 })

    const IMPLEMENTATION_ADDRESS = await proxy.implementation()

    const arbitrator = AppealableArbitrator.at(IMPLEMENTATION_ADDRESS)

    const DISPUTE_ID = 0 // First dispute has the ID 0
    const RULING = CHOICES - 1 // Arbitrary

    await arbitrator.giveRuling(DISPUTE_ID, RULING)

    const RULING_INDEX = 3 // Ruling field index in DisputeStruct

    assert.equal(
      (await arbitrator.disputes(DISPUTE_ID))[RULING_INDEX].toNumber(),
      RULING
    )
  })

<<<<<<< HEAD
  it.only('should be possible to appeal a dispute', async function(){
=======
  it('should retrieve appeal cost', async function() {
    const CHOICES = 217 // Arbitrary
    const EXTRA_DATA = 'EXTRA_DATA'

    await proxy.createDispute(CHOICES, EXTRA_DATA, { value: 1000000 })

    const IMPLEMENTATION_ADDRESS = await proxy.implementation()

    const ARBITRATOR = AppealableArbitrator.at(IMPLEMENTATION_ADDRESS)

    const DISPUTE_ID = 0 // First dispute has the ID 0
    const RULING = CHOICES - 1 // Arbitrary

    const ACTUAL = await proxy.appealCost(DISPUTE_ID, RULING)
    const EXPECTED = await ARBITRATOR.appealCost(DISPUTE_ID, RULING)

    assert(ACTUAL.equals(EXPECTED))
  })

  it('should appeal a dispute', async function() {
>>>>>>> 7a326e7... style(proxy-test): fix constant names
    const CHOICES = 217 // Arbitrary
    const EXTRA_DATA = 'EXTRA_DATA'

    await proxy.createDispute(CHOICES, EXTRA_DATA, { value: 1000000 })

    const IMPLEMENTATION_ADDRESS = await proxy.implementation()

    const ARBITRATOR = AppealableArbitrator.at(IMPLEMENTATION_ADDRESS)

    const DISPUTE_ID = 0 // First dispute has the ID 0
    const RULING = CHOICES - 1 // Arbitrary

    await ARBITRATOR.giveRuling(DISPUTE_ID, RULING)

    const RULING_INDEX = 3 // Ruling field index in DisputeStruct

<<<<<<< HEAD
    //await increaseTime(10000)

    console.log((await ARBITRATOR.disputes(0))[4].toNumber())
    //await arbitratorVersioningProxy.appeal(DISPUTE_ID, EXTRA_DATA, {gas: 1000000, value: 1})

<<<<<<< HEAD
    //await ARBITRATOR.appeal(DISPUTE_ID, EXTRA_DATA, {gas: 1000000, value: 100000000})
=======
=======
    await proxy.appeal(DISPUTE_ID, EXTRA_DATA, {
      gas: 1000000,
      value: 100000000
    })

    const ORIGINAL_DISPUTE = await ARBITRATOR.disputes(DISPUTE_ID)
    const APPEAL_DISPUTE = await ARBITRATOR.disputes(DISPUTE_ID + 1)

    assert(ORIGINAL_DISPUTE[1].equals(APPEAL_DISPUTE[1]))
  })

  it('should retrieve current ruling', async function() {
    const CHOICES = 217 // Arbitrary
    const EXTRA_DATA = 'EXTRA_DATA'

    await proxy.createDispute(CHOICES, EXTRA_DATA, { value: 1000000 })

    const IMPLEMENTATION_ADDRESS = await proxy.implementation()

    const ARBITRATOR = AppealableArbitrator.at(IMPLEMENTATION_ADDRESS)

    const DISPUTE_ID = 0 // First dispute has the ID 0
    const RULING = CHOICES - 1 // Arbitrary

    await ARBITRATOR.giveRuling(DISPUTE_ID, RULING)

    const ACTUAL = await proxy.currentRuling(DISPUTE_ID)

    assert.equal(RULING, ACTUAL)
>>>>>>> 7a326e7... style(proxy-test): fix constant names
  })

  it('should retrieve dispute status', async function() {
    const CHOICES = 217 // Arbitrary
    const EXTRA_DATA = 'EXTRA_DATA'

    await proxy.createDispute(CHOICES, EXTRA_DATA, { value: 1000000 })

    const IMPLEMENTATION_ADDRESS = await proxy.implementation()

    const ARBITRATOR = AppealableArbitrator.at(IMPLEMENTATION_ADDRESS)

    const DISPUTE_ID = 0 // First dispute has the ID 0
    const RULING = CHOICES - 1 // Arbitrary

    const EXPECTED = await ARBITRATOR.disputeStatus(DISPUTE_ID)
    const ACTUAL = await proxy.disputeStatus(DISPUTE_ID)

    assert(ACTUAL.equals(EXPECTED))
  })

  it('should appeal even when contract gets upgraded during the process', async function() {
    // THIS IS REVERTING, COULDN'T FIND WHY
    const CHOICES = Math.floor(Math.random() * 100 + 1) // Arbitrary
    const CHOISES_INDEX = 1
    const EXTRA_DATA = 'EXTRA_DATA'
    const DISPUTE_ID = 0 // First dispute has the ID 0
    const RULING = CHOICES - 1 // Arbitrary

    await proxy.createDispute(CHOICES, EXTRA_DATA, { value: 5 })

    let implementation_address = await proxy.implementation()
    let arbitrator = AppealableArbitrator.at(implementation_address)

    await arbitrator.giveRuling(DISPUTE_ID, RULING)

    const ORIGINAL_DISPUTE = await arbitrator.disputes(DISPUTE_ID)
>>>>>>> 477129e... test(proxy): finish tests, 1 fails when upgrade in-between

<<<<<<< HEAD
    await ARBITRATOR.appealCost(DISPUTE_ID, EXTRA_DATA) // Why does this revert?
=======
    /* UPGRAGE THE CONTRACT */
    const newappealableArbitrator = await AppealableArbitrator.new(
      ARBITRATION_FEE,
      GOVERNOR,
      ARBITRATOR_EXTRA_DATA,
      TIMEOUT
    )
    await newappealableArbitrator.changeArbitrator(
      newappealableArbitrator.address
    )

    await proxy.publish(EXTRA_DATA, newappealableArbitrator.address, {
      from: GOVERNOR
    })
    /* DONE */

    await proxy.appeal(DISPUTE_ID, EXTRA_DATA, {
      gas: 2000000,
      value: 100000000
    })
>>>>>>> 7a326e7... style(proxy-test): fix constant names
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
  //   await proxy.createDispute(CHOICES, EXTRA_DATA, {value: 5})
  //
  //   let implementation_address = await proxy.implementation()
  //   let arbitrator = APPEALABLE_ARBITRATOR.at(implementation_address)
  //
  //   await proxy.rule(DISPUTE_ID, RULING)  // Only the implementation can call it, not testable.
  // })
<<<<<<< HEAD
>>>>>>> 477129e... test(proxy): finish tests, 1 fails when upgrade in-between

=======
>>>>>>> 7a326e7... style(proxy-test): fix constant names
})
