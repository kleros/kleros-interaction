/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const T2CR = artifacts.require('./T2CR.sol')
const AppealableArbitrator = artifacts.require(
  './standard/arbitration/AppealableArbitrator.sol'
)
const EnhancedAppealableArbitrator = artifacts.require(
  './standard/arbitration/EnhancedAppealableArbitrator.sol'
)

contract('T2CR', function(accounts) {
  const governor = accounts[0]
  const partyA = accounts[2]
  const partyB = accounts[8]
  const arbitratorExtraData = 0x0
  const baseDeposit = 10 ** 10
  const arbitrationCost = 1000
  const sharedStakeMultiplier = 10000
  const winnerStakeMultiplier = 20000
  const loserStakeMultiplier = 2 * winnerStakeMultiplier
  const challengePeriodDuration = 5
  const registrationMetaEvidence = 'registrationMetaEvidence.json'
  const clearingMetaEvidence = 'clearingMetaEvidence.json'
  const appealPeriodDuration = 1001

  let appealableArbitrator
  let enhancedAppealableArbitrator
  let t2cr
  let tokenID

  const TOKEN_STATUS = {
    Absent: 0,
    Registered: 1,
    RegistrationRequested: 2,
    ClearingRequested: 3
  }

  const deployArbitrators = async () => {
    appealableArbitrator = await AppealableArbitrator.new(
      arbitrationCost, // _arbitrationCost
      governor, // _arbitrator
      null, // _arbitratorExtraData
      appealPeriodDuration // _appealPeriodDuration
    )
    await appealableArbitrator.changeArbitrator(appealableArbitrator.address)

    enhancedAppealableArbitrator = await EnhancedAppealableArbitrator.new(
      arbitrationCost, // _arbitrationCost
      governor, // _arbitrator
      null, // _arbitratorExtraData
      appealPeriodDuration, // _timeOut
      {
        from: governor
      }
    )

    await enhancedAppealableArbitrator.changeArbitrator(
      enhancedAppealableArbitrator.address
    )
  }

  const deployArbitrableTokenList = async arbitrator => {
    t2cr = await T2CR.new(
      arbitrator.address,
      arbitratorExtraData,
      registrationMetaEvidence,
      clearingMetaEvidence,
      governor,
      baseDeposit,
      baseDeposit,
      challengePeriodDuration,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier
    )

    MULTIPLIER_DIVISOR = await t2cr.MULTIPLIER_DIVISOR()
  }

  describe('registration request', () => {
    beforeEach(async () => {
      await deployArbitrators()
      await deployArbitrableTokenList(enhancedAppealableArbitrator)

      it('should require deposit', async () => {
        await expectThrow(
          t2cr.requestStatusChange(
            'OmiseGO',
            'OMG',
            0x0,
            'BcdwnVkEp8Nn41U2hoENwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu',
            { from: partyA }
          )
        )
      })

      const tx = await t2cr.requestStatusChange(
        'Pinakion',
        'PNK',
        0x1,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu',
        {
          from: partyA,
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )
      tokenID = tx.logs[1].args._tokenID
    })

    it('request should have been placed', async () => {
      assert.equal(
        (await web3.eth.getBalance(t2cr.address)).toNumber(),
        baseDeposit +
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000
      )

      const token = await t2cr.getItemInfo(tokenID)
      assert.equal(token[0], 'Pinakion')
      assert.equal(token[1], 'PNK')
      assert.equal(token[2], 0x1)
      assert.equal(
        token[3],
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu'
      )
      assert.equal(token[4].toNumber(), TOKEN_STATUS.RegistrationRequested)

      const request = await t2cr.getRequestInfo(tokenID, 0)
      assert.isFalse(request[0])

      const round = await t2cr.getRoundInfo(tokenID, 0, 0)
      assert.equal(round[0], false, 'Appeal attribute must be `false`')
      assert.equal(
        round[1][0].toNumber(),
        0,
        'The `Party.None` contribution must be 0.'
      )
      assert.equal(
        round[1][1].toNumber(),
        baseDeposit +
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000,
        'The `Party.Requester` contribution must be equal to the total reward.'
      )
      assert.equal(
        round[1][2].toNumber(),
        0,
        'The `Party.Challenger` contribution must be 0.'
      )
      assert.equal(round[2][1], true, 'The `Party.Requester` had to paid.')
      assert.equal(
        round[3].toNumber(),
        baseDeposit +
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000,
        'The `feeRewards` must be equal to the total reward.'
      )

      // The balance must be the same
      assert.equal(
        await web3.eth.getBalance(t2cr.address),
        baseDeposit +
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000
      )
    })

    it('should execute request and allow submitter to withdraw if no one challenges', async () => {
      await expectThrow(
        // time to challenge did not pass yet.
        t2cr.executeRequest(tokenID, { frogitm: partyA })
      )
      await increaseTime(challengePeriodDuration + 1)
      await t2cr.executeRequest(tokenID, { from: partyA })
      const request = await t2cr.getRequestInfo(tokenID, 0)
      await t2cr.withdrawFeesAndRewards(
        partyA,
        tokenID,
        0,
        request[5].toNumber() - 1
      )
    })

    it('should execute request and create a dispute', async () => {
      const tx1 = await t2cr.requestStatusChange(
        'Pinakion2',
        'PNK2',
        0x1,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu',
        {
          from: partyA, // Requester
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )
      tokenID1 = tx1.logs[1].args._tokenID

      await t2cr.challengeRequest(tokenID1, 'evidence_tokenID1', {
        from: partyB, // Challenger
        value:
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000 +
          baseDeposit
      })

      const roundTokenID1 = await t2cr.getRoundInfo(tokenID1, 0, 0)

      assert.equal(
        roundTokenID1[1][1].toNumber(),
        baseDeposit +
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000,
        'The `Party.Requester` contribution must be equal to the total cost.'
      )

      assert.equal(
        roundTokenID1[1][2].toNumber(),
        baseDeposit +
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000,
        'The `Party.Challenger` contribution must be equal to the total cost.'
      )

      assert.equal(roundTokenID1[2][0], false, 'The `Party.None` had to 0.')
      assert.equal(
        roundTokenID1[2][1],
        true,
        'The `Party.Requester` had to paid.'
      )
      assert.equal(
        roundTokenID1[2][2],
        true,
        'The `Party.Challenger` had to paid.'
      )

      const token1 = await t2cr.getItemInfo(tokenID1)

      const requestToken1 = await t2cr.getRequestInfo(tokenID1, 0)

      assert.equal(
        requestToken1[0],
        true, // The first request must disputed.
        'Must be disputed'
      )

      assert.equal(
        token1[4].toNumber(),
        TOKEN_STATUS.RegistrationRequested,
        'Must be `RegistrationRequested` as token status'
      )
    })
  })

  describe('dispute flow', () => {
    beforeEach(async () => {
      await deployArbitrators()
      await deployArbitrableTokenList(enhancedAppealableArbitrator)
    })

    it('should execute request, create a dispute and the challenger wins the dispute (absent)', async () => {
      const tx1 = await t2cr.requestStatusChange(
        'Pinakion2',
        'PNK2',
        0x1,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu',
        {
          from: partyA, // Requester
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )
      tokenID1 = tx1.logs[1].args._tokenID

      await t2cr.challengeRequest(tokenID1, 'evidence_tokenID1', {
        from: partyB, // Challenger
        value:
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000 +
          baseDeposit
      })

      const roundTokenID1 = await t2cr.getRoundInfo(tokenID1, 0, 0)

      assert.equal(
        roundTokenID1[1][1].toNumber(),
        baseDeposit +
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000,
        'The `Party.Requester` contribution must be equal to the total cost.'
      )

      assert.equal(
        roundTokenID1[1][2].toNumber(),
        baseDeposit +
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000,
        'The `Party.Challenger` contribution must be equal to the total cost.'
      )

      assert.equal(roundTokenID1[2][0], false, 'The `Party.None` had to 0.')
      assert.equal(
        roundTokenID1[2][1],
        true,
        'The `Party.Requester` had to paid.'
      )
      assert.equal(
        roundTokenID1[2][2],
        true,
        'The `Party.Challenger` had to paid.'
      )

      let token1 = await t2cr.getItemInfo(tokenID1)

      const requestToken1 = await t2cr.getRequestInfo(tokenID1, 0)

      assert.equal(
        requestToken1[0],
        true, // The first request must disputed.
        'Must be disputed'
      )

      assert.equal(
        token1[4].toNumber(),
        TOKEN_STATUS.RegistrationRequested,
        'Must be `RegistrationRequested` as token status'
      )

      assert.equal(
        await enhancedAppealableArbitrator.arbitrator(),
        enhancedAppealableArbitrator.address,
        'Must be the `enhancedAppealableArbitrator` contract address.'
      )

      assert.equal(
        token1[4].toNumber(),
        TOKEN_STATUS.RegistrationRequested,
        'Must be `RegistrationRequested` as token status'
      )

      // Give a ruling in favor the challenger
      await enhancedAppealableArbitrator.giveRuling(
        0,
        2, // Chanllenger wins the dispute
        { from: governor }
      )

      await increaseTime(appealPeriodDuration + 1)

      await enhancedAppealableArbitrator.giveRuling(
        0,
        2, // Chanllenger wins the dispute
        { from: governor }
      )

      const dispute = await enhancedAppealableArbitrator.disputes(0)

      assert.equal(dispute[0], t2cr.address, 'Must be the address of `t2cr`')

      assert.equal(
        dispute[3].toNumber(),
        2,
        'Must be challenger as winner of this dispute'
      )

      token1 = await t2cr.getItemInfo(tokenID1)

      assert.equal(
        token1[4].toNumber(),
        TOKEN_STATUS.Absent,
        'Must be `Absent` as token status'
      )
    })

    it('should execute request, create a dispute and the requester wins the dispute (registered)', async () => {
      const tx1 = await t2cr.requestStatusChange(
        'Pinakion2',
        'PNK2',
        0x1,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu',
        {
          from: partyA, // Requester
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )

      tokenID1 = tx1.logs[1].args._tokenID

      await t2cr.challengeRequest(tokenID1, 'evidence_tokenID1', {
        from: partyB, // Challenger
        value:
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000 +
          baseDeposit
      })

      // Give a ruling in favor the challenger
      await enhancedAppealableArbitrator.giveRuling(
        0,
        1, // Requester wins the dispute
        { from: governor }
      )

      await increaseTime(appealPeriodDuration + 1)

      // NOTE: note need to be call twice
      await enhancedAppealableArbitrator.giveRuling(
        0,
        1, // Requester wins the dispute
        { from: governor }
      )

      token1 = await t2cr.getItemInfo(tokenID1)

      assert.equal(
        token1[4].toNumber(),
        TOKEN_STATUS.Registered,
        'Must be `Registered` as token status'
      )
    })

    it('should execute request, raise a dispute, the requester wins the dispute (`RegistrationRequested`), do an appeal and challenger wins (`Absent`)', async () => {
      const tx1 = await t2cr.requestStatusChange(
        'Pinakion2',
        'PNK2',
        0x1,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu',
        {
          from: partyA, // Requester
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )
      tokenID1 = tx1.logs[1].args._tokenID

      await t2cr.challengeRequest(tokenID1, 'evidence_tokenID1', {
        from: partyB, // Challenger
        value:
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000 +
          baseDeposit
      })

      let token1 = await t2cr.getItemInfo(tokenID1)

      // Give a ruling in favor the requester
      await enhancedAppealableArbitrator.giveRuling(
        0,
        1, // Requester wins the dispute
        { from: governor }
      )

      token1 = await t2cr.getItemInfo(tokenID1)

      assert(
        token1[4].toNumber(),
        TOKEN_STATUS.RegistrationRequested,
        'Must be the `RegistrationRequested`'
      )

      const appealCost = (await enhancedAppealableArbitrator.appealCost(
        0,
        0x00
      )).toNumber()

      const loserRequiredStake =
        (loserStakeMultiplier * appealCost) / MULTIPLIER_DIVISOR
      let round = await t2cr.getRoundInfo(tokenID1, 0, 1)

      await t2cr.fundAppeal(
        tokenID1,
        2, // Challenger
        {
          from: partyB,
          value: appealCost + loserRequiredStake
        }
      )

      await increaseTime(appealPeriodDuration + 1)

      await enhancedAppealableArbitrator.giveRuling(
        0,
        2, // Chanllenger wins the dispute
        { from: governor }
      )

      token1 = await t2cr.getItemInfo(tokenID1)

      round = await t2cr.getRoundInfo(tokenID1, 0, 1)
      assert.isFalse(round[0])

      assert.equal(
        token1[4].toNumber(),
        TOKEN_STATUS.Absent,
        'Must be `Absent` as token status'
      )
    })

    it('should withdraw fees and the reward for the winner party (challenger)', async () => {
      const tx1 = await t2cr.requestStatusChange(
        'Pinakion2',
        'PNK2',
        0x1,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu',
        {
          from: partyA, // Requester
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )
      tokenID1 = tx1.logs[1].args._tokenID

      await t2cr.challengeRequest(tokenID1, 'evidence_tokenID1', {
        from: partyB, // Challenger
        value:
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000 +
          baseDeposit
      })

      // Give a ruling in favor the requester
      await enhancedAppealableArbitrator.giveRuling(
        0,
        1, // Requester wins the dispute
        { from: governor }
      )

      const appealCost = (await enhancedAppealableArbitrator.appealCost(
        0,
        0x00
      )).toNumber()

      const loserRequiredStake =
        (loserStakeMultiplier * appealCost) / MULTIPLIER_DIVISOR

      await t2cr.fundAppeal(
        tokenID1,
        2, // Challenger
        {
          from: partyB,
          value: appealCost + loserRequiredStake
        }
      )

      await increaseTime(appealPeriodDuration + 1)

      await enhancedAppealableArbitrator.giveRuling(
        0,
        2, // Challenger wins the dispute
        { from: governor }
      )

      const BigNumber = web3.BigNumber

      const oldChalengerBalance = new BigNumber(
        await web3.eth.getBalance(partyB)
      )

      await t2cr.withdrawFeesAndRewards(
        partyB,
        tokenID1,
        0, // request
        1 // round
      )

      const newChalengerBalance = new BigNumber(
        await web3.eth.getBalance(partyB)
      )

      assert.equal(
        oldChalengerBalance.add(5000).toNumber(),
        newChalengerBalance.toNumber(),
        'Challenger must be corectly refunded.'
      )
    })

    it('should withdraw fees and the reward for all winning parties (appeal challengers)', async () => {
      const tx1 = await t2cr.requestStatusChange(
        'Pinakion2',
        'PNK2',
        0x1,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu',
        {
          from: partyA, // Requester
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )
      tokenID1 = tx1.logs[1].args._tokenID

      await t2cr.challengeRequest(tokenID1, 'evidence_tokenID1', {
        from: partyB, // Challenger
        value:
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000 +
          baseDeposit
      })

      // Give a ruling in favor the requester
      await enhancedAppealableArbitrator.giveRuling(
        0,
        1, // Requester wins the dispute
        { from: governor }
      )

      const appealCost = (await enhancedAppealableArbitrator.appealCost(
        0,
        0x00
      )).toNumber()

      const loserRequiredStake =
        (loserStakeMultiplier * appealCost) / MULTIPLIER_DIVISOR

      assert(
        appealCost + loserRequiredStake,
        5000,
        'Must be 5000 as appeal price'
      )

      const BigNumber = web3.BigNumber

      const oldChalengerBalancePartyB = await web3.eth.getBalance(partyB)

      const fundAppealTX = await t2cr.fundAppeal(
        tokenID1,
        2, // Challenger
        {
          from: partyB,
          value: appealCost + loserRequiredStake // 5000
        }
      )

      const txGasCost = fundAppealTX.receipt.gasUsed * 100000000000 // Test environment doesn't care what the gasPrice is, spent value is always gasUsed * 10^11

      const newChalengerBalancePartyB = await web3.eth.getBalance(partyB)

      assert(
        oldChalengerBalancePartyB
          .minus(txGasCost)
          .equals(newChalengerBalancePartyB.add(5000)),
        'Challenge balance must decrease to pay the arbitration appeal cost.'
      )

      await increaseTime(appealPeriodDuration + 1)

      await enhancedAppealableArbitrator.giveRuling(
        0,
        2, // Challenger wins the dispute
        { from: governor }
      )

      const oldChalengerBalance = new BigNumber(
        await web3.eth.getBalance(partyB)
      )

      await t2cr.withdrawFeesAndRewards(
        partyB,
        tokenID1,
        0, // request
        1 // round
      )

      const newChalengerBalance = new BigNumber(
        await web3.eth.getBalance(partyB)
      )

      assert.equal(
        oldChalengerBalance.add(5000).toNumber(),
        newChalengerBalance.toNumber(),
        'Challenger must be corectly refunded.'
      )
    })

    it('should reimburse parties if the crowdfunding fails', async () => {
      const tx1 = await t2cr.requestStatusChange(
        'Pinakion22',
        'PNK22',
        0x1,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu',
        {
          from: partyA, // Requester
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )
      tokenID1 = tx1.logs[1].args._tokenID

      await t2cr.challengeRequest(tokenID1, 'evidence_tokenID1', {
        from: partyB, // Challenger
        value:
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000 +
          baseDeposit
      })

      // Give a ruling in favor the requester
      await enhancedAppealableArbitrator.giveRuling(
        0,
        1, // Requester wins the dispute
        { from: governor }
      )

      const appealCost = (await enhancedAppealableArbitrator.appealCost(
        0,
        0x00
      )).toNumber()

      const loserRequiredStake =
        (loserStakeMultiplier * appealCost) / MULTIPLIER_DIVISOR

      const { BigNumber } = web3

      await t2cr.fundAppeal(
        tokenID1,
        2, // Challenger
        {
          from: partyB,
          value: appealCost + loserRequiredStake // 5000. Loser fully funds
        }
      )

      // Winner does not fully fund
      const requesterContribution = appealCost // Missing winner stake.
      await t2cr.fundAppeal(
        tokenID1,
        1, // Requester
        {
          from: partyA,
          value: requesterContribution
        }
      )

      await increaseTime(appealPeriodDuration + 1)

      await enhancedAppealableArbitrator.giveRuling(
        0,
        2, // Challenger wins the dispute
        { from: governor }
      )

      const oldChalengerBalance = new BigNumber(
        await web3.eth.getBalance(partyB)
      )

      const oldRequesterBalance = new BigNumber(
        await web3.eth.getBalance(partyA)
      )

      await t2cr.withdrawFeesAndRewards(
        partyB,
        tokenID1,
        0, // request
        1 // round
      )

      await t2cr.withdrawFeesAndRewards(
        partyA,
        tokenID1,
        0, // request
        1 // round
      )

      const newChalengerBalance = new BigNumber(
        await web3.eth.getBalance(partyB)
      )

      const newRequesterBalance = new BigNumber(
        await web3.eth.getBalance(partyA)
      )

      assert.equal(
        oldChalengerBalance.add(5000).toNumber(),
        newChalengerBalance.toNumber(),
        'Challenger must be corectly refunded.'
      )

      assert.equal(
        oldRequesterBalance.add(requesterContribution).toNumber(),
        newRequesterBalance.toNumber(),
        'Requester must be corectly refunded.'
      )
    })
  })

  describe('multiple registration requests', () => {
    beforeEach(async () => {
      await deployArbitrators()
      await deployArbitrableTokenList(enhancedAppealableArbitrator)

      const tx0 = await t2cr.requestStatusChange(
        'OmiseGO',
        'OMG',
        0x0,
        'BcdwnVkEp8Nn41U2hoENwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu',
        {
          from: partyA,
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )
      const tx1 = await t2cr.requestStatusChange(
        'OmiseGO_1',
        'OMG_1',
        0x0,
        'BcdwnVkEp8Nn41U2hoENwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu',
        {
          from: partyA,
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )
      const tx2 = await t2cr.requestStatusChange(
        'OmiseGO_2',
        'OMG_2',
        0x0,
        'BcdwnVkEp8Nn41U2hoENwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu',
        {
          from: partyA,
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )

      tokenID = await t2cr.getItemInfo(tx0.logs[1].args._tokenID)
      tokenID1 = await t2cr.getItemInfo(tx1.logs[1].args._tokenID)
      tokenID2 = await t2cr.getItemInfo(tx2.logs[1].args._tokenID)
    })

    it('should save all the requests', async () => {
      assert.equal(tokenID[0], 'OmiseGO')
      assert.equal(tokenID[1], 'OMG')
      assert.equal(tokenID[2], 0x0)
      assert.equal(
        tokenID[3],
        'BcdwnVkEp8Nn41U2hoENwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu'
      )
      assert.equal(tokenID[4].toNumber(), TOKEN_STATUS.RegistrationRequested)

      assert.equal(tokenID1[4].toNumber(), TOKEN_STATUS.RegistrationRequested)
      assert.equal(tokenID2[4].toNumber(), TOKEN_STATUS.RegistrationRequested)

      assert.equal(
        await web3.eth.getBalance(t2cr.address),
        (baseDeposit +
          arbitrationCost +
          (sharedStakeMultiplier * arbitrationCost) / 10000) *
          3
      )
    })
  })

  describe('governance', () => {
    beforeEach(async () => {
      await deployArbitrators()
      await deployArbitrableTokenList(appealableArbitrator)
    })

    describe('caller is governor', () => {
      beforeEach(async () => {
        assert.notEqual(
          partyB,
          governor,
          'partyB and governor should be different for this test'
        )
      })

      it('should update governor', async () => {
        const governorBefore = await t2cr.governor()
        await t2cr.changeGovernor(partyB, { from: governor })

        const governorAfter = await t2cr.governor()
        assert.notEqual(
          governorAfter,
          governorBefore,
          'governor should have changed'
        )
        assert.equal(governorAfter, partyB, 'governor should be partyB')
      })

      it('should update challengePeriodDuration', async () => {
        const challengePeriodDurationBefore = await t2cr.challengePeriodDuration()
        const newTimeToChallenge =
          challengePeriodDurationBefore.toNumber() + 1000

        await t2cr.changeTimeToChallenge(newTimeToChallenge, {
          from: governor
        })

        const challengePeriodDurationAfter = await t2cr.challengePeriodDuration()
        assert.notEqual(
          challengePeriodDurationAfter.toNumber(),
          challengePeriodDurationBefore.toNumber(),
          'challengePeriodDuration should have changed'
        )
        assert.equal(
          challengePeriodDurationAfter.toNumber(),
          newTimeToChallenge,
          'challengePeriodDuration should have changed'
        )
      })
    })

    describe('caller is not governor', () => {
      beforeEach(async () => {
        assert.notEqual(
          partyA,
          governor,
          'partyA and governor should be different for this test'
        )
      })

      it('should not update governor', async () => {
        const governorBefore = await t2cr.governor()
        await expectThrow(
          t2cr.changeGovernor(partyB, {
            from: partyB
          })
        )

        const governorAfter = await t2cr.governor()
        assert.equal(
          governorAfter,
          governorBefore,
          'governor should not have changed'
        )
        assert.notEqual(governorAfter, partyB, 'governor should not be partyB')
      })

      it('should not update challengePeriodDuration', async () => {
        const challengePeriodDurationBefore = await t2cr.challengePeriodDuration()
        const newTimeToChallenge =
          challengePeriodDurationBefore.toNumber() + 1000

        await expectThrow(
          t2cr.changeTimeToChallenge(newTimeToChallenge, {
            from: partyA
          })
        )

        const challengePeriodDurationAfter = await t2cr.challengePeriodDuration()
        assert.equal(
          challengePeriodDurationAfter.toNumber(),
          challengePeriodDurationBefore.toNumber(),
          'challengePeriodDuration should not have changed'
        )
        assert.notEqual(
          challengePeriodDurationAfter.toNumber(),
          newTimeToChallenge,
          'challengePeriodDuration should not have changed'
        )
      })
    })
  })

  describe('query items', () => {
    let mkrSubmissions
    let tokenIDs
    beforeEach(async () => {
      await deployArbitrators()
      await deployArbitrableTokenList(enhancedAppealableArbitrator)
      mkrSubmissions = []
      tokenIDs = []

      let tx = await t2cr.requestStatusChange(
        'MakerDAO',
        'MKR',
        0x2,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauThawDkME1nFNQbCu',
        {
          from: partyA,
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )
      mkrSubmissions.push(tx.logs[1].args._tokenID)
      tokenIDs.push(tx.logs[1].args._tokenID)

      tx = await t2cr.requestStatusChange(
        'MakerDAO',
        'MKR',
        0x2,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauZhawDkME1nFNQbCu',
        {
          from: partyA,
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )
      mkrSubmissions.push(tx.logs[1].args._tokenID)
      tokenIDs.push(tx.logs[1].args._tokenID)

      tx = await t2cr.requestStatusChange(
        'MakerDAO',
        'MKR',
        0x2,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauQhawDkME1nFNQbCu',
        {
          from: partyA,
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )
      mkrSubmissions.push(tx.logs[1].args._tokenID)
      tokenIDs.push(tx.logs[1].args._tokenID)
      await increaseTime(challengePeriodDuration + 1)
      for (const ID of mkrSubmissions)
        await t2cr.executeRequest(ID, { from: partyA })

      tx = await t2cr.requestStatusChange(
        'OmiseGO',
        'OMG',
        0x3,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauQhawDkME1nFNQbCu',
        {
          from: partyA,
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )
      tokenIDs.push(tx.logs[1].args._tokenID)
      await increaseTime(challengePeriodDuration + 1)
      await t2cr.executeRequest(tx.logs[1].args._tokenID, {
        from: partyA
      })

      tx = await t2cr.requestStatusChange(
        'Binance',
        'BNB',
        0x4,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauQhawDkME1nFNQbCu',
        {
          from: partyA,
          value:
            baseDeposit +
            arbitrationCost +
            (sharedStakeMultiplier * arbitrationCost) / 10000
        }
      )
      tokenIDs.push(tx.logs[1].args._tokenID)

      await increaseTime(challengePeriodDuration + 1)
      await t2cr.executeRequest(tx.logs[1].args._tokenID, {
        from: partyA
      })
    })

    it('should return token submissions for address', async () => {
      const data = await t2cr.queryItems(
        0x0,
        3,
        [true, true, true, true, true, true, true, true, false],
        true,
        0x2
      )
      for (let i = 0; i < mkrSubmissions.length; i++)
        assert.equal(mkrSubmissions[i], data[0][i])
    })

    it('should return all tokens', async () => {
      const data = await t2cr.queryItems(
        0x0,
        5,
        [true, true, true, true, true, true, true, true, false],
        true,
        0x0
      )
      for (let i = 0; i < tokenIDs.length; i++)
        assert.equal(tokenIDs[i], data[0][i])
    })
  })
})
