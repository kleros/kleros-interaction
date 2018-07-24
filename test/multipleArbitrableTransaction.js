/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const { expectThrow, increaseTime } = require("../helpers/utils");
const MultipleArbitrableTransaction = artifacts.require(
  "./MultipleArbitrableTransaction.sol"
);
const CentralizedArbitrator = artifacts.require("./CentralizedArbitrator.sol");

contract("MultipleArbitrableTransaction", function(accounts) {
  let payer = accounts[0]
  let payee = accounts[1]
  let arbitrator = accounts[2]
  let other = accounts[3]
  let amount = 1000
  let timeout = 100
  let arbitrationFee = 20
  let gasPrice = 5000000000
  const metaEvidenceUri = 'https://kleros.io'

  async function getLastTransaction(multipleContract, callback) {
    const metaEvidenceEvent = multipleContract.MetaEvidence();
    const awaitable = new Promise((resolve, reject) => {
      const handler = metaEvidenceEvent.watch((error, result) => {
        metaEvidenceEvent.stopWatching();
        if (!error) {
          resolve(result);
        } else {
          reject(error);
        }
      });
    });
    await callback();
    return await awaitable;
  }

  it("Should handle 1 transaction", async () => {
    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          0x0,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );

    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();
    let payerBalanceBeforeReimbursment = web3.eth.getBalance(payer);
    await multipleContract.reimburse(arbitrableTransactionId, 1000, {
      from: payee
    });
    let newPayerBalance = web3.eth.getBalance(payer);
    let newContractBalance = web3.eth.getBalance(multipleContract.address);
    let newAmount = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[2];

    assert.equal(
      newPayerBalance.toString(),
      payerBalanceBeforeReimbursment.plus(1000).toString(),
      "The payer has not been reimbursed correctly"
    );
    assert.equal(
      newContractBalance.toNumber(),
      0,
      "Bad amount in the contract"
    );
    assert.equal(newAmount.toNumber(), 0, "Amount not updated correctly");
  });

  it("Should handle 3 transaction", async () => {
    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });
    for (var cnt = 0; cnt < 3; cnt += 1) {
      const lastTransaction = await getLastTransaction(
        multipleContract,
        async () => {
          await multipleContract.createTransaction(
            0x0,
            timeout,
            payee,
            0x0,
            metaEvidenceUri,
            { from: payer, value: amount }
          );
        }
      );

      let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

      let payerBalanceBeforeReimbursment = web3.eth.getBalance(payer);
      await multipleContract.reimburse(arbitrableTransactionId, 1000, {
        from: payee
      });
      let newPayerBalance = web3.eth.getBalance(payer);
      let newContractBalance = web3.eth.getBalance(multipleContract.address);
      let newAmount = (await multipleContract.transactions(
        arbitrableTransactionId
      ))[2];

      assert.equal(
        newPayerBalance.toString(),
        payerBalanceBeforeReimbursment.plus(1000).toString(),
        "The payer has not been reimbursed correctly"
      );
      assert.equal(
        newContractBalance.toNumber(),
        0,
        "Bad amount in the contract"
      );
      assert.equal(newAmount.toNumber(), 0, "Amount not updated correctly");
    }
  });

  it("Should put 1000 wei in the contract", async () => {
    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          0x0,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );

    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    assert.equal(
      web3.eth.getBalance(multipleContract.address),
      1000,
      "The contract hasn't received the wei correctly."
    );
    let amountSending = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[2];

    assert.equal(
      amountSending.toNumber(),
      1000,
      "The contract hasn't updated its amount correctly."
    );
  });

  // Pay
  it("The payee should withdraw", async () => {
    let initialPayeeBalance = web3.eth.getBalance(payee);
    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          0x0,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );

    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    increaseTime(timeout + 1);
    let tx = await multipleContract.withdraw(arbitrableTransactionId, {
      from: payee
    });
    let consumed = tx.receipt.gasUsed * 100000000000;
    let newPayeeBalance = web3.eth.getBalance(payee);
    assert.equal(
      newPayeeBalance.toString(),
      initialPayeeBalance.plus(1000 - consumed).toString(),
      "The payee hasn't been paid properly"
    );
  });

  it("The payer should not withdraw", async () => {
    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          0x0,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );
    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();
    await expectThrow(
      multipleContract.withdraw(arbitrableTransactionId, { from: payer })
    );
  });

  // Reimburse
  it("Should reimburse 507 to the payer", async () => {
    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          0x0,
          0 /* timeout */,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );
    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    let payerBalanceBeforeReimbursment = web3.eth.getBalance(payer);
    await multipleContract.reimburse(arbitrableTransactionId, 507, {
      from: payee
    });
    let newPayerBalance = web3.eth.getBalance(payer);
    let newContractBalance = web3.eth.getBalance(multipleContract.address);
    let newAmount = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[2];

    assert.equal(
      newPayerBalance.toString(),
      payerBalanceBeforeReimbursment.plus(507).toString(),
      "The payer has not been reimbursed correctly"
    );
    assert.equal(
      newContractBalance.toNumber(),
      493,
      "Bad amount in the contract"
    );
    assert.equal(newAmount.toNumber(), 493, "Amount not updated correctly");
  });

  it("Should reimburse 1000 (all) to the payer", async () => {
    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          0x0,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );
    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    let payerBalanceBeforeReimbursment = web3.eth.getBalance(payer);
    await multipleContract.reimburse(arbitrableTransactionId, 1000, {
      from: payee
    });
    let newPayerBalance = web3.eth.getBalance(payer);
    let newContractBalance = web3.eth.getBalance(multipleContract.address);
    let newAmount = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[2];

    assert.equal(
      newPayerBalance.toString(),
      payerBalanceBeforeReimbursment.plus(1000).toString(),
      "The payer has not been reimbursed correctly"
    );
    assert.equal(
      newContractBalance.toNumber(),
      0,
      "Bad amount in the contract"
    );
    assert.equal(newAmount.toNumber(), 0, "Amount not updated correctly");
  });

  it("Should fail if we try to reimburse more", async () => {
    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          0x0,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );
    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    await expectThrow(
      multipleContract.reimburse(arbitrableTransactionId, 1003, { from: payee })
    );
  });

  it("Should fail if the payer to tries to reimburse it", async () => {
    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          0x0,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );
    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    await expectThrow(
      multipleContract.reimburse(arbitrableTransactionId, 1000, { from: payer })
    );
  });

  // executeRuling
  it("Should reimburse the payer (including arbitration fee) when the arbitrator decides so", async () => {
    let centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );

    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          centralizedArbitrator.address,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );
    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    await multipleContract.payArbitrationFeeBySeller(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    });
    await multipleContract.payArbitrationFeeByBuyer(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    });
    let payerBalanceBeforeReimbursment = web3.eth.getBalance(payer);
    await centralizedArbitrator.giveRuling(0, 1, { from: arbitrator });
    let newPayerBalance = web3.eth.getBalance(payer);
    assert.equal(
      newPayerBalance.toString(),
      payerBalanceBeforeReimbursment.plus(1020).toString(),
      "The payer has not been reimbursed correctly"
    );
  });

  it("Should pay the payee and reimburse him the arbitration fee when the arbitrator decides so", async () => {
    let centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );
    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          centralizedArbitrator.address,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );
    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    await multipleContract.payArbitrationFeeByBuyer(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    });
    await multipleContract.payArbitrationFeeBySeller(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    });
    let payeeBalanceBeforePay = web3.eth.getBalance(payee);
    await centralizedArbitrator.giveRuling(0, 2, { from: arbitrator });
    let newPayeeBalance = web3.eth.getBalance(payee);
    assert.equal(
      newPayeeBalance.toString(),
      payeeBalanceBeforePay.plus(1020).toString(),
      "The payee has not been paid properly"
    );
  });

  it("It should do nothing if the arbitrator decides so", async () => {
    let centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );
    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          centralizedArbitrator.address,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );
    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    await multipleContract.payArbitrationFeeByBuyer(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    });
    await multipleContract.payArbitrationFeeBySeller(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    });
    let payeeBalanceBeforePay = web3.eth.getBalance(payee);
    let payerBalanceBeforeReimbursment = web3.eth.getBalance(payer);
    await centralizedArbitrator.giveRuling(0, 0, { from: arbitrator });
    let newPayeeBalance = web3.eth.getBalance(payee);
    let newPayerBalance = web3.eth.getBalance(payer);
    assert.equal(
      newPayeeBalance.toString(),
      payeeBalanceBeforePay.toString(),
      "The payee got wei while it shouldn't"
    );
    assert.equal(
      newPayerBalance.toString(),
      payerBalanceBeforeReimbursment.toString(),
      "The payer got wei while it shouldn't"
    );
  });

  it("Should reimburse the payer in case of timeout of the payee", async () => {
    let centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );

    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          centralizedArbitrator.address,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );
    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    await multipleContract.payArbitrationFeeByBuyer(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    });
    increaseTime(timeout + 1);
    let payerBalanceBeforeReimbursment = web3.eth.getBalance(payer);
    let tx = await multipleContract.timeOutByBuyer(arbitrableTransactionId, {
      from: payer,
      gasPrice: gasPrice
    });
    let txFee = tx.receipt.gasUsed * gasPrice;
    let newPayerBalance = web3.eth.getBalance(payer);
    assert.equal(
      newPayerBalance.toString(),
      payerBalanceBeforeReimbursment
        .plus(1020)
        .minus(txFee)
        .toString(),
      "The payer has not been reimbursed correctly"
    );
  });

  it("Shouldn't work before timeout for the payer", async () => {
    let centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );

    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          centralizedArbitrator.address,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );
    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    await expectThrow(
      multipleContract.timeOutByBuyer(arbitrableTransactionId, {
        from: payer,
        gasPrice: gasPrice
      })
    );
    await multipleContract.payArbitrationFeeByBuyer(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    });
    increaseTime(1);
    await expectThrow(
      multipleContract.timeOutByBuyer(arbitrableTransactionId, {
        from: payer,
        gasPrice: gasPrice
      })
    );
  });

  it("Should pay and reimburse the payee in case of timeout of the payer", async () => {
    let centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );

    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          centralizedArbitrator.address,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );
    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    await multipleContract.payArbitrationFeeBySeller(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    });
    increaseTime(timeout + 1);
    let payeeBalanceBeforeReimbursment = web3.eth.getBalance(payee);
    let tx = await multipleContract.timeOutBySeller(arbitrableTransactionId, {
      from: payee,
      gasPrice: gasPrice
    });
    let txFee = tx.receipt.gasUsed * gasPrice;
    let newPayeeBalance = web3.eth.getBalance(payee);
    assert.equal(
      newPayeeBalance.toString(),
      payeeBalanceBeforeReimbursment
        .plus(1020)
        .minus(txFee)
        .toString(),
      "The payee has not been paid correctly"
    );
  });

  it("Shouldn't work before timeout for the payee", async () => {
    let centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );

    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          centralizedArbitrator.address,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );
    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    await expectThrow(
      multipleContract.timeOutBySeller(arbitrableTransactionId, {
        from: payee,
        gasPrice: gasPrice
      })
    );
    await multipleContract.payArbitrationFeeBySeller(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    });
    increaseTime(1);
    await expectThrow(
      multipleContract.timeOutBySeller(arbitrableTransactionId, {
        from: payee,
        gasPrice: gasPrice
      })
    );
  });

  // submitEvidence
  it("Should create events when evidence is submitted by the payer", async () => {
    let centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );

    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          centralizedArbitrator.address,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );
    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    await multipleContract.payArbitrationFeeByBuyer(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    });
    await multipleContract.payArbitrationFeeBySeller(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    });
    let tx = await multipleContract.submitEvidence(
      arbitrableTransactionId,
      "ipfs:/X",
      { from: payer }
    );
    assert.equal(tx.logs[0].event, "Evidence");
    assert.equal(tx.logs[0].args._arbitrator, centralizedArbitrator.address);
    assert.equal(tx.logs[0].args._party, payer);
    assert.equal(tx.logs[0].args._evidence, "ipfs:/X");
  });

  it("Should create events when evidence is submitted by the payee", async () => {
    let centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );

    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          centralizedArbitrator.address,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );
    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    await multipleContract.payArbitrationFeeByBuyer(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    });
    await multipleContract.payArbitrationFeeBySeller(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    });
    let tx = await multipleContract.submitEvidence(
      arbitrableTransactionId,
      "ipfs:/X",
      { from: payee }
    );
    assert.equal(tx.logs[0].event, "Evidence");
    assert.equal(tx.logs[0].args._arbitrator, centralizedArbitrator.address);
    assert.equal(tx.logs[0].args._party, payee);
    assert.equal(tx.logs[0].args._evidence, "ipfs:/X");
  });

  it("Should fail if someone else try to submit", async () => {
    let centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );

    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          centralizedArbitrator.address,
          timeout,
          payee,
          0x0,
          metaEvidenceUri,
          { from: payer, value: amount }
        );
      }
    );
    let arbitrableTransactionId = lastTransaction.args._transactionId.toNumber();

    await multipleContract.payArbitrationFeeByBuyer(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    });
    await multipleContract.payArbitrationFeeBySeller(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    });
    await expectThrow(
      multipleContract.submitEvidence(arbitrableTransactionId, "ipfs:/X", {
        from: other
      })
    );
  });

  it("Should handle multiple transactions concurrently", async () => {
    let centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );

    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });

    const metaEvidenceEvent = multipleContract.MetaEvidence();

    let currentResolve;
    let lastTransactionEvent = -1;
    const handler = metaEvidenceEvent.watch((error, result) => {
      const eventTransaction = result.args._transactionId.toNumber();
      if (eventTransaction > lastTransactionEvent) {
        lastTransactionEvent = eventTransaction;
        currentResolve(result);
      }
    });

    const transaction1Promise = new Promise(resolve => {
      currentResolve = resolve;

      multipleContract.createTransaction(
        centralizedArbitrator.address,
        timeout,
        payee,
        0x0,
        metaEvidenceUri,
        { from: payer, value: amount }
      );
    });

    const lastTransaction = await transaction1Promise;

    let arbitrableTransactionId1 = lastTransaction.args._transactionId.toNumber();

    const transaction2Promise = new Promise(resolve => {
      currentResolve = resolve;

      multipleContract.createTransaction(
        centralizedArbitrator.address,
        timeout,
        payee,
        0x0,
        metaEvidenceUri,
        { from: payer, value: amount }
      );
    });

    const lastTransaction2 = await transaction2Promise;

    let arbitrableTransactionId2 = lastTransaction2.args._transactionId.toNumber();

    metaEvidenceEvent.stopWatching();

    await multipleContract.payArbitrationFeeByBuyer(arbitrableTransactionId2, {
      from: payer,
      value: arbitrationFee
    });
    await multipleContract.payArbitrationFeeBySeller(arbitrableTransactionId1, {
      from: payee,
      value: arbitrationFee
    });
    //This generates transaction 1 dispute 0
    await multipleContract.payArbitrationFeeByBuyer(arbitrableTransactionId1, {
      from: payer,
      value: arbitrationFee
    });
    //This generates transaction 2 dispute 1
    await multipleContract.payArbitrationFeeBySeller(arbitrableTransactionId2, {
      from: payee,
      value: arbitrationFee
    });

    let payerBalanceBeforeReimbursment = web3.eth.getBalance(payer);
    //Ruling for transaction 1
    await centralizedArbitrator.giveRuling(0, 1, { from: arbitrator });
    let newPayerBalance = web3.eth.getBalance(payer);
    assert.equal(
      newPayerBalance.toString(),
      payerBalanceBeforeReimbursment.plus(1020).toString(),
      "The payer has not been reimbursed correctly"
    );

    let payeeBalanceBeforePay = web3.eth.getBalance(payee);
    //ruling for transaction 2
    await centralizedArbitrator.giveRuling(1, 2, { from: arbitrator });
    let newPayeeBalance = web3.eth.getBalance(payee);
    assert.equal(
      newPayeeBalance.toString(),
      payeeBalanceBeforePay.plus(1020).toString(),
      "The payee has not been paid properly"
    );
  });

  it("Should handle multiple transactions and arbitrators concurrently", async () => {
    let centralizedArbitrator1 = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    );
    let centralizedArbitrator2 = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: other }
    );

    let multipleContract = await MultipleArbitrableTransaction.new({
      from: payer
    });

    const metaEvidenceEvent = multipleContract.MetaEvidence();

    let currentResolve;
    let lastTransactionEvent = -1;
    const handler = metaEvidenceEvent.watch((error, result) => {
      const eventTransaction = result.args._transactionId.toNumber();
      if (eventTransaction > lastTransactionEvent) {
        lastTransactionEvent = eventTransaction;
        currentResolve(result);
      }
    });

    const transaction1Promise = new Promise(resolve => {
      currentResolve = resolve;

      multipleContract.createTransaction(
        centralizedArbitrator1.address,
        timeout,
        payee,
        0x0,
        metaEvidenceUri,
        { from: payer, value: amount }
      );
    });

    const lastTransaction = await transaction1Promise;

    let arbitrableTransactionId1 = lastTransaction.args._transactionId.toNumber();

    const transaction2Promise = new Promise(resolve => {
      currentResolve = resolve;

      multipleContract.createTransaction(
        centralizedArbitrator2.address,
        timeout,
        payee,
        0x0,
        metaEvidenceUri,
        { from: payer, value: amount }
      );
    });

    const lastTransaction2 = await transaction2Promise;

    let arbitrableTransactionId2 = lastTransaction2.args._transactionId.toNumber();

    metaEvidenceEvent.stopWatching();

    await multipleContract.payArbitrationFeeByBuyer(arbitrableTransactionId2, {
      from: payer,
      value: arbitrationFee
    });
    await multipleContract.payArbitrationFeeBySeller(arbitrableTransactionId1, {
      from: payee,
      value: arbitrationFee
    });
    //This generates transaction 1 dispute 0 from arbitrator 1
    await multipleContract.payArbitrationFeeByBuyer(arbitrableTransactionId1, {
      from: payer,
      value: arbitrationFee
    });
    //This generates transaction 2 dispute 0 from arbitrator 2
    await multipleContract.payArbitrationFeeBySeller(arbitrableTransactionId2, {
      from: payee,
      value: arbitrationFee
    });

    let payerBalanceBeforeReimbursment = web3.eth.getBalance(payer);
    //Ruling for transaction 1
    await centralizedArbitrator1.giveRuling(0, 1, { from: arbitrator });
    let newPayerBalance = web3.eth.getBalance(payer);
    assert.equal(
      newPayerBalance.toString(),
      payerBalanceBeforeReimbursment.plus(1020).toString(),
      "The payer has not been reimbursed correctly"
    );

    let payeeBalanceBeforePay = web3.eth.getBalance(payee);
    //ruling for transaction 2
    await centralizedArbitrator2.giveRuling(0, 2, { from: other });
    let newPayeeBalance = web3.eth.getBalance(payee);
    assert.equal(
      newPayeeBalance.toString(),
      payeeBalanceBeforePay.plus(1020).toString(),
      "The payee has not been paid properly"
    );
  });
});
