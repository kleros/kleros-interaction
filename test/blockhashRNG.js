var BlockHashRNG = artifacts.require("BlockHashRNG");

contract('BlockhashRNG', async (accounts) => {

  it("should increase the reward for a random number", async () => {
    let blockHashRNG = await BlockHashRNG.new({from: accounts[0]})
    await blockHashRNG.contribute(10, {from: accounts[0], value: 1000})
    let balance = await blockHashRNG.reward(10);
    assert.equal(balance.toNumber(), 1000);

    await blockHashRNG.contribute(10, {from: accounts[1], value: 1000})
    balance = await blockHashRNG.reward(10);
    assert.equal(balance.toNumber(), 2000)
  })

  it("should generate a random number different from zero", async () => {
    let blockHashRNG = await BlockHashRNG.new({from: accounts[0]})
    let rn = await blockHashRNG.getRN(web3.eth.blockNumber)

    assert.notEqual(rn, 0)
  })

  it("should mine dummy blocks", async () => {
    let currentBlockNum = web3.eth.blockNumber

    // mine nine empty blocks
    for (i =0; i < 9; i++){
      await web3.currentProvider.sendAsync({method: "evm_mine"}, function(err, result) {
      });
    }

    // web3.eth.blockNumber is not going to return the correct value if there are no transactions in the block
    // fake a single transaction
    await BlockHashRNG.new({from: accounts[0]})

    assert.equal(currentBlockNum + 10, web3.eth.blockNumber)
  })

  it("should save the random number trough time", async () => {
    let blockHashRNG = await BlockHashRNG.new({from: accounts[0]})
    let blockNum = web3.eth.blockNumber
    let randomNumCall = await blockHashRNG.getRN.call(blockNum)
    let randomNum = randomNumCall.toNumber()

    await blockHashRNG.saveRN(blockNum)
    // long time passes
    for (i = 0; i < 257; i++){
      await web3.currentProvider.sendAsync({method: "evm_mine"}, function(err, result) {
      });
    }

    let sameRandomNum = await blockHashRNG.getRN.call(blockNum)
    assert.equal(sameRandomNum.toNumber(), randomNum, "unsaved random number should be 0")
  })

  it("should give out the reward for saving a number", async () => {
    let blockHashRNG = await BlockHashRNG.new({from: accounts[0]})
    let reimbursment = 1e18
    let balanceBeforeReimbursment = web3.eth.getBalance(accounts[2])
    let blockNum = web3.eth.blockNumber

    await blockHashRNG.contribute(blockNum, {from: accounts[1], value: reimbursment})
    await blockHashRNG.saveRN(blockNum, {from: accounts[2]})

    let balanceAfterReimbursment = web3.eth.getBalance(accounts[2])
    assert.ok(balanceAfterReimbursment.toNumber() > balanceBeforeReimbursment.toNumber())
  })

});
