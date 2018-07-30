var BlockHashRNGFallback = artifacts.require("BlockHashRNGFallback");

contract('BlockHashRNGFallback', async (accounts) => {
  it("should save the random number trough time", async () => {
    let blockHashRNGFallback = await BlockHashRNGFallback.new({from: accounts[0]})
    let blockNum = web3.eth.blockNumber
    let randomNumCall = await blockHashRNGFallback.getRN.call(blockNum)
    let randomNum = randomNumCall.toNumber()

    await blockHashRNGFallback.saveRN(blockNum)
    // long time passes
    for (i = 0; i < 257; i++){
      await web3.currentProvider.sendAsync({method: "evm_mine"}, function(err, result) {
      });
    }

    let sameRandomNum = await blockHashRNGFallback.getRN.call(blockNum)
    assert.equal(sameRandomNum.toNumber(), randomNum, "unsaved random number should be 0")
  })

  it("should fallback to a number different from zero", async () => {
    let blockHashRNGFallback = await BlockHashRNGFallback.new({from: accounts[0]})
    let blockNum = web3.eth.blockNumber

    // long time passes
    for (i = 0; i < 257; i++){
      await web3.currentProvider.sendAsync({method: "evm_mine"}, function(err, result) {
      });
    }

    let randomNum = await blockHashRNGFallback.getRN.call(blockNum)
    assert.notEqual(randomNum.toNumber(), 0)

  })

  it("should give out the reward for saving a number", async () => {
    let blockHashRNGFallback = await BlockHashRNGFallback.new({from: accounts[0]})
    let reimbursment = 1e18
    let balanceBeforeReimbursment = web3.eth.getBalance(accounts[2])
    let blockNum = web3.eth.blockNumber

    await blockHashRNGFallback.contribute(blockNum, {from: accounts[1], value: reimbursment})
    await blockHashRNGFallback.saveRN(blockNum, {from: accounts[2]})

    let balanceAfterReimbursment = web3.eth.getBalance(accounts[2])
    assert.ok(balanceAfterReimbursment.toNumber() > balanceBeforeReimbursment.toNumber())
  })

  it("should not give reward to a caller who provided invalid block number", async () => {
    let blockHashRNGFallback = await BlockHashRNGFallback.new({from: accounts[0]})
    let reimbursment = 1e18
    let balanceBeforeReimbursment = web3.eth.getBalance(accounts[2])
    let blockNum = web3.eth.blockNumber + 100

    await blockHashRNGFallback.contribute(blockNum, {from: accounts[1], value: reimbursment})
    await blockHashRNGFallback.saveRN(blockNum, {from: accounts[2]})

    let balanceAfterReimbursment = web3.eth.getBalance(accounts[2])
    assert.ok(balanceAfterReimbursment.toNumber() < balanceBeforeReimbursment.toNumber())

  })
})
