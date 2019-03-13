/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const MultipleArbitrableTransaction = artifacts.require(
  './MultipleArbitrableTransaction.sol'
)
const CentralizedArbitrator = artifacts.require('./CentralizedArbitrator.sol')

contract('MultipleArbitrableTransaction', function(accounts) {
  const sender = accounts[0]
  const receiver = accounts[1]
  const arbitrator = accounts[2]
  const other = accounts[3]
  const amount = 1000
  const feeTimeout = 100
  const timeoutPayment = 100
  const timeout = 100 // TODO must remove it
  const arbitrationFee = 20
  const gasPrice = 5000000000
  const metaEvidenceUri = 'https://kleros.io'

  /**
   * Getter for the last transaction
   * @param {MultipleArbitrableTransaction} multipleContract Multiple arbitrable transaction instance.
   * @param {function} callback The callback.
   * @returns {function} The last transaction.
   */
  async function getLastTransaction(multipleContract, callback) {
    const metaEvidenceEvent = multipleContract.MetaEvidence()
    const awaitable = new Promise((resolve, reject) => {
      const _handler = metaEvidenceEvent.watch((error, result) => {
        metaEvidenceEvent.stopWatching()
        if (!error) resolve(result)
        else reject(error)
      })
    })
    await callback()
    return awaitable
  }

  it('Should handle 1 transaction', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      feeTimeout,
      { from: sender }
    )
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )

    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()
    const senderBalanceBeforeReimbursment = web3.eth.getBalance(sender)
    await multipleContract.reimburse(arbitrableTransactionId, 1000, {
      from: receiver
    })
    const newSenderBalance = web3.eth.getBalance(sender)
    const newContractBalance = web3.eth.getBalance(multipleContract.address)
    const newAmount = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[2]

    assert.equal(
      newSenderBalance.toString(),
      senderBalanceBeforeReimbursment.plus(1000).toString(),
      'The sender has not been reimbursed correctly'
    )
    assert.equal(newContractBalance.toNumber(), 0, 'Bad amount in the contract')
    assert.equal(newAmount.toNumber(), 0, 'Amount not updated correctly')
  })

  it('Should handle 3 transaction', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      feeTimeout,
      { from: sender }
    )
    for (var cnt = 0; cnt < 3; cnt += 1) {
      const lastTransaction = await getLastTransaction(
        multipleContract,
        async () => {
          await multipleContract.createTransaction(
            timeoutPayment,
            receiver,
            metaEvidenceUri,
            { from: sender, value: amount }
          )
        }
      )

      const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

      const senderBalanceBeforeReimbursment = web3.eth.getBalance(sender)
      await multipleContract.reimburse(arbitrableTransactionId, 1000, {
        from: receiver
      })
      const newSenderBalance = web3.eth.getBalance(sender)
      const newContractBalance = web3.eth.getBalance(multipleContract.address)
      const newAmount = (await multipleContract.transactions(
        arbitrableTransactionId
      ))[2]

      assert.equal(
        newSenderBalance.toString(),
        senderBalanceBeforeReimbursment.plus(1000).toString(),
        'The sender has not been reimbursed correctly'
      )
      assert.equal(
        newContractBalance.toNumber(),
        0,
        'Bad amount in the contract'
      )
      assert.equal(newAmount.toNumber(), 0, 'Amount not updated correctly')
    }
  })

  it('Should put 1000 wei in the contract', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      feeTimeout,
      { from: sender }
    )
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )

    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    assert.equal(
      web3.eth.getBalance(multipleContract.address),
      1000,
      "The contract hasn't received the wei correctly."
    )
    const amountSending = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[2]

    assert.equal(
      amountSending.toNumber(),
      1000,
      "The contract hasn't updated its amount correctly."
    )
  })

  // Pay
  it('The receiver should execute payment', async () => {
    const initialReceiverBalance = web3.eth.getBalance(receiver)
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      feeTimeout,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )

    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await increaseTime(timeoutPayment + 1)

    const tx = await multipleContract.executeTransaction(
      arbitrableTransactionId,
      {
        from: receiver
      }
    )

    const consumed = tx.receipt.gasUsed * 100000000000
    const newReceiverBalance = web3.eth.getBalance(receiver)
    assert.equal(
      newReceiverBalance.toString(),
      initialReceiverBalance.plus(1000 - consumed).toString(),
      "The receiver hasn't been paid properly"
    )
  })

  it('The sender should not withdraw', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      feeTimeout,
      { from: sender }
    )
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()
    await expectThrow(
      multipleContract.executeTransaction(arbitrableTransactionId, {
        from: sender
      })
    )
  })

  // Reimburse
  it('Should reimburse 507 to the sender', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      0,
      { from: sender }
    )
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    const senderBalanceBeforeReimbursment = web3.eth.getBalance(sender)
    await multipleContract.reimburse(arbitrableTransactionId, 507, {
      from: receiver
    })
    const newSenderBalance = web3.eth.getBalance(sender)
    const newContractBalance = web3.eth.getBalance(multipleContract.address)
    const newAmount = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[2]

    assert.equal(
      newSenderBalance.toString(),
      senderBalanceBeforeReimbursment.plus(507).toString(),
      'The sender has not been reimbursed correctly'
    )
    assert.equal(
      newContractBalance.toNumber(),
      493,
      'Bad amount in the contract'
    )
    assert.equal(newAmount.toNumber(), 493, 'Amount not updated correctly')
  })

  it('Should reimburse 1000 (all) to the sender', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      0,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    const senderBalanceBeforeReimbursment = web3.eth.getBalance(sender)
    await multipleContract.reimburse(arbitrableTransactionId, 1000, {
      from: receiver
    })
    const newSenderBalance = web3.eth.getBalance(sender)
    const newContractBalance = web3.eth.getBalance(multipleContract.address)
    const newAmount = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[2]

    assert.equal(
      newSenderBalance.toString(),
      senderBalanceBeforeReimbursment.plus(1000).toString(),
      'The sender has not been reimbursed correctly'
    )
    assert.equal(newContractBalance.toNumber(), 0, 'Bad amount in the contract')
    assert.equal(newAmount.toNumber(), 0, 'Amount not updated correctly')
  })

  it('Should fail if we try to reimburse more', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      0,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await expectThrow(
      multipleContract.reimburse(arbitrableTransactionId, 1003, {
        from: receiver
      })
    )
  })

  it('Should fail if the sender to tries to reimburse it', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      0,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await expectThrow(
      multipleContract.reimburse(arbitrableTransactionId, 1000, {
        from: sender
      })
    )
  })

  // executeRuling
  it('Should reimburse the sender (including arbitration fee) when the arbitrator decides so', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      0,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: receiver,
        value: arbitrationFee
      }
    )
    const senderBalanceBeforeReimbursment = web3.eth.getBalance(sender)
    await centralizedArbitrator.giveRuling(0, 1, { from: arbitrator })
    const newSenderBalance = web3.eth.getBalance(sender)
    assert.equal(
      newSenderBalance.toString(),
      senderBalanceBeforeReimbursment.plus(1020).toString(),
      'The sender has not been reimbursed correctly'
    )
  })

  it('Should pay the receiver and reimburse him the arbitration fee when the arbitrator decides so', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      0,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: receiver,
        value: arbitrationFee
      }
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    const receiverBalanceBeforePay = web3.eth.getBalance(receiver)
    await centralizedArbitrator.giveRuling(0, 2, { from: arbitrator })
    const newReceiverBalance = web3.eth.getBalance(receiver)
    assert.equal(
      newReceiverBalance.toString(),
      receiverBalanceBeforePay.plus(1020).toString(),
      'The receiver has not been paid properly'
    )
  })

  it('Should split the amount if there is no ruling', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      0,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: receiver,
        value: arbitrationFee
      }
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    const senderBalanceBeforeRuling = web3.eth.getBalance(sender)
    const receiverBalanceBeforeRuling = web3.eth.getBalance(receiver)

    await centralizedArbitrator.giveRuling(0, 0, { from: arbitrator })

    const senderBalanceAfterRuling = web3.eth.getBalance(sender)
    const receiverBalanceAfterRuling = web3.eth.getBalance(receiver)

    assert.equal(
      receiverBalanceAfterRuling.toString(),
      receiverBalanceBeforeRuling.plus(510).toString(),
      'The receiver has not been reimbursed correctly'
    )

    assert.equal(
      senderBalanceAfterRuling.toString(),
      senderBalanceBeforeRuling.plus(510).toString(),
      'The sender has not been paid properly'
    )
  })

  it('Should refund overpaid arbitration fee for sender', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      0,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    const extraAmount = 100
    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: receiver,
        value: arbitrationFee + extraAmount
      }
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    const senderBalanceBeforePay = web3.eth.getBalance(sender)
    await centralizedArbitrator.giveRuling(0, 2, { from: arbitrator })
    const newSenderBalance = web3.eth.getBalance(sender)
    assert.equal(
      newSenderBalance.toString(),
      senderBalanceBeforePay.plus(0).toString(),
      'The sender was not refunded properly'
    )
  })

  it('Should change status to WaitingReceiver after the arbitration cost increase', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      0,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )

    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: receiver,
        value: arbitrationFee
      }
    )

    arbitrableTransactionStatus = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[8]

    assert.equal(
      arbitrableTransactionStatus.toNumber(),
      1, // `Status.WaitingSender == 1`
      'The transaction did not change correctly to new status: `Status.WaitingSender`'
    )

    await centralizedArbitrator.setArbitrationPrice(arbitrationFee + 42, {
      from: arbitrator
    })

    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee + 42
    })

    arbitrableTransactionStatus = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[8]

    assert.equal(
      arbitrableTransactionStatus.toNumber(),
      2, // `Status.WaitingReceiver == 2`
      'The transaction did not change correctly to new status: `Status.WaitingReceiver`'
    )
  })

  it('Should split correclty the arbitration cost after the arbitration cost increase', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      0,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )

    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: receiver,
        value: arbitrationFee
      }
    )

    await centralizedArbitrator.setArbitrationPrice(arbitrationFee + 42, {
      from: arbitrator
    })

    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee + 42
    })

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: receiver,
        value: 42 + 10 // Pay the rest of arbitration fee with an extra to test also the refund in this case
      }
    )

    const senderBalanceBeforeRuling = web3.eth.getBalance(sender)
    const receiverBalanceBeforeRuling = web3.eth.getBalance(receiver)

    await centralizedArbitrator.giveRuling(0, 0, { from: arbitrator })

    const senderBalanceAfterRuling = web3.eth.getBalance(sender)
    const receiverBalanceAfterRuling = web3.eth.getBalance(receiver)

    assert.equal(
      receiverBalanceAfterRuling.toString(),
      receiverBalanceBeforeRuling
        .plus(510)
        .plus(21)
        .toString(),
      'The receiver has not been reimbursed correctly'
    )

    assert.equal(
      senderBalanceAfterRuling.toString(),
      senderBalanceBeforeRuling
        .plus(510)
        .plus(21)
        .toString(),
      'The sender has not been paid properly'
    )

    // check also the contract balance
    assert.equal(
      web3.eth.getBalance(multipleContract.address),
      0,
      'The ETH amount in the contract is not 0'
    )
  })

  it('Should reimburse the sender in case of timeout of the receiver', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      0,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    await increaseTime(timeout + 1)
    const senderBalanceBeforeReimbursment = web3.eth.getBalance(sender)
    const tx = await multipleContract.timeOutBySender(arbitrableTransactionId, {
      from: sender,
      gasPrice: gasPrice
    })
    const txFee = tx.receipt.gasUsed * gasPrice
    const newSenderBalance = web3.eth.getBalance(sender)
    assert.equal(
      newSenderBalance.toString(),
      senderBalanceBeforeReimbursment
        .plus(1020)
        .minus(txFee)
        .toString(),
      'The sender has not been reimbursed correctly'
    )
  })

  it("Shouldn't work before timeout for the sender", async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      feeTimeout,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await expectThrow(
      multipleContract.timeOutBySender(arbitrableTransactionId, {
        from: sender,
        gasPrice: gasPrice
      })
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    await increaseTime(1)
    await expectThrow(
      multipleContract.timeOutBySender(arbitrableTransactionId, {
        from: sender,
        gasPrice: gasPrice
      })
    )
  })

  it('Should pay and reimburse the receiver in case of timeout of the sender', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      feeTimeout,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: receiver,
        value: arbitrationFee
      }
    )
    await increaseTime(feeTimeout + 1)
    const receiverBalanceBeforeReimbursment = web3.eth.getBalance(receiver)
    const tx = await multipleContract.timeOutByReceiver(
      arbitrableTransactionId,
      {
        from: receiver,
        gasPrice: gasPrice
      }
    )
    const txFee = tx.receipt.gasUsed * gasPrice
    const newReceiverBalance = web3.eth.getBalance(receiver)
    assert.equal(
      newReceiverBalance.toString(),
      receiverBalanceBeforeReimbursment
        .plus(1020)
        .minus(txFee)
        .toString(),
      'The receiver has not been paid correctly'
    )
  })

  it("Shouldn't work before timeout for the receiver", async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      feeTimeout,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await expectThrow(
      multipleContract.timeOutByReceiver(arbitrableTransactionId, {
        from: receiver,
        gasPrice: gasPrice
      })
    )
    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: receiver,
        value: arbitrationFee
      }
    )
    await increaseTime(1)
    await expectThrow(
      multipleContract.timeOutByReceiver(arbitrableTransactionId, {
        from: receiver,
        gasPrice: gasPrice
      })
    )
  })

  // submitEvidence
  it('Should create events when evidence is submitted by the sender', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      feeTimeout,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: receiver,
        value: arbitrationFee
      }
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    const tx = await multipleContract.submitEvidence(
      arbitrableTransactionId,
      'ipfs:/X',
      { from: sender }
    )
    assert.equal(tx.logs[0].event, 'Evidence')
    assert.equal(tx.logs[0].args._arbitrator, centralizedArbitrator.address)
    assert.equal(tx.logs[0].args._party, sender)
    assert.equal(tx.logs[0].args._evidence, 'ipfs:/X')
  })

  it('Should create events when evidence is submitted by the receiver', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      feeTimeout,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: receiver,
        value: arbitrationFee
      }
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    const tx = await multipleContract.submitEvidence(
      arbitrableTransactionId,
      'ipfs:/X',
      { from: receiver }
    )
    assert.equal(tx.logs[0].event, 'Evidence')
    assert.equal(tx.logs[0].args._arbitrator, centralizedArbitrator.address)
    assert.equal(tx.logs[0].args._party, receiver)
    assert.equal(tx.logs[0].args._evidence, 'ipfs:/X')
  })

  it('Should fail if someone else try to submit', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      feeTimeout,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: amount }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: receiver,
        value: arbitrationFee
      }
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    await expectThrow(
      multipleContract.submitEvidence(arbitrableTransactionId, 'ipfs:/X', {
        from: other
      })
    )
  })

  it('Should handle multiple transactions concurrently', async () => {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )

    const multipleContract = await MultipleArbitrableTransaction.new(
      centralizedArbitrator.address,
      0x0,
      feeTimeout,
      { from: sender }
    )

    const metaEvidenceEvent = multipleContract.MetaEvidence()

    let currentResolve
    let lastTransactionEvent = -1
    metaEvidenceEvent.watch((_error, result) => {
      const eventTransaction = result.args._metaEvidenceID.toNumber()
      if (eventTransaction > lastTransactionEvent) {
        lastTransactionEvent = eventTransaction
        currentResolve(result)
      }
    })

    const transaction1Promise = new Promise(resolve => {
      currentResolve = resolve

      multipleContract.createTransaction(
        timeoutPayment,
        receiver,
        metaEvidenceUri,
        { from: sender, value: amount }
      )
    })

    const lastTransaction = await transaction1Promise

    const arbitrableTransactionId1 = lastTransaction.args._metaEvidenceID.toNumber()

    const transaction2Promise = new Promise(resolve => {
      currentResolve = resolve

      multipleContract.createTransaction(
        timeoutPayment,
        receiver,
        metaEvidenceUri,
        { from: sender, value: amount }
      )
    })

    const lastTransaction2 = await transaction2Promise

    const arbitrableTransactionId2 = lastTransaction2.args._metaEvidenceID.toNumber()

    metaEvidenceEvent.stopWatching()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId2,
      {
        from: receiver,
        value: arbitrationFee
      }
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId1, {
      from: sender,
      value: arbitrationFee
    })
    // This generates transaction 1 dispute 0
    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId1,
      {
        from: receiver,
        value: arbitrationFee
      }
    )
    // This generates transaction 2 dispute 1
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId2, {
      from: sender,
      value: arbitrationFee
    })

    const senderBalanceBeforeReimbursment = web3.eth.getBalance(sender)
    // Ruling for transaction 1
    await centralizedArbitrator.giveRuling(0, 1, { from: arbitrator })
    const newSenderBalance = web3.eth.getBalance(sender)
    assert.equal(
      newSenderBalance.toString(),
      senderBalanceBeforeReimbursment.plus(1020).toString(),
      'The sender has not been reimbursed correctly'
    )

    const receiverBalanceBeforePay = web3.eth.getBalance(receiver)
    // ruling for transaction 2
    await centralizedArbitrator.giveRuling(1, 2, { from: arbitrator })
    const newReceiverBalance = web3.eth.getBalance(receiver)
    assert.equal(
      newReceiverBalance.toString(),
      receiverBalanceBeforePay.plus(1020).toString(),
      'The receiver has not been paid properly'
    )
  })

  // FIXME
  // it('Should handle multiple transactions and arbitrators concurrently', async () => {
  //   const centralizedArbitrator1 = await CentralizedArbitrator.new(
  //     arbitrationFee,
  //     { from: arbitrator }
  //   )
  //   const centralizedArbitrator2 = await CentralizedArbitrator.new(
  //     arbitrationFee,
  //     { from: other }
  //   )

  //   const multipleContract1 = await MultipleArbitrableTransaction.new(
  //     centralizedArbitrator1.address,
  //     0x0,
  //     feeTimeout,
  //     { from: sender }
  //   )

  //   const metaEvidenceEvent = multipleContract1.MetaEvidence()

  //   let currentResolve
  //   let lastTransactionEvent = -1
  //   const _handler = metaEvidenceEvent.watch((_error, result) => {
  //     const eventTransaction = result.args._metaEvidenceID.toNumber()
  //     if (eventTransaction > lastTransactionEvent) {
  //       lastTransactionEvent = eventTransaction
  //       currentResolve(result)
  //     }
  //   })

  //   const transaction1Promise = new Promise(resolve => {
  //     currentResolve = resolve

  //     multipleContract1.createTransaction(
  //       timeoutPayment,
  //       receiver,
  //       metaEvidenceUri,
  //       { from: sender, value: amount }
  //     )
  //   })

  //   const lastTransaction = await transaction1Promise

  //   const arbitrableTransactionId1 = lastTransaction.args._metaEvidenceID.toNumber()

  //   const multipleContract2 = await MultipleArbitrableTransaction.new(
  //     centralizedArbitrator2.address,
  //     0x0,
  //     feeTimeout,
  //     { from: sender }
  //   )

  //   const transaction2Promise = new Promise(resolve => {
  //     currentResolve = resolve

  //     multipleContract2.createTransaction(
  //       timeoutPayment,
  //       receiver,
  //       metaEvidenceUri,
  //       { from: sender, value: amount }
  //     )
  //   })

  //   const lastTransaction2 = await transaction2Promise

  //   const arbitrableTransactionId2 = lastTransaction2.args._metaEvidenceID.toNumber()

  //   metaEvidenceEvent.stopWatching()

  //   await multipleContract1.payArbitrationFeeByReceiver(arbitrableTransactionId2, {
  //     from: sender,
  //     value: arbitrationFee
  //   })
  //   await multipleContract1.payArbitrationFeeBySender(arbitrableTransactionId1, {
  //     from: receiver,
  //     value: arbitrationFee
  //   })
  //   // This generates transaction 1 dispute 0 from arbitrator 1
  //   await multipleContract2.payArbitrationFeeByReceiver(arbitrableTransactionId1, {
  //     from: sender,
  //     value: arbitrationFee
  //   })
  //   // This generates transaction 2 dispute 0 from arbitrator 2
  //   await multipleContract2.payArbitrationFeeBySender(arbitrableTransactionId2, {
  //     from: receiver,
  //     value: arbitrationFee
  //   })

  //   const senderBalanceBeforeReimbursment = web3.eth.getBalance(sender)
  //   // Ruling for transaction 1
  //   await centralizedArbitrator1.giveRuling(0, 1, { from: arbitrator })
  //   const newSenderBalance = web3.eth.getBalance(sender)
  //   assert.equal(
  //     newSenderBalance.toString(),
  //     senderBalanceBeforeReimbursment.plus(1020).toString(),
  //     'The sender has not been reimbursed correctly'
  //   )

  //   const receiverBalanceBeforePay = web3.eth.getBalance(receiver)
  //   // ruling for transaction 2
  //   await centralizedArbitrator2.giveRuling(0, 2, { from: other })
  //   const newReceiverBalance = web3.eth.getBalance(receiver)
  //   assert.equal(
  //     newReceiverBalance.toString(),
  //     receiverBalanceBeforePay.plus(1020).toString(),
  //     'The receiver has not been paid properly'
  //   )
  // })
})
