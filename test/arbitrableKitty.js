const { expectThrow, increaseTime } = require('../helpers/utils')

const ArbitrableKitty = artifacts.require('ArbitrableKitty')
const KittyCore = artifacts.require('KittyCore')
const GeneScienceMock = artifacts.require('GeneScienceMock')
const SaleClockAuction = artifacts.require('SaleClockAuction')
const SiringClockAuction = artifacts.require('SiringClockAuction')
const CentralizedArbitrator = artifacts.require('CentralizedArbitrator')

contract('ArbitrableKitty', (accounts) => {
  let kittyCore
  let arbitrator
  let arbitrable
  let siringAuction
  let saleAuction

  const params = {
    ARBITRATOR: accounts[9],
    PARTY_A: accounts[0],
    PARTY_B: accounts[1],
    OTHER_USER: accounts[3],
    TIMEOUT: 100,
    ARBITRATION_FEE: 20,
    EXTRA_DATA: 0x08575,
    META_EVIDENCE: 'https://kleros.io',
    PARTY_A_WINS: 1,
    PARTY_B_WINS: 2,
    SHARED_CUSTODY: 3,
    kittyId: undefined,
    ceo: accounts[8],
    coo: accounts[7],
    cfo: accounts[6]
  }

  const deployAndPrepare = async () => {
    const { PARTY_A } = params

    arbitrator = await deployArbitratorContracts(params)
    kittyCore = await deployKittyContracts(params)

    // Give a kitty to Party A
    params.kittyId = await mintKitty(4000, params.PARTY_A)

    // Deploy arbitrable contract
    arbitrable = await deployArbitrableKitty(params, arbitrator, kittyCore)

    // Transfer kitty to contract
    await kittyCore.transfer(arbitrable.address, params.kittyId, { from: PARTY_A })
  }

  const deployArbitratorContracts = async ({ARBITRATOR, ARBITRATION_FEE}) => {
    return CentralizedArbitrator.new(ARBITRATION_FEE, { from: ARBITRATOR })
  }

  const deployKittyContracts = async ({ coo, ceo }) => {
    const coreC = await KittyCore.new({ from: coo })
    await coreC.setCEO(ceo, {from: coo})

    let geneScienceContract = await GeneScienceMock.new({ from: coo })
    await coreC.setGeneScienceAddress(geneScienceContract.address, {
      from: ceo
    })

    siringAuction = await SiringClockAuction.new(
      coreC.address,
      100,
      { from: coo }
    )

    await coreC.setSiringAuctionAddress(siringAuction.address, {
      from: ceo
    })

    saleAuction = await SaleClockAuction.new(
      coreC.address,
      100,
      { from: coo }
    )
    await coreC.setSaleAuctionAddress(saleAuction.address, {
      from: ceo
    })

    coreC._getKittyHelper = async function (id) {
      let attrs = await this.getKitty(id)
      return {
        isGestating: attrs[0],
        isReady: attrs[1],
        cooldownIndex: attrs[2].toNumber(),
        nextActionAt: attrs[3].toNumber(),
        siringWithId: attrs[4].toNumber(),
        birthTime: attrs[5].toNumber(),
        matronId: attrs[6].toNumber(),
        sireId: attrs[7].toNumber(),
        generation: attrs[8].toNumber(),
        genes: attrs[9]
      }
    }

    await coreC.unpause({ from: ceo })

    return coreC
  }

  const deployArbitrableKitty = async (params, arbitrator, kittyCore) => {
    const { META_EVIDENCE, TIMEOUT, PARTY_B, EXTRA_DATA, PARTY_A } = params

    return ArbitrableKitty.new(
      arbitrator.address,
      kittyCore.address,
      PARTY_B,
      TIMEOUT,
      EXTRA_DATA,
      META_EVIDENCE,
      {from: PARTY_A}
    )
  }

  const kittyToSiringAuction = async (kittyId, user) => {
    await kittyCore.createSiringAuction(
      kittyId,
      100,
      200,
      60,
      { from: user }
    )

    return kittyId
  }

  const mintKitty = async (genes, user) => {
    const { coo } = params
    await kittyCore.createPromoKitty(genes, user, { from: coo })
    const kittyId = (await kittyCore.totalSupply()).toNumber()
    return kittyId
  }

  describe('No running disputes', () => {
    beforeEach(async () => {
      await deployAndPrepare()
      const status = (await arbitrable.status()).toNumber()
      assert.isAtMost(status, 0, 'should not have any pending or resolved disputes')
    })

    it('should allow any party to put kitty up for siring and cancel', async () => {
      const { kittyId, PARTY_B, PARTY_A } = params
      let kittyOwner

      await arbitrable.createSiringAuction(kittyId, 100, 200, 60, { from: PARTY_B })
      kittyOwner = await kittyCore.ownerOf(kittyId)
      assert.equal(kittyOwner, siringAuction.address, 'Siring auction contract should own kitty')

      await arbitrable.cancelSiringAuction(kittyId, { from: PARTY_A })
      kittyOwner = await kittyCore.ownerOf(kittyId)
      assert.equal(kittyOwner, arbitrable.address, 'Arbitrable contract should own kitty')
    })

    it('should allow any party to bid on siring auction and cancel', async () => {
      const { OTHER_USER, kittyId, PARTY_B } = params

      // Give a kitty to another user and put it up for siring
      const otherKittyId = await kittyToSiringAuction(
        await mintKitty(2000, OTHER_USER),
        OTHER_USER
      )

      await arbitrable.bidOnSiringAuction(otherKittyId, kittyId, {
        from: PARTY_B,
        value: 200
      })

      const kittyOwner = await kittyCore.ownerOf(kittyId)
      assert.equal(kittyOwner, arbitrable.address, 'contract should own the kitty')

      let { isGestating } = await kittyCore._getKittyHelper(kittyId)
      assert.isTrue(isGestating, 'kitty should be pregnant')

      increaseTime(60 * 60)

      await arbitrable.giveBirth(kittyId, { from: PARTY_B })
      isGestating = (await kittyCore._getKittyHelper(kittyId)).isGestating

      assert.isFalse(isGestating, 'kitty should not be pregnant')
    })

    it('should allow parties to breed with auto', async () => {
      const { PARTY_A, kittyId, PARTY_B } = params

      const kitty2Id = await mintKitty(5000, PARTY_B)
      await kittyCore.transfer(arbitrable.address, kitty2Id, { from: PARTY_B })

      await arbitrable.breedWithAuto(kitty2Id, kittyId, {
        from: PARTY_A,
        value: await kittyCore.autoBirthFee()
      })

      let { isGestating } = await kittyCore._getKittyHelper(kitty2Id)
      assert.isTrue(isGestating, 'kitty should be pregnant')
    })
  })

  describe('Consent', () => {
    beforeEach(async () => {
      await deployAndPrepare()
      const status = (await arbitrable.status()).toNumber()
      assert.isAtMost(status, 0, 'should not have any pending or resolved disputes')
    })

    it('should only allow party A to transfer kitty out of the contract if B consents', async () => {
      const { kittyId, PARTY_A, PARTY_B } = params

      await expectThrow(
        arbitrable.transfer(PARTY_A, kittyId, { from: PARTY_A })
      )

      assert.equal((await kittyCore.ownerOf(kittyId)), arbitrable.address, 'arbitrable should still own kitty')

      await arbitrable.consentToTransfer(kittyId, PARTY_A, { from: PARTY_B })
      arbitrable.transfer(PARTY_A, kittyId, { from: PARTY_A })

      assert.equal((await kittyCore.ownerOf(kittyId)), PARTY_A, 'party B should own kitty')
    })

    it('should only allow party B to transfer kitty out of the contract if A consents', async () => {
      const { kittyId, PARTY_A, PARTY_B, OTHER_USER } = params

      await expectThrow(
        arbitrable.transfer(OTHER_USER, kittyId, { from: PARTY_B })
      )

      assert.equal((await kittyCore.ownerOf(kittyId)), arbitrable.address, 'arbitrable should still own kitty')

      await arbitrable.consentToTransfer(kittyId, OTHER_USER, { from: PARTY_A })
      arbitrable.transfer(OTHER_USER, kittyId, { from: PARTY_B })

      assert.equal((await kittyCore.ownerOf(kittyId)), OTHER_USER, 'other user should own kitty')
    })

    it('should only allow party B to sell kitty if A consents', async () => {
      const { kittyId, PARTY_A, PARTY_B } = params

      await expectThrow(
        arbitrable.createSaleAuction(kittyId, 100, 200, 60, { from: PARTY_B })
      )
      assert.equal((await kittyCore.ownerOf(kittyId)), arbitrable.address, 'arbitrable should still own kitty')

      await arbitrable.consentToSell(kittyId, 100, 200, 60, { from: PARTY_A })
      await arbitrable.createSaleAuction(kittyId, 100, 200, 60, { from: PARTY_B })
      assert.equal((await kittyCore.ownerOf(kittyId)), saleAuction.address, 'sale auction contract should own kitty')
    })

    it('should only allow party A to sell kitty if B consents', async () => {
      const { kittyId, PARTY_A, PARTY_B } = params

      await expectThrow(
        arbitrable.createSaleAuction(kittyId, 100, 200, 60, { from: PARTY_A })
      )

      assert.equal((await kittyCore.ownerOf(kittyId)), arbitrable.address, 'arbitrable should still own kitty')

      await arbitrable.consentToSell(kittyId, 100, 200, 60, { from: PARTY_B })
      await arbitrable.createSaleAuction(kittyId, 100, 200, 60, { from: PARTY_A })
      assert.equal((await kittyCore.ownerOf(kittyId)), saleAuction.address, 'sale auction contract should own kitty')
    })

    it('should allow party to revoke consent before other party takes action', async () => {
      const { kittyId, PARTY_A, PARTY_B } = params

      await arbitrable.consentToSell(kittyId, 150, 300, 20, { from: PARTY_B })
      assert.isTrue(await arbitrable.partyConsentsToSell(PARTY_B, kittyId, 150, 300, 20))

      await expectThrow(
        arbitrable.createSaleAuction(kittyId, 100, 200, 60, { from: PARTY_A })
      )

      await arbitrable.revokeConsentToSell(kittyId, { from: PARTY_B })
      assert.isFalse(await arbitrable.partyConsentsToSell(PARTY_B, kittyId, 150, 300, 20))

      await arbitrable.consentToSell(kittyId, 100, 200, 60, { from: PARTY_B })
      await arbitrable.createSaleAuction(kittyId, 100, 200, 60, { from: PARTY_A })
      assert.equal((await kittyCore.ownerOf(kittyId)), saleAuction.address, 'sale auction contract should own kitty')
    })
  })

  describe('Dispute during siring auction', () => {
    beforeEach(deployAndPrepare)

    it('should allow only party A to cancel siring auction', async () => {
      const { PARTY_A, PARTY_B, kittyId, ARBITRATION_FEE, PARTY_A_WINS, ARBITRATOR } = params

      await arbitrable.createSiringAuction(kittyId, 100, 200, 60, { from: PARTY_B })
      assert.equal(await kittyCore.ownerOf(kittyId), siringAuction.address, 'siring contract should own kitty')

      // Raise dispute
      await arbitrable.payArbitrationFeeByPartyA({from: PARTY_A, value: ARBITRATION_FEE})
      await arbitrable.payArbitrationFeeByPartyB({from: PARTY_B, value: ARBITRATION_FEE})

      // Grant custody to party A
      await arbitrator.giveRuling(0, PARTY_A_WINS, {from: ARBITRATOR})

      // Party B should not be allowed to cancel siring auction
      await expectThrow(
        arbitrable.cancelSiringAuction(kittyId, { from: PARTY_B })
      )

      await arbitrable.cancelSiringAuction(kittyId, { from: PARTY_A })

      assert.equal((await kittyCore.ownerOf(kittyId)), arbitrable.address, 'arbitrable contract should own kitty')
    })

    it('should allow only party B to cancel siring auction', async () => {
      const { PARTY_A, PARTY_B, kittyId, ARBITRATION_FEE, PARTY_B_WINS, ARBITRATOR } = params

      await arbitrable.createSiringAuction(kittyId, 100, 200, 60, { from: PARTY_A })
      assert.equal(await kittyCore.ownerOf(kittyId), siringAuction.address, 'siring contract should own kitty')

      // Raise dispute
      await arbitrable.payArbitrationFeeByPartyA({from: PARTY_A, value: ARBITRATION_FEE})
      await arbitrable.payArbitrationFeeByPartyB({from: PARTY_B, value: ARBITRATION_FEE})

      // Grant custody to party B
      await arbitrator.giveRuling(0, PARTY_B_WINS, {from: ARBITRATOR})

      // Party B should not be allowed to cancel siring auction
      await expectThrow(
        arbitrable.cancelSiringAuction(kittyId, { from: PARTY_A })
      )

      await arbitrable.cancelSiringAuction(kittyId, { from: PARTY_B })

      assert.equal((await kittyCore.ownerOf(kittyId)), arbitrable.address, 'arbitrable contract should own kitty')
    })
  })

  describe('Dispute during sale auction', () => {
    beforeEach(deployAndPrepare)

    it('should allow only party A to cancel sale auction', async () => {
      const { PARTY_A, PARTY_B, kittyId, ARBITRATION_FEE, PARTY_A_WINS, ARBITRATOR } = params

      await arbitrable.consentToSell(kittyId, 100, 200, 60, { from: PARTY_A })
      await arbitrable.createSaleAuction(kittyId, 100, 200, 60, { from: PARTY_B })
      assert.equal(await kittyCore.ownerOf(kittyId), saleAuction.address, 'sale contract should own kitty')

      // Raise dispute
      await arbitrable.payArbitrationFeeByPartyA({from: PARTY_A, value: ARBITRATION_FEE})
      await arbitrable.payArbitrationFeeByPartyB({from: PARTY_B, value: ARBITRATION_FEE})

      // Grant custody to party A
      await arbitrator.giveRuling(0, PARTY_A_WINS, {from: ARBITRATOR})

      // Party B should not be allowed to cancel sale auction
      await expectThrow(
        arbitrable.cancelSaleAuction(kittyId, { from: PARTY_B })
      )

      await arbitrable.cancelSaleAuction(kittyId, { from: PARTY_A })
      assert.equal((await kittyCore.ownerOf(kittyId)), arbitrable.address, 'arbitrable contract should own kitty')
    })

    it('should allow only party B to cancel sale auction', async () => {
      const { PARTY_A, PARTY_B, kittyId, PARTY_B_WINS, ARBITRATION_FEE, ARBITRATOR } = params

      await arbitrable.consentToSell(kittyId, 100, 200, 60, { from: PARTY_B })
      await arbitrable.createSaleAuction(kittyId, 100, 200, 60, { from: PARTY_A })
      assert.equal(await kittyCore.ownerOf(kittyId), saleAuction.address, 'sale contract should own kitty')

      // Raise dispute
      await arbitrable.payArbitrationFeeByPartyA({from: PARTY_A, value: ARBITRATION_FEE})
      await arbitrable.payArbitrationFeeByPartyB({from: PARTY_B, value: ARBITRATION_FEE})

      // Grant custody to party B
      await arbitrator.giveRuling(0, PARTY_B_WINS, {from: ARBITRATOR})

      // Party B should not be allowed to cancel sale auction
      await expectThrow(
        arbitrable.cancelSaleAuction(kittyId, { from: PARTY_A })
      )

      await arbitrable.cancelSaleAuction(kittyId, { from: PARTY_B })

      assert.equal((await kittyCore.ownerOf(kittyId)), arbitrable.address, 'arbitrable contract should own kitty')
    })
  })

  describe('Party A wins', () => {
    beforeEach(async () => {
      await deployAndPrepare()

      const { PARTY_A, PARTY_B, ARBITRATION_FEE, ARBITRATOR, PARTY_A_WINS } = params
      assert.isAtMost((await arbitrable.rulingResult()).toNumber(), 0, 'should not have a result yet')

      // Raise dispute
      await arbitrable.payArbitrationFeeByPartyA({from: PARTY_A, value: ARBITRATION_FEE})
      await arbitrable.payArbitrationFeeByPartyB({from: PARTY_B, value: ARBITRATION_FEE})

      // Grant custody to party A
      await arbitrator.giveRuling(0, PARTY_A_WINS, {from: ARBITRATOR})
    })

    it('should grant custody to A if arbitrator ruled as such', async () => {
      const { PARTY_A_WINS, PARTY_A } = params

      assert.equal((await arbitrable.rulingResult()).toNumber(), PARTY_A_WINS, 'party A should have won')
      assert.equal(await arbitrable.winner(), PARTY_A, 'Party A should be the winner')
    })

    it('should allow only party A to transfer kitty if arbitrator ruled as such', async () => {
      const { PARTY_A, PARTY_B, OTHER_USER, kittyId } = params

      await expectThrow(
        arbitrable.transfer(PARTY_B, kittyId, { from: PARTY_B })
      )

      await arbitrable.transfer(OTHER_USER, kittyId, { from: PARTY_A })

      assert.equal(await kittyCore.ownerOf(kittyId), OTHER_USER, 'other user should own kitty.')
    })
  })

  describe('Party B wins', () => {
    beforeEach(async () => {
      await deployAndPrepare()

      const { PARTY_A, PARTY_B, ARBITRATION_FEE, ARBITRATOR, PARTY_B_WINS } = params
      assert.isAtMost((await arbitrable.rulingResult()).toNumber(), 0, 'should not have a result yet')

      // Raise dispute
      await arbitrable.payArbitrationFeeByPartyA({from: PARTY_A, value: ARBITRATION_FEE})
      await arbitrable.payArbitrationFeeByPartyB({from: PARTY_B, value: ARBITRATION_FEE})

      // Grant custody to party B
      await arbitrator.giveRuling(0, PARTY_B_WINS, {from: ARBITRATOR})
    })

    it('should grant custody to B if arbitrator ruled as such', async () => {
      const { PARTY_B_WINS, PARTY_B } = params
      assert.equal((await arbitrable.rulingResult()).toNumber(), PARTY_B_WINS, 'party B should have won')
      assert.equal(await arbitrable.winner(), PARTY_B, 'Party B should be the winner')
    })

    it('should allow only party B to transfer kitty if arbitrator ruled as such', async () => {
      const { PARTY_A, PARTY_B, OTHER_USER, kittyId } = params

      await expectThrow(
        arbitrable.transfer(PARTY_A, kittyId, { from: PARTY_A })
      )

      await arbitrable.transfer(OTHER_USER, kittyId, { from: PARTY_B })

      assert.equal(await kittyCore.ownerOf(kittyId), OTHER_USER, 'other user should own kitty.')
    })
  })

  describe('Shared custody', () => {
    beforeEach(async () => {
      await deployAndPrepare()

      const { PARTY_A, PARTY_B, ARBITRATION_FEE, ARBITRATOR, SHARED_CUSTODY } = params
      assert.isAtMost((await arbitrable.rulingResult()).toNumber(), 0, 'should not have a result yet')

      // Raise dispute
      await arbitrable.payArbitrationFeeByPartyA({from: PARTY_A, value: ARBITRATION_FEE})
      await arbitrable.payArbitrationFeeByPartyB({from: PARTY_B, value: ARBITRATION_FEE})

      // // Grant shared custody
      await arbitrator.giveRuling(0, SHARED_CUSTODY, { from: ARBITRATOR })
    })

    it('should have granted shared custody', async () => {
      const { SHARED_CUSTODY } = params
      const rulingResult = (await arbitrable.rulingResult()).toNumber()
      assert.equal(rulingResult, SHARED_CUSTODY, 'shared custody should have been granted')
      assert.equal((await web3.eth.getBalance(arbitrable.address)).toNumber(),0,'should have split fees')
    })

    it("should return correct custody information", async () => {
      const { PARTY_A, PARTY_B } = params

      assert.isFalse(await arbitrable.underSendersCustody({ from: PARTY_B }),"should not be available yet")
      assert.isFalse(await arbitrable.underSendersCustody({ from: PARTY_A }),"should not be available yet")

      increaseTime(1)

      assert.isTrue(await arbitrable.underSendersCustody({ from: PARTY_A }),"should be under A's custody")
      assert.isFalse(await arbitrable.underSendersCustody({ from: PARTY_B }),"should be under A's custody")

      increaseTime(60 * 60 * 24 * 7)
      assert.isTrue(await arbitrable.underSendersCustody({ from: PARTY_B }),"should be under B's custody")
      assert.isFalse(await arbitrable.underSendersCustody({ from: PARTY_A }),"should be under B's custody")
    })

    it("should allow only party A to take actions during A's custody", async () => {
      const { PARTY_A, PARTY_B, kittyId } = params
      increaseTime(1)

      await expectThrow(
        arbitrable.createSiringAuction(kittyId, 100, 200, 60, { from: PARTY_B })
      )

      await arbitrable.createSiringAuction(kittyId, 100, 200, 60, { from: PARTY_A })

      await expectThrow(
        arbitrable.cancelSiringAuction(kittyId, { from: PARTY_B })
      )

      await arbitrable.cancelSiringAuction(kittyId, { from: PARTY_A })

      const kitty2Id = await mintKitty(5000, arbitrable.address)
      const autoBirthFee = await kittyCore.autoBirthFee()

      await expectThrow(
        arbitrable.breedWithAuto(kitty2Id, kittyId, {
          from: PARTY_B,
          value: autoBirthFee
        })
      )

      await arbitrable.breedWithAuto(kitty2Id, kittyId, {
        from: PARTY_A,
        value: autoBirthFee
      })

    })

    it("should allow only party B to take actions during B's custody", async () => {
      const { PARTY_A, PARTY_B, kittyId, OTHER_USER } = params
      increaseTime((60 * 60 * 24 * 7) + 1)

      const otherKittyId = await kittyToSiringAuction(
        await mintKitty(2000, OTHER_USER),
        OTHER_USER
      )

      await expectThrow(
        arbitrable.bidOnSiringAuction(otherKittyId, kittyId, { from: PARTY_A, value: 200 })
      )
      await arbitrable.bidOnSiringAuction(otherKittyId, kittyId, { from: PARTY_B, value: 200 })

      increaseTime(60 * 60)

      await expectThrow(
        arbitrable.giveBirth(kittyId, { from: PARTY_A })
      )

      await arbitrable.giveBirth(kittyId, { from: PARTY_B })
    })

  })

  describe('Custody math checker', () => {
    beforeEach(deployAndPrepare)

    it('should calculate modulus correctly', async () => {
      assert.equal((await arbitrable.modulus(21999,1661)).toNumber(),406)
      assert.equal((await arbitrable.modulus(2,4)).toNumber(),2)
      await expectThrow(
        arbitrable.modulus(2,0)
      )
    })

    it('should return custody correctly for input', async () => {
      const partyA = 1
      const partyB = 2

      assert.equal((await arbitrable.custodyTurn(10000,10001,300)).toNumber(),partyA)
      assert.equal((await arbitrable.custodyTurn(10000,10300,300)).toNumber(),partyB)
    })
  })

})
