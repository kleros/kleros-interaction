/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

const {
  expectThrow
} = require('../helpers/utils')
const ArbitrableBlacklist = artifacts.require('./ArbitrableBlacklist.sol')
const CentralizedArbitrator = artifacts.require('./CentralizedArbitrator.sol')
const Item = artifacts.require('./ArbitrableBlacklist.sol')

contract('ArbitrableBlacklist', function(accounts) {

  let arbitrator = accounts[1]
  let partyA = accounts[2]
  let partyB = accounts[3]
  let arbitratorExtraData = 0x08575
  let arbitrationFee = 128
  let stake = 256
  let timeToChallenge = 0
  let contractHash = 0x6aa0bb2779ab006be0739900654a89f1f8a2d7373ed38490a7cbab9c9392e1ff

  let centralizedArbitrator
  let arbitrableBlacklist
  let arbitrationCost

  const ITEM_STATUS = {
    ABSENT: 0,
    CLEARED: 1,
    RESUBMITTED: 2,
    BLACKLISTED: 3,
    SUBMITTED: 4,
    CLEARING_REQUESTED: 5,
    PREVENTIVE_CLEARING_REQUESTED: 6
  };

  const RULING = {
    OTHER: 0,
    BLACKLIST: 1,
    CLEAR: 2
  };

  const ARBITRARY_NUMBER = 123
  const ARBITRARY_STRING = "abc"

  beforeEach('setup contract for each test', async () => {
    centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {
      from: arbitrator
    })

    arbitrableBlacklist = await ArbitrableBlacklist.new(centralizedArbitrator.address, arbitratorExtraData, contractHash, stake, timeToChallenge, {
      from: arbitrator
    })

    arbitrationCost = (await centralizedArbitrator.arbitrationCost.call("as", {
      from: arbitrator
    })).toNumber();
  })

  it('should be constructed correctly', async () => {

    assert.equal(await arbitrableBlacklist.stake(), stake)
    assert.equal(await arbitrableBlacklist.timeToChallenge(), timeToChallenge)
    assert.equal(await arbitrableBlacklist.arbitratorExtraData(), arbitratorExtraData)
  })


  describe('msg.value restrictions', function() {
    describe('Should revert when msg.value < stake+arbitratorCost', function() {

      it('requestBlacklisting', async () => {
        await expectThrow(arbitrableBlacklist.requestBlacklisting(
          ARBITRARY_STRING, {
            from: arbitrator,
            value: stake + arbitrationCost - 1
          }))
      })

      it('requestClearing', async () => {
        await expectThrow(arbitrableBlacklist.requestClearing(
          ARBITRARY_STRING, {
            from: arbitrator,
            value: stake + arbitrationCost - 1
          }))
      })

      it('challengeBlacklisting', async () => {
        await expectThrow(arbitrableBlacklist.challengeBlacklisting(
          ARBITRARY_STRING, {
            from: arbitrator,
            value: stake + arbitrationCost - 1
          }))
      })

      it('challengeClearing', async () => {
        await expectThrow(arbitrableBlacklist.challengeBlacklisting(
          ARBITRARY_STRING, {
            from: arbitrator,
            value: stake + arbitrationCost - 1
          }))
      })
    })
  })

  describe('When item.disputed', function() {

    beforeEach('prepare pre-conditions to satisfy other requirements', async function() {
      await arbitrableBlacklist.requestBlacklisting(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }) // To satisfy `require(item.status==ItemStatus.Resubmitted || item.status==ItemStatus.Submitted)`

      await arbitrableBlacklist.challengeBlacklisting(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }) // To dissatisfy `require(!item.disputed)`
    })

    beforeEach('assert pre-conditions', async function() {
      assert.ok((await arbitrableBlacklist.items(ARBITRARY_STRING))[0] == ITEM_STATUS.SUBMITTED || (await arbitrableBlacklist.items(ARBITRARY_STRING))[0] == ITEM_STATUS.RESUBMITTED)

      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[5], true)
    })
    it('challengeBlacklisting', async () => {
      await expectThrow(arbitrableBlacklist.challengeBlacklisting(
        ARBITRARY_STRING, {
          from: arbitrator,
          value: stake + arbitrationCost
        }))
    })

    it('challengeClearing', async () => {
      await expectThrow(arbitrableBlacklist.challengeClearing(
        ARBITRARY_STRING, {
          from: arbitrator,
          value: stake + arbitrationCost
      }))
    })
  })

  describe('When !(item.status==ItemStatus.ClearingRequested || item.status==ItemStatus.PreventiveClearingRequested))', function() {

    beforeEach('assert pre-conditions', async function() {
      assert.ok((await arbitrableBlacklist.items(ARBITRARY_STRING))[0] < ITEM_STATUS.CLEARING_REQUESTED)
    })

    it('challengeBlacklisting', async function() {
      await expectThrow(arbitrableBlacklist.challengeBlacklisting(
        ARBITRARY_STRING, {
          from: arbitrator,
          value: stake + arbitrationCost
      }))
    })

    it('challengeClearing', async function() {
      await expectThrow(arbitrableBlacklist.challengeClearing(
        ARBITRARY_STRING, {
          from: arbitrator,
          value: stake + arbitrationCost
      }))
    })
  })


  describe('When item in absent state', function() {

    beforeEach('assert pre-conditions', async function() {
      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0], ITEM_STATUS.ABSENT)

    })

    it('calling isPermitted should return true', async () => {
      assert.equal((await arbitrableBlacklist.isPermitted(ARBITRARY_STRING)), true)
    })

    it('calling requestBlacklisting should move item into the submitted state', async () => {
      await arbitrableBlacklist.requestBlacklisting(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      })

      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0], ITEM_STATUS.SUBMITTED);
    })

    it('calling requestClearing should move item into the preventive clearing requested state', async () => {
      await arbitrableBlacklist.requestClearing(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      })

      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.PREVENTIVE_CLEARING_REQUESTED)
    })

    it('calling challangeBlacklisting should revert', async () => {
      await expectThrow(arbitrableBlacklist.challengeBlacklisting(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }))
    })

    it('calling challangeClearing should revert', async () => {
      await expectThrow(arbitrableBlacklist.challengeClearing(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }))
    })

    it('calling executeRequest should revert', async () => {
      await expectThrow(arbitrableBlacklist.executeRequest(ARBITRARY_STRING, {
        from: arbitrator
      }))
    })
  })

  describe('When item in cleared state', function() {

    beforeEach('prepare pre-conditions', async function() {
      await arbitrableBlacklist.requestBlacklisting(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      })
      await arbitrableBlacklist.executeRequest(ARBITRARY_STRING, {
        from: arbitrator
      })
      await arbitrableBlacklist.requestClearing(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      })
      await arbitrableBlacklist.executeRequest(ARBITRARY_STRING, {
        from: arbitrator
      })
    })

    beforeEach('assert pre-conditions', async function() {
      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0], ITEM_STATUS.CLEARED)
    })

    it('calling isPermitted should return true', async () => {
      assert.equal((await arbitrableBlacklist.isPermitted(ARBITRARY_STRING)), true)
    })

    it('calling requestBlacklisting should move item into the resubmitted state', async () => {
      await arbitrableBlacklist.requestBlacklisting(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      })

      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.RESUBMITTED)
    })

    it('calling requestClearing should revert', async () => {
      await expectThrow(arbitrableBlacklist.requestClearing(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }))
    })

    it('calling challangeBlacklisting should revert', async () => {
      await expectThrow(arbitrableBlacklist.challengeBlacklisting(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }))
    })

    it('calling challangeClearing should revert', async () => {
      await expectThrow(arbitrableBlacklist.challengeClearing(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }))
    })

    it('calling executeRequest should revert', async () => {
      await expectThrow(arbitrableBlacklist.executeRequest(ARBITRARY_STRING, {
        from: arbitrator
      }))
    })
  })

  describe('When item in resubmitted state', function() {

    beforeEach('prepare pre-conditions', async function() {
      await arbitrableBlacklist.requestBlacklisting(ARBITRARY_STRING, {
        from: partyA,
        value: stake + arbitrationCost
      })
      await arbitrableBlacklist.executeRequest(ARBITRARY_STRING, {
        from: partyA
      })
      await arbitrableBlacklist.requestClearing(ARBITRARY_STRING, {
        from: partyB,
        value: stake + arbitrationCost
      })
      await arbitrableBlacklist.executeRequest(ARBITRARY_STRING, {
        from: partyB
      })
      await arbitrableBlacklist.requestBlacklisting(ARBITRARY_STRING, {
        from: partyA,
        value: stake + arbitrationCost
      })
    })

    beforeEach('assert pre-conditions', async function() {
      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.RESUBMITTED)

    })

    it('calling isPermitted should return true', async () => {
      assert.equal((await arbitrableBlacklist.isPermitted(ARBITRARY_STRING)), true)
    })

    it('calling requestBlacklisting should revert', async () => {
      await expectThrow(arbitrableBlacklist.requestBlacklisting(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }))
    })

    it('calling requestClearing should revert', async function() {
      await expectThrow(arbitrableBlacklist.requestClearing(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }))
    })

    it('calling challangeBlacklisting should create a dispute', async function() {
      let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();

      await arbitrableBlacklist.challengeBlacklisting(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      })

      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[3].toString(), arbitrator)
      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber(), itemBalance + stake)
      let disputeID = (await arbitrableBlacklist.items(ARBITRARY_STRING))[6].toNumber();
      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[5], true)
      assert.equal(web3.toUtf8(await arbitrableBlacklist.disputeIDToItem(disputeID)), ARBITRARY_STRING)
    })

    it('calling challangeClearing should revert', async () => {
      await expectThrow(arbitrableBlacklist.challengeClearing(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }))
    })

    it('calling executeRequest should move item into the blacklisted state', async function() {
      await arbitrableBlacklist.executeRequest(ARBITRARY_STRING, {
        from: arbitrator
      })

      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.BLACKLISTED)
    })

    describe('executeRuling', async function() {
      let disputeID

      beforeEach('create a dispute', async function() {
        await arbitrableBlacklist.challengeBlacklisting(ARBITRARY_STRING, {
          from: partyB,
          value: stake + arbitrationCost
        });

        disputeID = (await arbitrableBlacklist.items(ARBITRARY_STRING))[6].toNumber();
      })

      it('calling executeRuling with BLACKLIST should send item.balance to submitter', async function() {
        let submitter = (await arbitrableBlacklist.items(ARBITRARY_STRING))[2];
        let submitterBalance = web3.eth.getBalance(submitter).toNumber();
        let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();

        await centralizedArbitrator.giveRuling(disputeID, RULING.BLACKLIST, {from: arbitrator})

        assert.equal(web3.eth.getBalance(submitter).toNumber(), submitterBalance + itemBalance)
        assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.BLACKLISTED)
      })

      it('calling executeRuling with CLEAR should send item.balance to challanger', async function() {
        let challenger = (await arbitrableBlacklist.items(ARBITRARY_STRING))[3];
        let challengerBalance = web3.eth.getBalance(challenger).toNumber();
        let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();

        await centralizedArbitrator.giveRuling(disputeID, RULING.CLEAR, {from: arbitrator})

        assert.equal(web3.eth.getBalance(challenger), challengerBalance + itemBalance)
        assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARED)
      })

      it('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the absent state', async function() {

        let submitter = (await arbitrableBlacklist.items(ARBITRARY_STRING))[2];
        let challenger = (await arbitrableBlacklist.items(ARBITRARY_STRING))[3];
        let submitterBalance = web3.eth.getBalance(submitter).toNumber();
        let challengerBalance = web3.eth.getBalance(challenger).toNumber();
        let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();

        await centralizedArbitrator.giveRuling(disputeID, RULING.OTHER, {from: arbitrator})

        assert.equal(web3.eth.getBalance(submitter).toNumber(), submitterBalance + (itemBalance / 2))
        assert.equal(web3.eth.getBalance(challenger).toNumber(), challengerBalance + (itemBalance / 2))
        assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.ABSENT)

      })
    })
  })

  describe('When item in blacklisted state', function() {

    beforeEach('prepare pre-conditions', async function() {
      await arbitrableBlacklist.requestBlacklisting(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      })
      await arbitrableBlacklist.executeRequest(ARBITRARY_STRING, {
        from: arbitrator
      })
    })

    beforeEach('assert pre-conditions', async function() {
      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0], ITEM_STATUS.BLACKLISTED)
    })

    it('calling isPermitted should return true', async () => {
      assert.equal((await arbitrableBlacklist.isPermitted(ARBITRARY_STRING)), false)
    })

    it('calling requestBlacklisting should revert', async () => {
      await expectThrow(arbitrableBlacklist.requestBlacklisting(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }))
    })

    it('calling requestClearing should move item into the clearing requested state', async () => {
      await arbitrableBlacklist.requestClearing(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      })

      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARING_REQUESTED)
    })

    it('calling challengeBlacklisting should revert', async () => {
      await expectThrow(arbitrableBlacklist.challengeBlacklisting(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }))
    })

    it('calling challengeClearing should revert', async () => {
      await expectThrow(arbitrableBlacklist.challengeClearing(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }))
    })

    it('calling executeRequest should revert', async function() {
      await expectThrow(arbitrableBlacklist.executeRequest(ARBITRARY_STRING, {
        from: arbitrator
      }))
    })
  })

  describe('When item in submitted state', function() {

    beforeEach('prepare pre-conditions', async function() {
      await arbitrableBlacklist.requestBlacklisting(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      })
    })

    beforeEach('assert pre-conditions', async function() {
      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.SUBMITTED)
    })

    it('calling isPermitted should return false', async () => {
      assert.equal((await arbitrableBlacklist.isPermitted(ARBITRARY_STRING)), false)
    })

    it('calling requestBlacklisting should revert', async () => {
      await expectThrow(arbitrableBlacklist.requestBlacklisting(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }))
    })

    it('calling requestClearing should move item into the clearing requested state', async () => {
      await expectThrow(arbitrableBlacklist.requestClearing(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }))
    })

    it('calling challangeBlacklisting should create a dispute', async function() {
      let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();

      await arbitrableBlacklist.challengeBlacklisting(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      })

      let disputeID = (await arbitrableBlacklist.items(ARBITRARY_STRING))[6].toNumber();

      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[3].toString(), arbitrator)
      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber(), itemBalance + stake)
      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[5], true)
      assert.equal(web3.toUtf8(await arbitrableBlacklist.disputeIDToItem(disputeID)), ARBITRARY_STRING)
    })

    it('calling challengeClearing should revert', async () => {
      await expectThrow(arbitrableBlacklist.challengeClearing(ARBITRARY_STRING, {
        from: arbitrator,
        value: stake + arbitrationCost
      }))
    })

    it('calling executeRequest should move item into the blacklisted state', async function() {
      await arbitrableBlacklist.executeRequest(ARBITRARY_STRING, {
        from: arbitrator
      })

      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.BLACKLISTED)
    })

    describe('executeRuling', async function() {
      let disputeID

      beforeEach('create a dispute', async function() {
        await arbitrableBlacklist.challengeBlacklisting(ARBITRARY_STRING, {
          from: partyB,
          value: stake + arbitrationCost
        });

        disputeID = (await arbitrableBlacklist.items(ARBITRARY_STRING))[6].toNumber();
      })

      it('calling executeRuling with BLACKLIST should send item.balance to submitter', async function() {
        let submitter = (await arbitrableBlacklist.items(ARBITRARY_STRING))[2];
        let submitterBalance = web3.eth.getBalance(submitter).toNumber();
        let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();


        const hash = await centralizedArbitrator.giveRuling(disputeID, RULING.BLACKLIST, {from: arbitrator})
        const gasUsed = hash.receipt.gasUsed;
        const gasCost = gasUsed*Math.pow(10,11); // Test environment doesn't care what the gasPrice is, spent value is always gasUsed * 10^11

        assert.equal(web3.eth.getBalance(submitter).toNumber(), submitterBalance + itemBalance - gasCost)
        assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.BLACKLISTED)
      })

      it('calling executeRuling with CLEAR should send item.balance to challanger', async function() {
        let challenger = (await arbitrableBlacklist.items(ARBITRARY_STRING))[3];
        let challengerBalance = web3.eth.getBalance(challenger).toNumber();
        let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();

        await centralizedArbitrator.giveRuling(disputeID, RULING.CLEAR, {from: arbitrator})

        assert.equal(web3.eth.getBalance(challenger).toNumber(), challengerBalance + itemBalance)
        assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARED)
      })

      it('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the absent state', async function() {
        let submitter = (await arbitrableBlacklist.items(ARBITRARY_STRING))[2];
        let challenger = (await arbitrableBlacklist.items(ARBITRARY_STRING))[3];
        let submitterBalance = web3.eth.getBalance(submitter).toNumber();
        let challengerBalance = web3.eth.getBalance(challenger).toNumber();
        let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();
        let disputeID = (await arbitrableBlacklist.items(ARBITRARY_STRING))[6].toNumber();

        const hash = await centralizedArbitrator.giveRuling(disputeID, RULING.OTHER, {from: arbitrator})
        const gasUsed = hash.receipt.gasUsed;
        const gasCost = gasUsed*Math.pow(10,11); // Test environment doesn't care what the gasPrice is, spent value is always gasUsed * 10^11

        assert.equal(web3.eth.getBalance(submitter).toNumber() , submitterBalance + itemBalance / 2 - gasCost)
        assert.equal(web3.eth.getBalance(challenger).toNumber(), challengerBalance + itemBalance / 2)
        assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.ABSENT)
      })
    })
  })

  describe('When item in clearing requested state', function() {

    beforeEach('prepare pre-conditions', async function() {
      await arbitrableBlacklist.requestBlacklisting(ARBITRARY_STRING, {
        from: partyA,
        value: stake + arbitrationCost
      })
      await arbitrableBlacklist.executeRequest(ARBITRARY_STRING, {
        from: partyA
      })
      await arbitrableBlacklist.requestClearing(ARBITRARY_STRING, {
        from: partyB,
        value: stake + arbitrationCost
      })
    })

    beforeEach('assert pre-conditions', async function() {
      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARING_REQUESTED)
    })

    it('calling isPermitted on a not-disputed item should return true', async () => {
      assert.equal((await arbitrableBlacklist.isPermitted(ARBITRARY_STRING)), false)
    })

    it('calling requestBlacklisting should revert', async () => {
      await expectThrow(arbitrableBlacklist.requestBlacklisting(ARBITRARY_STRING, {
        from: partyA,
        value: stake + arbitrationCost
      }))
    })

    it('calling requestClearing should revert', async function() {
      await expectThrow(arbitrableBlacklist.requestClearing(ARBITRARY_STRING, {
        from: partyB,
        value: stake + arbitrationCost
      }))
    })

    it('calling challengeBlacklisting should revert', async () => {
      await expectThrow(arbitrableBlacklist.challengeBlacklisting(ARBITRARY_STRING, {
        from: partyB,
        value: stake + arbitrationCost
      }))
    })

    it('calling challangeClearing should create a dispute', async function() {
      let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();

      await arbitrableBlacklist.challengeClearing(ARBITRARY_STRING, {
        from: partyA,
        value: stake + arbitrationCost
      })
      let disputeID = (await arbitrableBlacklist.items(ARBITRARY_STRING))[6].toNumber();

      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[3].toString(), partyA)
      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber(), itemBalance + stake)
      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[5], true)
      assert.equal(web3.toUtf8(await arbitrableBlacklist.disputeIDToItem(disputeID)), ARBITRARY_STRING)
    })

    it('calling executeRequest should move item into the blacklisted state', async function() {
      await arbitrableBlacklist.executeRequest(ARBITRARY_STRING, {
        from: partyA
      })

      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARED)
    })

    describe('executeRuling', async function() {
      let disputeID

      beforeEach('create a dispute', async function() {
        await arbitrableBlacklist.challengeClearing(ARBITRARY_STRING, {
          from: partyB,
          value: stake + arbitrationCost
        });

        disputeID = (await arbitrableBlacklist.items(ARBITRARY_STRING))[6].toNumber();
      })

      it('calling executeRuling with BLACKLIST should send item.balance to challenger', async function() {
        let challenger = (await arbitrableBlacklist.items(ARBITRARY_STRING))[3];
        let challengerBalance = web3.eth.getBalance(challenger).toNumber();
        let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();

        await centralizedArbitrator.giveRuling(disputeID, RULING.BLACKLIST, {from: arbitrator})

        assert.equal(web3.eth.getBalance(challenger).toNumber(), challengerBalance + itemBalance)
        assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.BLACKLISTED)
      })

      it('calling executeRuling with CLEAR should send item.balance to submitter', async function() {
        let submitter = (await arbitrableBlacklist.items(ARBITRARY_STRING))[2];
        let submitterBalance = web3.eth.getBalance(submitter).toNumber();
        let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();

        await centralizedArbitrator.giveRuling(disputeID, RULING.CLEAR, {from: arbitrator})

        assert.equal(web3.eth.getBalance(submitter).toNumber(), submitterBalance + itemBalance)
        assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARED)
      })

      it('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the absent state', async function() {
        let submitter = (await arbitrableBlacklist.items(ARBITRARY_STRING))[2];
        let challenger = (await arbitrableBlacklist.items(ARBITRARY_STRING))[3];
        let submitterBalance = web3.eth.getBalance(submitter).toNumber();
        let challengerBalance = web3.eth.getBalance(challenger).toNumber();
        let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();
        let disputeID = (await arbitrableBlacklist.items(ARBITRARY_STRING))[6].toNumber();

        await centralizedArbitrator.giveRuling(disputeID, RULING.OTHER, {from: arbitrator})

        assert.equal(web3.eth.getBalance(submitter).toNumber(), submitterBalance + itemBalance / 2)
        assert.equal(web3.eth.getBalance(challenger).toNumber(), challengerBalance + itemBalance / 2)
        assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.ABSENT)
      })
    })
  })

  describe('When item in preventive clearing requested state', function() {

    beforeEach('prepare pre-conditions', async function() {
      await arbitrableBlacklist.requestClearing(ARBITRARY_STRING, {
        from: partyB,
        value: stake + arbitrationCost
      })
    })

    beforeEach('assert pre-conditions', async function() {
      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.PREVENTIVE_CLEARING_REQUESTED)
    })

    it('calling isPermitted on a not-disputed item should return true', async () => {
      assert.equal((await arbitrableBlacklist.isPermitted(ARBITRARY_STRING)), true)
    })

    it('calling isPermitted on a disputed item should return false', async () => { //TODO
      await arbitrableBlacklist.challengeClearing(ARBITRARY_STRING, {
        from: partyA,
        value: stake + arbitrationCost
      }) // To satisfy disputed pre-condition

      assert.equal((await arbitrableBlacklist.isPermitted(ARBITRARY_STRING)), false)
    })

    it('calling requestBlacklisting should revert', async () => {
      await expectThrow(arbitrableBlacklist.requestBlacklisting(ARBITRARY_STRING, {
        from: partyA,
        value: stake + arbitrationCost
      }))
    })

    it('calling requestClearing should revert', async function() {
      await expectThrow(arbitrableBlacklist.requestClearing(ARBITRARY_STRING, {
        from: partyB,
        value: stake + arbitrationCost
      }))
    })

    it('calling challengeBlacklisting should revert', async () => {
      await expectThrow(arbitrableBlacklist.challengeBlacklisting(ARBITRARY_STRING, {
        from: partyB,
        value: stake + arbitrationCost
      }))
    })

    it('calling challangeClearing should create a dispute', async function() {
      let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();

      await arbitrableBlacklist.challengeClearing(ARBITRARY_STRING, {
        from: partyA,
        value: stake + arbitrationCost
      })

      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[3].toString(), partyA)
      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber(), itemBalance + stake)
      let disputeID = (await arbitrableBlacklist.items(ARBITRARY_STRING))[6].toNumber();
      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[5], true)
      assert.equal(web3.toUtf8(await arbitrableBlacklist.disputeIDToItem(disputeID)), ARBITRARY_STRING)
    })

    it('calling executeRequest should move item into the blacklisted state', async function() {
      await arbitrableBlacklist.executeRequest(ARBITRARY_STRING, {
        from: arbitrator
      })

      assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARED)
    })

    describe('executeRuling', async function() {
      let disputeID

      beforeEach('create a dispute', async function() {
        await arbitrableBlacklist.challengeClearing(ARBITRARY_STRING, {
          from: partyB,
          value: stake + arbitrationCost
        });

        disputeID = (await arbitrableBlacklist.items(ARBITRARY_STRING))[6].toNumber();
      })

      it('calling executeRuling with BLACKLIST should send item.balance to challenger', async function() {
        let challenger = (await arbitrableBlacklist.items(ARBITRARY_STRING))[3];
        let challengerBalance = web3.eth.getBalance(challenger).toNumber();
        let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();

        await centralizedArbitrator.giveRuling(disputeID, RULING.BLACKLIST, {from: arbitrator})

        assert.equal(await web3.eth.getBalance(challenger).toNumber(), challengerBalance + itemBalance)
        assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.BLACKLISTED)
      })

      it('calling executeRuling with CLEAR should send item.balance to submitter', async function() {
        let submitter = (await arbitrableBlacklist.items(ARBITRARY_STRING))[2];
        let submitterBalance = web3.eth.getBalance(submitter).toNumber();
        let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();

        await centralizedArbitrator.giveRuling(disputeID, RULING.CLEAR, {from: arbitrator});

        assert.equal(web3.eth.getBalance(submitter).toNumber(), submitterBalance + itemBalance)
        assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARED)
      })

      it('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the absent state', async function() {
        let submitter = (await arbitrableBlacklist.items(ARBITRARY_STRING))[2];
        let challenger = (await arbitrableBlacklist.items(ARBITRARY_STRING))[3];
        let submitterBalance = web3.eth.getBalance(submitter).toNumber();
        let challengerBalance = web3.eth.getBalance(challenger).toNumber();
        let itemBalance = (await arbitrableBlacklist.items(ARBITRARY_STRING))[4].toNumber();
        let disputeID = (await arbitrableBlacklist.items(ARBITRARY_STRING))[6].toNumber();

        await centralizedArbitrator.giveRuling(disputeID, RULING.OTHER, {from: arbitrator})

        assert.equal(web3.eth.getBalance(submitter).toNumber(), submitterBalance + itemBalance / 2)
        assert.equal(web3.eth.getBalance(challenger).toNumber(), challengerBalance + itemBalance / 2)
        assert.equal((await arbitrableBlacklist.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.ABSENT)
      })
    })
  })
})
