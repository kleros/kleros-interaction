/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')
const { latestTime } = require('openzeppelin-solidity/test/helpers/latestTime')

const Linguo = artifacts.require('./LinguoToken.sol')
const Arbitrator = artifacts.require(
  './standard/arbitration/EnhancedAppealableArbitrator.sol'
)

const ERC20Mock = artifacts.require('./ERC20Mock.sol')

const randomInt = max => Math.ceil(Math.random() * max)

contract('Linguo', function(accounts) {
  const governor = accounts[0]
  const requester = accounts[1]
  const translator = accounts[2]
  const challenger = accounts[3]
  const other = accounts[4]
  const arbitrationFee = 1000
  const arbitratorExtraData = 0x85
  const appealTimeOut = 100
  const reviewTimeout = 2400
  const translatorBaseDeposit = 3000
  const challengerBaseDeposit = 2000
  const sharedMultiplier = 5000
  const winnerMultiplier = 3000
  const loserMultiplier = 7000
  const NOT_PAYABLE_VALUE = (2 ** 256 - 2) / 2
  const tokenBalance = 100000000

  const taskMinPrice = 5000
  const taskMaxPrice = 10000
  const submissionTimeout = 3600
  let arbitrator
  let linguo
  let MULTIPLIER_DIVISOR
  let taskTx
  let currentTime
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

    linguo = await Linguo.new(
      arbitrator.address,
      arbitratorExtraData,
      reviewTimeout,
      translatorBaseDeposit,
      challengerBaseDeposit,
      sharedMultiplier,
      winnerMultiplier,
      loserMultiplier,
      { from: governor }
    )

    token = await ERC20Mock.new(requester, tokenBalance, { from: governor })
    await token.approve(linguo.address, 50000000, {
      from: requester
    })

    MULTIPLIER_DIVISOR = (await linguo.MULTIPLIER_DIVISOR()).toNumber()
    currentTime = await latestTime()
    taskTx = await linguo.createTask(
      currentTime + submissionTimeout,
      token.address,
      taskMinPrice,
      taskMaxPrice,
      'TestMetaEvidence',
      {
        from: requester
      }
    )
    // Because of time fluctuation the timeout stored in the contract can deviate a little from the variable value.
    // So subtract small amount to prevent the time increase going out of timeout range.
    secondsPassed = randomInt(submissionTimeout - 5)
    await increaseTime(secondsPassed)
  })

  it('Should set the correct values in constructor', async () => {
    assert.equal(await linguo.arbitrator(), arbitrator.address)
    assert.equal(await linguo.arbitratorExtraData(), arbitratorExtraData)
    assert.equal(await linguo.governor(), governor)
    assert.equal(await linguo.reviewTimeout(), reviewTimeout)
    assert.equal(await linguo.translatorBaseDeposit(), translatorBaseDeposit)
    assert.equal(await linguo.challengerBaseDeposit(), challengerBaseDeposit)
    assert.equal(await linguo.sharedStakeMultiplier(), sharedMultiplier)
    assert.equal(await linguo.winnerStakeMultiplier(), winnerMultiplier)
    assert.equal(await linguo.loserStakeMultiplier(), loserMultiplier)
  })

  it('Should set the correct values in a newly created task and fire an event', async () => {
    const task = await linguo.tasks(0)
    assert.equal(
      task[0],
      token.address,
      'The token address is not set up properly'
    )

    // An error up to 0.1% is allowed because of time fluctuation
    assert(
      Math.abs(submissionTimeout - task[1].toNumber()) <=
        submissionTimeout / 1000,
      'The submissionTimeout is not set up properly'
    )
    assert.equal(
      task[2].toNumber(),
      taskMinPrice,
      'The min price is not set up properly'
    )
    assert.equal(
      task[3].toNumber(),
      taskMaxPrice,
      'The max price is not set up properly'
    )
    assert.equal(
      task[4].toNumber(),
      0,
      'The task status is not set up properly'
    )
    assert.equal(task[6], requester, 'The requester is not set up properly')
    assert.equal(
      task[7].toNumber(),
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

    assert.equal(
      taskTx.logs[1].event,
      'TaskCreated',
      'The second event has not been created'
    )
    assert.equal(
      taskTx.logs[1].args._taskID.toNumber(),
      0,
      'The second event has wrong task ID'
    )
    assert.equal(
      taskTx.logs[1].args._requester,
      requester,
      'The second event has wrong requester address'
    )
    assert.equal(
      taskTx.logs[1].args._token,
      token.address,
      'The second event has wrong token address'
    )
  })

  it('Should not be possible to deposit less than min price when creating a task', async () => {
    currentTime = await latestTime()
    // Invert max and min price to make sure it throws when less than min price is deposited.
    await expectThrow(
      linguo.createTask(
        currentTime + submissionTimeout,
        token.address,
        taskMaxPrice,
        taskMinPrice,
        'TestMetaEvidence',
        {
          from: requester
        }
      )
    )

    // Also check the require for the deadline.
    await expectThrow(
      linguo.createTask(
        currentTime - 5,
        token.address,
        taskMinPrice,
        taskMaxPrice,
        'TestMetaEvidence',
        {
          from: requester
        }
      )
    )
  })

  it('Should return correct task price and assignment deposit value before submission timeout ended', async () => {
    const priceLinguo = await linguo.getTaskPrice(0)
    const price = Math.floor(
      taskMinPrice +
        ((taskMaxPrice - taskMinPrice) * secondsPassed) / submissionTimeout
    )
    // an error up to 1% is allowed because of time fluctuation
    assert(
      Math.abs(priceLinguo.toNumber() - price) <= price / 100,
      'Contract returns incorrect task price'
    )

    assert.equal(
      (await linguo.getDepositValue(0)).toNumber(),
      4000, // Arbitration fee + translation base deposit (1000 + 3000).
      'Contract returns incorrect translator deposit'
    )
  })

  it('Should return correct task price and assignment deposit value after submission timeout ended', async () => {
    await increaseTime(submissionTimeout + 1)
    const priceLinguo = await linguo.getTaskPrice(0)
    assert.equal(
      priceLinguo.toNumber(),
      0,
      'Contract returns incorrect task price after submission timeout ended'
    )
    const deposit = NOT_PAYABLE_VALUE
    const depositLinguo = await linguo.getDepositValue(0)
    assert.equal(
      depositLinguo.toNumber(),
      deposit,
      'Contract returns incorrect required deposit after submission timeout ended'
    )
  })

  it('Should return correct task price and assignment deposit when status is not `created`', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()
    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })

    const expectedTaskPrice = 0
    const actualTaskPrice = await linguo.getTaskPrice(0)
    assert.equal(
      actualTaskPrice.toNumber(),
      expectedTaskPrice,
      'Contract returns incorrect task price if status is not `created`'
    )

    const expectedDeposit = NOT_PAYABLE_VALUE
    const actualDeposit = await linguo.getDepositValue(0)
    assert.equal(
      actualDeposit.toNumber(),
      expectedDeposit,
      'Contract returns incorrect required deposit if status is not `created`'
    )
  })

  it('Should not be possible to pay less than required deposit value', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()
    await expectThrow(
      linguo.assignTask(0, {
        from: translator,
        value: requiredDeposit - 1
      })
    )
  })

  it('Should emit TaskAssigned event after assigning to the task', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()
    const assignTx = await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })

    assert.equal(
      assignTx.logs[0].event,
      'TaskAssigned',
      'The TaskAssigned event was not emitted'
    )
  })

  it('Should reimburse requester leftover token price after assigning the task and should set correct values', async () => {
    const oldBalance = await token.balanceOf(requester)

    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()

    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })

    const newBalance = await token.balanceOf(requester)
    const taskInfo = await linguo.getTaskParties(0)
    const task = await linguo.tasks(0)
    assert.equal(
      newBalance.toNumber(),
      oldBalance.toNumber() + taskMaxPrice - task[7].toNumber(),
      'The requester was not reimbursed correctly'
    )
    assert.equal(
      taskInfo[1],
      translator,
      'The translator was not set up properly'
    )
    assert.equal(
      task[8].toNumber(),
      4000,
      'Translator deposit was not set up correctly'
    )
  })

  it('Should not be possible to submit translation after submission timeout ended', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()
    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })
    await increaseTime(submissionTimeout - secondsPassed + 1)
    await expectThrow(
      linguo.submitTranslation(0, 'ipfs:/X', {
        from: translator
      })
    )
  })

  it('Only an assigned translator should be allowed to submit translation to a task', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()
    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })
    await expectThrow(
      linguo.submitTranslation(0, 'ipfs:/X', {
        from: other
      })
    )
  })

  it('Should fire an event after translation is submitted', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()
    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })
    submissionTx = await linguo.submitTranslation(0, 'ipfs:/X', {
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
    const reimburseTx = await linguo.reimburseRequester(0)
    const newTokenBalance = await token.balanceOf(requester)

    assert.equal(
      reimburseTx.logs[0].event,
      'TaskResolved',
      'TaskResolved event was not emitted'
    )
    assert.equal(
      newTokenBalance,
      tokenBalance,
      'The requester should have an initial token balance'
    )
    const task = await linguo.tasks(0)
    assert.equal(task[7].toNumber(), 0, 'The price should be set to 0')
    assert.equal(task[8].toNumber(), 0, 'Sum deposit should be set to 0')
  })

  it('Should reimburse requester if translator failed to submit translation before submission timeout ended', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()
    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })
    await increaseTime(submissionTimeout + 1)
    const oldBalance = await web3.eth.getBalance(requester)
    const oldTokenBalance = await token.balanceOf(requester)
    let task = await linguo.tasks(0)
    await linguo.reimburseRequester(0)

    const newBalance = await web3.eth.getBalance(requester)
    const newTokenBalance = await token.balanceOf(requester)
    assert.equal(
      newBalance.toString(),
      oldBalance.plus(requiredDeposit).toString(),
      'The requester was not reimbursed correctly'
    )
    assert.equal(
      newTokenBalance.toNumber(),
      oldTokenBalance.toNumber() + task[7].toNumber(), // This sum should give an initial balance value.
      'The requester should have an initial token balance'
    )

    task = await linguo.tasks(0)
    assert.equal(task[7].toNumber(), 0, 'The price should be set to 0')
    assert.equal(task[8].toNumber(), 0, 'Sum deposit should be set to 0')
  })

  it('Should not be possible to reimburse if submission timeout has not passed', async () => {
    await increaseTime(submissionTimeout - secondsPassed - 1)
    await expectThrow(linguo.reimburseRequester(0))
  })

  it('Should accept the translation and pay the translator if review timeout has passed without challenge', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()
    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })
    await linguo.submitTranslation(0, 'ipfs:/X', { from: translator })
    await increaseTime(reviewTimeout + 1)
    let task = await linguo.tasks(0)

    const oldBalance = await web3.eth.getBalance(translator)
    const acceptTx = await linguo.acceptTranslation(0)
    const newBalance = await web3.eth.getBalance(translator)
    const newTokenBalance = await token.balanceOf(translator)

    assert.equal(
      acceptTx.logs[0].event,
      'TaskResolved',
      'TaskResolved event was not emitted'
    )

    assert.equal(
      newBalance.toString(),
      oldBalance
        .plus(4000) // Translator deposit
        .toString(),
      'The translator did not get his deposit back'
    )
    assert.equal(
      newTokenBalance.toNumber(),
      task[7].toNumber(), // Translator's initial token balance was 0, so now it should be equal to the task price.
      'The translator was not paid correctly'
    )
    task = await linguo.tasks(0)
    assert.equal(task[7].toNumber(), 0, 'The price should be set to 0')
    assert.equal(task[8].toNumber(), 0, 'Sum deposit should be set to 0')
  })

  it('Should not be possible to accept translation if review timeout has not passed or if it was challenged', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()

    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })
    await linguo.submitTranslation(0, 'ipfs:/X', { from: translator })
    await expectThrow(linguo.acceptTranslation(0))

    const challengerDeposit = (await linguo.getChallengeValue(0)).toNumber()
    await linguo.challengeTranslation(0, '', {
      from: challenger,
      value: challengerDeposit
    })
    await increaseTime(reviewTimeout + 1)
    await expectThrow(linguo.acceptTranslation(0))
  })

  it('Should set correct values in contract and in dispute and emit TranslationChallenged event after task has been challenged', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()

    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })
    await linguo.submitTranslation(0, 'ipfs:/X', { from: translator })

    const challengerDeposit = (await linguo.getChallengeValue(0)).toNumber()

    // Check that reverts if the deposit is lower than expected
    await expectThrow(
      linguo.challengeTranslation(0, 'ChallengeEvidence:/X', {
        from: challenger,
        value: challengerDeposit - 1
      })
    )
    const challengeTx = await linguo.challengeTranslation(
      0,
      'ChallengeEvidence',
      {
        from: challenger,
        value: challengerDeposit
      }
    )

    assert.equal(
      challengeTx.logs[1].event,
      'TranslationChallenged',
      'TranslationChallenged event was not emitted'
    )

    assert.equal(
      challengeTx.logs[2].event,
      'Evidence',
      'Evidence event was not emitted'
    )

    assert.equal(
      challengeTx.logs[2].args._arbitrator,
      arbitrator.address,
      'The Evidence event has wrong arbitrator'
    )

    assert.equal(
      challengeTx.logs[2].args._evidenceGroupID.toNumber(),
      0,
      'The Evidence event has wrong evidenceGroupID'
    )

    assert.equal(
      challengeTx.logs[2].args._party,
      challenger,
      'The Evidence event has wrong party address'
    )

    assert.equal(
      challengeTx.logs[2].args._evidence,
      'ChallengeEvidence',
      'The Evidence event has wrong evidence string'
    )

    const task = await linguo.tasks(0)
    const taskInfo = await linguo.getTaskParties(0)
    assert.equal(
      taskInfo[2],
      challenger,
      'The challenger was not set up properly'
    )

    assert.equal(
      task[8].toNumber(),
      6000, // Translator deposit + challenger deposit - arbitration fees: 4000 + 3000 - 1000
      'The sum of translator and challenger deposits was not set up properly'
    )

    const dispute = await arbitrator.disputes(0)
    assert.equal(dispute[0], linguo.address, 'Arbitrable not set up properly')
    assert.equal(
      dispute[1].toNumber(),
      2,
      'Number of choices not set up properly'
    )
    assert.equal(
      dispute[2].toNumber(),
      1000,
      'Arbitration fee not set up properly'
    )
  })

  it('Should not allow to challenge if review timeout has passed', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()

    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })
    await linguo.submitTranslation(0, 'ipfs:/X', { from: translator })
    const challengerDeposit = (await linguo.getChallengeValue(0)).toNumber()
    await increaseTime(reviewTimeout + 1)
    await expectThrow(
      linguo.challengeTranslation(0, '', {
        from: challenger,
        value: challengerDeposit
      })
    )
  })

  it('Should pay to all parties correctly when arbitrator refused to rule', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()

    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })
    let task = await linguo.tasks(0)
    await linguo.submitTranslation(0, 'ipfs:/X', { from: translator })

    const challengerDeposit = (await linguo.getChallengeValue(0)).toNumber()
    await linguo.challengeTranslation(0, '', {
      from: challenger,
      value: challengerDeposit
    })

    const oldTokenBalanceRequester = await token.balanceOf(requester)

    const oldBalance1 = await web3.eth.getBalance(translator)
    const oldBalance2 = await web3.eth.getBalance(challenger)

    await arbitrator.giveRuling(0, 0)
    await increaseTime(appealTimeOut + 1)
    await arbitrator.giveRuling(0, 0)

    const newBalance1 = await web3.eth.getBalance(translator)
    const newBalance2 = await web3.eth.getBalance(challenger)

    const newTokenBalanceRequester = await token.balanceOf(requester)

    assert.equal(
      newTokenBalanceRequester.toNumber(),
      oldTokenBalanceRequester.toNumber() + task[7].toNumber(),
      'The requester was not reimbursed correctly'
    )

    assert.equal(
      newBalance1.toString(),
      oldBalance1.plus(3000).toString(), // 3000 is a half of the sum of the eth deposits.
      'The translator was not paid correctly'
    )

    assert.equal(
      newBalance2.toString(),
      oldBalance2.plus(3000).toString(),
      'The challenger was not paid correctly'
    )

    task = await linguo.tasks(0)
    assert.equal(task[10].toNumber(), 0, 'The ruling of the task is incorrect')
    assert.equal(task[7].toNumber(), 0, 'The price should be set to 0')
    assert.equal(task[8].toNumber(), 0, 'Sum deposit should be set to 0')
  })

  it('Should pay to all parties correctly if translator wins', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()

    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })
    let task = await linguo.tasks(0)
    await linguo.submitTranslation(0, 'ipfs:/X', { from: translator })

    const challengerDeposit = (await linguo.getChallengeValue(0)).toNumber()
    await linguo.challengeTranslation(0, '', {
      from: challenger,
      value: challengerDeposit
    })

    const oldTokenBalanceRequester = await token.balanceOf(requester)
    const oldBalance1 = await web3.eth.getBalance(translator)
    const oldBalance2 = await web3.eth.getBalance(challenger)

    await arbitrator.giveRuling(0, 1)
    await increaseTime(appealTimeOut + 1)
    await arbitrator.giveRuling(0, 1)

    const newTokenBalanceRequester = await token.balanceOf(requester)
    const newBalance1 = await web3.eth.getBalance(translator)
    const newBalance2 = await web3.eth.getBalance(challenger)

    const balanceTokenTranslator = await token.balanceOf(translator)

    assert.equal(
      newTokenBalanceRequester.toNumber(),
      oldTokenBalanceRequester.toNumber(),
      'The requester should have the same token balance'
    )

    assert.equal(
      newBalance1.toString(),
      oldBalance1.plus(6000).toString(),
      'The translator was not paid correctly'
    )
    assert.equal(
      balanceTokenTranslator.toNumber(),
      task[7].toNumber(),
      'The translator has incorrect token balance'
    )

    assert.equal(
      newBalance2.toString(),
      oldBalance2.toString(),
      'The challenger should have the same balance'
    )

    task = await linguo.tasks(0)
    assert.equal(task[10].toNumber(), 1, 'The ruling of the task is incorrect')
  })

  it('Should pay to all parties correctly if challenger wins', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()

    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })
    let task = await linguo.tasks(0)
    await linguo.submitTranslation(0, 'ipfs:/X', { from: translator })

    const challengerDeposit = (await linguo.getChallengeValue(0)).toNumber()
    await linguo.challengeTranslation(0, '', {
      from: challenger,
      value: challengerDeposit
    })

    const oldTokenBalanceRequester = await token.balanceOf(requester)
    const oldBalance1 = await web3.eth.getBalance(translator)
    const oldBalance2 = await web3.eth.getBalance(challenger)

    await arbitrator.giveRuling(0, 2)
    await increaseTime(appealTimeOut + 1)
    await arbitrator.giveRuling(0, 2)

    const newTokenBalanceRequester = await token.balanceOf(requester)
    const newBalance1 = await web3.eth.getBalance(translator)
    const newBalance2 = await web3.eth.getBalance(challenger)

    const balanceTokenTranslator = await token.balanceOf(translator)
    const balanceTokenChallenger = await token.balanceOf(challenger)

    assert.equal(
      newTokenBalanceRequester.toNumber(),
      oldTokenBalanceRequester.toNumber() + task[7].toNumber(),
      'The requester was not reimbursed correctly'
    )

    assert.equal(
      newBalance1.toString(),
      oldBalance1.toString(),
      'The translator should have the same balance'
    )
    assert.equal(
      balanceTokenTranslator.toNumber(),
      0,
      'The translator should have 0 token balance'
    )

    assert.equal(
      newBalance2.toString(),
      oldBalance2.plus(6000).toString(),
      'The challenger was not paid correctly'
    )
    assert.equal(
      balanceTokenChallenger.toNumber(),
      0,
      'The challenger should have 0 token balance'
    )

    task = await linguo.tasks(0)
    assert.equal(task[10].toNumber(), 2, 'The ruling of the task is incorrect')
  })

  it('Should not be possible to assign the task after the timeout', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()
    await increaseTime(submissionTimeout - secondsPassed + 1)
    await expectThrow(
      linguo.assignTask(0, {
        from: translator,
        value: requiredDeposit
      })
    )
  })

  it('Should demand correct appeal fees and register that appeal fee has been paid', async () => {
    let roundInfo
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()

    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })
    await linguo.submitTranslation(0, 'ipfs:/X', { from: translator })

    const challengerDeposit = (await linguo.getChallengeValue(0)).toNumber()
    await linguo.challengeTranslation(0, '', {
      from: challenger,
      value: challengerDeposit
    })

    await arbitrator.giveRuling(0, 2)
    const loserAppealFee =
      arbitrationFee + (arbitrationFee * loserMultiplier) / MULTIPLIER_DIVISOR // 1700

    const fundTx = await linguo.fundAppeal(0, 1, {
      from: translator,
      value: 10000 // Deliberately overpay to check that only required fee amount will be registered.
    })

    // Check that event is emitted when fees are paid.
    assert.equal(
      fundTx.logs[0].event,
      'HasPaidAppealFee',
      'The event has not been created'
    )
    assert.equal(
      fundTx.logs[0].args._taskID.toNumber(),
      0,
      'The event has wrong task ID'
    )
    assert.equal(
      fundTx.logs[0].args._party.toNumber(),
      1,
      'The event has wrong party'
    )

    roundInfo = await linguo.getRoundInfo(0, 0)

    assert.equal(
      roundInfo[0][1].toNumber(),
      1700,
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
      linguo.fundAppeal(0, 1, { from: translator, value: loserAppealFee })
    )

    // increase time to make sure winner can pay in 2nd half
    await increaseTime(appealTimeOut / 2 + 1)
    await linguo.fundAppeal(0, 2, {
      from: challenger,
      value: 20000 // Deliberately overpay to check that only required fee amount will be registered.
    })

    roundInfo = await linguo.getRoundInfo(0, 0)

    assert.equal(
      roundInfo[0][2].toNumber(),
      1300,
      'Registered fee of challenger is incorrect'
    )
    assert.equal(
      roundInfo[1][2],
      true,
      'Did not register that challenger successfully paid his fees'
    )

    assert.equal(
      roundInfo[2].toNumber(),
      2000, // winnerAppealFee + loserAppealFee - arbitrationFee
      'Incorrect fee rewards value'
    )

    // If both sides pay their fees it starts new appeal round. Check that both sides have their value set to default.
    roundInfo = await linguo.getRoundInfo(0, 1)
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

  it('Should change the ruling if loser paid appeal fee while winner did not', async () => {
    let task
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()

    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })
    await linguo.submitTranslation(0, 'ipfs:/X', { from: translator })

    const challengerDeposit = (await linguo.getChallengeValue(0)).toNumber()
    await linguo.challengeTranslation(0, '', {
      from: challenger,
      value: challengerDeposit
    })

    task = await linguo.tasks(0)

    await arbitrator.giveRuling(0, 2)

    const loserAppealFee =
      arbitrationFee + (arbitrationFee * loserMultiplier) / MULTIPLIER_DIVISOR
    await linguo.fundAppeal(0, 1, {
      from: translator,
      value: loserAppealFee
    })
    await increaseTime(appealTimeOut + 1)

    const oldTokenBalanceRequester = await token.balanceOf(requester)
    const oldBalance1 = await web3.eth.getBalance(translator)
    const oldBalance2 = await web3.eth.getBalance(challenger)

    await arbitrator.giveRuling(0, 2)

    const newTokenBalanceRequester = await token.balanceOf(requester)
    const newBalance1 = await web3.eth.getBalance(translator)
    const newBalance2 = await web3.eth.getBalance(challenger)

    const balanceTokenTranslator = await token.balanceOf(translator)

    assert.equal(
      newTokenBalanceRequester.toNumber(),
      oldTokenBalanceRequester.toNumber(),
      'The requester should have the same token balance'
    )

    assert.equal(
      newBalance1.toString(),
      oldBalance1.plus(6000).toString(),
      'The translator was not paid correctly'
    )
    assert.equal(
      balanceTokenTranslator.toNumber(),
      task[7].toNumber(),
      'The translator has incorrect token balance'
    )

    assert.equal(
      newBalance2.toString(),
      oldBalance2.toString(),
      'The challenger should have the same balance'
    )

    task = await linguo.tasks(0)
    assert.equal(task[10].toNumber(), 1, 'The ruling of the task is incorrect')
  })

  it('Should withdraw correct fees', async () => {
    const requiredDeposit = (await linguo.getDepositValue(0)).toNumber()

    await linguo.assignTask(0, {
      from: translator,
      value: requiredDeposit
    })
    await linguo.submitTranslation(0, 'ipfs:/X', { from: translator })

    const challengerDeposit = (await linguo.getChallengeValue(0)).toNumber()
    await linguo.challengeTranslation(0, '', {
      from: challenger,
      value: challengerDeposit
    })

    await arbitrator.giveRuling(0, 2)

    const loserAppealFee =
      arbitrationFee + (arbitrationFee * loserMultiplier) / MULTIPLIER_DIVISOR // 1700

    await linguo.fundAppeal(0, 1, {
      from: other,
      value: loserAppealFee * 0.75 // 1275
    })

    await linguo.fundAppeal(0, 1, {
      from: translator,
      value: 5000
    })

    const winnerAppealFee =
      arbitrationFee + (arbitrationFee * winnerMultiplier) / MULTIPLIER_DIVISOR // 1300

    await linguo.fundAppeal(0, 2, {
      from: other,
      value: 0.2 * winnerAppealFee // 260
    })

    await linguo.fundAppeal(0, 2, {
      from: challenger,
      value: winnerAppealFee
    })

    const roundInfo = await linguo.getRoundInfo(0, 0)

    await arbitrator.giveRuling(1, 2)

    await linguo.fundAppeal(0, 1, {
      from: translator,
      value: loserAppealFee - 1 // Deliberately underpay to check that in can be reimbursed later. (1699)
    })

    await increaseTime(appealTimeOut + 1)
    await arbitrator.giveRuling(1, 2)

    const oldBalance1 = await web3.eth.getBalance(translator)
    await linguo.withdrawFeesAndRewards(translator, 0, 0, {
      from: governor
    })
    let newBalance1 = await web3.eth.getBalance(translator)
    assert.equal(
      newBalance1.toString(),
      oldBalance1.toString(),
      'Translator balance should stay the same after withdrawing from 0 round'
    )
    await linguo.withdrawFeesAndRewards(translator, 0, 1, {
      from: governor
    })
    newBalance1 = await web3.eth.getBalance(translator)
    assert.equal(
      newBalance1.toString(),
      oldBalance1.plus(1699).toString(),
      'Translator should be reimbursed unsuccessful payment'
    )

    const oldBalance2 = await web3.eth.getBalance(challenger)
    await linguo.withdrawFeesAndRewards(challenger, 0, 0, {
      from: governor
    })
    const newBalance2 = await web3.eth.getBalance(challenger)
    assert.equal(
      newBalance2.toString(),
      oldBalance2.plus(0.8 * roundInfo[2]).toString(), // 1600
      'Incorrect balance of the challenger after withdrawing'
    )

    const oldBalance3 = await web3.eth.getBalance(other)
    await linguo.withdrawFeesAndRewards(other, 0, 0, {
      from: governor
    })
    const newBalance3 = await web3.eth.getBalance(other)
    assert.equal(
      newBalance3.toString(),
      oldBalance3.plus(0.2 * roundInfo[2]).toString(), // 400
      'Incorrect balance of the crowdfunder after withdrawing'
    )
  })

  it('Should make governance changes', async () => {
    // reviewTimeout
    await expectThrow(
      linguo.changeReviewTimeout(22, {
        from: other
      })
    )
    await linguo.changeReviewTimeout(22, {
      from: governor
    })

    assert.equal(
      (await linguo.reviewTimeout()).toNumber(),
      22,
      'Incorrect review timeout value'
    )
    // translator deposit
    await expectThrow(
      linguo.changeTranslatorBaseDeposit(44, {
        from: other
      })
    )
    await linguo.changeTranslatorBaseDeposit(44, {
      from: governor
    })

    assert.equal(
      (await linguo.translatorBaseDeposit()).toNumber(),
      44,
      'Incorrect translatorBaseDeposit value'
    )
    // challenger deposit
    await expectThrow(
      linguo.changeChallengerBaseDeposit(88, {
        from: other
      })
    )
    await linguo.changeChallengerBaseDeposit(88, {
      from: governor
    })

    assert.equal(
      (await linguo.challengerBaseDeposit()).toNumber(),
      88,
      'Incorrect challengerBaseDeposit value'
    )
    // shared multiplier
    await expectThrow(
      linguo.changeSharedStakeMultiplier(5011, {
        from: other
      })
    )
    await linguo.changeSharedStakeMultiplier(5011, {
      from: governor
    })

    assert.equal(
      (await linguo.sharedStakeMultiplier()).toNumber(),
      5011,
      'Incorrect sharedStakeMultiplier value'
    )
    // winner multiplier
    await expectThrow(
      linguo.changeWinnerStakeMultiplier(3033, {
        from: other
      })
    )
    await linguo.changeWinnerStakeMultiplier(3033, {
      from: governor
    })

    assert.equal(
      (await linguo.winnerStakeMultiplier()).toNumber(),
      3033,
      'Incorrect winnerStakeMultiplier value'
    )
    // governor
    await expectThrow(
      linguo.changeGovernor(other, {
        from: other
      })
    )
    await linguo.changeGovernor(other, {
      from: governor
    })

    assert.equal(await linguo.governor(), other, 'Incorrect governor address')
    // loser multiplier
    await expectThrow(
      linguo.changeLoserStakeMultiplier(7077, {
        from: governor
      })
    )
    await linguo.changeLoserStakeMultiplier(7077, {
      from: other
    })

    assert.equal(
      (await linguo.loserStakeMultiplier()).toNumber(),
      7077,
      'Incorrect loserStakeMultiplier value'
    )
  })
})
