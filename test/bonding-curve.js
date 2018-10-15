/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

const Pinakion = artifacts.require('MiniMeTokenERC20.sol')
const BondingCurve = artifacts.require('BondingCurve.sol')

contract('BondingCurve', function(accounts) {
  const mm1 = accounts[0]
  const mmp1 = 1e19
  const mme1 = 1e19

  const u1 = accounts[1]
  const ue1 = 1e18

  var pinakion
  var bondingCurve

  before('set up', async function() {
    pinakion = await Pinakion.new(
      '0x00',
      '0x00',
      '0x00',
      'Pinakion',
      18,
      'PNK',
      true
    )
    await pinakion.generateTokens(mm1, mmp1)
    bondingCurve = await BondingCurve.new(pinakion.address, accounts[0], 500)
  })

  it('should accept deposit', async function() {
    await pinakion.approve(bondingCurve.address, mmp1, { from: mm1 })
    await bondingCurve.deposit(mmp1, { value: mme1, from: mm1 })
    assert.equal((await bondingCurve.totalEth()).toNumber(), mme1)
    assert.equal((await bondingCurve.totalPnk()).toNumber(), mmp1)
  })

  it('should allow to withdraw', async function() {
    const eth0 = (await web3.eth.getBalance(mm1)).toNumber()
    const pnk0 = (await pinakion.balanceOf(mm1)).toNumber()

    await bondingCurve.withdraw({ from: mm1, gasPrice: 0 })

    const eth1 = (await web3.eth.getBalance(mm1)).toNumber()
    const pnk1 = (await pinakion.balanceOf(mm1)).toNumber()
    assert.equal(eth1 - eth0, mme1)
    assert.equal(pnk1 - pnk0, mmp1)
  })

  it('should allow to buy PNK', async function() {
    await pinakion.approve(bondingCurve.address, mmp1, { from: mm1 })
    await bondingCurve.deposit(mmp1, { value: mme1, from: mm1 })

    const price0 =
      (await bondingCurve.totalEth()).toNumber() /
      (await bondingCurve.totalPnk()).toNumber()

    const pnk0 = (await pinakion.balanceOf(u1)).toNumber()

    await bondingCurve.buy(u1, 0, { value: ue1 })

    const pnk1 = (await pinakion.balanceOf(u1)).toNumber()

    assert(pnk1 > pnk0)

    // because of bonding curve alogrithm and spread, actual price should be higher
    console.log('buying price', ue1 / (pnk1 - pnk0))
    assert(ue1 / (pnk1 - pnk0) > price0)
  })

  it('should allow to sell PNK', async function() {
    const price0 =
      (await bondingCurve.totalEth()).toNumber() /
      (await bondingCurve.totalPnk()).toNumber()

    const eth0 = (await web3.eth.getBalance(u1)).toNumber()
    const pnk0 = await pinakion.balanceOf(u1) // .toNumber() leads to rounding error

    const extraData = makeExtraDataForSelling(u1, 0)

    await pinakion.approveAndCall(bondingCurve.address, pnk0, extraData, {
      from: u1
    })

    const eth1 = (await web3.eth.getBalance(u1)).toNumber()
    const pnk1 = (await pinakion.balanceOf(u1)).toNumber()

    // sold all PNKs
    assert.equal(pnk1, 0)
    assert(eth1 > eth0)

    // actual price should slope
    console.log('selling price', (eth1 - eth0) / pnk0.toNumber())

    assert((eth1 - eth0) / pnk0.toNumber() < price0)
  })
})

/**
 * Construct the _extraData parameter for selling PNK.
 * @param {address} recipientAddress - address to send ETH to
 * @param {uint256} _minEth - minimum number of ETH or no deal
 * @returns {string} - the string representing _extraData
 */
function makeExtraDataForSelling(recipientAddress, _minEth) {
  if (recipientAddress.startsWith('0x'))
    recipientAddress = recipientAddress.slice(2)

  // fixme: minEth not implemented, use 0 has placeholder
  return (
    '0x' +
    '62637331' + // 'bcs1'
    recipientAddress +
    '0000000000000000000000000000000000000000000000000000000000000000'
  )
}
