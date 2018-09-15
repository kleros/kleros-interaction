/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

const BigNumber = web3.BigNumber;
const {
  expectThrow
} = require('../helpers/utils');
const CentralizedArbitrator = artifacts.require('./CentralizedArbitrator.sol');
const AppealableArbitrator = artifacts.require('./AppealableArbitrator.sol');


contract('appealableArbitrator', function(accounts) {

  const acc0 = accounts[0];
  const acc1 = accounts[1];
  const acc2 = accounts[2];
  const arbitratorExtraData = 0x08575;
  const arbitrationPrice = 4;
  const timeout = 100;

  const ARBITRARY_NUMBER = 123;
  const ARBITRARY_STRING = "abc";

  let appealableArbitrator;
  let centralizedArbitrator;
  let arbitrationCost;



  before('setup contract for each test', async () => {
    centralizedArbitrator = await CentralizedArbitrator.new(arbitrationPrice, {
      from: acc0
    });

    appealableArbitrator = await AppealableArbitrator.new(
      centralizedArbitrator.address,
      arbitrationPrice,
      arbitratorExtraData,
      timeout, {
        from: acc0
      }
    );

  });

  it('should ask appealCost to its superior acc0itrator', async() => {

    const superior = await appealableArbitrator.arbitrator();
    const centralizedArbitrator = new CentralizedArbitrator(superior);

    const actual = await appealableArbitrator.appealCost(ARBITRARY_NUMBER, ARBITRARY_STRING);
    const expected = await centralizedArbitrator.appealCost(ARBITRARY_NUMBER, ARBITRARY_STRING);

    assert(actual.equals(expected));
  })

});
