/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const { soliditySha3 } = require('web3-utils')
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const RealitioArbitratorProxy = artifacts.require(
  './RealitioArbitratorProxy.sol'
)
const KlerosLiquid = artifacts.require(
  '@kleros/kleros/contracts/kleros/KlerosLiquid.sol'
)
const Pinakion = artifacts.require('MiniMeTokenERC20')
const Realitio = artifacts.require('Realitio')
const RealitioERC20 = artifacts.require(
  '@realitio/realitio-contracts/truffle/contracts/RealitioERC20.sol'
)

const ConstantNG = artifacts.require('ConstantNG')

contract('RealitioArbitratorProxy', function(accounts) {
  const governor = accounts[0]
  const arbitratorExtraData = 0x85
  const requester = accounts[1]
  const answerer = accounts[2]
  const juror1 = accounts[3]
  const juror2 = accounts[4]
  const juror3 = accounts[5]
  const juror4 = accounts[6]
  const juror5 = accounts[7]
  const other = accounts[8]
  const bounty = 1000
  const bond = 200
  const questionTimeout = 640

  const nbVotes = 100
  const feeForJuror = 100
  const minStake = 100

  const MAX_NUMBER = 2 ** 256 - 1

  let pinakion
  let RNG
  let klerosLiquid
  beforeEach('initialize the contract', async function() {
    pinakion = await Pinakion.new(0x0, 0x0, 0, 'Pinakion', 18, 'PNK', true)
    RNG = await ConstantNG.new(10)
    klerosLiquid = await KlerosLiquid.new(
      governor,
      pinakion.address,
      RNG.address,
      0,
      60,
      false,
      minStake,
      1000,
      100,
      12,
      [0, 0, 0, 0],
      3,
      { from: governor }
    )
  })

  it('Should set the correct values in constructor (Realitio ETH)', async () => {
    const realitio = await Realitio.new()
    const proxy = await RealitioArbitratorProxy.new(
      klerosLiquid.address,
      arbitratorExtraData,
      realitio.address,
      { from: governor }
    )
    assert.equal(await proxy.arbitrator(), klerosLiquid.address)
    assert.equal(await proxy.arbitratorExtraData(), arbitratorExtraData)
    assert.equal(await proxy.realitio(), realitio.address)
    assert.equal(await proxy.deployer(), governor)
  })

  it('Should raise a dispute for realitio contract with correct values and fire the event', async () => {
    const realitio = await Realitio.new()
    const proxy = await RealitioArbitratorProxy.new(
      klerosLiquid.address,
      arbitratorExtraData,
      realitio.address,
      { from: governor }
    )

    tx = await realitio.askQuestion(
      0,
      'New question?',
      proxy.address,
      questionTimeout,
      0,
      0,
      { from: requester, value: bounty }
    )
    const questionID = tx.logs[0].args.question_id
    let question = await realitio.questions(questionID)
    assert.equal(
      question[5],
      false,
      "The question shouldn't be marked as pending arbitration"
    )

    // Should not be possible to request arbitration until the question is answered.
    await expectThrow(
      proxy.requestArbitration(questionID, 0, { from: governor, value: 300 })
    )

    const answer = soliditySha3('answer')
    await realitio.submitAnswer(questionID, answer, 0, {
      from: answerer,
      value: bond
    })

    txDispute = await proxy.requestArbitration(questionID, 0, {
      from: governor,
      value: 300
    })

    question = await realitio.questions(questionID)
    assert.equal(
      question[5],
      true,
      'The question should have pending arbitration status'
    )
    assert.equal(
      txDispute.logs[1].event,
      'DisputeIDToQuestionID',
      'The event has not been created'
    )
    assert.equal(
      txDispute.logs[1].args._disputeID.toNumber(),
      0,
      'The event has wrong dispute ID'
    )
    assert.equal(
      txDispute.logs[1].args._questionID,
      questionID,
      'The event has wrong question ID'
    )

    const dispute = await klerosLiquid.disputes(0)
    assert.equal(dispute[1], proxy.address, 'Arbitrable not set up properly')
    const numberOfChoices = (await proxy.NUMBER_OF_CHOICES_FOR_ARBITRATOR()).toString()
    assert.equal(
      dispute[2].toString(),
      numberOfChoices,
      'Number of choices not set up properly'
    )

    const disputeToQuestion = await proxy.disputeIDToQuestionID(0)
    assert.equal(
      disputeToQuestion,
      questionID,
      'Incorrect disputeIDtoQuestionID value'
    )

    const disputer = await proxy.questionIDToDisputer(questionID)
    assert.equal(disputer, governor, 'Incorrect questionIDToDisputer value')
  })

  it('Should receive correct answer from arbitrator and set correct values in proxy and realitio contracts after the answer is reported to realitio', async () => {
    await pinakion.generateTokens(governor, -1)
    await pinakion.transfer(juror1, 200)
    await pinakion.transfer(juror2, 200)
    await pinakion.transfer(juror3, 200)
    await pinakion.transfer(juror4, 200)
    await pinakion.transfer(juror5, 200)

    await pinakion.approve(klerosLiquid.address, 200, { from: juror1 })
    await pinakion.approve(klerosLiquid.address, 200, { from: juror2 })
    await pinakion.approve(klerosLiquid.address, 200, { from: juror3 })
    await pinakion.approve(klerosLiquid.address, 200, { from: juror4 })
    await pinakion.approve(klerosLiquid.address, 200, { from: juror5 })

    const realitio = await Realitio.new()
    const proxy = await RealitioArbitratorProxy.new(
      klerosLiquid.address,
      arbitratorExtraData,
      realitio.address,
      { from: governor }
    )

    tx = await realitio.askQuestion(
      0,
      'New question?',
      proxy.address,
      questionTimeout,
      0,
      0,
      { from: requester, value: bounty }
    )
    const questionID = tx.logs[0].args.question_id
    const answerHash = soliditySha3('answer')
    await realitio.submitAnswerCommitment(questionID, answerHash, 0, answerer, {
      from: answerer,
      value: bond
    })
    const commitment = soliditySha3(questionID, answerHash, bond)
    let currentHistoryHash = await realitio.getHistoryHash(questionID)

    // Overpay arbitration cost to have desired number of votes in the court.
    await proxy.requestArbitration(questionID, 0, {
      from: governor,
      value: nbVotes * feeForJuror
    })

    await klerosLiquid.setStake(0, minStake, { from: juror1 })
    await klerosLiquid.setStake(0, minStake, { from: juror2 })
    await klerosLiquid.setStake(0, minStake, { from: juror3 })
    await klerosLiquid.setStake(0, minStake, { from: juror4 })
    await klerosLiquid.setStake(0, minStake, { from: juror5 })

    await klerosLiquid.passPhase()
    await klerosLiquid.passPhase()
    // Split drawing into 5 instances to avoid going out of gas.
    await klerosLiquid.drawJurors(0, nbVotes / 5)
    await klerosLiquid.drawJurors(0, nbVotes / 5)
    await klerosLiquid.drawJurors(0, nbVotes / 5)
    await klerosLiquid.drawJurors(0, nbVotes / 5)
    await klerosLiquid.drawJurors(0, nbVotes / 5)
    await klerosLiquid.passPeriod(0)

    let vote
    // Cap possible choice to the total number of votes to avoid dealing with big numbers and make votes overlap.
    for (let i = 0; i < nbVotes; i++) {
      vote = await klerosLiquid.getVote(0, 0, i)
      if (juror1 === vote[0])
        await klerosLiquid.castVote(
          0,
          [i],
          Math.ceil(Math.random() * nbVotes),
          0,
          { from: juror1 }
        )
      else if (juror2 === vote[0])
        await klerosLiquid.castVote(
          0,
          [i],
          Math.ceil(Math.random() * nbVotes),
          0,
          { from: juror2 }
        )
      else if (juror3 === vote[0])
        await klerosLiquid.castVote(
          0,
          [i],
          Math.ceil(Math.random() * nbVotes),
          0,
          { from: juror3 }
        )
      else if (juror4 === vote[0])
        await klerosLiquid.castVote(
          0,
          [i],
          Math.ceil(Math.random() * nbVotes),
          0,
          { from: juror4 }
        )
      else if (juror5 === vote[0])
        await klerosLiquid.castVote(
          0,
          [i],
          Math.ceil(Math.random() * nbVotes),
          0,
          { from: juror5 }
        )
    }

    await klerosLiquid.passPeriod(0)
    await klerosLiquid.passPeriod(0)

    let ruled = await proxy.questionIDToRuled(questionID)
    assert.equal(
      ruled,
      false,
      'The question should not be marked as ruled before arbitration'
    )

    // Check that the answer can't be reported if the questiion is not ruled.
    await expectThrow(
      proxy.reportAnswer(questionID, 0x0, commitment, bond, answerer, true, {
        from: governor
      })
    )

    let ruling = (await klerosLiquid.currentRuling(0)).toNumber()
    if (ruling === 0) ruling = MAX_NUMBER
    else ruling = ruling - 1

    await klerosLiquid.executeRuling(0)

    let questionToAnswer = await proxy.questionIDToAnswer(questionID)
    // QuestionToAnswer has type bytes32 but it can still be compared to uint.
    assert.equal(
      questionToAnswer,
      ruling,
      'The answer provided by arbitrator is set incorrectly'
    )
    ruled = await proxy.questionIDToRuled(questionID)
    assert.equal(
      ruled,
      true,
      'The question should be marked as ruled after arbitration'
    )
    const disputeToQuestion = await proxy.disputeIDToQuestionID(0)
    assert.equal(
      disputeToQuestion,
      0x0,
      'DisputeIDToQuestionID record should be deleted'
    )

    // Check that the answer can not be reported until reveal timeout has passed.
    await expectThrow(
      proxy.reportAnswer(questionID, 0x0, commitment, bond, answerer, true, {
        from: governor
      })
    )

    await increaseTime(questionTimeout / 8 + 1)

    // Check the requirement for correct answer parameters by providing one wrong parameter at a time.
    await expectThrow(
      proxy.reportAnswer(0x0, 0x0, commitment, bond, answerer, true, {
        from: governor
      })
    )
    await expectThrow(
      proxy.reportAnswer(
        questionID,
        questionID,
        commitment,
        bond,
        answerer,
        true,
        { from: governor }
      )
    )
    await expectThrow(
      proxy.reportAnswer(questionID, 0x0, 0x0, bond, answerer, true, {
        from: governor
      })
    )
    await expectThrow(
      proxy.reportAnswer(
        questionID,
        0x0,
        commitment,
        bond - 1,
        answerer,
        true,
        { from: governor }
      )
    )
    await expectThrow(
      proxy.reportAnswer(questionID, 0x0, commitment, bond, requester, true, {
        from: governor
      })
    )
    await expectThrow(
      proxy.reportAnswer(questionID, 0x0, commitment, bond, answerer, false, {
        from: governor
      })
    )

    await proxy.reportAnswer(
      questionID,
      0x0,
      commitment,
      bond,
      answerer,
      true,
      { from: governor }
    )

    // Check that correct values have been reported to realitio.
    const newHistoryHash = soliditySha3(
      currentHistoryHash,
      questionToAnswer,
      0,
      governor,
      false
    )
    currentHistoryHash = await realitio.getHistoryHash(questionID)
    assert.equal(
      currentHistoryHash,
      newHistoryHash,
      'The data was not reported correctly by proxy contract to realitio'
    )
    const bestAnswer = await realitio.getBestAnswer(questionID)
    assert.equal(
      bestAnswer,
      questionToAnswer,
      'The answer was not reported correctly by proxy contract to realitio'
    )
    const question = await realitio.questions(questionID)
    assert.equal(
      question[5],
      false,
      "The question shouldn't be marked as pending arbitration"
    )

    // Check that mappings are successfully deleted.
    const disputer = await proxy.questionIDToDisputer(questionID)
    assert.equal(disputer, 0x0, 'questionIDToDisputer value should be empty')
    questionToAnswer = await proxy.questionIDToAnswer(questionID)
    assert.equal(
      questionToAnswer,
      0x0,
      'questionIDToAnswer value should be empty'
    )
    ruled = await proxy.questionIDToRuled(questionID)
    assert.equal(
      ruled,
      false,
      'The question should not be marked as ruled after the answer is reported'
    )
  })

  it('Should set the correct values in constructor and set token correctly (Realitio ERC20)', async () => {
    const realitioERC20 = await RealitioERC20.new()
    const proxy = await RealitioArbitratorProxy.new(
      klerosLiquid.address,
      arbitratorExtraData,
      realitioERC20.address,
      { from: governor }
    )

    assert.equal(await proxy.arbitrator(), klerosLiquid.address)
    assert.equal(await proxy.arbitratorExtraData(), arbitratorExtraData)
    assert.equal(await proxy.realitio(), realitioERC20.address)
    assert.equal(await proxy.deployer(), governor)

    await realitioERC20.setToken(pinakion.address)
    assert.equal(await realitioERC20.token(), pinakion.address)

    // Should not be possible to set token again.
    await expectThrow(realitioERC20.setToken(pinakion.address))
  })

  it('Should raise a dispute for realitioERC20 contract with correct values and fire the event', async () => {
    const realitioERC20 = await RealitioERC20.new()
    const proxy = await RealitioArbitratorProxy.new(
      klerosLiquid.address,
      arbitratorExtraData,
      realitioERC20.address,
      { from: governor }
    )
    await realitioERC20.setToken(pinakion.address)

    await pinakion.generateTokens(governor, -1)
    await pinakion.transfer(requester, 2000)
    await pinakion.transfer(answerer, 2000)

    await pinakion.approve(realitioERC20.address, 2000, { from: requester })
    await pinakion.approve(realitioERC20.address, 2000, { from: answerer })

    tx = await realitioERC20.askQuestionERC20(
      0,
      'New question?',
      proxy.address,
      questionTimeout,
      0,
      0,
      bounty,
      { from: requester }
    )

    const questionID = tx.logs[0].args.question_id
    let question = await realitioERC20.questions(questionID)
    assert.equal(
      question[5],
      false,
      "The question shouldn't be marked as pending arbitration"
    )

    // Should not be possible to request arbitration until the question is answered.
    await expectThrow(
      proxy.requestArbitration(questionID, 0, { from: governor, value: 300 })
    )

    const answer = soliditySha3('answer')
    await realitioERC20.submitAnswerERC20(questionID, answer, 0, bond, {
      from: answerer
    })

    txDispute = await proxy.requestArbitration(questionID, 0, {
      from: governor,
      value: 300
    })

    question = await realitioERC20.questions(questionID)

    assert.equal(
      question[5],
      true,
      'The question should have pending arbitration status'
    )
    assert.equal(
      txDispute.logs[1].event,
      'DisputeIDToQuestionID',
      'The event has not been created'
    )
    assert.equal(
      txDispute.logs[1].args._disputeID.toNumber(),
      0,
      'The event has wrong dispute ID'
    )
    assert.equal(
      txDispute.logs[1].args._questionID,
      questionID,
      'The event has wrong question ID'
    )

    const dispute = await klerosLiquid.disputes(0)
    assert.equal(dispute[1], proxy.address, 'Arbitrable not set up properly')

    const numberOfChoices = (await proxy.NUMBER_OF_CHOICES_FOR_ARBITRATOR()).toString()
    assert.equal(
      dispute[2].toString(),
      numberOfChoices,
      'Number of choices not set up properly'
    )

    const disputeToQuestion = await proxy.disputeIDToQuestionID(0)
    assert.equal(
      disputeToQuestion,
      questionID,
      'Incorrect disputeIDtoQuestionID value'
    )

    const disputer = await proxy.questionIDToDisputer(questionID)
    assert.equal(disputer, governor, 'Incorrect questionIDToDisputer value')
  })

  it('Should receive correct answer from arbitrator and set correct values in proxy and realitioERC20 contracts after the answer is reported to realitioERC20', async () => {
    await pinakion.generateTokens(governor, -1)
    await pinakion.transfer(juror1, 200)
    await pinakion.transfer(juror2, 200)
    await pinakion.transfer(juror3, 200)
    await pinakion.transfer(juror4, 200)
    await pinakion.transfer(juror5, 200)

    await pinakion.approve(klerosLiquid.address, 200, { from: juror1 })
    await pinakion.approve(klerosLiquid.address, 200, { from: juror2 })
    await pinakion.approve(klerosLiquid.address, 200, { from: juror3 })
    await pinakion.approve(klerosLiquid.address, 200, { from: juror4 })
    await pinakion.approve(klerosLiquid.address, 200, { from: juror5 })

    const realitioERC20 = await RealitioERC20.new()
    const proxy = await RealitioArbitratorProxy.new(
      klerosLiquid.address,
      arbitratorExtraData,
      realitioERC20.address,
      { from: governor }
    )
    await realitioERC20.setToken(pinakion.address)

    await pinakion.transfer(requester, 2000)
    await pinakion.transfer(answerer, 2000)

    await pinakion.approve(realitioERC20.address, 2000, { from: requester })
    await pinakion.approve(realitioERC20.address, 2000, { from: answerer })

    tx = await realitioERC20.askQuestionERC20(
      0,
      'New question?',
      proxy.address,
      questionTimeout,
      0,
      0,
      bounty,
      { from: requester }
    )

    const questionID = tx.logs[0].args.question_id
    const answer =
      '0x0000000000000000000000000000000000000000000000000000000000000002'
    await realitioERC20.submitAnswerERC20(questionID, answer, 0, bond, {
      from: answerer
    })
    let currentHistoryHash = await realitioERC20.getHistoryHash(questionID)

    // Overpay arbitration cost to have desired number of votes in the court.
    await proxy.requestArbitration(questionID, 0, {
      from: governor,
      value: nbVotes * feeForJuror
    })

    await klerosLiquid.setStake(0, minStake, { from: juror1 })
    await klerosLiquid.setStake(0, minStake, { from: juror2 })
    await klerosLiquid.setStake(0, minStake, { from: juror3 })
    await klerosLiquid.setStake(0, minStake, { from: juror4 })
    await klerosLiquid.setStake(0, minStake, { from: juror5 })

    await klerosLiquid.passPhase()
    await klerosLiquid.passPhase()
    // Split drawing into 5 instances to avoid going out of gas
    await klerosLiquid.drawJurors(0, nbVotes / 5)
    await klerosLiquid.drawJurors(0, nbVotes / 5)
    await klerosLiquid.drawJurors(0, nbVotes / 5)
    await klerosLiquid.drawJurors(0, nbVotes / 5)
    await klerosLiquid.drawJurors(0, nbVotes / 5)
    await klerosLiquid.passPeriod(0)

    let vote
    // Make all jurors vote for the same choice to make winning choice match already given answer.
    for (let i = 0; i < nbVotes; i++) {
      vote = await klerosLiquid.getVote(0, 0, i)
      if (juror1 === vote[0])
        await klerosLiquid.castVote(0, [i], 3, 0, { from: juror1 })
      else if (juror2 === vote[0])
        await klerosLiquid.castVote(0, [i], 3, 0, { from: juror2 })
      else if (juror3 === vote[0])
        await klerosLiquid.castVote(0, [i], 3, 0, { from: juror3 })
      else if (juror4 === vote[0])
        await klerosLiquid.castVote(0, [i], 3, 0, { from: juror4 })
      else if (juror5 === vote[0])
        await klerosLiquid.castVote(0, [i], 3, 0, { from: juror5 })
    }

    await klerosLiquid.passPeriod(0)
    await klerosLiquid.passPeriod(0)

    let ruled = await proxy.questionIDToRuled(questionID)
    assert.equal(
      ruled,
      false,
      'The question should not be marked as ruled before arbitration'
    )

    // Check that the answer can't be reported if the questiion is not ruled.
    await expectThrow(
      proxy.reportAnswer(questionID, 0x0, answer, bond, answerer, false, {
        from: governor
      })
    )

    await klerosLiquid.executeRuling(0)

    let questionToAnswer = await proxy.questionIDToAnswer(questionID)
    // Arbitrator's choice was set up to match the already given answer. Check if it matches.
    assert.equal(
      questionToAnswer,
      answer,
      'The answer provided by arbitrator is set incorrectly'
    )
    ruled = await proxy.questionIDToRuled(questionID)
    assert.equal(
      ruled,
      true,
      'The question should be marked as ruled after arbitration'
    )
    const disputeToQuestion = await proxy.disputeIDToQuestionID(0)
    assert.equal(
      disputeToQuestion,
      0x0,
      'DisputeIDToQuestionID record should be deleted'
    )

    // Check the requirement for correct answer parameters by providing one wrong parameter at a time.
    await expectThrow(
      proxy.reportAnswer(0x0, 0x0, answer, bond, answerer, false, {
        from: governor
      })
    )
    await expectThrow(
      proxy.reportAnswer(
        questionID,
        questionID,
        answer,
        bond,
        answerer,
        false,
        { from: governor }
      )
    )
    await expectThrow(
      proxy.reportAnswer(questionID, 0x0, 0x0, bond, answerer, false, {
        from: governor
      })
    )
    await expectThrow(
      proxy.reportAnswer(questionID, 0x0, answer, bond - 1, answerer, false, {
        from: governor
      })
    )
    await expectThrow(
      proxy.reportAnswer(questionID, 0x0, answer, bond, requester, false, {
        from: governor
      })
    )
    await expectThrow(
      proxy.reportAnswer(questionID, 0x0, answer, bond, answerer, true, {
        from: governor
      })
    )

    await proxy.reportAnswer(questionID, 0x0, answer, bond, answerer, false, {
      from: governor
    })

    // Check that correct values have been reported to realitio. In case where correct answer has already been given the initial answerer wins.
    const newHistoryHash = soliditySha3(
      currentHistoryHash,
      questionToAnswer,
      0,
      answerer,
      false
    )
    currentHistoryHash = await realitioERC20.getHistoryHash(questionID)
    assert.equal(
      currentHistoryHash,
      newHistoryHash,
      'The data was not reported correctly by proxy contract to realitio'
    )
    const bestAnswer = await realitioERC20.getBestAnswer(questionID)
    assert.equal(
      bestAnswer,
      questionToAnswer,
      'The answer was not reported correctly by proxy contract to realitio'
    )
    const question = await realitioERC20.questions(questionID)
    assert.equal(
      question[5],
      false,
      "The question shouldn't be marked as pending arbitration"
    )

    // Check that mappings are successfully deleted.
    const disputer = await proxy.questionIDToDisputer(questionID)
    assert.equal(disputer, 0x0, 'questionIDToDisputer value should be empty')
    questionToAnswer = await proxy.questionIDToAnswer(questionID)
    assert.equal(
      questionToAnswer,
      0x0,
      'questionIDToAnswer value should be empty'
    )
    ruled = await proxy.questionIDToRuled(questionID)
    assert.equal(
      ruled,
      false,
      'The question should not be marked as ruled after the answer is reported'
    )
  })

  it('Only the deployer should be allowed to set metaevidence', async () => {
    const realitio = await Realitio.new()
    const proxy = await RealitioArbitratorProxy.new(
      klerosLiquid.address,
      arbitratorExtraData,
      realitio.address,
      { from: governor }
    )
    await expectThrow(
      proxy.setMetaEvidence('string metaevidence', { from: other })
    )
    await proxy.setMetaEvidence('string metaevidence', { from: governor })

    const deployer = await proxy.deployer()
    assert.equal(
      deployer,
      0x0,
      'The deployer should be deleted after metaevidence has been uploaded'
    )
  })
})
