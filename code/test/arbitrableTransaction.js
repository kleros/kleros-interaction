const { expectThrow, waitForMined } = require('../helpers/utils')
const ArbitrableTransaction = artifacts.require('./ArbitrableTransaction.sol')
const CentralizedArbitrator = artifacts.require('./CentralizedArbitrator.sol')

contract('ArbitrableTransaction', function(accounts) {
	
	let payer = accounts[0]
    let payee = accounts[1]
	let other = accounts[2]
	let amount = 1000
	let timeout = 100
	
	// Constructor
	it("Should put 1000 wei in the contract", async () => {
		let arbitrableTransaction = await ArbitrableTransaction.new("0x0", timeout, payee, "0x0",{from:payer,value:amount})
		assert.equal(web3.eth.getBalance(arbitrableTransaction.address), 1000, "The contract hasn't received the wei correctly.")
		
		let a = await arbitrableTransaction.amount()
		assert.equal(a.toNumber(), 1000, "The contract hasn't updated its amount correctly.")
	})
	
	// Pay
	it("Should pay the payee", async () => {
		let initialPayeeBalance = web3.eth.getBalance(payee)
		let arbitrableTransaction = await ArbitrableTransaction.new("0x0", timeout, payee, "0x0",{from:payer,value:amount})
		await arbitrableTransaction.pay({from:payer})
		let newPayeeBalance = web3.eth.getBalance(payee)
		assert.equal(newPayeeBalance.toString(), initialPayeeBalance.plus(1000).toString(), "The payee hasn't been paid properly")
	})
	
	it("Should not pay the payee", async () => {
		let initialPayeeBalance = web3.eth.getBalance(payee)
		let arbitrableTransaction = await ArbitrableTransaction.new("0x0", timeout, payee, "0x0",{from:payer,value:amount})
		await expectThrow(arbitrableTransaction.pay({from:payee}))
	})
	
	// Reimburse
	it("Should reimburse 507 to the payer", async () => {
		let arbitrableTransaction = await ArbitrableTransaction.new("0x0", timeout, payee, "0x0",{from:payer,value:amount})
		let payerBalanceBeforeReimbursment = web3.eth.getBalance(payer)
		await arbitrableTransaction.reimburse(507,{from:payee})
		let newPayerBalance = web3.eth.getBalance(payer)
		let newContractBalance = web3.eth.getBalance(arbitrableTransaction.address)
		let newAmount = await arbitrableTransaction.amount()
		
		
		assert.equal(newPayerBalance.toString(), payerBalanceBeforeReimbursment.plus(507).toString(), "The payer has not been reimbursed correctly")
		assert.equal(newContractBalance.toNumber(), 493, "Bad amount in the contract")
		assert.equal(newAmount.toNumber(), 493, "Amount not updated correctly")
	})

	it("Should reimburse 1000 (all) to the payer", async () => {
		let arbitrableTransaction = await ArbitrableTransaction.new("0x0", timeout, payee, "0x0",{from:payer,value:amount})
		let payerBalanceBeforeReimbursment = web3.eth.getBalance(payer)
		await arbitrableTransaction.reimburse(1000,{from:payee})
		let newPayerBalance = web3.eth.getBalance(payer)
		let newContractBalance = web3.eth.getBalance(arbitrableTransaction.address)
		let newAmount = await arbitrableTransaction.amount()
		
		assert.equal(newPayerBalance.toString(), payerBalanceBeforeReimbursment.plus(1000).toString(), "The payer has not been reimbursed correctly")
		assert.equal(newContractBalance.toNumber(), 0, "Bad amount in the contract")
		assert.equal(newAmount.toNumber(), 0, "Amount not updated correctly")
	})
	
	it("Should fail if we try to reimburse more", async () => {
		let arbitrableTransaction = await ArbitrableTransaction.new("0x0", timeout, payee, "0x0",{from:payer,value:amount})
		let payerBalanceBeforeReimbursment = web3.eth.getBalance(payer)
		await expectThrow(arbitrableTransaction.reimburse(1003,{from:payee}))
	})
	
	it("Should fail if the payer to it", async () => {
		let arbitrableTransaction = await ArbitrableTransaction.new("0x0", timeout, payee, "0x0",{from:payer,value:amount})
		let payerBalanceBeforeReimbursment = web3.eth.getBalance(payer)
		await expectThrow(arbitrableTransaction.reimburse(1000,{from:payer}))
	})
	
	// executeRuling
	
	
	
})

