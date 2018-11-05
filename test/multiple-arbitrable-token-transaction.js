/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const ERC20Mock = artifacts.require('./ERC20Mock.sol')
const MultipleArbitrableTokenTransaction = artifacts.require(
  './MultipleArbitrableTokenTransaction.sol'
)

contract('MultipleArbitrableTokenTransaction', function(accounts) {
  const payer = accounts[0]
  const payee = accounts[1]
  const timeout = 100
  const metaEvidenceUri = 'https://kleros.io'

  beforeEach(async () => {
    this.token = await ERC20Mock.new(payer, 100)
  })

  it('Should handle 1 transaction', async () => {
    const arbitrableTokenContract = await MultipleArbitrableTokenTransaction.new(
      {
        from: payer
      }
    )

    await this.token.approve(arbitrableTokenContract.address, 10, {
      from: payer
    })
    await arbitrableTokenContract.createTransaction(
      0x0,
      this.token.address,
      timeout,
      10,
      payee,
      0x0,
      metaEvidenceUri,
      { from: payer }
    )
  })
})
