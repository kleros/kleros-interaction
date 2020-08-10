/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const MultipleArbitrableTransaction = artifacts.require(
  './MultipleArbitrableTransactionWithAppeals.sol'
)
const CentralizedArbitrator = artifacts.require('./CentralizedArbitrator.sol')
const AppealableArbitrator = artifacts.require('EnhancedAppealableArbitrator')

contract('MultipleArbitrableTransactionWithAppeals', function(accounts) {
  const sender = accounts[0]
  const receiver = accounts[1]
  const arbitrator = accounts[2]
  const other = accounts[3]
  const feeTimeout = 100
  const timeoutPayment = 100
  const arbitrationFee = 20
  const gasPrice = 5000000000
  const metaEvidenceUri = 'https://kleros.io'
  const amount = 1000
  const sharedStakeMultiplier = 5000
  const winnerStakeMultiplier = 2000
  const loserStakeMultiplier = 8000

  const appealTimeout = 100

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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
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
    await multipleContract.reimburse(arbitrableTransactionId, amount, {
      from: receiver
    })
    const newSenderBalance = web3.eth.getBalance(sender)
    const newContractBalance = web3.eth.getBalance(multipleContract.address)
    const newAmount = (await multipleContract.transactions(
      arbitrableTransactionId
    ))[2]

    assert.equal(
      newSenderBalance.toString(),
      senderBalanceBeforeReimbursment.plus(amount).toString(),
      'The sender has not been reimbursed correctly'
    )
    assert.equal(newContractBalance.toNumber(), 0, 'Bad amount in the contract')
    assert.equal(newAmount.toNumber(), 0, 'Amount not updated correctly')
  })

  it('Should emit TransactionCreated', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      feeTimeout,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
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

    const eventResult = await new Promise((resolve, reject) => {
      multipleContract
        .TransactionCreated({}, { fromBlock: 0, toBlock: 'latest' })
        .get((error, eventResult) => {
          if (error)
            reject(new Error('Could not lookup TransactionCreated event log'))
          else resolve(eventResult)
        })
    })

    assert.equal(eventResult.length, 1)
    assert.equal(
      eventResult[0].args._transactionID.toNumber(),
      arbitrableTransactionId
    )
    assert.equal(eventResult[0].args._sender, sender)
    assert.equal(eventResult[0].args._receiver, receiver)
  })

  it('Should handle 3 transaction', async () => {
    const multipleContract = await MultipleArbitrableTransaction.new(
      0x0,
      0x0,
      feeTimeout,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
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
      await multipleContract.reimburse(arbitrableTransactionId, amount, {
        from: receiver
      })
      const newSenderBalance = web3.eth.getBalance(sender)
      const newContractBalance = web3.eth.getBalance(multipleContract.address)
      const newAmount = (await multipleContract.transactions(
        arbitrableTransactionId
      ))[2]

      assert.equal(
        newSenderBalance.toString(),
        senderBalanceBeforeReimbursment.plus(amount).toString(),
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )
    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()

    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    await increaseTime(timeoutPayment + 1)
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
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
        { from: sender, value: 1000 }
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
        { from: sender, value: 1000 }
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

  it('Should demand correct appeal fees and register that appeal fee has been paid', async () => {
    let roundInfo
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      arbitrator,
      0x0,
      appealTimeout,
      { from: arbitrator }
    )

    await appealableArbitrator.changeArbitrator(appealableArbitrator.address, {
      from: arbitrator
    })

    const multipleContract = await MultipleArbitrableTransaction.new(
      appealableArbitrator.address,
      0x0,
      feeTimeout,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()
    const MULTIPLIER_DIVISOR = (await multipleContract.MULTIPLIER_DIVISOR()).toNumber()

    await multipleContract.payArbitrationFeeByReceiver(
      arbitrableTransactionId,
      {
        from: receiver,
        value: arbitrationFee
      }
    )
    // Check that can't fund if there is no dispute.
    await expectThrow(
      multipleContract.fundAppeal(arbitrableTransactionId, 2, {
        from: receiver
      })
    )
    await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })

    // Change the fee to a higher value to check multiplier calculations.
    const appealFee = 1000
    await appealableArbitrator.setArbitrationPrice(appealFee, {
      from: arbitrator
    })

    // Check that can't fund the dispute that is not appealable.
    await expectThrow(
      multipleContract.fundAppeal(arbitrableTransactionId, 2, {
        from: receiver
      })
    )

    await appealableArbitrator.giveRuling(0, 1, { from: arbitrator })

    const loserAppealFee =
      appealFee + (appealFee * loserStakeMultiplier) / MULTIPLIER_DIVISOR // 1800.

    // Check that can't fund 0 side.
    await expectThrow(
      multipleContract.fundAppeal(arbitrableTransactionId, 0, {
        from: receiver
      })
    )

    const fundTx = await multipleContract.fundAppeal(
      arbitrableTransactionId,
      2,
      {
        from: receiver,
        value: 1e18 // Deliberately overpay to check that only required fee amount will be registered.
      }
    )

    // Check that event is emitted when fees are paid.
    assert.equal(
      fundTx.logs[0].event,
      'HasPaidAppealFee',
      'The event has not been created'
    )
    assert.equal(
      fundTx.logs[0].args._transactionID.toNumber(),
      arbitrableTransactionId,
      'The event has wrong transaction ID'
    )
    assert.equal(
      fundTx.logs[0].args._party.toNumber(),
      2,
      'The event has wrong party'
    )

    roundInfo = await multipleContract.getRoundInfo(arbitrableTransactionId, 0)

    assert.equal(
      roundInfo[0][2].toNumber(),
      loserAppealFee,
      'Registered fee of the receiver is incorrect'
    )
    assert.equal(
      roundInfo[1][2],
      true,
      'Did not register that the receiver successfully paid his fees'
    )

    assert.equal(
      roundInfo[0][1].toNumber(),
      0,
      'Should not register any payments for the sender'
    )
    assert.equal(
      roundInfo[1][1],
      false,
      'Should not register that the sender successfully paid fees'
    )

    // Check that it's not possible to fund appeal after funding has been registered.
    await expectThrow(
      multipleContract.fundAppeal(arbitrableTransactionId, 2, {
        from: receiver,
        value: loserAppealFee
      })
    )

    const winnerAppealFee =
      appealFee + (appealFee * winnerStakeMultiplier) / MULTIPLIER_DIVISOR // 1200.

    // increase time to make sure winner can pay in 2nd half.
    await increaseTime(appealTimeout / 2 + 1)
    await multipleContract.fundAppeal(arbitrableTransactionId, 1, {
      from: sender,
      value: 3e18 // Deliberately overpay to check that only required fee amount will be registered.
    })

    roundInfo = await multipleContract.getRoundInfo(arbitrableTransactionId, 0)

    assert.equal(
      roundInfo[0][1].toNumber(),
      winnerAppealFee,
      'Registered fee of the sender is incorrect'
    )
    assert.equal(
      roundInfo[1][1],
      true,
      'Did not register that the sender successfully paid his fees'
    )

    assert.equal(
      roundInfo[2].toNumber(),
      winnerAppealFee + loserAppealFee - appealFee, // 2000.
      'Incorrect fee rewards value'
    )

    // If both sides pay their fees it starts new appeal round. Check that both sides have their value set to default.
    roundInfo = await multipleContract.getRoundInfo(arbitrableTransactionId, 1)
    assert.equal(
      roundInfo[1][1],
      false,
      'Appeal fee payment for the sender should not be registered'
    )
    assert.equal(
      roundInfo[1][2],
      false,
      'Appeal fee payment for the receiver should not be registered'
    )
  })

  it('Should not be possible for loser to fund appeal if first half of appeal period has passed', async () => {
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      arbitrator,
      0x0,
      appealTimeout,
      { from: arbitrator }
    )

    await appealableArbitrator.changeArbitrator(appealableArbitrator.address, {
      from: arbitrator
    })
    const multipleContract = await MultipleArbitrableTransaction.new(
      appealableArbitrator.address,
      0x0,
      feeTimeout,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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

    await appealableArbitrator.giveRuling(0, 1, { from: arbitrator })
    await increaseTime(appealTimeout / 2 + 1)
    await expectThrow(
      multipleContract.fundAppeal(arbitrableTransactionId, 2, {
        from: receiver,
        value: 1e18
      })
    )
  })

  it('Should not be possible for winner to fund appeal if appeal period has passed', async () => {
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      arbitrator,
      0x0,
      appealTimeout,
      { from: arbitrator }
    )

    await appealableArbitrator.changeArbitrator(appealableArbitrator.address, {
      from: arbitrator
    })
    const multipleContract = await MultipleArbitrableTransaction.new(
      appealableArbitrator.address,
      0x0,
      feeTimeout,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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

    await appealableArbitrator.giveRuling(0, 1, { from: arbitrator })

    await increaseTime(appealTimeout + 1)
    await expectThrow(
      multipleContract.fundAppeal(arbitrableTransactionId, 1, {
        from: sender,
        value: 1e18
      })
    )
  })

  it('Should change the ruling if loser paid appeal fee while winner did not', async () => {
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      arbitrator,
      0x0,
      appealTimeout,
      { from: arbitrator }
    )

    await appealableArbitrator.changeArbitrator(appealableArbitrator.address, {
      from: arbitrator
    })
    const multipleContract = await MultipleArbitrableTransaction.new(
      appealableArbitrator.address,
      0x0,
      feeTimeout,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
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

    await appealableArbitrator.giveRuling(0, 2, { from: arbitrator })

    await multipleContract.fundAppeal(arbitrableTransactionId, 1, {
      from: sender,
      value: 3e18
    })
    await increaseTime(appealTimeout + 1)

    await appealableArbitrator.giveRuling(0, 2, { from: arbitrator })

    const transaction = await multipleContract.transactions(
      arbitrableTransactionId
    )
    assert.equal(
      transaction[9].toNumber(),
      1,
      'The ruling of the transaction is incorrect'
    )
  })

  it('Should withdraw correct fees if dispute had winner/loser', async () => {
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      arbitrator,
      0x0,
      appealTimeout,
      { from: arbitrator }
    )

    await appealableArbitrator.changeArbitrator(appealableArbitrator.address, {
      from: arbitrator
    })
    const multipleContract = await MultipleArbitrableTransaction.new(
      appealableArbitrator.address,
      0x0,
      feeTimeout,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()
    const MULTIPLIER_DIVISOR = (await multipleContract.MULTIPLIER_DIVISOR()).toNumber()

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

    // Change the fee to a higher value to check multiplier calculations.
    const appealFee = 1000
    await appealableArbitrator.setArbitrationPrice(appealFee, {
      from: arbitrator
    })

    await appealableArbitrator.giveRuling(0, 2, { from: arbitrator })

    const loserAppealFee =
      appealFee + (appealFee * loserStakeMultiplier) / MULTIPLIER_DIVISOR // 1800.

    await multipleContract.fundAppeal(arbitrableTransactionId, 1, {
      from: other,
      value: loserAppealFee * 0.75
    })

    await multipleContract.fundAppeal(arbitrableTransactionId, 1, {
      from: sender,
      value: 2e18
    })

    const winnerAppealFee =
      appealFee + (appealFee * winnerStakeMultiplier) / MULTIPLIER_DIVISOR // 1200.

    await multipleContract.fundAppeal(arbitrableTransactionId, 2, {
      from: other,
      value: 0.2 * winnerAppealFee
    })

    await multipleContract.fundAppeal(arbitrableTransactionId, 2, {
      from: receiver,
      value: winnerAppealFee
    })

    const roundInfo = await multipleContract.getRoundInfo(0, 0)

    await appealableArbitrator.giveRuling(1, 2, { from: arbitrator })

    await multipleContract.fundAppeal(arbitrableTransactionId, 1, {
      from: sender,
      value: loserAppealFee / 2
    })

    await increaseTime(appealTimeout + 1)
    await expectThrow(
      multipleContract.withdrawFeesAndRewards(
        sender,
        arbitrableTransactionId,
        0,
        { from: arbitrator }
      )
    )
    await appealableArbitrator.giveRuling(1, 2, { from: arbitrator })

    assert.equal(
      (await multipleContract.amountWithdrawable(
        arbitrableTransactionId,
        sender
      )).toNumber(),
      900,
      'Sender has incorrect withdrawable amount'
    )
    assert.equal(
      (await multipleContract.amountWithdrawable(
        arbitrableTransactionId,
        receiver
      )).toNumber(),
      1600,
      'Receiver has incorrect withdrawable amount'
    )
    assert.equal(
      (await multipleContract.amountWithdrawable(
        arbitrableTransactionId,
        other
      )).toNumber(),
      400,
      'Crowdfunder has incorrect withdrawable amount'
    )

    const oldBalance1 = await web3.eth.getBalance(sender)
    await multipleContract.withdrawFeesAndRewards(
      sender,
      arbitrableTransactionId,
      0,
      {
        from: arbitrator
      }
    )
    let newBalance1 = await web3.eth.getBalance(sender)
    assert.equal(
      newBalance1.toString(),
      oldBalance1.toString(),
      'Sender balance should stay the same after withdrawing from 0 round'
    )
    await multipleContract.withdrawFeesAndRewards(
      sender,
      arbitrableTransactionId,
      1,
      {
        from: arbitrator
      }
    )
    newBalance1 = await web3.eth.getBalance(sender)
    assert.equal(
      newBalance1.toString(),
      oldBalance1.plus(loserAppealFee / 2).toString(),
      'Sender should be reimbursed unsuccessful payment'
    )

    const oldBalance2 = await web3.eth.getBalance(receiver)
    await multipleContract.withdrawFeesAndRewards(
      receiver,
      arbitrableTransactionId,
      0,
      {
        from: arbitrator
      }
    )
    const newBalance2 = await web3.eth.getBalance(receiver)
    assert.equal(
      newBalance2.toString(),
      oldBalance2.plus(0.8 * roundInfo[2]).toString(),
      'Incorrect balance of the receiver after withdrawing'
    )

    const oldBalance3 = await web3.eth.getBalance(other)
    await multipleContract.withdrawFeesAndRewards(
      other,
      arbitrableTransactionId,
      0,
      {
        from: arbitrator
      }
    )
    const newBalance3 = await web3.eth.getBalance(other)
    assert.equal(
      newBalance3.toString(),
      oldBalance3.plus(0.2 * roundInfo[2]).toString(),
      'Incorrect balance of the crowdfunder after withdrawing'
    )

    assert.equal(
      (await multipleContract.amountWithdrawable(
        arbitrableTransactionId,
        sender
      )).toNumber(),
      0,
      'Sender should have 0 withdrawable amount'
    )
    assert.equal(
      (await multipleContract.amountWithdrawable(
        arbitrableTransactionId,
        receiver
      )).toNumber(),
      0,
      'Receiver should have 0 withdrawable amount'
    )
    assert.equal(
      (await multipleContract.amountWithdrawable(
        arbitrableTransactionId,
        other
      )).toNumber(),
      0,
      'Crowdfunder should have 0 withdrawable amount'
    )
  })

  it('Should withdraw correct fees if arbitrator refused to arbitrate', async () => {
    const appealableArbitrator = await AppealableArbitrator.new(
      arbitrationFee,
      arbitrator,
      0x0,
      appealTimeout,
      { from: arbitrator }
    )

    await appealableArbitrator.changeArbitrator(appealableArbitrator.address, {
      from: arbitrator
    })
    const multipleContract = await MultipleArbitrableTransaction.new(
      appealableArbitrator.address,
      0x0,
      feeTimeout,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const lastTransaction = await getLastTransaction(
      multipleContract,
      async () => {
        await multipleContract.createTransaction(
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender, value: 1000 }
        )
      }
    )
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()
    const MULTIPLIER_DIVISOR = (await multipleContract.MULTIPLIER_DIVISOR()).toNumber()

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

    // Change the fee to a higher value to check multiplier calculations.
    const appealFee = 1000
    await appealableArbitrator.setArbitrationPrice(appealFee, {
      from: arbitrator
    })

    await appealableArbitrator.giveRuling(0, 0, { from: arbitrator })

    const sharedAppealFee =
      appealFee + (appealFee * sharedStakeMultiplier) / MULTIPLIER_DIVISOR // 1500.

    await multipleContract.fundAppeal(arbitrableTransactionId, 1, {
      from: other,
      value: 0.4 * sharedAppealFee
    })

    await multipleContract.fundAppeal(arbitrableTransactionId, 1, {
      from: sender,
      value: 2e18
    })

    await multipleContract.fundAppeal(arbitrableTransactionId, 2, {
      from: other,
      value: 0.2 * sharedAppealFee
    })

    await multipleContract.fundAppeal(arbitrableTransactionId, 2, {
      from: receiver,
      value: sharedAppealFee
    })

    const roundInfo = await multipleContract.getRoundInfo(0, 0)

    await appealableArbitrator.giveRuling(1, 0, { from: arbitrator })
    await increaseTime(appealTimeout + 1)
    await appealableArbitrator.giveRuling(1, 0, { from: arbitrator })

    const oldBalance1 = await web3.eth.getBalance(sender)
    await multipleContract.withdrawFeesAndRewards(sender, 0, 0, {
      from: arbitrator
    })
    const newBalance1 = await web3.eth.getBalance(sender)
    assert.equal(
      newBalance1.toString(),
      oldBalance1.plus(0.3 * roundInfo[2]).toString(),
      'Incorrect sender balance after withdrawing'
    )

    const oldBalance2 = await web3.eth.getBalance(receiver)
    await multipleContract.withdrawFeesAndRewards(receiver, 0, 0, {
      from: arbitrator
    })
    const newBalance2 = await web3.eth.getBalance(receiver)
    assert.equal(
      newBalance2.toString(),
      oldBalance2.plus(0.4 * roundInfo[2]).toString(),
      'Incorrect balance of the receiver after withdrawing'
    )

    const oldBalance3 = await web3.eth.getBalance(other)
    await multipleContract.withdrawFeesAndRewards(other, 0, 0, {
      from: arbitrator
    })
    const newBalance3 = await web3.eth.getBalance(other)
    assert.equal(
      newBalance3.toString(),
      oldBalance3.plus(0.3 * roundInfo[2]).toString(),
      'Incorrect balance of the crowdfunder after withdrawing'
    )
  })
})
