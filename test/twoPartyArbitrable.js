/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const { expectThrow, increaseTime } = require('../helpers/utils')
const TwoPartyArbitrable = artifacts.require('./TwoPartyArbitrable.sol')
const CentralizedArbitrator = artifacts.require('./CentralizedArbitrator.sol')

contract('TwoPartyArbitrable', function (accounts) {
  const partyA = accounts[0]
  const partyB = accounts[1]
  const arbitrator = accounts[2]
  const other = accounts[3]
  const timeout = 100
  const arbitrationFee = 20
  const gasPrice = 5000000000
  const metaEvidenceUri = 'https://kleros.io'
  const amountOfChoices = 2


  // Constructor
  it('Should set the correct values', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x08575, metaEvidenceUri, {from: partyA})
    assert.equal(await arbitrable.timeout(), timeout)
    assert.equal(await arbitrable.partyA(), partyA)
    assert.equal(await arbitrable.partyB(), partyB)
    assert.equal(await arbitrable.arbitratorExtraData(), 0x08575)
  })

  // payArbitrationFeeByPartyA and payArbitrationFeeByPartyB
  it('Should create a dispute when A and B pay', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x08575, metaEvidenceUri, {from: partyA})
    await arbitrable.payArbitrationFeeByPartyA({from: partyA, value: arbitrationFee})
    await arbitrable.payArbitrationFeeByPartyB({from: partyB, value: arbitrationFee})
    const dispute = await centralizedArbitrator.disputes(0)
    assert.equal(dispute[0], arbitrable.address, 'Arbitrable not set up properly')
    assert.equal(dispute[1].toNumber(), 2, 'Number of choices not set up properly')
    assert.equal(dispute[2].toNumber(), 20, 'Fee not set up properly')
  })

  it('Should create a dispute when B and A pay', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x08575, metaEvidenceUri, {from: partyA})
    await arbitrable.payArbitrationFeeByPartyB({from: partyB, value: arbitrationFee})
    await arbitrable.payArbitrationFeeByPartyA({from: partyA, value: arbitrationFee})
    const dispute = await centralizedArbitrator.disputes(0)
    assert.equal(dispute[0], arbitrable.address, 'Arbitrable not set up properly')
    assert.equal(dispute[1].toNumber(), 2, 'Number of choices not set up properly')
    assert.equal(dispute[2].toNumber(), 20, 'Fee not set up properly')
  })

  it('Should not be possible to pay less', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x08575, metaEvidenceUri, {from: partyA})
    await expectThrow(arbitrable.payArbitrationFeeByPartyB({from: partyB, value: arbitrationFee - 1}))
    await expectThrow(arbitrable.payArbitrationFeeByPartyA({from: partyA, value: arbitrationFee - 1}))
    await arbitrable.payArbitrationFeeByPartyB({from: partyB, value: arbitrationFee})
    await expectThrow(arbitrable.payArbitrationFeeByPartyA({from: partyA, value: arbitrationFee - 1}))
    await arbitrable.payArbitrationFeeByPartyA({from: partyA, value: arbitrationFee})
  })

  // meta-evidence
  it('Should create MetaEvidence event on contract creation', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x0, metaEvidenceUri, {from: partyA})
    const metaEvidenceEvents = await new Promise((resolve, reject) => {
      arbitrable.MetaEvidence({}, {
          fromBlock: 0,
          toBlock: 'latest'
        })
        .get((error, result) => {
          if (error) reject()

          resolve(result)
        })
    })

    assert.equal(metaEvidenceEvents.length, 1, 'Meta Evidence event was not created')
    assert.equal(metaEvidenceEvents[0].args._evidence, metaEvidenceUri)
  })
  
  it('Should link MetaEvidence event on dispute creation', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x0, metaEvidenceUri, {from: partyA})
    const metaEvidenceEvents = await new Promise((resolve, reject) => {
      arbitrable.MetaEvidence({}, {
          fromBlock: 0,
          toBlock: 'latest'
        })
        .get((error, result) => {
          if (error) reject()

          resolve(result)
        })
    })
    assert.equal(metaEvidenceEvents.length, 1, 'Meta Evidence event was not created')
    const metaEvidenceId = metaEvidenceEvents[0].args._metaEvidenceID.toNumber()

    await arbitrable.payArbitrationFeeByPartyB({from: partyB, value: arbitrationFee})
    await arbitrable.payArbitrationFeeByPartyA({from: partyA, value: arbitrationFee})
    const dispute = await centralizedArbitrator.disputes(0)
    assert.equal(dispute[0], arbitrable.address, 'No dispute created')
    const metaEvidenceLinkEvents = await new Promise((resolve, reject) => {
      arbitrable.Dispute({}, {
          fromBlock: 0,
          toBlock: 'latest'
        })
        .get((error, result) => {
          if (error) reject()

          resolve(result)
        })
    })

    assert.equal(metaEvidenceLinkEvents.length, 1, 'Meta Evidence event was not created')
    assert.equal(metaEvidenceLinkEvents[0].args._arbitrator, centralizedArbitrator.address)
    assert.equal(metaEvidenceLinkEvents[0].args._disputeID.toNumber(), 0)
    assert.equal(metaEvidenceLinkEvents[0].args._metaEvidenceID.toNumber(), metaEvidenceId)
  })

  // timeOutByPartyA and timeOutByPartyB
  it('Should reimburse partyA in case of timeout of partyB', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x0, metaEvidenceUri, {from: partyA})
    await arbitrable.payArbitrationFeeByPartyA({from: partyA, value: arbitrationFee})
    increaseTime(timeout + 1)
    const partyABalanceBeforeReimbursment = web3.eth.getBalance(partyA)
    const tx = await arbitrable.timeOutByPartyA({from: partyA, gasPrice: gasPrice})
    const txFee = tx.receipt.gasUsed * gasPrice
    const newpartyABalance = web3.eth.getBalance(partyA)
    assert.equal(newpartyABalance.toString(), partyABalanceBeforeReimbursment.plus(20).minus(txFee).toString(), 'partyA has not been reimbursed correctly')
  })

  it("Shouldn't work before timeout for partyA", async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x0, metaEvidenceUri, {from: partyA})
    await expectThrow(arbitrable.timeOutByPartyA({from: partyA, gasPrice: gasPrice}))
    await arbitrable.payArbitrationFeeByPartyA({from: partyA, value: arbitrationFee})
    increaseTime(1)
    await expectThrow(arbitrable.timeOutByPartyA({from: partyA, gasPrice: gasPrice}))
  })

  it('Should reimburse partyB in case of timeout of partyA', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x0, metaEvidenceUri, {from: partyA})
    await arbitrable.payArbitrationFeeByPartyB({from: partyB, value: arbitrationFee})
    increaseTime(timeout + 1)
    const partyBBalanceBeforeReimbursment = web3.eth.getBalance(partyB)
    const tx = await arbitrable.timeOutByPartyB({from: partyB, gasPrice: gasPrice})
    const txFee = tx.receipt.gasUsed * gasPrice
    const newpartyBBalance = web3.eth.getBalance(partyB)
    assert.equal(newpartyBBalance.toString(), partyBBalanceBeforeReimbursment.plus(20).minus(txFee).toString(), 'partyB has not been reimbursed correctly')
  })

  it("Shouldn't work before timeout for partyB", async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x0, metaEvidenceUri, {from: partyA})
    await expectThrow(arbitrable.timeOutByPartyB({from: partyB, gasPrice: gasPrice}))
    await arbitrable.payArbitrationFeeByPartyB({from: partyB, value: arbitrationFee})
    increaseTime(1)
    await expectThrow(arbitrable.timeOutByPartyB({from: partyB, gasPrice: gasPrice}))
  })

  // submitEvidence
  it('Should create events when evidence is submitted by partyA', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x0, metaEvidenceUri, {from: partyA})
    await arbitrable.payArbitrationFeeByPartyA({from: partyA, value: arbitrationFee})
    await arbitrable.payArbitrationFeeByPartyB({from: partyB, value: arbitrationFee})
    const tx = await arbitrable.submitEvidence('ipfs:/X', {from: partyA})
    assert.equal(tx.logs[0].event, 'Evidence')
    assert.equal(tx.logs[0].args._arbitrator, centralizedArbitrator.address)
    assert.equal(tx.logs[0].args._party, partyA)
    assert.equal(tx.logs[0].args._evidence, 'ipfs:/X')
  })

  it('Should create events when evidence is submitted by partyB', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x0, metaEvidenceUri, {from: partyA})
    await arbitrable.payArbitrationFeeByPartyA({from: partyA, value: arbitrationFee})
    await arbitrable.payArbitrationFeeByPartyB({from: partyB, value: arbitrationFee})
    const tx = await arbitrable.submitEvidence('ipfs:/X', {from: partyB})
    assert.equal(tx.logs[0].event, 'Evidence')
    assert.equal(tx.logs[0].args._arbitrator, centralizedArbitrator.address)
    assert.equal(tx.logs[0].args._party, partyB)
    assert.equal(tx.logs[0].args._evidence, 'ipfs:/X')
  })

  it('Should fail if someone else tries to submit', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x0, metaEvidenceUri, {from: partyA})
    await arbitrable.payArbitrationFeeByPartyA({from: partyA, value: arbitrationFee})
    await arbitrable.payArbitrationFeeByPartyB({from: partyB, value: arbitrationFee})
    await expectThrow(arbitrable.submitEvidence('ipfs:/X', {from: other}))
  })

  // appeal
  // TODO: When we'll have a contract using appeal.

  // executeRuling
  it('Should reimburse the partyA (including arbitration fee) when the arbitrator decides so', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x0, metaEvidenceUri, {from: partyA})
    await arbitrable.payArbitrationFeeByPartyA({from: partyA, value: arbitrationFee})
    await arbitrable.payArbitrationFeeByPartyB({from: partyB, value: arbitrationFee})
    const partyABalanceBeforeReimbursment = web3.eth.getBalance(partyA)
    await centralizedArbitrator.giveRuling(0, 1, {from: arbitrator})
    const newPartyABalance = web3.eth.getBalance(partyA)
    assert.equal(newPartyABalance.toString(), partyABalanceBeforeReimbursment.plus(20).toString(), 'partyA has not been reimbursed correctly')
  })

  it('Should pay the partyB and reimburse him the arbitration fee when the arbitrator decides so', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x0, metaEvidenceUri, {from: partyA})
    await arbitrable.payArbitrationFeeByPartyA({from: partyA, value: arbitrationFee})
    await arbitrable.payArbitrationFeeByPartyB({from: partyB, value: arbitrationFee})
    const partyBBalanceBeforePay = web3.eth.getBalance(partyB)
    await centralizedArbitrator.giveRuling(0, 2, {from: arbitrator})
    const newPartyBBalance = web3.eth.getBalance(partyB)
    assert.equal(newPartyBBalance.toString(), partyBBalanceBeforePay.plus(20).toString(), 'partyB has not been reimbursed correctly')
  })

  it('It should do nothing if the arbitrator decides so', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {from: arbitrator})
    const arbitrable = await TwoPartyArbitrable.new(centralizedArbitrator.address, timeout, partyB, amountOfChoices, 0x0, metaEvidenceUri, {from: partyA})
    await arbitrable.payArbitrationFeeByPartyA({from: partyA, value: arbitrationFee})
    await arbitrable.payArbitrationFeeByPartyB({from: partyB, value: arbitrationFee})
    const partyBBalanceBeforePay = web3.eth.getBalance(partyB)
    const partyABalanceBeforeReimbursment = web3.eth.getBalance(partyA)
    await centralizedArbitrator.giveRuling(0, 0, {from: arbitrator})
    const newPartyBBalance = web3.eth.getBalance(partyB)
    const newPartyABalance = web3.eth.getBalance(partyA)
    assert.equal(newPartyBBalance.toString(), partyBBalanceBeforePay.toString(), "partyB got wei while it shouldn't")
    assert.equal(newPartyABalance.toString(), partyABalanceBeforeReimbursment.toString(), "partyA got wei while it shouldn't")
  })
})