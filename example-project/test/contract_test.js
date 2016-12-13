var assert = require('assert');
var helper = require('ethereum-sandbox-helper');
var Workbench = require('ethereum-sandbox-workbench');

var workbench = new Workbench({
  contractsDirectory: 'contracts',
  solcVersion: '0.4.4',
  defaults: {
    from: '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826'
  }
});

var contract;

workbench.startTesting('contract', function(contracts) {
  it('Deploy Contract', function() {
    return contracts.Contract.new()
      .then(function(result) {
        if (result.address) contract = result;
        else throw new Error('Contract is not deployed');
        return true;
      });
  });
  
  it('Prints string', function() {
    var str = "hello, ethereum!";
    return contract.test(str)
      .then(function(txHash) {
        return workbench.waitForReceipt(txHash);
      })
      .then(function (receipt) {
        assert.equal(helper.hexToString(receipt.logs[0].data), str);
        return true;
      });
  });
});
