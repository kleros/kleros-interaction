module.exports = {
  // mocha: {
  //   reporter: 'eth-gas-reporter',
  //   reporterOptions: {
  //     currency: 'USD',
  //     gasPrice: 21
  //   }
  // },
  networks: {
    test: {
      host: 'localhost',
      port: 8545,
      network_id: '*',
      gas: 8000000
    }
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  }
}
