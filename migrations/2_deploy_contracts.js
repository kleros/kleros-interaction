const T2cr = artifacts.require('ArbitrableTokenList')
const Arbitrator = artifacts.require('CentralizedArbitrator')

module.exports = function(deployer, network, accounts) {
  deployer.deploy(Arbitrator, 10 ** 17).then(async () => {
    await deployer.deploy(
      T2cr,
      Arbitrator.address,
      'extra',
      'kleros.io',
      false,
      false,
      false,
      10 ** 17,
      60 * 60 * 24 * 7,
      accounts[5],
      200
    )
  })
}
