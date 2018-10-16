/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const AppealableArbitrator = artifacts.require('./AppealableArbitrator.sol')
const CentralizedArbitrator = artifacts.require('./CentralizedArbitrator.sol')
// an ultimate arbitrable contract to test the final ruling option
const TwoPartyArbitrable = artifacts.require('./TwoPartyArbitrable.sol')

contract('AppealableArbitrator', function(accounts) {
  const appealable = accounts[0]
  const arbitrator = accounts[1]
  const other = accounts[2]
  const timeOut = 100
  const arbitrationFee = 2
  const choices = 2
  const arbitratorExtraData = 0x85
  const NOT_PAYABLE_VALUE = (2 ** 256 - 2) / 2
  const partyA = accounts[3]
  const partyB = accounts[4]

  it('Should set the correct values', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      centralizedArbitrator.address,
      arbitratorExtraData,
      timeOut,
      { from: appealable }
    )
    assert.equal(await appealableArbitrator.timeOut(), timeOut)
    assert.equal(
      await appealableArbitrator.arbitrationCost(0x85),
      arbitrationFee
    )
    assert.equal(
      await appealableArbitrator.arbitrator(),
      centralizedArbitrator.address
    )
    assert.equal(
      await appealableArbitrator.arbitratorExtraData(),
      arbitratorExtraData
    )
  })

  it('Non-owner cant change arbitrator', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      centralizedArbitrator.address,
      arbitratorExtraData,
      timeOut,
      { from: appealable }
    )
    await expectThrow(
      appealableArbitrator.changeArbitrator(other, { from: other })
    )
  })

  it('Non-owner cant change timeout', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      centralizedArbitrator.address,
      arbitratorExtraData,
      timeOut,
      { from: appealable }
    )
    await expectThrow(appealableArbitrator.changeTimeOut(5, { from: other }))
  })

  it('Non-owner cant rule none-appealed disputes', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      centralizedArbitrator.address,
      arbitratorExtraData,
      timeOut,
      { from: appealable }
    )
    await appealableArbitrator.createDispute(choices, arbitratorExtraData, {
      value: arbitrationFee
    })
    await expectThrow(appealableArbitrator.giveRuling(0, 1, { from: other }))
  })

  it('Ruling should set correct values in none-appealed disputes and create AppealPossible event', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      centralizedArbitrator.address,
      arbitratorExtraData,
      timeOut,
      { from: appealable }
    )
    await appealableArbitrator.createDispute(choices, arbitratorExtraData, {
      value: arbitrationFee
    })
    const tx = await appealableArbitrator.giveRuling(0, 1)
    const dispute = await appealableArbitrator.disputes(0)
    assert.equal(dispute[0], appealable, 'Arbitrable not set up properly')
    assert.equal(
      dispute[1].toNumber(),
      2,
      'Number of choices not set up properly'
    )
    assert.equal(
      dispute[2].toNumber(),
      2,
      'Arbitration fee not set up properly'
    )
    assert.equal(dispute[3].toNumber(), 1, 'Ruling not set up properly')
    assert.equal(dispute[4].toNumber(), 1, 'Dispute has incorrect status')
    assert.equal(
      tx.logs[0].event,
      'AppealPossible',
      'The event has not been created'
    )
    assert.equal(
      tx.logs[0].args._disputeID.toNumber(),
      0,
      'The event has wrong dispute ID'
    )
    assert.equal(
      tx.logs[0].args._arbitrable,
      appealable,
      'The event has wrong arbitrable address'
    )
  })

  it('Shouldnt allow to make final ruling in non-appealed dispute before timeout', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      centralizedArbitrator.address,
      arbitratorExtraData,
      timeOut,
      { from: appealable }
    )
    const arbitrable = await TwoPartyArbitrable.new(
      appealableArbitrator.address,
      timeOut,
      partyB,
      2,
      arbitratorExtraData,
      '',
      { from: partyA }
    )
    // creates a dispute in appealable contract
    await arbitrable.payArbitrationFeeByPartyB({
      from: partyB,
      value: arbitrationFee
    })
    await arbitrable.payArbitrationFeeByPartyA({
      from: partyA,
      value: arbitrationFee
    })
    //
    await appealableArbitrator.giveRuling(0, 1)
    increaseTime(1)
    await expectThrow(appealableArbitrator.giveRuling(0, 1))
  })

  it('Shouldnt be possible to pay less than appeal fee', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      centralizedArbitrator.address,
      arbitratorExtraData,
      timeOut,
      { from: appealable }
    )
    await appealableArbitrator.createDispute(choices, arbitratorExtraData, {
      value: arbitrationFee
    })
    await expectThrow(
      appealableArbitrator.appeal(0, arbitratorExtraData, {
        from: appealable,
        value: 20
      })
    )
    await appealableArbitrator.giveRuling(0, 1)
    await expectThrow(
      appealableArbitrator.appeal(0, arbitratorExtraData, {
        from: appealable,
        value: arbitrationFee - 1
      })
    )
  })

  it('Should set correct values after appeal is done', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      centralizedArbitrator.address,
      arbitratorExtraData,
      timeOut,
      { from: appealable }
    )
    // these disputes are created to differentiate dispute's indexes in arbitrator and arbitrable contracts
    // and to differentiate them from default uint mapping value
    await centralizedArbitrator.createDispute(choices, arbitratorExtraData, {
      value: arbitrationFee
    })
    await appealableArbitrator.createDispute(choices, arbitratorExtraData, {
      value: arbitrationFee
    })
    await appealableArbitrator.createDispute(choices, arbitratorExtraData, {
      value: arbitrationFee
    })
    await appealableArbitrator.createDispute(choices, arbitratorExtraData, {
      value: arbitrationFee
    })
    await appealableArbitrator.giveRuling(2, 1)
    await appealableArbitrator.appeal(2, arbitratorExtraData, {
      value: arbitrationFee
    })
    const appealDispute = await appealableArbitrator.appealDisputes(2)
    assert.equal(
      appealDispute[1],
      centralizedArbitrator.address,
      'Appeal has wrong arbitrator'
    )
    assert.equal(appealDispute[2].toNumber(), 1, 'Appeal has wrong ID')
    const appealDisputeIDsToDisputeIDs = await appealableArbitrator.appealDisputeIDsToDisputeIDs(
      1
    )
    assert.equal(
      appealDisputeIDsToDisputeIDs.toNumber(),
      2,
      'Dispute ID has incorrect appeal ID'
    )
    const dispute = await centralizedArbitrator.disputes(1)
    assert.equal(
      dispute[0],
      appealableArbitrator.address,
      'Arbitrable not set up properly'
    )
    assert.equal(dispute[1].toNumber(), 2, 'Choices not set up properly')
    assert.equal(dispute[2].toNumber(), 2, 'Fee not set up properly')
  })

  it('Should return correct appeal cost', async () => {
    var appealCost
    var appealCost2
    const centralizedArbitrator = await CentralizedArbitrator.new(3, {
      from: arbitrator
    })
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      centralizedArbitrator.address,
      arbitratorExtraData,
      timeOut,
      { from: appealable }
    )
    await appealableArbitrator.createDispute(choices, arbitratorExtraData, {
      value: arbitrationFee
    })
    appealCost = await appealableArbitrator.appealCost(0, arbitratorExtraData)
    assert.equal(
      appealCost.toNumber(),
      NOT_PAYABLE_VALUE,
      'Incorrect appeal cost for dispute before ruling'
    )
    await appealableArbitrator.giveRuling(0, 1)
    appealCost = await appealableArbitrator.appealCost(0, arbitratorExtraData)
    assert.equal(
      appealCost.toNumber(),
      3,
      'Incorrect appeal cost for dispute after ruling'
    )
    await appealableArbitrator.appeal(0, arbitratorExtraData, {
      from: appealable,
      value: 3
    })
    appealCost = await appealableArbitrator.appealCost(0, arbitratorExtraData)
    appealCost2 = await centralizedArbitrator.appealCost(
      0,
      arbitratorExtraData,
      { from: arbitrator }
    )
    assert.equal(
      appealCost.toNumber(),
      appealCost2.toNumber(),
      'Incorrect appeal cost after appeal was made'
    )
  })

  it('Should return correct status', async () => {
    var status
    var dispute
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      centralizedArbitrator.address,
      arbitratorExtraData,
      timeOut,
      { from: appealable }
    )
    await appealableArbitrator.createDispute(choices, arbitratorExtraData, {
      value: arbitrationFee
    })
    await appealableArbitrator.giveRuling(0, 1)
    dispute = await appealableArbitrator.disputes(0)
    status = await appealableArbitrator.disputeStatus(0)
    assert.equal(status.toNumber(), dispute[4].toNumber(), 'Incorrect status')
    await appealableArbitrator.appeal(0, arbitratorExtraData, {
      from: appealable,
      value: arbitrationFee
    })
    dispute = await centralizedArbitrator.disputes(0)
    status = await appealableArbitrator.disputeStatus(0)
    assert.equal(
      status.toNumber(),
      dispute[4].toNumber(),
      'Incorrect status after appeal'
    )
  })

  it('Shouldnt allow non-arbitrator to make final ruling after appeal', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      centralizedArbitrator.address,
      arbitratorExtraData,
      timeOut,
      { from: appealable }
    )
    const arbitrable = await TwoPartyArbitrable.new(
      appealableArbitrator.address,
      timeOut,
      partyB,
      2,
      arbitratorExtraData,
      '',
      { from: partyA }
    )
    await arbitrable.payArbitrationFeeByPartyB({
      from: partyB,
      value: arbitrationFee
    })
    await arbitrable.payArbitrationFeeByPartyA({
      from: partyA,
      value: arbitrationFee
    })
    await appealableArbitrator.giveRuling(0, 2)
    await appealableArbitrator.appeal(0, arbitratorExtraData, {
      from: appealable,
      value: arbitrationFee
    })
    await expectThrow(
      appealableArbitrator.giveRuling(0, 1, { from: appealable })
    )
    await expectThrow(appealableArbitrator.giveRuling(0, 1, { from: partyA }))
  })

  it('Should set correct values in disputes after final ruling after appeal', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      centralizedArbitrator.address,
      arbitratorExtraData,
      timeOut,
      { from: appealable }
    )
    const arbitrable = await TwoPartyArbitrable.new(
      appealableArbitrator.address,
      timeOut,
      partyB,
      2,
      arbitratorExtraData,
      '',
      { from: partyA }
    )
    await arbitrable.payArbitrationFeeByPartyB({
      from: partyB,
      value: arbitrationFee
    })
    await arbitrable.payArbitrationFeeByPartyA({
      from: partyA,
      value: arbitrationFee
    })
    await appealableArbitrator.giveRuling(0, 1)
    await appealableArbitrator.appeal(0, arbitratorExtraData, {
      from: appealable,
      value: arbitrationFee
    })
    centralizedArbitrator.giveRuling(0, 2, { from: arbitrator })
    const disputeAppeal = await appealableArbitrator.disputes(0)
    const disputeArbitrator = await centralizedArbitrator.disputes(0)
    assert.equal(
      disputeAppeal[3].toNumber(),
      disputeArbitrator[3].toNumber(),
      'Arbitrator and arbitrable contracts have different rulings'
    )
    assert.equal(
      disputeAppeal[4].toNumber(),
      2,
      'Incorrect status in arbitrable contract'
    )
    assert.equal(
      disputeArbitrator[4].toNumber(),
      2,
      'Incorrect status in arbitrator contract'
    )
  })

  it('Should get correct latest AppealID', async () => {
    var appealID
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      centralizedArbitrator.address,
      arbitratorExtraData,
      timeOut,
      { from: appealable }
    )

    const arbitrable = await AppealableArbitrator.new(
      arbitrationFee,
      appealableArbitrator.address,
      arbitratorExtraData,
      timeOut,
      { from: other }
    )
    // these disputes are created to differentiate dispute's indexes in arbitrator and arbitrable contracts
    // and to differentiate them from default uint mapping value
    await appealableArbitrator.createDispute(choices, arbitratorExtraData, {
      value: arbitrationFee
    })
    await arbitrable.createDispute(choices, arbitratorExtraData, {
      value: arbitrationFee
    })
    await arbitrable.createDispute(choices, arbitratorExtraData, {
      value: arbitrationFee
    })
    await arbitrable.createDispute(choices, arbitratorExtraData, {
      value: arbitrationFee
    })
    appealID = await arbitrable.getAppealDisputeID(2)
    assert.equal(
      appealID.toNumber(),
      2,
      'Incorrect appealID before appeal was made'
    )
    await arbitrable.giveRuling(2, 1, { from: other })
    await arbitrable.appeal(2, arbitratorExtraData, {
      from: other,
      value: arbitrationFee
    })
    appealID = await new Promise(resolve => {
      arbitrable
        .getAppealDisputeID(2)
        .then(result => {
          resolve(result)
        })
        .catch(function() {
          assert(false, 'getAppealDisputeID function shouldnt throw')
        })
    })
    assert.equal(
      appealID.toNumber(),
      1,
      'Incorrect appealID after appeal was made'
    )
  })
})
