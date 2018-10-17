/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

const ArbitrablePermissionList = artifacts.require('ArbitrablePermissionList')
const CentralizedArbitrator = artifacts.require('CentralizedArbitrator')
const MiniMeTokenFactory = artifacts.require('MiniMeTokenFactory')
const ArbitratorVersioningProxy = artifacts.require('ArbitratorVersioningProxy')
const AppealableArbitrator = artifacts.require('AppealableArbitrator')

contract('ArbitrableVersioningProxy', function(accounts) {
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

  let centralizedArbitrator
  let appealableArbitrator
  let proxy

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

    appealableArbitrator = await AppealableArbitrator.new(
      ARBITRATION_FEE,
      GOVERNOR,
      ARBITRATOR_EXTRA_DATA,
      TIMEOUT
    )

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
    assert.equal(newVersion.address, implementation)
  })

  it('should rollback to the previous version', async function() {
    const previousImplementation = await proxy.implementation()

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

  it('should set the stable version to a previously published version', async function() {
    const previousImplementation = await proxy.implementation()
    const previousTag = (await proxy.allTags())[0]

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

  it('should create a dispute', async function() {
    const CHOICES = 217 // Arbitrary

    await proxy.createDispute(CHOICES, 'EXTRA_DATA', { value: 10000000 })

    const IMPLEMENTATION_ADDRESS = await proxy.implementation()

    const arbitrator = AppealableArbitrator.at(IMPLEMENTATION_ADDRESS)

    assert.equal((await arbitrator.disputes(0))[1].toNumber(), CHOICES)
  })

  it('should retrieve appeal cost', async function() {
    const CHOICES = 217 // Arbitrary
    const EXTRA_DATA = 'EXTRA_DATA'

    await proxy.createDispute(CHOICES, EXTRA_DATA, { value: 1000000 })

    const IMPLEMENTATION_ADDRESS = await proxy.implementation()

    const arbitrator = AppealableArbitrator.at(IMPLEMENTATION_ADDRESS)

    const DISPUTE_ID = 0 // First dispute has the ID 0
    const RULING = CHOICES - 1 // Arbitrary

    const ACTUAL = await proxy.appealCost(DISPUTE_ID, RULING)
    const EXPECTED = await arbitrator.appealCost(DISPUTE_ID, RULING)

    assert(ACTUAL.equals(EXPECTED))
  })

  it('appeal should transfer the dispute when called the first time', async function() {
    const CHOICES = Math.ceil(Math.random() * 100);

    await proxy.createDispute(CHOICES, "EXTRA_DATA", { value: 1000000 })

    let implementationAddress = await proxy.implementation()
    let arbitrator = AppealableArbitrator.at(implementationAddress)

    const DISPUTE_ID = 0 // First dispute has the ID 0
    const RULING = Math.floor(Math.random() * CHOICES);

    await arbitrator.giveRuling(DISPUTE_ID, RULING)

    const newVersion = await AppealableArbitrator.new(
      ARBITRATION_FEE + 1,
      accounts[9],
      'NEW_EXTRA_DATA',
      0,
      { from: accounts[8] }
    )
    await proxy.publish("NEXT_TAG", newVersion.address, { from: GOVERNOR })

    await proxy.appeal(DISPUTE_ID, "EXTRA_DATA", {
      gas: 1000000,
      value: 100000000
    })

    implementationAddress = await proxy.implementation()
    arbitrator = AppealableArbitrator.at(implementationAddress)

    const ORIGINAL_DISPUTE = await proxy.disputes(DISPUTE_ID)
    const NEW_DISPUTE = await arbitrator.disputes(DISPUTE_ID) // This is the first dispute of the new arbitrator.

    assert(ORIGINAL_DISPUTE[3].equals(NEW_DISPUTE[1])) // Check if choices are the same.
  })

  it('should retrieve current ruling', async function() {
    const CHOICES = 217 // Arbitrary
    const EXTRA_DATA = 'EXTRA_DATA'

    await proxy.createDispute(CHOICES, EXTRA_DATA, { value: 1000000 })

    const IMPLEMENTATION_ADDRESS = await proxy.implementation()

    const arbitrator = AppealableArbitrator.at(IMPLEMENTATION_ADDRESS)

    const DISPUTE_ID = 0 // First dispute has the ID 0
    const RULING = CHOICES - 1 // Arbitrary

    await arbitrator.giveRuling(DISPUTE_ID, RULING)

    const ACTUAL = await proxy.currentRuling(DISPUTE_ID)

    assert.equal(RULING, ACTUAL)
  })

  it('should retrieve dispute status', async function() {
    const CHOICES = 217 // Arbitrary
    const EXTRA_DATA = 'EXTRA_DATA'

    await proxy.createDispute(CHOICES, EXTRA_DATA, { value: 1000000 })

    const IMPLEMENTATION_ADDRESS = await proxy.implementation()

    const arbitrator = AppealableArbitrator.at(IMPLEMENTATION_ADDRESS)

    const DISPUTE_ID = 0 // First dispute has the ID 0

    const EXPECTED = await arbitrator.disputeStatus(DISPUTE_ID)
    const ACTUAL = await proxy.disputeStatus(DISPUTE_ID)

    assert(ACTUAL.equals(EXPECTED))
  })
})
