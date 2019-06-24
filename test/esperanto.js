/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const Esperanto = artifacts.require('./Esperanto.sol')
const Arbitrator = artifacts.require(
  './standard/arbitration/EnhancedAppealableArbitrator.sol'
)

const randomInt = max => Math.ceil(Math.random() * max)

contract('Esperanto', function(accounts) {
  const governor = accounts[0]
  const requester = accounts[1]
  const translator = accounts[2]
  const challenger = accounts[3]
  const other = accounts[4]
  const arbitrationFee = 1e18
  const arbitratorExtraData = 0x85
  const appealTimeOut = 100
  const reviewTimeout = 2400
  const translationMultiplier = 1000
  const challengeMultiplier = 2000
  const sharedMultiplier = 5000
  const winnerMultiplier = 3000
  const loserMultiplier = 7000
  const NOT_PAYABLE_VALUE = (2 ** 256 - 2) / 2

  const taskMinPrice = 1e18
  const taskMaxPrice = 5e18
  const submissionTimeout = 3600
  let arbitrator
  let esperanto
  let MULTIPLIER_DIVISOR
  let taskTx
  let secondsPassed
  beforeEach('initialize the contract', async function() {
    arbitrator = await Arbitrator.new(
      arbitrationFee,
      governor,
      arbitratorExtraData,
      appealTimeOut,
      { from: governor }
    )

    await arbitrator.changeArbitrator(arbitrator.address)

    esperanto = await Esperanto.new(
      arbitrator.address,
      arbitratorExtraData,
      reviewTimeout,
      translationMultiplier,
      challengeMultiplier,
      sharedMultiplier,
      winnerMultiplier,
      loserMultiplier,
      { from: governor }
    )

    MULTIPLIER_DIVISOR = (await esperanto.MULTIPLIER_DIVISOR()).toNumber()
    taskTx = await esperanto.createTask(
      submissionTimeout,
      taskMinPrice,
      taskMaxPrice,
      'TestMetaEvidence',
      {
        from: requester,
        value: taskMaxPrice
      }
    )
    secondsPassed = randomInt(submissionTimeout)
    await increaseTime(secondsPassed)
  })

  it('Should set the correct values in constructor', async () => {
    assert.equal(await esperanto.arbitrator(), arbitrator.address)
    assert.equal(await esperanto.arbitratorExtraData(), arbitratorExtraData)
    assert.equal(await esperanto.reviewTimeout(), reviewTimeout)
    assert.equal(await esperanto.translationMultiplier(), translationMultiplier)
    assert.equal(await esperanto.challengeMultiplier(), challengeMultiplier)
    assert.equal(await esperanto.sharedStakeMultiplier(), sharedMultiplier)
    assert.equal(await esperanto.winnerStakeMultiplier(), winnerMultiplier)
    assert.equal(await esperanto.loserStakeMultiplier(), loserMultiplier)
  })

  it('Should set the correct values in newly created task and fire an event', async () => {
    const task = await esperanto.tasks(0)

    assert.equal(
      task[0].toNumber(),
      submissionTimeout,
      'The submissionTimeout is not set up properly'
    )
    assert.equal(
      task[1].toNumber(),
      taskMinPrice,
      'The min price is not set up properly'
    )
    assert.equal(
      task[2].toNumber(),
      taskMaxPrice,
      'The max price is not set up properly'
    )

    assert.equal(
      task[3].toNumber(),
      0,
      'The task status is not set up properly'
    )

    const taskInfo = await esperanto.getTaskInfo(0)

    assert.equal(
      taskInfo[0][0],
      requester,
      'The requester is not set up properly'
    )
    assert.equal(
      taskInfo[1][0].toNumber(),
      taskMaxPrice,
      'The requester deposit is not set up properly'
    )

    assert.equal(
      taskTx.logs[0].event,
      'MetaEvidence',
      'The event has not been created'
    )
    assert.equal(
      taskTx.logs[0].args._metaEvidenceID.toNumber(),
      0,
      'The event has wrong task ID'
    )
    assert.equal(
      taskTx.logs[0].args._evidence,
      'TestMetaEvidence',
      'The event has wrong meta-evidence string'
    )
  })

  it('Should not be possible to deposit less when creating a task', async () => {
    await expectThrow(
      esperanto.createTask(
        submissionTimeout,
        taskMinPrice,
        taskMaxPrice,
        'TestMetaEvidence',
        {
          from: requester,
          value: taskMaxPrice - 1000
        }
      )
    )
    // should throw when max price is less than min price
    await expectThrow(
      esperanto.createTask(
        submissionTimeout,
        taskMaxPrice,
        taskMinPrice,
        'TestMetaEvidence',
        {
          from: requester,
          value: taskMaxPrice
        }
      )
    )
  })

  it('Should return correct task price and assignment deposit value before submission timeout ended', async () => {
    const priceEsperanto = await esperanto.getTaskPrice(0, 0)
    let price = Math.floor(
      taskMinPrice +
        ((taskMaxPrice - taskMinPrice) * secondsPassed) / submissionTimeout
    )
    // an error up to 1% is allowed because of time fluctuation
    assert(
      Math.abs(priceEsperanto.toNumber() - price) <= price / 100,
      'Contract returns incorrect task price'
    )
    // for a required deposit we take a price that will be 20 blocks from now (300 seconds) to add a surplus to the deposit
    price = Math.floor(
      taskMinPrice +
        ((taskMaxPrice - taskMinPrice) * (secondsPassed + 300)) /
          submissionTimeout
    )
    const deposit =
      arbitrationFee + (translationMultiplier * price) / MULTIPLIER_DIVISOR
    const depositEsperanto = await esperanto.getSafeDepositValue(0)
    assert(
      Math.abs(depositEsperanto.toNumber() - deposit) <= deposit / 100,
      'Contract returns incorrect required deposit'
    )
  })

  it('Should return correct task price and assignment deposit value after submission timeout ended', async () => {
    await increaseTime(submissionTimeout + 1)
    const priceEsperanto = await esperanto.getTaskPrice(0, 0)
    assert.equal(
      priceEsperanto.toNumber(),
      0,
      'Contract returns incorrect task price after submission timeout ended'
    )
    const deposit = NOT_PAYABLE_VALUE
    const depositEsperanto = await esperanto.getSafeDepositValue(0)
    assert.equal(
      depositEsperanto.toNumber(),
      deposit,
      'Contract returns incorrect required deposit afer submission timeout ended'
    )
  })

  it('Should not be possible to pay less than minimum deposit value', async () => {
    const pureDeposit = (await esperanto.getMinimumDepositValue(0)).toNumber()
    // subtract small amount because minimum deposit will not always fail on its own
    await expectThrow(
      esperanto.assignTask(0, {
        from: translator,
        value: pureDeposit - 1000
      })
    )
  })

  it('Should reimburse requester leftover price after assigning the task and set correct values', async () => {
    const oldBalance = await web3.eth.getBalance(requester)

    const requiredDeposit = await esperanto.getSafeDepositValue(0)
    const pureDeposit = (await esperanto.getMinimumDepositValue(0)).toNumber()

    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })

    const newBalance = await web3.eth.getBalance(requester)
    const taskInfo = await esperanto.getTaskInfo(0)

    const price = await taskInfo[1][0].toNumber()
    const manualNewBalance = oldBalance.toNumber() + (taskMaxPrice - price)
    // an error up to 0.1% is allowed because of time fluctuation
    assert(
      Math.abs(newBalance.toNumber() - manualNewBalance) <=
        manualNewBalance / 1000,
      'The requester was not reimbursed correctly'
    )
    assert.equal(
      taskInfo[0][1],
      translator,
      'The translator was not set up properly'
    )
    // an error up to 1% is allowed because of time fluctuation
    assert(
      Math.abs(taskInfo[1][1].toNumber() - pureDeposit) <= pureDeposit / 100,
      'The translator deposit was not set up properly'
    )
  })
  it('Should not be possible to submit translation after submission timeout ended', async () => {
    const requiredDeposit = await esperanto.getSafeDepositValue(0)
    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await increaseTime(submissionTimeout - secondsPassed + 1)
    await expectThrow(
      esperanto.submitTranslation(0, 'ipfs:/X', {
        from: translator
      })
    )
  })
  it('Only an assigned translator should be allowed to submit translation to a task', async () => {
    const requiredDeposit = await esperanto.getSafeDepositValue(0)
    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await expectThrow(
      esperanto.submitTranslation(0, 'ipfs:/X', {
        from: other
      })
    )
  })
  it('Should fire an event after translation is submitted', async () => {
    const requiredDeposit = await esperanto.getSafeDepositValue(0)
    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    submissionTx = await esperanto.submitTranslation(0, 'ipfs:/X', {
      from: translator
    })
    assert.equal(
      submissionTx.logs[0].event,
      'TranslationSubmitted',
      'The event has not been created'
    )
    assert.equal(
      submissionTx.logs[0].args._taskID.toNumber(),
      0,
      'The event has wrong task ID'
    )
    assert.equal(
      submissionTx.logs[0].args._translator,
      translator,
      'The event has wrong translator address'
    )
    assert.equal(
      submissionTx.logs[0].args._translatedText,
      'ipfs:/X',
      'The event has wrong link to the translated text'
    )
  })
  it('Should reimburse requester if no one picked the task before submission timeout ended', async () => {
    await increaseTime(submissionTimeout + 1)
    const oldBalance = await web3.eth.getBalance(requester)
    await esperanto.reimburseRequester(0)
    const newBalance = await web3.eth.getBalance(requester)
    assert.equal(
      newBalance.toNumber(),
      oldBalance.toNumber() + taskMaxPrice,
      'The requester was not reimbursed correctly'
    )
  })
  it('Should reimburse requester if translator failed to submit translation before submission timeout ended', async () => {
    const requiredDeposit = await esperanto.getSafeDepositValue(0)
    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await increaseTime(submissionTimeout + 1)
    const oldBalance = await web3.eth.getBalance(requester)
    // task price + translator's deposit should go to requester
    const taskInfo = await esperanto.getTaskInfo(0)
    const dif = taskInfo[1][0].toNumber() + taskInfo[1][1].toNumber()
    await esperanto.reimburseRequester(0)
    const newBalance = await web3.eth.getBalance(requester)
    const manualNewBalance = oldBalance.toNumber() + dif
    // an error up to 0.1% is allowed because of time fluctuation
    assert(
      Math.abs(newBalance.toNumber() - manualNewBalance) <=
        manualNewBalance / 1000,
      'The requester was not reimbursed correctly'
    )
  })
  it('Should not be possible to reimburse if submission timeout has not passed', async () => {
    await increaseTime(submissionTimeout - secondsPassed - 1)
    await expectThrow(esperanto.reimburseRequester(0))
  })
  it('Should accept the translation and pay the translator if review timeout has passed without challenge', async () => {
    const requiredDeposit = await esperanto.getSafeDepositValue(0)
    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await esperanto.submitTranslation(0, 'ipfs:/X', { from: translator })
    await increaseTime(reviewTimeout + 1)
    const taskInfo = await esperanto.getTaskInfo(0)
    const dif = taskInfo[1][0].toNumber() + taskInfo[1][1].toNumber()
    const oldBalance = await web3.eth.getBalance(translator)
    await esperanto.acceptTranslation(0)
    const newBalance = await web3.eth.getBalance(translator)
    const manualNewBalance = oldBalance.toNumber() + dif
    // an error up to 0.1% is allowed because of time fluctuation
    assert(
      Math.abs(newBalance.toNumber() - manualNewBalance) <=
        manualNewBalance / 1000,
      'The translator was not paid correctly'
    )
  })
  it('Should not be possible to accept translation if review timeout has not passed or if it was challenged', async () => {
    const requiredDeposit = await esperanto.getSafeDepositValue(0)

    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await esperanto.submitTranslation(0, 'ipfs:/X', { from: translator })
    await expectThrow(esperanto.acceptTranslation(0))

    const taskInfo = await esperanto.getTaskInfo(0)
    const price = taskInfo[1][0].toNumber()
    // add an extra amount because of time fluctuation
    const challengerDeposit =
      arbitrationFee + (challengeMultiplier * price) / MULTIPLIER_DIVISOR + 1e17
    await esperanto.challengeTranslation(0, {
      from: challenger,
      value: challengerDeposit
    })
    await increaseTime(reviewTimeout + 1)
    await expectThrow(esperanto.acceptTranslation(0))
  })

  it('Should set correct values in contract and in despute after task has been challenged', async () => {
    let taskInfo
    const requiredDeposit = await esperanto.getSafeDepositValue(0)

    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await esperanto.submitTranslation(0, 'ipfs:/X', { from: translator })

    taskInfo = await esperanto.getTaskInfo(0)
    const price = taskInfo[1][0].toNumber()
    // add an extra amount because of time fluctuation
    const challengerDeposit =
      arbitrationFee + (challengeMultiplier * price) / MULTIPLIER_DIVISOR + 1e17
    await esperanto.challengeTranslation(0, {
      from: challenger,
      value: challengerDeposit
    })
    // get task info again because of updated values
    taskInfo = await esperanto.getTaskInfo(0)
    // fee is subtracted from challenger's deposit upon submission. Also subtract the surplus
    const pureChallengeDeposit = challengerDeposit - arbitrationFee - 1e17
    assert.equal(
      taskInfo[0][2],
      challenger,
      'The challenger was not set up properly'
    )
    // an error up to 1% is allowed because of time fluctuation
    assert(
      Math.abs(taskInfo[1][2].toNumber() - pureChallengeDeposit) <=
        pureChallengeDeposit / 100,
      'The challenger deposit was not set up properly'
    )

    const dispute = await arbitrator.disputes(0)
    assert.equal(
      dispute[0],
      esperanto.address,
      'Arbitrable not set up properly'
    )
    assert.equal(
      dispute[1].toNumber(),
      2,
      'Number of choices not set up properly'
    )
    assert.equal(
      dispute[2].toNumber(),
      1e18,
      'Arbitration fee not set up properly'
    )
  })
  it('Should not allow to challenge if review timeout has passed', async () => {
    const requiredDeposit = await esperanto.getSafeDepositValue(0)

    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await esperanto.submitTranslation(0, 'ipfs:/X', { from: translator })

    await increaseTime(reviewTimeout + 1)
    const taskInfo = await esperanto.getTaskInfo(0)
    const price = taskInfo[1][0].toNumber()
    // add an extra amount because of time fluctuation
    const challengerDeposit =
      arbitrationFee + (challengeMultiplier * price) / MULTIPLIER_DIVISOR + 1e17
    await expectThrow(
      esperanto.challengeTranslation(0, {
        from: challenger,
        value: challengerDeposit
      })
    )
  })

  it('Should paid to all parties correctly when arbitrator refused to rule', async () => {
    let taskInfo
    const requiredDeposit = await esperanto.getSafeDepositValue(0)

    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await esperanto.submitTranslation(0, 'ipfs:/X', { from: translator })

    taskInfo = await esperanto.getTaskInfo(0)
    const price = taskInfo[1][0].toNumber()
    // add an extra amount because of time fluctuation
    const challengerDeposit =
      arbitrationFee + (challengeMultiplier * price) / MULTIPLIER_DIVISOR + 1e17
    await esperanto.challengeTranslation(0, {
      from: challenger,
      value: challengerDeposit
    })

    const oldBalance1 = await web3.eth.getBalance(requester)
    const oldBalance2 = await web3.eth.getBalance(translator)
    const oldBalance3 = await web3.eth.getBalance(challenger)
    taskInfo = await esperanto.getTaskInfo(0)
    const manualNewBalance1 = taskInfo[1][0].toNumber() + oldBalance1.toNumber()
    const manualNewBalance2 = taskInfo[1][1].toNumber() + oldBalance2.toNumber()
    const manualNewBalance3 = taskInfo[1][2].toNumber() + oldBalance3.toNumber()

    await arbitrator.giveRuling(0, 0)
    await increaseTime(appealTimeOut + 1)
    await arbitrator.giveRuling(0, 0)

    const newBalance1 = await web3.eth.getBalance(requester)
    const newBalance2 = await web3.eth.getBalance(translator)
    const newBalance3 = await web3.eth.getBalance(challenger)
    // an error up to 0.1% is allowed because of time fluctuation
    assert(
      Math.abs(newBalance1.toNumber() - manualNewBalance1) <=
        manualNewBalance1 / 1000,
      'The requester was not paid correctly'
    )
    assert(
      Math.abs(newBalance2.toNumber() - manualNewBalance2) <=
        manualNewBalance2 / 1000,
      'The translator was not paid correctly'
    )
    assert(
      Math.abs(newBalance3.toNumber() - manualNewBalance3) <=
        manualNewBalance3 / 1000,
      'The challenger was not paid correctly'
    )

    const task = await esperanto.tasks(0)
    assert.equal(task[6].toNumber(), 0, 'The ruling of the task is incorrect')
  })

  it('Should paid to all parties correctly if translator wins', async () => {
    let taskInfo
    const requiredDeposit = await esperanto.getSafeDepositValue(0)

    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await esperanto.submitTranslation(0, 'ipfs:/X', { from: translator })

    taskInfo = await esperanto.getTaskInfo(0)
    const price = taskInfo[1][0].toNumber()
    // add an extra amount because of time fluctuation
    const challengerDeposit =
      arbitrationFee + (challengeMultiplier * price) / MULTIPLIER_DIVISOR + 1e17
    await esperanto.challengeTranslation(0, {
      from: challenger,
      value: challengerDeposit
    })

    const oldBalance1 = await web3.eth.getBalance(requester)
    const oldBalance2 = await web3.eth.getBalance(translator)
    const oldBalance3 = await web3.eth.getBalance(challenger)

    taskInfo = await esperanto.getTaskInfo(0)

    const manualNewBalance2 =
      taskInfo[1][0].toNumber() +
      taskInfo[1][1].toNumber() +
      taskInfo[1][2].toNumber() +
      oldBalance2.toNumber()

    await arbitrator.giveRuling(0, 1)
    await increaseTime(appealTimeOut + 1)
    await arbitrator.giveRuling(0, 1)

    const newBalance1 = await web3.eth.getBalance(requester)
    const newBalance2 = await web3.eth.getBalance(translator)
    const newBalance3 = await web3.eth.getBalance(challenger)
    assert.equal(
      newBalance1.toNumber(),
      oldBalance1.toNumber(),
      'Requester has incorrect balance'
    )
    // an error up to 0.1% is allowed because of time fluctuation
    assert(
      Math.abs(newBalance2.toNumber() - manualNewBalance2) <=
        manualNewBalance2 / 1000,
      'The translator was not paid correctly'
    )
    assert.equal(
      newBalance3.toNumber(),
      oldBalance3.toNumber(),
      'Challenger has incorrect balance'
    )

    const task = await esperanto.tasks(0)
    assert.equal(task[6].toNumber(), 1, 'The ruling of the task is incorrect')
  })

  it('Should paid to all parties correctly if challenger wins', async () => {
    let taskInfo
    const requiredDeposit = await esperanto.getSafeDepositValue(0)

    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await esperanto.submitTranslation(0, 'ipfs:/X', { from: translator })

    taskInfo = await esperanto.getTaskInfo(0)
    const price = taskInfo[1][0].toNumber()
    // add an extra amount because of time fluctuation
    const challengerDeposit =
      arbitrationFee + (challengeMultiplier * price) / MULTIPLIER_DIVISOR + 1e17
    await esperanto.challengeTranslation(0, {
      from: challenger,
      value: challengerDeposit
    })

    const oldBalance1 = await web3.eth.getBalance(requester)
    const oldBalance2 = await web3.eth.getBalance(translator)
    const oldBalance3 = await web3.eth.getBalance(challenger)

    taskInfo = await esperanto.getTaskInfo(0)
    const manualNewBalance1 = taskInfo[1][0].toNumber() + oldBalance1.toNumber()
    const manualNewBalance3 =
      taskInfo[1][1].toNumber() +
      taskInfo[1][2].toNumber() +
      oldBalance3.toNumber()

    await arbitrator.giveRuling(0, 2)
    await increaseTime(appealTimeOut + 1)
    await arbitrator.giveRuling(0, 2)

    const newBalance1 = await web3.eth.getBalance(requester)
    const newBalance2 = await web3.eth.getBalance(translator)
    const newBalance3 = await web3.eth.getBalance(challenger)

    // an error up to 0.1% is allowed because of time fluctuation
    assert(
      Math.abs(newBalance1.toNumber() - manualNewBalance1) <=
        manualNewBalance1 / 1000,
      'The requester was not paid correctly'
    )
    assert.equal(
      newBalance2.toNumber(),
      oldBalance2.toNumber(),
      'Translator has incorrect balance'
    )
    assert(
      Math.abs(newBalance3.toNumber() - manualNewBalance3) <=
        manualNewBalance3 / 1000,
      'The challenger was not paid correctly'
    )

    const task = await esperanto.tasks(0)
    assert.equal(task[6].toNumber(), 2, 'The ruling of the task is incorrect')
  })

  it('Should demand correct appeal fees and register that appeal fee has been paid', async () => {
    let roundInfo
    const requiredDeposit = await esperanto.getSafeDepositValue(0)

    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await esperanto.submitTranslation(0, 'ipfs:/X', { from: translator })

    const taskInfo = await esperanto.getTaskInfo(0)
    const price = taskInfo[1][0].toNumber()
    // add an extra amount because of time fluctuation
    const challengerDeposit =
      arbitrationFee + (challengeMultiplier * price) / MULTIPLIER_DIVISOR + 1e17
    await esperanto.challengeTranslation(0, {
      from: challenger,
      value: challengerDeposit
    })
    // in  that case translator is loser and challenger is winner
    await arbitrator.giveRuling(0, 2)
    // appeal fee is the same as arbitration fee for this arbitrator
    const loserAppealFee =
      arbitrationFee + (arbitrationFee * loserMultiplier) / MULTIPLIER_DIVISOR

    await esperanto.fundAppeal(0, 1, {
      from: translator,
      value: 3e18 // Deliberately overpay to check that only required fee amount will be registered.
    })

    roundInfo = await esperanto.getRoundInfo(0, 0)

    assert.equal(
      roundInfo[0][0].toNumber(),
      0,
      'Should not register any payments for requester'
    )
    assert.equal(
      roundInfo[1][0],
      false,
      'Should not register that requester successfully paid fees'
    )

    assert.equal(
      roundInfo[0][1].toNumber(),
      loserAppealFee,
      'Registered fee of translator is incorrect'
    )
    assert.equal(
      roundInfo[1][1],
      true,
      'Did not register that translator successfully paid his fees'
    )

    assert.equal(
      roundInfo[0][2].toNumber(),
      0,
      'Should not register any payments for challenger'
    )
    assert.equal(
      roundInfo[1][2],
      false,
      'Should not register that challenger successfully paid fees'
    )

    // Check that it's not possible to fund appeal after funding has been registered.
    await expectThrow(
      esperanto.fundAppeal(0, 1, { from: translator, value: loserAppealFee })
    )

    const winnerAppealFee =
      arbitrationFee + (arbitrationFee * winnerMultiplier) / MULTIPLIER_DIVISOR

    // increase time to make sure winner can pay in 2nd half
    await increaseTime(appealTimeOut / 2 + 1)
    await esperanto.fundAppeal(0, 2, {
      from: challenger,
      value: 3e18 // Deliberately overpay to check that only required fee amount will be registered.
    })

    roundInfo = await esperanto.getRoundInfo(0, 0)

    assert.equal(
      roundInfo[0][2].toNumber(),
      winnerAppealFee,
      'Registered fee of challenger is incorrect'
    )
    assert.equal(
      roundInfo[1][2],
      true,
      'Did not register that challenger successfully paid his fees'
    )

    assert.equal(
      roundInfo[2].toNumber(),
      winnerAppealFee + loserAppealFee - arbitrationFee,
      'Incorrect fee rewards value'
    )
    assert.equal(
      roundInfo[3].toNumber(),
      winnerAppealFee + loserAppealFee,
      'Incorrect successfully paid fees value'
    )

    // If both sides pay their fees it starts new appeal round. Check that both sides have their value set to default.
    roundInfo = await esperanto.getRoundInfo(0, 1)
    assert.equal(
      roundInfo[1][1],
      false,
      'Appeal fee payment for translator should not be registered'
    )
    assert.equal(
      roundInfo[1][2],
      false,
      'Appeal fee payment for challenger should not be registered'
    )
  })

  it('Should not be possible for loser to fund appeal if first half of appeal period has passed', async () => {
    const requiredDeposit = await esperanto.getSafeDepositValue(0)

    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await esperanto.submitTranslation(0, 'ipfs:/X', { from: translator })

    const taskInfo = await esperanto.getTaskInfo(0)
    const price = taskInfo[1][0].toNumber()
    // add an extra amount because of time fluctuation
    const challengerDeposit =
      arbitrationFee + (challengeMultiplier * price) / MULTIPLIER_DIVISOR + 1e17
    await esperanto.challengeTranslation(0, {
      from: challenger,
      value: challengerDeposit
    })
    await arbitrator.giveRuling(0, 1)
    const loserAppealFee =
      arbitrationFee + (arbitrationFee * loserMultiplier) / MULTIPLIER_DIVISOR
    await increaseTime(appealTimeOut / 2 + 1)
    await expectThrow(
      esperanto.fundAppeal(0, 2, { from: challenger, value: loserAppealFee })
    )
  })

  it('Should not be possible for winner to fund appeal if appeal period has passed', async () => {
    const requiredDeposit = await esperanto.getSafeDepositValue(0)

    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await esperanto.submitTranslation(0, 'ipfs:/X', { from: translator })

    const taskInfo = await esperanto.getTaskInfo(0)
    const price = taskInfo[1][0].toNumber()
    // add an extra amount because of time fluctuation
    const challengerDeposit =
      arbitrationFee + (challengeMultiplier * price) / MULTIPLIER_DIVISOR + 1e17
    await esperanto.challengeTranslation(0, {
      from: challenger,
      value: challengerDeposit
    })
    await arbitrator.giveRuling(0, 1)

    const winnerAppealFee =
      arbitrationFee + (arbitrationFee * winnerMultiplier) / MULTIPLIER_DIVISOR
    await increaseTime(appealTimeOut + 1)
    await expectThrow(
      esperanto.fundAppeal(0, 1, { from: translator, value: winnerAppealFee })
    )
  })

  it('Should change the ruling if loser paid appeal fee while winner did not', async () => {
    let taskInfo
    const requiredDeposit = await esperanto.getSafeDepositValue(0)

    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await esperanto.submitTranslation(0, 'ipfs:/X', { from: translator })

    taskInfo = await esperanto.getTaskInfo(0)
    const price = taskInfo[1][0].toNumber()
    // add an extra amount because of time fluctuation
    const challengerDeposit =
      arbitrationFee + (challengeMultiplier * price) / MULTIPLIER_DIVISOR + 1e17
    await esperanto.challengeTranslation(0, {
      from: challenger,
      value: challengerDeposit
    })
    await arbitrator.giveRuling(0, 2)

    const loserAppealFee =
      arbitrationFee + (arbitrationFee * loserMultiplier) / MULTIPLIER_DIVISOR
    await esperanto.fundAppeal(0, 1, {
      from: translator,
      value: loserAppealFee
    })
    await increaseTime(appealTimeOut + 1)

    const oldBalance1 = await web3.eth.getBalance(requester)
    const oldBalance2 = await web3.eth.getBalance(translator)
    const oldBalance3 = await web3.eth.getBalance(challenger)

    taskInfo = await esperanto.getTaskInfo(0)
    // translator's balance should increase while other's stay the same despite ruling being in favor of challenger
    const manualNewBalance2 =
      taskInfo[1][0].toNumber() +
      taskInfo[1][1].toNumber() +
      taskInfo[1][2].toNumber() +
      oldBalance2.toNumber()

    await arbitrator.giveRuling(0, 2)

    const newBalance1 = await web3.eth.getBalance(requester)
    const newBalance2 = await web3.eth.getBalance(translator)
    const newBalance3 = await web3.eth.getBalance(challenger)
    assert.equal(
      newBalance1.toNumber(),
      oldBalance1.toNumber(),
      'Requester has incorrect balance'
    )
    // an error up to 0.1% is allowed because of time fluctuation
    assert(
      Math.abs(newBalance2.toNumber() - manualNewBalance2) <=
        manualNewBalance2 / 1000,
      'The translator was not paid correctly'
    )
    assert.equal(
      newBalance3.toNumber(),
      oldBalance3.toNumber(),
      'Challenger has incorrect balance'
    )

    const task = await esperanto.tasks(0)
    assert.equal(task[6].toNumber(), 1, 'The ruling of the task is incorrect')
  })

  it('Should withdraw correct fees if dispute had winner/loser', async () => {
    const requiredDeposit = await esperanto.getSafeDepositValue(0)

    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await esperanto.submitTranslation(0, 'ipfs:/X', { from: translator })

    const taskInfo = await esperanto.getTaskInfo(0)
    const price = taskInfo[1][0].toNumber()

    const challengerDeposit =
      arbitrationFee + (challengeMultiplier * price) / MULTIPLIER_DIVISOR + 1e17
    await esperanto.challengeTranslation(0, {
      from: challenger,
      value: challengerDeposit
    })

    await arbitrator.giveRuling(0, 2)

    const loserAppealFee =
      arbitrationFee + (arbitrationFee * loserMultiplier) / MULTIPLIER_DIVISOR

    await esperanto.fundAppeal(0, 1, {
      from: other,
      value: loserAppealFee * 0.75
    })

    await esperanto.fundAppeal(0, 1, {
      from: translator,
      value: 2e18
    })

    const winnerAppealFee =
      arbitrationFee + (arbitrationFee * winnerMultiplier) / MULTIPLIER_DIVISOR

    await esperanto.fundAppeal(0, 2, {
      from: other,
      value: 0.2 * winnerAppealFee
    })

    await esperanto.fundAppeal(0, 2, {
      from: challenger,
      value: winnerAppealFee
    })

    const roundInfo = await esperanto.getRoundInfo(0, 0)

    await arbitrator.giveRuling(1, 2)

    await esperanto.fundAppeal(0, 1, {
      from: translator,
      value: 1e17 // Deliberately underpay to check that in can be reimbursed later.
    })

    await increaseTime(appealTimeOut + 1)
    await arbitrator.giveRuling(1, 2)

    const oldBalance1 = await web3.eth.getBalance(translator)
    await esperanto.withdrawFeesAndRewards(translator, 0, 0, {
      from: governor
    })
    let newBalance1 = await web3.eth.getBalance(translator)
    assert.equal(
      newBalance1.toString(),
      oldBalance1.toString(),
      'Translator balance should stay the same after withdrawing from 0 round'
    )
    await esperanto.withdrawFeesAndRewards(translator, 0, 1, {
      from: governor
    })
    newBalance1 = await web3.eth.getBalance(translator)
    assert.equal(
      newBalance1.toString(),
      oldBalance1.plus(1e17).toString(),
      'Translator should be reimbursed unsuccessful payment'
    )

    const oldBalance2 = await web3.eth.getBalance(challenger)
    await esperanto.withdrawFeesAndRewards(challenger, 0, 0, {
      from: governor
    })
    const newBalance2 = await web3.eth.getBalance(challenger)
    assert.equal(
      newBalance2.toString(),
      oldBalance2.plus(0.8 * roundInfo[2]).toString(),
      'Incorrect balance of the challenger after withdrawing'
    )

    const oldBalance3 = await web3.eth.getBalance(other)
    await esperanto.withdrawFeesAndRewards(other, 0, 0, {
      from: governor
    })
    const newBalance3 = await web3.eth.getBalance(other)
    assert.equal(
      newBalance3.toString(),
      oldBalance3.plus(0.2 * roundInfo[2]).toString(),
      'Incorrect balance of the crowdfunder after withdrawing'
    )
  })

  it('Should withdraw correct fees if arbitrator refused to arbitrate', async () => {
    const requiredDeposit = await esperanto.getSafeDepositValue(0)

    await esperanto.assignTask(0, {
      from: translator,
      value: requiredDeposit.toNumber()
    })
    await esperanto.submitTranslation(0, 'ipfs:/X', { from: translator })

    const taskInfo = await esperanto.getTaskInfo(0)
    const price = taskInfo[1][0].toNumber()

    const challengerDeposit =
      arbitrationFee + (challengeMultiplier * price) / MULTIPLIER_DIVISOR + 1e17
    await esperanto.challengeTranslation(0, {
      from: challenger,
      value: challengerDeposit
    })

    await arbitrator.giveRuling(0, 0)

    const sharedAppealFee =
      arbitrationFee + (arbitrationFee * sharedMultiplier) / MULTIPLIER_DIVISOR

    await esperanto.fundAppeal(0, 1, {
      from: other,
      value: 0.4 * sharedAppealFee
    })

    await esperanto.fundAppeal(0, 1, {
      from: translator,
      value: 2e18
    })

    await esperanto.fundAppeal(0, 2, {
      from: other,
      value: 0.2 * sharedAppealFee
    })

    await esperanto.fundAppeal(0, 2, {
      from: challenger,
      value: sharedAppealFee
    })

    const roundInfo = await esperanto.getRoundInfo(0, 0)

    await arbitrator.giveRuling(1, 0)
    await increaseTime(appealTimeOut + 1)
    await arbitrator.giveRuling(1, 0)

    const oldBalance1 = await web3.eth.getBalance(translator)
    await esperanto.withdrawFeesAndRewards(translator, 0, 0, {
      from: governor
    })
    const newBalance1 = await web3.eth.getBalance(translator)
    assert.equal(
      newBalance1.toString(),
      oldBalance1.plus(0.3 * roundInfo[2]).toString(),
      'Incorrect translator balance after withdrawing'
    )

    const oldBalance2 = await web3.eth.getBalance(challenger)
    await esperanto.withdrawFeesAndRewards(challenger, 0, 0, {
      from: governor
    })
    const newBalance2 = await web3.eth.getBalance(challenger)
    assert.equal(
      newBalance2.toString(),
      oldBalance2.plus(0.4 * roundInfo[2]).toString(),
      'Incorrect balance of the challenger after withdrawing'
    )

    const oldBalance3 = await web3.eth.getBalance(other)
    await esperanto.withdrawFeesAndRewards(other, 0, 0, {
      from: governor
    })
    const newBalance3 = await web3.eth.getBalance(other)
    assert.equal(
      newBalance3.toString(),
      oldBalance3.plus(0.3 * roundInfo[2]).toString(),
      'Incorrect balance of the crowdfunder after withdrawing'
    )
  })
})
