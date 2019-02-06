/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const shouldFail = require('./helpers/should-fail')
const time = require('./helpers/time')

const MultipleArbitrableTokenTransactionFactory = artifacts.require(
  './MultipleArbitrableTokenTransactionFactory.sol'
)

const MultipleArbitrableTokenTransaction = artifacts.require(
  './MultipleArbitrableTokenTransaction.sol'
)

const ERC20Mock = artifacts.require('./ERC20Mock.sol')
const CentralizedArbitrator = artifacts.require('./CentralizedArbitrator.sol')

contract('MultipleArbitrableTokenTransaction', function(accounts) {
  const payer = accounts[0]
  const payee = accounts[1]
  const arbitrator = accounts[2]
  const other = accounts[3]
  const arbitrationFee = 20
  const timeoutFee = 100
  const timeoutPayment = 100
  const gasPrice = 5000000000
  const metaEvidenceUri = 'https://kleros.io'

  beforeEach(async () => {
    this.token = await ERC20Mock.new(payer, 100)
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
    const maFactoryContract = await MultipleArbitrableTokenTransactionFactory.new(
      centralizedArbitrator.address,
      0x0,
      timeoutFee,
      { from: payer }
    )
    const creationMaContractTx = await maFactoryContract.createArbitrableToken(
      this.token.address,
      { from: payer }
    )

    // Get the address of the arbitrable token comtract deployed
    const maContractAddress =
      creationMaContractTx.logs[0].args._arbitrableTokenPayment

    const maContract = await MultipleArbitrableTokenTransaction.at(
      maContractAddress
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
    await this.token.approve(maContract.address, 42, {
      from: payer
    })
    const lastTransaction = await getLastTransaction(maContract, async () => {
      await maContract.createTransaction(
        42,
        timeoutPayment,
        payee,
        metaEvidenceUri,
        { from: payer }
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
  async function execteActionAndCompareBalances(action, data) {
    // sanitizing the data parameters
    if (typeof data.payer === 'undefined')
      data.payer = {
        etherDelta: 0,
        tokenDelta: 0
      }
    if (typeof data.payee === 'undefined')
      data.payee = {
        etherDelta: 0,
        tokenDelta: 0
      }
    if (!data.payer.etherDelta) data.payer.etherDelta = 0
    if (!data.payer.tokenDelta) data.payer.tokenDelta = 0
    if (!data.payee.etherDelta) data.payee.etherDelta = 0
    if (!data.payee.tokenDelta) data.payee.tokenDelta = 0
    if (!data.contractTokenDelta) data.contractTokenDelta = 0

    const contractTokenBalanceBefore = await this.token.balanceOf(
      data.maContract.address
    )
    const payerTokenBalanceBefore = await this.token.balanceOf(payer)
    const payerEtherBalanceBefore = web3.eth.getBalance(payer)
    const payeeTokenBalanceBefore = await this.token.balanceOf(payee)
    const payeeEtherBalanceBefore = await web3.eth.getBalance(payee)

    actionData = await action()
    if (typeof actionData === 'undefined') actionData = {}

    const contractTokenBalanceAfter = await this.token.balanceOf(
      data.maContract.address
    )
    const payerTokenBalanceAfter = await this.token.balanceOf(payer)
    const payerEtherBalanceAfter = await web3.eth.getBalance(payer)
    const payeeTokenBalanceAfter = await this.token.balanceOf(payee)
    const payeeEtherBalanceAfter = await web3.eth.getBalance(payee)

    assert.equal(
      payerEtherBalanceAfter.toString(),
      payerEtherBalanceBefore
        .minus(actionData.payerTotalTxCost || 0)
        .plus(data.payer.etherDelta)
        .toString(),
      'The payer has not been reimbursed correctly in ether'
    )
    assert.equal(
      payeeEtherBalanceAfter.toString(),
      payeeEtherBalanceBefore
        .minus(actionData.payeeTotalTxCost || 0)
        .plus(data.payee.etherDelta)
        .toString(),
      'The payee has not been paid correctly in ether'
    )
    assert.equal(
      payerTokenBalanceAfter.toString(),
      payerTokenBalanceBefore.plus(data.payer.tokenDelta).toString(),
      'The payer has not been reimbursed correctly in token'
    )
    assert.equal(
      payeeTokenBalanceAfter.toString(),
      payeeTokenBalanceBefore.plus(data.payee.tokenDelta).toString(),
      'The payee has not been paid correctly in token'
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
      42,
      "The contract hasn't updated its amount correctly."
    )

    await execteActionAndCompareBalances(
      async () => {
        let payerTotalTxCost = 0
        const tx = await maContract.pay(arbitrableTransactionId, 42, {
          from: payer,
          gasPrice
        })
        payerTotalTxCost += tx.receipt.gasUsed * gasPrice
        return {
          payerTotalTxCost
        }
      },
      {
        maContract,
        payee: {
          tokenDelta: 42
        },
        contractTokenDelta: -42
      }
    )

    const newAmount = await getTransactionAmount(
      maContract,
      arbitrableTransactionId
    )
    assert.equal(newAmount.toNumber(), 0, 'Amount not updated correctly')
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
      42,
      "The contract hasn't updated its amount correctly."
    )

    await execteActionAndCompareBalances(
      async () => {
        let payeeTotalTxCost = 0
        const tx = await maContract.reimburse(arbitrableTransactionId, 42, {
          from: payee,
          gasPrice
        })
        payeeTotalTxCost += tx.receipt.gasUsed * gasPrice
        return {
          payeeTotalTxCost
        }
      },
      {
        maContract,
        payer: {
          tokenDelta: 42
        },
        contractTokenDelta: -42
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

      await execteActionAndCompareBalances(
        async () => {
          let payeeTotalTxCost = 0
          const tx = await maContract.reimburse(arbitrableTransactionId, 42, {
            from: payee,
            gasPrice
          })
          payeeTotalTxCost += tx.receipt.gasUsed * gasPrice
          return {
            payeeTotalTxCost
          }
        },
        {
          maContract,
          payer: {
            tokenDelta: 42
          },
          contractTokenDelta: -42
        }
      )

      const amount = await getTransactionAmount(
        maContract,
        arbitrableTransactionId
      )
      assert.equal(amount.toNumber(), 0, 'Amount not updated correctly')
    }
  })

  it('Should fail creating transaction when token amount is not approved', async () => {
    const { maContract } = await setupContracts()

    await shouldFail.reverting(
      getLastTransaction(maContract, async () => {
        await maContract.createTransaction(
          42,
          timeoutPayment,
          payee,
          metaEvidenceUri,
          { from: payer }
        )
      })
    )
  })

  it('Should reimburse partially to the sender', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await execteActionAndCompareBalances(
      async () => {
        let payeeTotalTxCost = 0
        const tx = await maContract.reimburse(arbitrableTransactionId, 10, {
          from: payee,
          gasPrice
        })
        payeeTotalTxCost += tx.receipt.gasUsed * gasPrice
        return {
          payeeTotalTxCost
        }
      },
      {
        maContract,
        payer: {
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
      maContract.reimburse(arbitrableTransactionId, 43, { from: payee })
    )
  })

  it('Should fail if the payer to tries to reimburse it', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)
    shouldFail.reverting(
      maContract.reimburse(arbitrableTransactionId, 43, { from: payer })
    )
  })

  it('The payee should execute transaction', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await execteActionAndCompareBalances(
      async () => {
        let payeeTotalTxCost = 0
        await time.increase(timeoutPayment + 1)
        const tx = await maContract.executeTransaction(
          arbitrableTransactionId,
          {
            from: payee,
            gasPrice
          }
        )
        payeeTotalTxCost += tx.receipt.gasUsed * gasPrice
        return {
          payeeTotalTxCost
        }
      },
      {
        maContract,
        payee: {
          tokenDelta: 42
        },
        contractTokenDelta: -42
      }
    )
  })

  it('The payee should not execute transaction until timeout', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await shouldFail.reverting(
      maContract.executeTransaction(arbitrableTransactionId, {
        from: payee
      })
    )
  })

  it('Should not pay or reimburse when there is a dispute', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    })

    await shouldFail.reverting(
      maContract.pay(arbitrableTransactionId, 42, {
        from: payer,
        gasPrice
      })
    )

    await shouldFail.reverting(
      maContract.reimburse(arbitrableTransactionId, 42, {
        from: payee,
        gasPrice
      })
    )
  })

  it('Should reimburse the payer (including arbitration fee) when the arbitrator decides so', async () => {
    const { centralizedArbitrator, maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    })

    await execteActionAndCompareBalances(
      async () => {
        await centralizedArbitrator.giveRuling(0, 1, { from: arbitrator })
      },
      {
        maContract,
        payer: {
          etherDelta: 20,
          tokenDelta: 42
        },
        contractTokenDelta: -42
      }
    )
  })

  it('Should pay the payee and reimburse him the arbitration fee when the arbitrator decides so', async () => {
    const { centralizedArbitrator, maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    })

    await execteActionAndCompareBalances(
      async () => {
        await centralizedArbitrator.giveRuling(0, 2, { from: arbitrator })
      },
      {
        maContract,
        payee: {
          etherDelta: 20,
          tokenDelta: 42
        },
        contractTokenDelta: -42
      }
    )
  })

  it('Should split the amount if there is no ruling', async () => {
    const { centralizedArbitrator, maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    })

    await execteActionAndCompareBalances(
      async () => {
        await centralizedArbitrator.giveRuling(0, 0, { from: arbitrator })
      },
      {
        maContract,
        payer: {
          etherDelta: 10,
          tokenDelta: 21
        },
        payee: {
          etherDelta: 10,
          tokenDelta: 21
        },
        contractTokenDelta: -42
      }
    )
  })

  it('Should reimburse the payer in case of timeout of the payee', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    })

    await execteActionAndCompareBalances(
      async () => {
        await time.increase(timeoutFee + 1)
        const tx = await maContract.timeOutByReceiver(arbitrableTransactionId, {
          from: payer,
          gasPrice
        })
        const txFee = tx.receipt.gasUsed * gasPrice
        return {
          payerTotalTxCost: txFee
        }
      },
      {
        maContract,
        payer: {
          etherDelta: 20,
          tokenDelta: 42
        },
        contractTokenDelta: -42
      }
    )
  })

  it("Shouldn't work before timeout for the payer", async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await shouldFail.reverting(
      maContract.timeOutByReceiver(arbitrableTransactionId, {
        from: payer,
        gasPrice: gasPrice
      })
    )
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    })
    await time.increase(1)
    await shouldFail.reverting(
      maContract.timeOutByReceiver(arbitrableTransactionId, {
        from: payer,
        gasPrice: gasPrice
      })
    )
  })

  it('Should reimburse the payee in case of timeout of the payer', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })

    await execteActionAndCompareBalances(
      async () => {
        await time.increase(timeoutFee + 1)
        const tx = await maContract.timeOutBySender(arbitrableTransactionId, {
          from: payee,
          gasPrice
        })
        const txFee = tx.receipt.gasUsed * gasPrice
        return {
          payeeTotalTxCost: txFee
        }
      },
      {
        maContract,
        payee: {
          etherDelta: 20,
          tokenDelta: 42
        },
        contractTokenDelta: -42
      }
    )
  })

  it("Shouldn't work before timeout for the payee", async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await shouldFail.reverting(
      maContract.timeOutBySender(arbitrableTransactionId, {
        from: payee,
        gasPrice: gasPrice
      })
    )
    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })
    await time.increase(1)
    await shouldFail.reverting(
      maContract.timeOutBySender(arbitrableTransactionId, {
        from: payee,
        gasPrice: gasPrice
      })
    )
  })

  it('Should create events when evidence is submitted by the payer', async () => {
    const { centralizedArbitrator, maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })

    const tx = await maContract.submitEvidence(
      arbitrableTransactionId,
      'ipfs:/X',
      { from: payer }
    )
    assert.equal(tx.logs[0].event, 'Evidence')
    assert.equal(tx.logs[0].args._arbitrator, centralizedArbitrator.address)
    assert.equal(tx.logs[0].args._party, payer)
    assert.equal(tx.logs[0].args._evidence, 'ipfs:/X')
  })

  it('Should create events when evidence is submitted by the payee', async () => {
    const { centralizedArbitrator, maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })

    const tx = await maContract.submitEvidence(
      arbitrableTransactionId,
      'ipfs:/X',
      { from: payee }
    )
    assert.equal(tx.logs[0].event, 'Evidence')
    assert.equal(tx.logs[0].args._arbitrator, centralizedArbitrator.address)
    assert.equal(tx.logs[0].args._party, payee)
    assert.equal(tx.logs[0].args._evidence, 'ipfs:/X')
  })

  it('Should fail if someone else try to submit', async () => {
    const { maContract } = await setupContracts()
    const { arbitrableTransactionId } = await createTestTransaction(maContract)

    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
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

    await this.token.approve(maContract.address, 42 * 2, {
      from: payer
    })

    const arbitrableTransactionId1 = (await createTestTransaction(maContract))
      .arbitrableTransactionId

    const arbitrableTransactionId2 = (await createTestTransaction(maContract))
      .arbitrableTransactionId

    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId2, {
      from: payer,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeBySender(arbitrableTransactionId1, {
      from: payee,
      value: arbitrationFee
    })
    // This generates transaction 1 dispute 0
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId1, {
      from: payer,
      value: arbitrationFee
    })
    // This generates transaction 2 dispute 1
    await maContract.payArbitrationFeeBySender(arbitrableTransactionId2, {
      from: payee,
      value: arbitrationFee
    })

    await execteActionAndCompareBalances(
      async () => {
        await centralizedArbitrator.giveRuling(0, 1, { from: arbitrator })
      },
      {
        maContract,
        payer: {
          etherDelta: 20,
          tokenDelta: 42
        },
        contractTokenDelta: -42
      }
    )

    await execteActionAndCompareBalances(
      async () => {
        await centralizedArbitrator.giveRuling(1, 2, { from: arbitrator })
      },
      {
        maContract,
        payee: {
          etherDelta: 20,
          tokenDelta: 42
        },
        contractTokenDelta: -42
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

    await maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
      from: payee,
      value: arbitrationFee
    })
    await maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
      from: payer,
      value: arbitrationFee
    })

    // raise arbitration fee
    await centralizedArbitrator.setArbitrationPrice(arbitrationFee + 1, {
      from: arbitrator
    })

    await shouldFail.reverting(
      maContract.payArbitrationFeeBySender(arbitrableTransactionId, {
        from: payee,
        value: arbitrationFee + 1
      })
    )

    await shouldFail.reverting(
      maContract.payArbitrationFeeByReceiver(arbitrableTransactionId, {
        from: payer,
        value: arbitrationFee + 1
      })
    )
  })
})
