/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const {
  expectThrow
} = require("openzeppelin-solidity/test/helpers/expectThrow");
const {
  increaseTime
} = require("openzeppelin-solidity/test/helpers/increaseTime");

const ArbitrablePermissionList = artifacts.require(
  "./ArbitrablePermissionList.sol"
);
const CentralizedArbitrator = artifacts.require("./CentralizedArbitrator.sol");

contract("ArbitrablePermissionList", function(accounts) {
  const arbitratorExtraData = 0x08575;
  const metaEvidence = "https://kleros.io";
  const blacklist = false;
  const appendOnly = false;
  const rechallengePossible = true;
  const stake = 10;
  const timeToChallenge = 0;
  const submitter = accounts[0];
  const challenger = accounts[1];
  const arbitrator = accounts[2];
  const arbitrationFee = 5;
  const ITEM_VALUE = "item1";
  const gasPrice = 1000000000;
  const ITEM_STATUS = {
    ABSENT: 0,
    CLEARED: 1,
    RESUBMITTED: 2,
    REGISTERED: 3,
    SUBMITTED: 4,
    CLEARING_REQUESTED: 5,
    PREVENTIVE_CLEARING_REQUESTED: 6
  };

  it("Should be able to register and clear item", async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );
    const arbitrablePL = await ArbitrablePermissionList.new(
      centralizedArbitrator.address,
      arbitratorExtraData,
      metaEvidence,
      blacklist,
      appendOnly,
      rechallengePossible,
      stake,
      timeToChallenge,
      { from: submitter }
    );
    await arbitrablePL.requestRegistration(ITEM_VALUE, {
      from: submitter,
      value: stake + arbitrationFee
    });
    const reqRegistrationItem = await arbitrablePL.items(ITEM_VALUE);
    assert.equal(
      reqRegistrationItem[0].toNumber(),
      ITEM_STATUS.SUBMITTED,
      "Item registeration request not submitted."
    );

    await arbitrablePL.executeRequest(ITEM_VALUE, {
      from: submitter
    });
    let exeRequestItem = await arbitrablePL.items(ITEM_VALUE);
    assert.equal(
      exeRequestItem[0].toNumber(),
      ITEM_STATUS.REGISTERED,
      "Item is not registered"
    );
    await arbitrablePL.requestClearing(ITEM_VALUE, {
      from: submitter,
      value: stake + arbitrationFee
    });
    const reqClearingItem = await arbitrablePL.items(ITEM_VALUE);
    assert.equal(
      reqClearingItem[0].toNumber(),
      ITEM_STATUS.CLEARING_REQUESTED,
      "Item not in clearing requested"
    );
    await arbitrablePL.executeRequest(ITEM_VALUE, {
      from: submitter
    });
    exeRequestItem = await arbitrablePL.items(ITEM_VALUE);
    assert.equal(
      exeRequestItem[0].toNumber(),
      ITEM_STATUS.CLEARED,
      "Item not cleared"
    );
  });

  it("Should not be possible to pay less", async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );
    const arbitrablePL = await ArbitrablePermissionList.new(
      centralizedArbitrator.address,
      arbitratorExtraData,
      metaEvidence,
      blacklist,
      appendOnly,
      rechallengePossible,
      stake,
      timeToChallenge,
      { from: submitter }
    );

    await arbitrablePL.requestRegistration(ITEM_VALUE, {
      from: submitter,
      value: stake + arbitrationFee
    });
    const reqRegistrationItem = await arbitrablePL.items(ITEM_VALUE);
    assert.equal(
      reqRegistrationItem[0].toNumber(),
      ITEM_STATUS.SUBMITTED,
      "Item not submitted"
    );
    await expectThrow(
      arbitrablePL.requestRegistration(ITEM_VALUE, {
        from: submitter,
        value: stake + arbitrationFee - 1
      })
    );
    await expectThrow(
      arbitrablePL.requestClearing(ITEM_VALUE, {
        from: submitter,
        value: stake + arbitrationFee - 1
      })
    );
    await expectThrow(
      arbitrablePL.challengeRegistration(ITEM_VALUE, {
        from: challenger,
        value: stake + arbitrationFee - 1
      })
    );
    await expectThrow(
      arbitrablePL.challengeClearing(ITEM_VALUE, {
        from: challenger,
        value: stake + arbitrationFee - 1
      })
    );
  });

  it("Should create a dispute when someone challenges registration", async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );
    const arbitrablePL = await ArbitrablePermissionList.new(
      centralizedArbitrator.address,
      arbitratorExtraData,
      metaEvidence,
      blacklist,
      appendOnly,
      rechallengePossible,
      stake,
      timeToChallenge,
      { from: submitter }
    );

    await arbitrablePL.requestRegistration(ITEM_VALUE, {
      from: submitter,
      value: stake + arbitrationFee
    });
    //await arbitrablePL.executeRequest(ITEM_VALUE,{from:submitter});
    await arbitrablePL.challengeRegistration(ITEM_VALUE, {
      from: challenger,
      value: stake + arbitrationFee
    });
    const dispute = await centralizedArbitrator.disputes(0);
    assert.equal(
      dispute[0],
      arbitrablePL.address,
      "Arbitrable not set up properly"
    );
    assert.equal(
      dispute[1].toNumber(),
      2,
      "Number of choices not set up properly"
    );
    assert.equal(
      dispute[2].toNumber(),
      arbitrationFee,
      "Fee not set up properly"
    );
  });
  // it("Should not be able to challenge registration when arbitration fee increases", async () => {
  //   const centralizedArbitrator = await CentralizedArbitrator.new(
  //     arbitrationFee,
  //     { from: arbitrator }
  //   );
  //   const arbitrablePL = await ArbitrablePermissionList.new(
  //     centralizedArbitrator.address,
  //     arbitratorExtraData,
  //     metaEvidence,
  //     blacklist,
  //     appendOnly,
  //     rechallengePossible,
  //     stake,
  //     timeToChallenge,
  //     { from: submitter }
  //   );

  //   const submitterTx = await arbitrablePL.requestRegistration(ITEM_VALUE, {
  //     from: submitter,
  //     value: stake + arbitrationFee,
  //     gasPrice: gasPrice
  //   });
  //   const submitterTxFee = submitterTx.receipt.gasUsed * gasPrice;
  //   const submitterBalBeforeReqCancel = web3.eth.getBalance(submitter);
  //   const challengerBalBeforeReqCancel = web3.eth.getBalance(challenger);
  //   const challengerTx = await arbitrablePL.challengeRegistration(ITEM_VALUE, {
  //     from: challenger,
  //     value: stake + arbitrationFee,
  //     gasPrice: gasPrice
  //   });
  //   const challengerTxFee = challengerTx.receipt.gasUsed * gasPrice;

  //   assert.equal(
  //     await web3.eth.getBalance(submitter).toString(),
  //     submitterBalBeforeReqCancel
  //       .plus(arbitrationFee)
  //       .minus(submitterTxFee)
  //       .toString(),
  //     "Submitter has not received the refund appropriately"
  //   );
  //   assert.equal(
  //     await web3.eth.getBalance(challenger).toStrin(),
  //     challengerBalBeforeReqCancel
  //       .plus(arbitrationFee)
  //       .minus(challengerTxFee)
  //       .toString(),
  //     "Challenger not received refund properly"
  //   );
  // });
  it("Should create a dispute when someone challenges clearing ", async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );
    const arbitrablePL = await ArbitrablePermissionList.new(
      centralizedArbitrator.address,
      arbitratorExtraData,
      metaEvidence,
      blacklist,
      appendOnly,
      rechallengePossible,
      stake,
      timeToChallenge,
      { from: submitter }
    );

    await arbitrablePL.requestRegistration(ITEM_VALUE, {
      from: submitter,
      value: stake + arbitrationFee
    });
    const reqRegistrationItem = await arbitrablePL.items(ITEM_VALUE);
    assert.equal(
      reqRegistrationItem[0].toNumber(),
      ITEM_STATUS.SUBMITTED,
      "Item registeration request not submitted."
    );

    await arbitrablePL.executeRequest(ITEM_VALUE, {
      from: submitter
    });
    let exeRequestItem = await arbitrablePL.items(ITEM_VALUE);
    assert.equal(
      exeRequestItem[0].toNumber(),
      ITEM_STATUS.REGISTERED,
      "Item is not registered"
    );
    await arbitrablePL.requestClearing(ITEM_VALUE, {
      from: submitter,
      value: stake + arbitrationFee
    });
    const reqClearingItem = await arbitrablePL.items(ITEM_VALUE);
    assert.equal(
      reqClearingItem[0].toNumber(),
      ITEM_STATUS.CLEARING_REQUESTED,
      "Item not in clearing requested"
    );
    await arbitrablePL.challengeClearing(ITEM_VALUE, {
      from: challenger,
      value: stake + arbitrationFee
    });

    const dispute = await centralizedArbitrator.disputes(0);
    assert.equal(
      dispute[0],
      arbitrablePL.address,
      "Arbitrable not set up properly"
    );
    assert.equal(
      dispute[1].toNumber(),
      2,
      "Number of choices not set up properly"
    );
    assert.equal(
      dispute[2].toNumber(),
      arbitrationFee,
      "Fee not set up properly"
    );
  });

  // it("Should not be able to challenge clearing if arbitration fee has increased", async () => {
  //   const centralizedArbitrator = await CentralizedArbitrator.new(
  //     arbitrationFee,
  //     { from: arbitrator }
  //   );
  //   const arbitrablePL = await ArbitrablePermissionList.new(
  //     centralizedArbitrator.address,
  //     arbitratorExtraData,
  //     metaEvidence,
  //     blacklist,
  //     appendOnly,
  //     rechallengePossible,
  //     stake,
  //     timeToChallenge,
  //     { from: submitter }
  //   );

  //   await arbitrablePL.requestRegistration(ITEM_VALUE, {
  //     from: submitter,
  //     value: stake + arbitrationFee
  //   });
  //   await arbitrablePL.executeRequest(ITEM_VALUE, {
  //     from: submitter
  //   });

  //   const submitterTx = await arbitrablePL.requestClearing(ITEM_VALUE, {
  //     from: submitter,
  //     value: stake + arbitrationFee
  //   });
  //   const submitterTxCost = submitterTx.receipt.gasUsed * gasPrice;
  //   const submitterBalBeforeReqCancel = await web3.eth.getBalance(submitter);
  //   const challengerBalBeforeReqCancel = await web3.eth.getBalance(challenger);
  //   const challengerTx = await arbitrablePL.challengeClearing(ITEM_VALUE, {
  //     from: challenger,
  //     value: stake + arbitrationFee,
  //     gasPrice: gasPrice
  //   });
  //   const challengerTxCost = challengerTx.receipt.gasUsed * gasPrice;
  //   assert.equal(
  //     await web3.eth.getBalance(submitter).toString(),
  //     submitterBalBeforeReqCancel
  //       .plus(stake + arbitrationFee)
  //       .minus(submitterTxCost)
  //       .toString(),
  //     "Submitter has not been refunded properly"
  //   );
  //   assert.equal(
  //     await web3.eth.getBalance(challenger).toString(),
  //     challengerBalBeforeReqCancel
  //       .plus(stake + arbitrationFee)
  //       .minus(challengerTxCost)
  //       .toString(),
  //     "Submitter has not been refunded properly"
  //   );
  // });
  it("Should reward if ruling is REGISTER and rechallenge is possible", async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );
    const arbitrablePL = await ArbitrablePermissionList.new(
      centralizedArbitrator.address,
      arbitratorExtraData,
      metaEvidence,
      blacklist,
      appendOnly,
      rechallengePossible,
      stake,
      timeToChallenge,
      { from: submitter }
    );

    await arbitrablePL.requestRegistration(ITEM_VALUE, {
      from: submitter,
      value: arbitrationFee + stake
    });
    const submitterBalBefore = await web3.eth.getBalance(submitter);
    await arbitrablePL.challengeRegistration(ITEM_VALUE, {
      from: challenger,
      value: stake + arbitrationFee
    });
    const dispute = await centralizedArbitrator.disputes(0);
    assert.equal(
      dispute[0],
      arbitrablePL.address,
      "Arbitrable not set up properly"
    );
    assert.equal(
      dispute[1].toNumber(),
      2,
      "Number of choices not set up properly"
    );
    assert.equal(
      dispute[2].toNumber(),
      arbitrationFee,
      "Fee not set up properly"
    );
    await centralizedArbitrator.giveRuling(0, 1, { from: arbitrator });
    //const item = await arbitrablePL.items(ITEM_VALUE);
    const submitterBalAfter = await web3.eth.getBalance(submitter);
    assert.equal(
      submitterBalAfter.toString(),
      submitterBalBefore.plus(stake).toString(),
      "Submitter not refunded properly"
    );
  });
  it("Should reimburse if ruling is REGISTER and rechallenge not possible", async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );
    const arbitrablePL = await ArbitrablePermissionList.new(
      centralizedArbitrator.address,
      arbitratorExtraData,
      metaEvidence,
      blacklist,
      appendOnly,
      false,
      stake,
      timeToChallenge,
      { from: submitter }
    );

    await arbitrablePL.requestRegistration(ITEM_VALUE, {
      from: submitter,
      value: arbitrationFee + stake
    });
    const submitterBalBefore = await web3.eth.getBalance(submitter);
    await arbitrablePL.challengeRegistration(ITEM_VALUE, {
      from: challenger,
      value: stake + arbitrationFee
    });
    const dispute = await centralizedArbitrator.disputes(0);
    assert.equal(
      dispute[0],
      arbitrablePL.address,
      "Arbitrable not set up properly"
    );
    assert.equal(
      dispute[1].toNumber(),
      2,
      "Number of choices not set up properly"
    );
    assert.equal(
      dispute[2].toNumber(),
      arbitrationFee,
      "Fee not set up properly"
    );
    const itemBeforeRuling = await arbitrablePL.items(ITEM_VALUE);
    await centralizedArbitrator.giveRuling(0, 1, { from: arbitrator });
    //const item = await arbitrablePL.items(ITEM_VALUE);
    const submitterBalAfter = await web3.eth.getBalance(submitter);

    assert.equal(
      submitterBalAfter.toString(),
      submitterBalBefore.plus(itemBeforeRuling[4]).toString(),
      "Submitter not rewarded properly"
    );
  });

  it("Should reimburse if ruling is CLEAR and clearing requested", async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );
    const arbitrablePL = await ArbitrablePermissionList.new(
      centralizedArbitrator.address,
      arbitratorExtraData,
      metaEvidence,
      blacklist,
      appendOnly,
      rechallengePossible,
      stake,
      timeToChallenge,
      { from: submitter }
    );

    await arbitrablePL.requestRegistration(ITEM_VALUE, {
      from: submitter,
      value: arbitrationFee + stake
    });
    await arbitrablePL.executeRequest(ITEM_VALUE, { from: submitter });
    await arbitrablePL.requestClearing(ITEM_VALUE, {
      from: submitter,
      value: arbitrationFee + stake
    });
    const submitterBalBefore = await web3.eth.getBalance(submitter);
    await arbitrablePL.challengeClearing(ITEM_VALUE, {
      from: challenger,
      value: stake + arbitrationFee
    });
    const dispute = await centralizedArbitrator.disputes(0);
    assert.equal(
      dispute[0],
      arbitrablePL.address,
      "Arbitrable not set up properly"
    );
    assert.equal(
      dispute[1].toNumber(),
      2,
      "Number of choices not set up properly"
    );
    assert.equal(
      dispute[2].toNumber(),
      arbitrationFee,
      "Fee not set up properly"
    );
    const itemBeforeRuling = await arbitrablePL.items(ITEM_VALUE);
    await centralizedArbitrator.giveRuling(0, 2, { from: arbitrator });
    //const item = await arbitrablePL.items(ITEM_VALUE);
    const submitterBalAfter = await web3.eth.getBalance(submitter);
    assert.equal(
      submitterBalAfter.toString(),
      submitterBalBefore.plus(itemBeforeRuling[4]).toString(),
      "Submitter not rewared properly"
    );
  });
  it("Should reward if ruling is CLEAR and clearing not requested", async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );
    const arbitrablePL = await ArbitrablePermissionList.new(
      centralizedArbitrator.address,
      arbitratorExtraData,
      metaEvidence,
      blacklist,
      appendOnly,
      rechallengePossible,
      stake,
      timeToChallenge,
      { from: submitter }
    );

    await arbitrablePL.requestRegistration(ITEM_VALUE, {
      from: submitter,
      value: arbitrationFee + stake
    });
    await arbitrablePL.challengeRegistration(ITEM_VALUE, {
      from: challenger,
      value: stake + arbitrationFee
    });
    const challengerBalBefore = await web3.eth.getBalance(challenger);
    const dispute = await centralizedArbitrator.disputes(0);
    assert.equal(
      dispute[0],
      arbitrablePL.address,
      "Arbitrable not set up properly"
    );
    assert.equal(
      dispute[1].toNumber(),
      2,
      "Number of choices not set up properly"
    );
    assert.equal(
      dispute[2].toNumber(),
      arbitrationFee,
      "Fee not set up properly"
    );
    const itemBeforeRuling = await arbitrablePL.items(ITEM_VALUE);
    await centralizedArbitrator.giveRuling(0, 2, { from: arbitrator });
    //const item = await arbitrablePL.items(ITEM_VALUE);
    const challengerBalAfter = await web3.eth.getBalance(challenger);
    assert.equal(
      challengerBalAfter.toString(),
      challengerBalBefore.plus(itemBeforeRuling[4]).toString(),
      "Challenger not rewared properly"
    );
  });
  it("Should refund both the parties if ruling is neither REGISTER not CLEAR", async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );
    const arbitrablePL = await ArbitrablePermissionList.new(
      centralizedArbitrator.address,
      arbitratorExtraData,
      metaEvidence,
      blacklist,
      appendOnly,
      rechallengePossible,
      stake,
      timeToChallenge,
      { from: submitter }
    );

    await arbitrablePL.requestRegistration(ITEM_VALUE, {
      from: submitter,
      value: arbitrationFee + stake
    });

    await arbitrablePL.challengeRegistration(ITEM_VALUE, {
      from: challenger,
      value: stake + arbitrationFee
    });
    const dispute = await centralizedArbitrator.disputes(0);
    assert.equal(
      dispute[0],
      arbitrablePL.address,
      "Arbitrable not set up properly"
    );
    assert.equal(
      dispute[1].toNumber(),
      2,
      "Number of choices not set up properly"
    );
    assert.equal(
      dispute[2].toNumber(),
      arbitrationFee,
      "Fee not set up properly"
    );
    const challengerBalBefore = await web3.eth.getBalance(challenger);
    const submitterBalBefore = await web3.eth.getBalance(submitter);
    const itemBeforeRuling = await arbitrablePL.items(ITEM_VALUE);
    await centralizedArbitrator.giveRuling(0, 0, { from: arbitrator });
    //const item = await arbitrablePL.items(ITEM_VALUE);
    const challengerBalAfter = await web3.eth.getBalance(challenger);
    const submitterBalAfter = await web3.eth.getBalance(submitter);
    assert.equal(
      submitterBalAfter.toString(),
      submitterBalBefore.plus(Math.floor(itemBeforeRuling[4] / 2)).toString(),
      "Submitter not refunded properly"
    );
    assert.equal(
      challengerBalAfter.toString(),
      challengerBalBefore.plus(Math.floor(itemBeforeRuling[4] / 2)).toString(),
      "Challenger not refunded properly"
    );
  });
});
