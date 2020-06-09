/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const {
    expectThrow
  } = require('openzeppelin-solidity/test/helpers/expectThrow')
  const {
    increaseTime
  } = require('openzeppelin-solidity/test/helpers/increaseTime')
  
  const MultipleArbitrableTransactionWithFee = artifacts.require(
    './MultipleArbitrableTransactionWithFee.sol'
  )
  const CentralizedArbitrator = artifacts.require('./CentralizedArbitrator.sol')
  
  contract('MultipleArbitrableTransactionWithFee', function(accounts) {
    const sender = accounts[0]
    const receiver = accounts[1]
    const arbitrator = accounts[2]
    const other = accounts[3]
    const feeRecipient = accounts[4]
    const newFeeRecipient = accounts[5]
    const feeRecipientBasisPoint = 500
    const feeTimeout = 100
    const timeoutPayment = 100
    const arbitrationFee = 20
    const newArbitrationFee = 62
    const gasPrice = 5000000000
    const metaEvidenceUri = 'https://kleros.io'
    const amount = 1000
    const reimburse = 507
  
    /**
     * Getter for the last transaction
     * @param {MultipleArbitrableTransactionWithFee} multipleContract Multiple arbitrable transaction instance.
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
  
    function calculateFeeRecipientAmount(totalAmount) {
      return (totalAmount/10000) * feeRecipientBasisPoint;
    }
  
    it('Should handle 1 transaction', async () => {
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        0x0,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        0x0,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        0x0,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
  
    it('Should put specified amount in wei in the contract', async () => {
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        0x0,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
        amount,
        "The contract hasn't received the wei correctly."
      )
      const amountSending = (await multipleContract.transactions(
        arbitrableTransactionId
      ))[2]
  
      assert.equal(
        amountSending.toNumber(),
        amount,
        "The contract hasn't updated its amount correctly."
      )
    })
  
    // Pay
    it('The receiver should execute payment', async () => {
      const initialReceiverBalance = web3.eth.getBalance(receiver)
      const initialFeeRecipientBalance = web3.eth.getBalance(feeRecipient)
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        0x0,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
      const feeRecipientAmount = calculateFeeRecipientAmount(amount)
      const newReceiverBalance = web3.eth.getBalance(receiver)
      const newFeeRecipientBalance = web3.eth.getBalance(feeRecipient)
      assert.equal(
        newReceiverBalance.toString(),
        initialReceiverBalance.plus(amount).minus(consumed + feeRecipientAmount).toString(),
        "The receiver hasn't been paid properly"
      )
      assert.equal(
        newFeeRecipientBalance.toString(),
        initialFeeRecipientBalance.plus(feeRecipientAmount).toString(),
        "The fee recipient hasn't been paid properly"
      )
    })
  
    it('The sender should not withdraw', async () => {
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        0x0,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
    it('Should reimburse X out of the amount to the sender', async () => {
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        0x0,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
        senderBalanceBeforeReimbursment.plus(reimburse).toString(),
        'The sender has not been reimbursed correctly'
      )
      assert.equal(
        newContractBalance.toNumber(),
        amount - reimburse,
        'Bad amount in the contract'
      )
      assert.equal(newAmount.toNumber(), amount - reimburse, 'Amount not updated correctly')
    })
  
    it('Should reimburse complete amount (all) to the sender', async () => {
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        0x0,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
  
    it('Should fail if we try to reimburse more', async () => {
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        0x0,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
        multipleContract.reimburse(arbitrableTransactionId, amount + reimburse, {
          from: receiver
        })
      )
    })
  
    it('Should fail if the sender tries to reimburse it', async () => {
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        0x0,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
        multipleContract.reimburse(arbitrableTransactionId, amount, {
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
  
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        centralizedArbitrator.address,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
        senderBalanceBeforeReimbursment.plus(amount + arbitrationFee).toString(),
        'The sender has not been reimbursed correctly'
      )
    })
  
    it('Should pay the receiver and reimburse him the arbitration fee when the arbitrator decides so', async () => {
      const centralizedArbitrator = await CentralizedArbitrator.new(
        arbitrationFee,
        { from: arbitrator }
      )
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        centralizedArbitrator.address,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
      const feeRecipientBalanceBeforePay = web3.eth.getBalance(feeRecipient)
      const feeRecipientAmount = calculateFeeRecipientAmount(amount)
  
      await centralizedArbitrator.giveRuling(0, 2, { from: arbitrator })
      const newReceiverBalance = web3.eth.getBalance(receiver)
      const newFeeRecipientBalance = web3.eth.getBalance(feeRecipient)
  
      assert.equal(
        newReceiverBalance.toString(),
        receiverBalanceBeforePay.plus(amount + arbitrationFee - feeRecipientAmount).toString(),
        'The receiver has not been paid properly'
      )
      assert.equal(
        newFeeRecipientBalance.toString(),
        feeRecipientBalanceBeforePay.plus(feeRecipientAmount).toString(),
        "The fee recipient hasn't been paid properly"
      )
    })
  
    it('Should split the amount if there is no ruling', async () => {
      const centralizedArbitrator = await CentralizedArbitrator.new(
        arbitrationFee,
        { from: arbitrator }
      )
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        centralizedArbitrator.address,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
      const feeRecipientBalanceBeforeRuling = web3.eth.getBalance(feeRecipient)
      const feeRecipientAmount = calculateFeeRecipientAmount(amount/2)
  
      await centralizedArbitrator.giveRuling(0, 0, { from: arbitrator })
  
      const senderBalanceAfterRuling = web3.eth.getBalance(sender)
      const receiverBalanceAfterRuling = web3.eth.getBalance(receiver)
      const feeRecipientBalanceAfterRuling = web3.eth.getBalance(feeRecipient)
  
      assert.equal(
        receiverBalanceAfterRuling.toString(),
        receiverBalanceBeforeRuling.plus((amount/2) + (arbitrationFee/2) - feeRecipientAmount).toString(),
        'The receiver has not been reimbursed correctly'
      )
  
      assert.equal(
        senderBalanceAfterRuling.toString(),
        senderBalanceBeforeRuling.plus((amount/2) + (arbitrationFee/2)).toString(),
        'The sender has not been paid properly'
      )
  
      assert.equal(
        feeRecipientBalanceAfterRuling.toString(),
        feeRecipientBalanceBeforeRuling.plus(feeRecipientAmount).toString(),
        "The fee recipient hasn't been paid properly"
      )
    })
  
    it('Should refund overpaid arbitration fee for sender', async () => {
      const centralizedArbitrator = await CentralizedArbitrator.new(
        arbitrationFee,
        { from: arbitrator }
      )
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        centralizedArbitrator.address,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        centralizedArbitrator.address,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
  
      await centralizedArbitrator.setArbitrationPrice(newArbitrationFee, {
        from: arbitrator
      })
  
      await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
        from: sender,
        value: newArbitrationFee
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
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        centralizedArbitrator.address,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
  
      await centralizedArbitrator.setArbitrationPrice(newArbitrationFee, {
        from: arbitrator
      })
  
      await multipleContract.payArbitrationFeeBySender(arbitrableTransactionId, {
        from: sender,
        value: newArbitrationFee
      })
  
      await multipleContract.payArbitrationFeeByReceiver(
        arbitrableTransactionId,
        {
          from: receiver,
          value: newArbitrationFee // Pay the rest of arbitration fee with an extra to test also the refund in this case
        }
      )
  
      const senderBalanceBeforeRuling = web3.eth.getBalance(sender)
      const receiverBalanceBeforeRuling = web3.eth.getBalance(receiver)
      const feeRecipientBalanceBeforeRuling = web3.eth.getBalance(feeRecipient)
      const feeRecipientAmount = calculateFeeRecipientAmount(amount/2)
  
      await centralizedArbitrator.giveRuling(0, 0, { from: arbitrator })
  
      const senderBalanceAfterRuling = web3.eth.getBalance(sender)
      const receiverBalanceAfterRuling = web3.eth.getBalance(receiver)
      const feeRecipientBalanceAfterRuling = web3.eth.getBalance(feeRecipient)
  
      assert.equal(
        receiverBalanceAfterRuling.toString(),
        receiverBalanceBeforeRuling
          .plus((amount/2) - feeRecipientAmount)
          .plus(newArbitrationFee/2)
          .toString(),
        'The receiver has not been reimbursed correctly'
      )
  
      assert.equal(
        senderBalanceAfterRuling.toString(),
        senderBalanceBeforeRuling
          .plus((amount/2))
          .plus(newArbitrationFee/2)
          .toString(),
        'The sender has not been paid properly'
      )
  
      assert.equal(
        feeRecipientBalanceAfterRuling.toString(),
        feeRecipientBalanceBeforeRuling.plus(feeRecipientAmount).toString(),
        "The fee recipient hasn't been paid properly"
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
  
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        centralizedArbitrator.address,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
          .plus(amount + arbitrationFee)
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
  
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        centralizedArbitrator.address,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
  
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        centralizedArbitrator.address,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
      const feeRecipientBalanceBeforeReimbursment = web3.eth.getBalance(feeRecipient)
      const feeRecipientAmount = calculateFeeRecipientAmount(amount)
      const tx = await multipleContract.timeOutByReceiver(
        arbitrableTransactionId,
        {
          from: receiver,
          gasPrice: gasPrice
        }
      )
      const txFee = tx.receipt.gasUsed * gasPrice
      const newReceiverBalance = web3.eth.getBalance(receiver)
      const newfeeRecipientBalance = web3.eth.getBalance(feeRecipient)
      assert.equal(
        newReceiverBalance.toString(),
        receiverBalanceBeforeReimbursment
          .plus(amount + arbitrationFee)
          .minus(txFee + feeRecipientAmount)
          .toString(),
        'The receiver has not been paid correctly'
      )
      assert.equal(
        newfeeRecipientBalance.toString(),
        feeRecipientBalanceBeforeReimbursment.plus(feeRecipientAmount).toString(),
        "The fee recipient hasn't been paid properly"
      )
    })
  
    it("Shouldn't work before timeout for the receiver", async () => {
      const centralizedArbitrator = await CentralizedArbitrator.new(
        arbitrationFee,
        { from: arbitrator }
      )
  
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        centralizedArbitrator.address,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
  
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        centralizedArbitrator.address,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
  
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        centralizedArbitrator.address,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
  
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        centralizedArbitrator.address,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
  
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        centralizedArbitrator.address,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
        senderBalanceBeforeReimbursment.plus(amount + arbitrationFee).toString(),
        'The sender has not been reimbursed correctly'
      )
  
      const receiverBalanceBeforePay = web3.eth.getBalance(receiver)
      const feeRecipientBalanceBeforePay = web3.eth.getBalance(feeRecipient)
      const feeRecipientAmount = calculateFeeRecipientAmount(amount)
      // ruling for transaction 2
      await centralizedArbitrator.giveRuling(1, 2, { from: arbitrator })
      const newReceiverBalance = web3.eth.getBalance(receiver)
      const newFeeRecipientBalance = web3.eth.getBalance(feeRecipient)
      assert.equal(
        newReceiverBalance.toString(),
        receiverBalanceBeforePay.plus(amount + arbitrationFee - feeRecipientAmount).toString(),
        'The receiver has not been paid properly'
      )
      assert.equal(
        newFeeRecipientBalance.toString(),
        feeRecipientBalanceBeforePay.plus(feeRecipientAmount).toString(),
        'The receiver has not been paid properly'
      )
    })
  
    // newFeeRecipient
    it('Should change to newFeeRecipient and emit the corresponding event', async () => {
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        0x0,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
  
      const tx = await multipleContract.changeFeeRecipient(
        newFeeRecipient,
        {
          from: feeRecipient
        }
      )
  
      const _newFeeRecipient = await multipleContract.feeRecipient()
  
      assert.equal(tx.logs[0].event, 'FeeRecipientChanged')
      assert.equal(tx.logs[0].args._oldFeeRecipient, feeRecipient)
      assert.equal(tx.logs[0].args._newFeeRecipient, newFeeRecipient)
      assert.equal(_newFeeRecipient, newFeeRecipient)
    })
  
    it('Only feeRecipient should be allowed to change to newFeeRecipient', async () => {
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        0x0,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
  
      await expectThrow(multipleContract.changeFeeRecipient(newFeeRecipient, { from: other }))
    })
  
    // FeePayment
    it('Should emit FeePayment', async () => {
      const multipleContract = await MultipleArbitrableTransactionWithFee.new(
        0x0,
        0x0,
        feeRecipient,
        feeRecipientBasisPoint,
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
  
      assert.equal(tx.logs[0].event, 'FeePayment')
      assert.equal(tx.logs[0].args._transactionID.toNumber(), arbitrableTransactionId)
      assert.equal(tx.logs[0].args._amount, calculateFeeRecipientAmount(amount))
    })
  
  })
  