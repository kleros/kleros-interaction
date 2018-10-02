const T2cr = artifacts.require('ArbitrableTokenList')
const Arbitrator = artifacts.require('CentralizedArbitrator')

module.exports = function(deployer, network, accounts) {
  deployer.deploy(Arbitrator, 10 ** 17).then(async () => {
    await deployer.deploy(
      T2cr,
      Arbitrator.address,
      'extra',
      accounts[5],
      200,
      'kleros.io',
      false,
      false,
      10 ** 17,
      false,
      60 * 60 * 24 * 7
    )
  })
}
