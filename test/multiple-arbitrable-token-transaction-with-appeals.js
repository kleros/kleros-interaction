/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const shouldFail = require('./helpers/should-fail')
const time = require('./helpers/time')

const MultipleArbitrableTokenTransaction = artifacts.require(
  './MultipleArbitrableTokenTransactionWithAppeals.sol'
)

const ERC20Mock = artifacts.require('./ERC20Mock.sol')
const CentralizedArbitrator = artifacts.require('./CentralizedArbitrator.sol')
const AppealableArbitrator = artifacts.require('EnhancedAppealableArbitrator')

contract('MultipleArbitrableTokenTransactionWithAppeals', function(accounts) {
  const sender = accounts[0]
  const receiver = accounts[1]
  const arbitrator = accounts[2]
  const other = accounts[3]
  const arbitrationFee = 20
  const timeoutFee = 100
  const timeoutPayment = 100
  const gasPrice = 5000000000
  const metaEvidenceUri = 'https://kleros.io'
  const amount = 42
  const sharedStakeMultiplier = 5000
  const winnerStakeMultiplier = 2000
  const loserStakeMultiplier = 8000

  const appealTimeout = 100

  beforeEach(async () => {
    this.token = await ERC20Mock.new(sender, 100)
  })

  /**
   * Setup the contract for the test case
   * @returns {object} maContract and centralizedArbitrator
   */
  async function setupContracts() {
    const centralizedArbitrator = await CentralizedArbitrator.new(
      arbitrationFee,
      { from: arbitrator }
    )
    const maContract = await MultipleArbitrableTokenTransaction.new(
      centralizedArbitrator.address,
      0x0,
      timeoutFee,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    return {
      centralizedArbitrator,
      maContract
    }
  }

  /**
   * Getter for the last transaction
   * @param {MultipleArbitrableTransaction} maContract Multiple arbitrable transaction instance.
   * @param {function} callback The callback.
   * @returns {function} The last transaction.
   */
  async function getLastTransaction(maContract, callback) {
    const metaEvidenceEvent = maContract.MetaEvidence()
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

  /**
   * Create a test transaction
   *
   * Token amount is 42.
   * @param {MultipleArbitrableTransaction} maContract Multiple arbitrable transaction instance.
   * @param {Arbitrator} arbitrator (optional) arbitrator
   * @returns {object} lastTransaction, arbitrableTransactionId
   */
  async function createTestTransaction(maContract) {
    await this.token.approve(maContract.address, amount, {
      from: sender
    })
    const lastTransaction = await getLastTransaction(maContract, async () => {
      await maContract.createTransaction(
        amount,
        this.token.address,
        timeoutPayment,
        receiver,
        metaEvidenceUri,
        { from: sender }
      )
    })
    const arbitrableTransactionId = lastTransaction.args._metaEvidenceID.toNumber()
    return { lastTransaction, arbitrableTransactionId }
  }

  /**
   * Execute an action and compare balances between before and after
   *
   * @param {function} action Action function, returns promise
   * @param {object} data Data for comparisons
   */
  async function executeActionAndCompareBalances(action, data) {
    // sanitizing the data parameters
    if (typeof data.sender === 'undefined')
      data.sender = {
        etherDelta: 0,
        tokenDelta: 0
      }
    if (typeof data.receiver === 'undefined')
      data.receiver = {
        etherDelta: 0,
        tokenDelta: 0
      }
    if (!data.sender.etherDelta) data.sender.etherDelta = 0
    if (!data.sender.tokenDelta) data.sender.tokenDelta = 0
    if (!data.receiver.etherDelta) data.receiver.etherDelta = 0
    if (!data.receiver.tokenDelta) data.receiver.tokenDelta = 0
    if (!data.contractTokenDelta) data.contractTokenDelta = 0

    const contractTokenBalanceBefore = await this.token.balanceOf(
      data.maContract.address
    )
    const senderTokenBalanceBefore = await this.token.balanceOf(sender)
    const senderEtherBalanceBefore = web3.eth.getBalance(sender)
    const receiverTokenBalanceBefore = await this.token.balanceOf(receiver)
    const receiverEtherBalanceBefore = await web3.eth.getBalance(receiver)

    actionData = await action()
    if (typeof actionData === 'undefined') actionData = {}

    const contractTokenBalanceAfter = await this.token.balanceOf(
      data.maContract.address
    )
    const senderTokenBalanceAfter = await this.token.balanceOf(sender)
    const senderEtherBalanceAfter = await web3.eth.getBalance(sender)
    const receiverTokenBalanceAfter = await this.token.balanceOf(receiver)
    const receiverEtherBalanceAfter = await web3.eth.getBalance(receiver)

    assert.equal(
      senderEtherBalanceAfter.toString(),
      senderEtherBalanceBefore
        .minus(actionData.senderTotalTxCost || 0)
        .plus(data.sender.etherDelta)
        .toString(),
      'The sender has not been reimbursed correctly in ether'
    )
    assert.equal(
      receiverEtherBalanceAfter.toString(),
      receiverEtherBalanceBefore
        .minus(actionData.receiverTotalTxCost || 0)
        .plus(data.receiver.etherDelta)
        .toString(),
      'The receiver has not been paid correctly in ether'
    )
    assert.equal(
      senderTokenBalanceAfter.toString(),
      senderTokenBalanceBefore.plus(data.sender.tokenDelta).toString(),
      'The sender has not been reimbursed correctly in token'
    )
    assert.equal(
      receiverTokenBalanceAfter.toString(),
      receiverTokenBalanceBefore.plus(data.receiver.tokenDelta).toString(),
      'The receiver has not been paid correctly in token'
    )
    assert.equal(
      contractTokenBalanceAfter.toString(),
      contractTokenBalanceBefore.plus(data.contractTokenDelta).toString(),
      'Contract token amount is not correct'
    )
  }

  /**
   * Get transaction amount
   * @param {MultipleArbitrableTransaction} maContract Multiple arbitrable transaction instance.
   * @param {number} arbitrableTransactionId transaction Id
   * @returns {function} Amount involved in the transaction
   */
  async function getTransactionAmount(maContract, arbitrableTransactionId) {
    return (await maContract.transactions(arbitrableTransactionId))[2]
  }

  it('Should handle 1 transaction for payout', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    const oldAmount = await getTransactionAmount(
      maContract,
      arbitrableTransactionId
    )
    assert.equal(
      oldAmount.toNumber(),
      amount,
      "The contract hasn't updated its amount correctly."
    )

    await executeActionAndCompareBalances(
      async () => {
        let senderTotalTxCost = 0
        const tx = await maContract.pay(arbitrableTransactionId, amount, {
          from: sender,
          gasPrice
        })
        senderTotalTxCost += tx.receipt.gasUsed * gasPrice
        return {
          senderTotalTxCost
        }
      },
      {
        maContract,
        receiver: {
          tokenDelta: amount
        },
        contractTokenDelta: -amount
      }
    )

    const newAmount = await getTransactionAmount(
      maContract,
      arbitrableTransactionId
    )
    assert.equal(newAmount.toNumber(), 0, 'Amount not updated correctly')
  })

  it('Should emit TransactionCreated', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    const eventResult = await new Promise((resolve, reject) => {
      maContract
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
    assert.equal(eventResult[0].args._token, this.token.address)
    assert.equal(eventResult[0].args._amount, amount)
  })

  it('Should handle 1 transaction for reimburse', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    const oldAmount = await getTransactionAmount(
      maContract,
      arbitrableTransactionId
    )
    assert.equal(
      oldAmount.toNumber(),
      amount,
      "The contract hasn't updated its amount correctly."
    )

    await executeActionAndCompareBalances(
      async () => {
        let receiverTotalTxCost = 0
        const tx = await maContract.reimburse(arbitrableTransactionId, amount, {
          from: receiver,
          gasPrice
        })
        receiverTotalTxCost += tx.receipt.gasUsed * gasPrice
        return {
          receiverTotalTxCost
        }
      },
      {
        maContract,
        sender: {
          tokenDelta: amount
        },
        contractTokenDelta: -amount
      }
    )

    const newAmount = await getTransactionAmount(
      maContract,
      arbitrableTransactionId
    )
    assert.equal(newAmount.toNumber(), 0, 'Amount not updated correctly')
  })

  it('Should handle 3 transaction', async () => {
    const { maContract } = await setupContracts()
    for (var cnt = 0; cnt < 3; cnt += 1) {
      const { arbitrableTransactionId } = await createTestTransaction(
        maContract
      )

      await executeActionAndCompareBalances(
        async () => {
          let receiverTotalTxCost = 0
          const tx = await maContract.reimburse(
            arbitrableTransactionId,
            amount,
            {
              from: receiver,
              gasPrice
            }
          )
          receiverTotalTxCost += tx.receipt.gasUsed * gasPrice
          return {
            receiverTotalTxCost
          }
        },
        {
          maContract,
          sender: {
            tokenDelta: amount
          },
          contractTokenDelta: -amount
        }
      )

      const newAmount = await getTransactionAmount(
        maContract,
        arbitrableTransactionId
      )
      assert.equal(newAmount.toNumber(), 0, 'Amount not updated correctly')
    }
  })

  it('Should fail creating transaction when token amount is not approved', async () => {
    const { maContract } = await setupContracts()

    await shouldFail.reverting(
      getLastTransaction(maContract, async () => {
        await maContract.createTransaction(
          amount,
          this.token.address,
          timeoutPayment,
          receiver,
          metaEvidenceUri,
          { from: sender }
        )
      })
    )
  })

  it('Should reimburse partially to the sender', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await executeActionAndCompareBalances(
      async () => {
        let receiverTotalTxCost = 0
        const tx = await maContract.reimburse(arbitrableTransactionId, 10, {
          from: receiver,
          gasPrice
        })
        receiverTotalTxCost += tx.receipt.gasUsed * gasPrice
        return {
          receiverTotalTxCost
        }
      },
      {
        maContract,
        sender: {
          tokenDelta: 10
        },
        contractTokenDelta: -10
      }
    )

    const newAmount = await getTransactionAmount(
      maContract,
      arbitrableTransactionId
    )
    assert.equal(newAmount.toNumber(), 32, 'Amount not updated correctly')
  })

  it('Should fail to reimburse the sender tries more than approved', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)
    shouldFail.reverting(
      maContract.reimburse(arbitrableTransactionId, 43, { from: receiver })
    )
  })

  it('Should fail if the sender to tries to reimburse it', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)
    shouldFail.reverting(
      maContract.reimburse(arbitrableTransactionId, 43, { from: sender })
    )
  })

  it('The receiver should execute transaction', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await executeActionAndCompareBalances(
      async () => {
        let receiverTotalTxCost = 0
        await time.increase(timeoutPayment + 1)
        const tx = await maContract.executeTransaction(
          arbitrableTransactionId,
          {
            from: receiver,
            gasPrice
          }
        )
        receiverTotalTxCost += tx.receipt.gasUsed * gasPrice
        return {
          receiverTotalTxCost
        }
      },
      {
        maContract,
        receiver: {
          tokenDelta: amount
        },
        contractTokenDelta: -amount
      }
    )
  })

  it('The receiver should not execute transaction until timeout', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await shouldFail.reverting(
      maContract.executeTransaction(arbitrableTransactionId, {
        from: receiver
      })
    )
  })

  it('Should not pay or reimburse when there is a dispute', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })

    await shouldFail.reverting(
      maContract.pay(arbitrableTransactionId, amount, {
        from: sender,
        gasPrice
      })
    )

    await shouldFail.reverting(
      maContract.reimburse(arbitrableTransactionId, amount, {
        from: receiver,
        gasPrice
      })
    )
  })

  it('Should reimburse the sender (including arbitration fee) when the arbitrator decides so', async () => {
    const { centralizedArbitrator, maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })

    await executeActionAndCompareBalances(
      async () => {
        await centralizedArbitrator.giveRuling(0, 1, { from: arbitrator })
      },
      {
        maContract,
        sender: {
          etherDelta: 20,
          tokenDelta: amount
        },
        contractTokenDelta: -amount
      }
    )
  })

  it('Should pay the receiver and reimburse him the arbitration fee when the arbitrator decides so', async () => {
    const { centralizedArbitrator, maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })

    await executeActionAndCompareBalances(
      async () => {
        await centralizedArbitrator.giveRuling(0, 2, { from: arbitrator })
      },
      {
        maContract,
        receiver: {
          etherDelta: 20,
          tokenDelta: amount
        },
        contractTokenDelta: -amount
      }
    )
  })

  it('Should split the amount if there is no ruling', async () => {
    const { centralizedArbitrator, maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })

    await executeActionAndCompareBalances(
      async () => {
        await centralizedArbitrator.giveRuling(0, 0, { from: arbitrator })
      },
      {
        maContract,
        sender: {
          etherDelta: 10,
          tokenDelta: 21
        },
        receiver: {
          etherDelta: 10,
          tokenDelta: 21
        },
        contractTokenDelta: -amount
      }
    )
  })

  it('Should change status to WaitingReceiver after the arbitration cost increase', async () => {
    const { centralizedArbitrator, maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })

    arbitrableTransactionStatus = (await maContract.transactions(
      arbitrableTransactionId
    ))[9]

    assert.equal(
      arbitrableTransactionStatus.toNumber(),
      1, // `Status.WaitingSender == 1`
      'The transaction did not change correctly to new status: `Status.WaitingSender`'
    )

    await centralizedArbitrator.setArbitrationPrice(arbitrationFee + amount, {
      from: arbitrator
    })

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee + amount
    })

    arbitrableTransactionStatus = (await maContract.transactions(
      arbitrableTransactionId
    ))[9]

    assert.equal(
      arbitrableTransactionStatus.toNumber(),
      2, // `Status.WaitingReceiver == 2`
      'The transaction did not change correctly to new status: `Status.WaitingReceiver`'
    )
  })

  it('Should split correclty the arbitration cost after the arbitration cost increase', async () => {
    const { centralizedArbitrator, maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })

    await centralizedArbitrator.setArbitrationPrice(arbitrationFee + amount, {
      from: arbitrator
    })

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee + amount
    })

    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: amount // Pay the rest of arbitration fee with an extra to test also the refund in this case
    })

    arbitrableTransaction = await maContract.transactions(
      arbitrableTransactionId
    )

    const senderBalanceBeforeRuling = web3.eth.getBalance(sender)
    const receiverBalanceBeforeRuling = web3.eth.getBalance(receiver)

    await centralizedArbitrator.giveRuling(0, 0, { from: arbitrator })

    const senderBalanceAfterRuling = web3.eth.getBalance(sender)
    const receiverBalanceAfterRuling = web3.eth.getBalance(receiver)

    assert.equal(
      receiverBalanceAfterRuling.toString(),
      receiverBalanceBeforeRuling
        .plus(10)
        .plus(21)
        .toString(),
      'The receiver has not been reimbursed correctly'
    )

    assert.equal(
      senderBalanceAfterRuling.toString(),
      senderBalanceBeforeRuling
        .plus(10)
        .plus(21)
        .toString(),
      'The sender has not been paid properly'
    )

    // check also the contract balance
    assert.equal(
      web3.eth.getBalance(maContract.address),
      0,
      'The ETH amount in the contract is not 0'
    )
  })

  it('Should reimburse the sender in case of timeout of the receiver', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })

    await executeActionAndCompareBalances(
      async () => {
        await time.increase(timeoutFee + 1)
        const tx = await maContract.timeOutBySender(arbitrableTransactionId, {
          from: sender,
          gasPrice
        })
        const txFee = tx.receipt.gasUsed * gasPrice
        return {
          senderTotalTxCost: txFee
        }
      },
      {
        maContract,
        sender: {
          etherDelta: 20,
          tokenDelta: amount
        },
        contractTokenDelta: -amount
      }
    )
  })

  it("Shouldn't work before timeout for the sender", async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await shouldFail.reverting(
      maContract.timeOutBySender(arbitrableTransactionId, {
        from: sender,
        gasPrice: gasPrice
      })
    )
    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    await time.increase(1)
    await shouldFail.reverting(
      maContract.timeOutBySender(arbitrableTransactionId, {
        from: sender,
        gasPrice: gasPrice
      })
    )
  })

  it('Should reimburse the receiver in case of timeout of the sender', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })

    await executeActionAndCompareBalances(
      async () => {
        await time.increase(timeoutFee + 1)
        const tx = await maContract.timeOutByReceiver(arbitrableTransactionId, {
          from: receiver,
          gasPrice
        })
        const txFee = tx.receipt.gasUsed * gasPrice
        return {
          receiverTotalTxCost: txFee
        }
      },
      {
        maContract,
        receiver: {
          etherDelta: 20,
          tokenDelta: amount
        },
        contractTokenDelta: -amount
      }
    )
  })

  it("Shouldn't work before timeout for the receiver", async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await shouldFail.reverting(
      maContract.timeOutByReceiver(arbitrableTransactionId, {
        from: receiver,
        gasPrice: gasPrice
      })
    )
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })
    await time.increase(1)
    await shouldFail.reverting(
      maContract.timeOutByReceiver(arbitrableTransactionId, {
        from: receiver,
        gasPrice: gasPrice
      })
    )
  })

  it('Should create events when evidence is submitted by the sender', async () => {
    const { centralizedArbitrator, maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })

    const tx = await maContract.submitEvidence(
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
    const { centralizedArbitrator, maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })

    const tx = await maContract.submitEvidence(
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
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })

    await shouldFail.reverting(
      maContract.submitEvidence(arbitrableTransactionId, 'ipfs:/X', {
        from: other
      })
    )
  })

  it('Should handle multiple transactions concurrently', async () => {
    const { centralizedArbitrator, maContract } = await setupContracts()

    await this.token.approve(maContract.address, amount * 2, {
      from: sender
    })

    const arbitrableTransactionId1 = (await createTestTransaction(maContract))
      .arbitrableTransactionId

    const arbitrableTransactionId2 = (await createTestTransaction(maContract))
      .arbitrableTransactionId

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId2, {
      from: sender,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId1, {
      from: receiver,
      value: arbitrationFee
    })
    // This generates transaction 1 dispute 0
    await maContract.payArbitrationFeeBySender(arbitrableTransactionId1, {
      from: sender,
      value: arbitrationFee
    })
    // This generates transaction 2 dispute 1
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId2, {
      from: receiver,
      value: arbitrationFee
    })

    await executeActionAndCompareBalances(
      async () => {
        await centralizedArbitrator.giveRuling(0, 1, { from: arbitrator })
      },
      {
        maContract,
        sender: {
          etherDelta: 20,
          tokenDelta: amount
        },
        contractTokenDelta: -amount
      }
    )

    await executeActionAndCompareBalances(
      async () => {
        await centralizedArbitrator.giveRuling(1, 2, { from: arbitrator })
      },
      {
        maContract,
        receiver: {
          etherDelta: 20,
          tokenDelta: amount
        },
        contractTokenDelta: -amount
      }
    )
  })

  /*
  Vulnerability low: It is possible to come back to ‘WaitingForX’ status if the
  arbitration fee increases after the dispute is created. This can be used to
  create a new dispute or even timeout other party no watching as they think
  the dispute as already be created. This vulnerability is low because it’s
  circunstancial (need fee increases) and can be countered by calling
  payArbitrationFeeByX paying the difference (it would still create a new
  dispute but not make the victim lose).
  */
  it('vulnerability: payArbitrationFeeByX again after dispute raised', async () => {
    const { centralizedArbitrator, maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })

    // raise arbitration fee
    await centralizedArbitrator.setArbitrationPrice(arbitrationFee + 1, {
      from: arbitrator
    })

    await shouldFail.reverting(
      maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
        from: receiver,
        value: arbitrationFee + 1
      })
    )

    await shouldFail.reverting(
      maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
        from: sender,
        value: arbitrationFee + 1
      })
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

    const maContract = await MultipleArbitrableTokenTransaction.new(
      appealableArbitrator.address,
      0x0,
      timeoutFee,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const { arbitrableTransactionId } = await createTestTransaction(maContract)
    const MULTIPLIER_DIVISOR = (await maContract.MULTIPLIER_DIVISOR()).toNumber()

    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })
    // Check that can't fund if there is no dispute.
    await shouldFail.reverting(
      maContract.fundAppeal(arbitrableTransactionId, 2, {
        from: receiver
      })
    )
    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })

    // Change the fee to a higher value to check multiplier calculations.
    const appealFee = 1000
    await appealableArbitrator.setArbitrationPrice(appealFee, {
      from: arbitrator
    })

    // Check that can't fund the dispute that is not appealable.
    await shouldFail.reverting(
      maContract.fundAppeal(arbitrableTransactionId, 2, {
        from: receiver
      })
    )

    await appealableArbitrator.giveRuling(0, 1, { from: arbitrator })

    const loserAppealFee =
      appealFee + (appealFee * loserStakeMultiplier) / MULTIPLIER_DIVISOR // 1800.

    // Check that can't fund 0 side.
    await shouldFail.reverting(
      maContract.fundAppeal(arbitrableTransactionId, 0, {
        from: receiver
      })
    )

    const fundTx = await maContract.fundAppeal(arbitrableTransactionId, 2, {
      from: receiver,
      value: 1e18 // Deliberately overpay to check that only required fee amount will be registered.
    })

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

    roundInfo = await maContract.getRoundInfo(arbitrableTransactionId, 0)

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
    await shouldFail.reverting(
      maContract.fundAppeal(arbitrableTransactionId, 2, {
        from: receiver,
        value: loserAppealFee
      })
    )

    const winnerAppealFee =
      appealFee + (appealFee * winnerStakeMultiplier) / MULTIPLIER_DIVISOR // 1200.

    // increase time to make sure winner can pay in 2nd half.
    await time.increase(appealTimeout / 2 + 1)
    await maContract.fundAppeal(arbitrableTransactionId, 1, {
      from: sender,
      value: 3e18 // Deliberately overpay to check that only required fee amount will be registered.
    })

    roundInfo = await maContract.getRoundInfo(arbitrableTransactionId, 0)

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
    roundInfo = await maContract.getRoundInfo(arbitrableTransactionId, 1)
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

    const maContract = await MultipleArbitrableTokenTransaction.new(
      appealableArbitrator.address,
      0x0,
      timeoutFee,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })

    await appealableArbitrator.giveRuling(0, 1, { from: arbitrator })
    await time.increase(appealTimeout / 2 + 1)
    await shouldFail.reverting(
      maContract.fundAppeal(arbitrableTransactionId, 2, {
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

    const maContract = await MultipleArbitrableTokenTransaction.new(
      appealableArbitrator.address,
      0x0,
      timeoutFee,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const { arbitrableTransactionId } = await createTestTransaction(maContract)
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })

    await appealableArbitrator.giveRuling(0, 1, { from: arbitrator })

    await time.increase(appealTimeout + 1)
    await shouldFail.reverting(
      maContract.fundAppeal(arbitrableTransactionId, 1, {
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

    const maContract = await MultipleArbitrableTokenTransaction.new(
      appealableArbitrator.address,
      0x0,
      timeoutFee,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: sender,
      value: arbitrationFee
    })

    await appealableArbitrator.giveRuling(0, 2, { from: arbitrator })

    await maContract.fundAppeal(arbitrableTransactionId, 1, {
      from: sender,
      value: 3e18
    })
    await time.increase(appealTimeout + 1)

    await appealableArbitrator.giveRuling(0, 2, { from: arbitrator })

    const transaction = await maContract.transactions(arbitrableTransactionId)
    assert.equal(
      transaction[10].toNumber(),
      1,
      'The ruling of the transaction is incorrect'
    )
  })

  it('Should withdraw correct fees if a dispute had winner/loser', async () => {
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

    const maContract = await MultipleArbitrableTokenTransaction.new(
      appealableArbitrator.address,
      0x0,
      timeoutFee,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const { arbitrableTransactionId } = await createTestTransaction(maContract)
    const MULTIPLIER_DIVISOR = (await maContract.MULTIPLIER_DIVISOR()).toNumber()

    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
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

    await maContract.fundAppeal(arbitrableTransactionId, 1, {
      from: other,
      value: loserAppealFee * 0.75
    })

    await maContract.fundAppeal(arbitrableTransactionId, 1, {
      from: sender,
      value: 2e18
    })

    const winnerAppealFee =
      appealFee + (appealFee * winnerStakeMultiplier) / MULTIPLIER_DIVISOR // 1200.

    await maContract.fundAppeal(arbitrableTransactionId, 2, {
      from: other,
      value: 0.2 * winnerAppealFee
    })

    await maContract.fundAppeal(arbitrableTransactionId, 2, {
      from: receiver,
      value: winnerAppealFee
    })

    const roundInfo = await maContract.getRoundInfo(0, 0)

    await appealableArbitrator.giveRuling(1, 2, { from: arbitrator })

    await maContract.fundAppeal(arbitrableTransactionId, 1, {
      from: sender,
      value: loserAppealFee / 2
    })

    await time.increase(appealTimeout + 1)
    await shouldFail.reverting(
      maContract.withdrawFeesAndRewards(sender, arbitrableTransactionId, 0, {
        from: arbitrator
      })
    )
    await appealableArbitrator.giveRuling(1, 2, { from: arbitrator })

    assert.equal(
      (await maContract.amountWithdrawable(
        arbitrableTransactionId,
        sender
      )).toNumber(),
      900,
      'Sender has incorrect withdrawable amount'
    )
    assert.equal(
      (await maContract.amountWithdrawable(
        arbitrableTransactionId,
        receiver
      )).toNumber(),
      1600,
      'Receiver has incorrect withdrawable amount'
    )
    assert.equal(
      (await maContract.amountWithdrawable(
        arbitrableTransactionId,
        other
      )).toNumber(),
      400,
      'Crowdfunder has incorrect withdrawable amount'
    )

    const oldBalance1 = await web3.eth.getBalance(sender)
    await maContract.withdrawFeesAndRewards(
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
    await maContract.withdrawFeesAndRewards(
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
    await maContract.withdrawFeesAndRewards(
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
    await maContract.withdrawFeesAndRewards(other, arbitrableTransactionId, 0, {
      from: arbitrator
    })
    const newBalance3 = await web3.eth.getBalance(other)
    assert.equal(
      newBalance3.toString(),
      oldBalance3.plus(0.2 * roundInfo[2]).toString(),
      'Incorrect balance of the crowdfunder after withdrawing'
    )

    assert.equal(
      (await maContract.amountWithdrawable(
        arbitrableTransactionId,
        sender
      )).toNumber(),
      0,
      'Sender should have 0 withdrawable amount'
    )
    assert.equal(
      (await maContract.amountWithdrawable(
        arbitrableTransactionId,
        receiver
      )).toNumber(),
      0,
      'Receiver should have 0 withdrawable amount'
    )
    assert.equal(
      (await maContract.amountWithdrawable(
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

    const maContract = await MultipleArbitrableTokenTransaction.new(
      appealableArbitrator.address,
      0x0,
      timeoutFee,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier,
      { from: sender }
    )

    const { arbitrableTransactionId } = await createTestTransaction(maContract)
    const MULTIPLIER_DIVISOR = (await maContract.MULTIPLIER_DIVISOR()).toNumber()

    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: receiver,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
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

    await maContract.fundAppeal(arbitrableTransactionId, 1, {
      from: other,
      value: 0.4 * sharedAppealFee
    })

    await maContract.fundAppeal(arbitrableTransactionId, 1, {
      from: sender,
      value: 2e18
    })

    await maContract.fundAppeal(arbitrableTransactionId, 2, {
      from: other,
      value: 0.2 * sharedAppealFee
    })

    await maContract.fundAppeal(arbitrableTransactionId, 2, {
      from: receiver,
      value: sharedAppealFee
    })

    const roundInfo = await maContract.getRoundInfo(0, 0)

    await appealableArbitrator.giveRuling(1, 0, { from: arbitrator })
    await time.increase(appealTimeout + 1)
    await appealableArbitrator.giveRuling(1, 0, { from: arbitrator })

    const oldBalance1 = await web3.eth.getBalance(sender)
    await maContract.withdrawFeesAndRewards(sender, 0, 0, {
      from: arbitrator
    })
    const newBalance1 = await web3.eth.getBalance(sender)
    assert.equal(
      newBalance1.toString(),
      oldBalance1.plus(0.3 * roundInfo[2]).toString(),
      'Incorrect sender balance after withdrawing'
    )

    const oldBalance2 = await web3.eth.getBalance(receiver)
    await maContract.withdrawFeesAndRewards(receiver, 0, 0, {
      from: arbitrator
    })
    const newBalance2 = await web3.eth.getBalance(receiver)
    assert.equal(
      newBalance2.toString(),
      oldBalance2.plus(0.4 * roundInfo[2]).toString(),
      'Incorrect balance of the receiver after withdrawing'
    )

    const oldBalance3 = await web3.eth.getBalance(other)
    await maContract.withdrawFeesAndRewards(other, 0, 0, {
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
