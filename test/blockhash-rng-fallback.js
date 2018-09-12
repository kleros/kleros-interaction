/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

var BlockHashRNGFallback = artifacts.require('BlockHashRNGFallback')

contract('BlockHashRNGFallback', async accounts => {
  it('should save the random number trough time', async () => {
    const blockHashRNGFallback = await BlockHashRNGFallback.new({
      from: accounts[0]
    })
    const blockNum = web3.eth.blockNumber
    const randomNumCall = await blockHashRNGFallback.getRN.call(blockNum)
    const randomNum = randomNumCall.toNumber()

    await blockHashRNGFallback.saveRN(blockNum)
    // long time passes
    for (i = 0; i < 257; i++)
      await web3.currentProvider.sendAsync({ method: 'evm_mine' }, function(
        _err,
        _result
      ) {})

    const sameRandomNum = await blockHashRNGFallback.getRN.call(blockNum)
    assert.equal(
      sameRandomNum.toNumber(),
      randomNum,
      'unsaved random number should be 0'
    )
  })

  it('should fallback to a number different from zero', async () => {
    const blockHashRNGFallback = await BlockHashRNGFallback.new({
      from: accounts[0]
    })
    const blockNum = web3.eth.blockNumber

    // long time passes
    for (i = 0; i < 257; i++)
      await web3.currentProvider.sendAsync({ method: 'evm_mine' }, function(
        _err,
        _result
      ) {})

    const randomNum = await blockHashRNGFallback.getRN.call(blockNum)
    assert.notEqual(randomNum.toNumber(), 0)
  })

  it('should give out the reward for saving a number', async () => {
    const blockHashRNGFallback = await BlockHashRNGFallback.new({
      from: accounts[0]
    })
    const reimbursment = 1e18
    const balanceBeforeReimbursment = web3.eth.getBalance(accounts[2])
    const blockNum = web3.eth.blockNumber

    await blockHashRNGFallback.contribute(blockNum, {
      from: accounts[1],
      value: reimbursment
    })
    await blockHashRNGFallback.saveRN(blockNum, { from: accounts[2] })

    const balanceAfterReimbursment = web3.eth.getBalance(accounts[2])
    assert.ok(
      balanceAfterReimbursment.toNumber() > balanceBeforeReimbursment.toNumber()
    )
  })

  it('should not give reward to a caller who provided invalid block number', async () => {
    const blockHashRNGFallback = await BlockHashRNGFallback.new({
      from: accounts[0]
    })
    const reimbursment = 1e18
    const balanceBeforeReimbursment = web3.eth.getBalance(accounts[2])
    const blockNum = web3.eth.blockNumber + 100

    await blockHashRNGFallback.contribute(blockNum, {
      from: accounts[1],
      value: reimbursment
    })
    await blockHashRNGFallback.saveRN(blockNum, { from: accounts[2] })

    const balanceAfterReimbursment = web3.eth.getBalance(accounts[2])
    assert.ok(
      balanceAfterReimbursment.toNumber() < balanceBeforeReimbursment.toNumber()
    )
  })
})
