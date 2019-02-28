/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')
const {
  increaseTime
} = require('openzeppelin-solidity/test/helpers/increaseTime')

const ArbitrableTokenList = artifacts.require('./ArbitrableTokenList.sol')
const AppealableArbitrator = artifacts.require(
  './standard/arbitration/AppealableArbitrator.sol'
)
const EnhancedAppealableArbitrator = artifacts.require(
  './standard/arbitration/EnhancedAppealableArbitrator.sol'
)

contract('ArbitrableTokenList', function(accounts) {
  const governor = accounts[0]
  const partyA = accounts[2]
  const partyB = accounts[8]
  const arbitratorExtraData = 0x08575
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
  let arbitrableTokenList
  let MULTIPLIER_DIVISOR
  let tokenID

  const TOKEN_STATUS = {
    Absent: 0,
    Registered: 1,
    RegistrationRequested: 2,
    ClearingRequested: 3
  }

  const DISPUTE_STATUS = {
    Waiting: 0,
    Appealable: 1,
    Solved: 2
  }

  const RULING_OPTIONS = { Other: 0, Accept: 1, Refuse: 2 }
  const PARTY = { None: 0, Requester: 1, Challenger: 2 }

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
      appealPeriodDuration // _timeOut
    )
    await enhancedAppealableArbitrator.changeArbitrator(
      enhancedAppealableArbitrator.address
    )
  }

  const deployArbitrableTokenList = async arbitrator => {
    arbitrableTokenList = await ArbitrableTokenList.new(
      arbitrator.address, // arbitrator
      arbitratorExtraData,
      registrationMetaEvidence,
      clearingMetaEvidence,
      governor, // governor
      baseDeposit,
      baseDeposit,
      challengePeriodDuration,
      sharedStakeMultiplier,
      winnerStakeMultiplier,
      loserStakeMultiplier
    )

    MULTIPLIER_DIVISOR = await arbitrableTokenList.MULTIPLIER_DIVISOR()
  }

  describe('registration request', () => {
    beforeEach(async () => {
      await deployArbitrators()
      await deployArbitrableTokenList(enhancedAppealableArbitrator)

      it('should require deposit', async () => {
        await expectThrow(
          arbitrableTokenList.requestStatusChange(
            'OmiseGO',
            'OMG',
            0x0,
            'BcdwnVkEp8Nn41U2hoENwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu',
            { from: partyA }
          )
        )
      })

      const tx = await arbitrableTokenList.requestStatusChange(
        'Pinakion',
        'PNK',
        0x1,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu',
        { from: partyA, value: baseDeposit + arbitrationCost + (sharedStakeMultiplier * arbitrationCost)/10000 }
      )
      tokenID = tx.logs[1].args._tokenID
    })

    it('request should have been placed', async () => {
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        baseDeposit + arbitrationCost + (sharedStakeMultiplier * arbitrationCost)/10000
      )

      const token = await arbitrableTokenList.getTokenInfo(tokenID)
      assert.equal(token[0], 'Pinakion')
      assert.equal(token[1], 'PNK')
      assert.equal(token[2], 0x1)
      assert.equal(
        token[3],
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauPhawDkME1nFNQbCu'
      )
      assert.equal(token[4].toNumber(), TOKEN_STATUS.RegistrationRequested)

      const request = await arbitrableTokenList.getRequestInfo(tokenID, 0)
      const round = await arbitrableTokenList.getRoundInfo(tokenID, 0, 0)
      assert.isFalse(request[0])
      assert.equal(
        await web3.eth.getBalance(arbitrableTokenList.address),
        baseDeposit + arbitrationCost + (sharedStakeMultiplier * arbitrationCost)/10000
      )
    })

    it('should execute request and allow submitter to withdraw if no one challenges', async () => {
      await expectThrow(
        // time to challenge did not pass yet.
        arbitrableTokenList.executeRequest(tokenID, { frogitm: partyA })
      )
      await increaseTime(challengePeriodDuration + 1)
      await arbitrableTokenList.executeRequest(tokenID, { from: partyA })
      const request = await arbitrableTokenList.getRequestInfo(tokenID, 0)
      await arbitrableTokenList.withdrawFeesAndRewards(
        partyA,
        tokenID,
        0,
        request[5].toNumber() - 1
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
        const governorBefore = await arbitrableTokenList.governor()
        await arbitrableTokenList.changeGovernor(partyB, { from: governor })

        const governorAfter = await arbitrableTokenList.governor()
        assert.notEqual(
          governorAfter,
          governorBefore,
          'governor should have changed'
        )
        assert.equal(governorAfter, partyB, 'governor should be partyB')
      })

      it('should update challengePeriodDuration', async () => {
        const challengePeriodDurationBefore = await arbitrableTokenList.challengePeriodDuration()
        const newTimeToChallenge =
          challengePeriodDurationBefore.toNumber() + 1000

        await arbitrableTokenList.changeTimeToChallenge(newTimeToChallenge, {
          from: governor
        })

        const challengePeriodDurationAfter = await arbitrableTokenList.challengePeriodDuration()
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
        const governorBefore = await arbitrableTokenList.governor()
        await expectThrow(
          arbitrableTokenList.changeGovernor(partyB, {
            from: partyB
          })
        )

        const governorAfter = await arbitrableTokenList.governor()
        assert.equal(
          governorAfter,
          governorBefore,
          'governor should not have changed'
        )
        assert.notEqual(governorAfter, partyB, 'governor should not be partyB')
      })

      it('should not update challengePeriodDuration', async () => {
        const challengePeriodDurationBefore = await arbitrableTokenList.challengePeriodDuration()
        const newTimeToChallenge =
          challengePeriodDurationBefore.toNumber() + 1000

        await expectThrow(
          arbitrableTokenList.changeTimeToChallenge(newTimeToChallenge, {
            from: partyA
          })
        )

        const challengePeriodDurationAfter = await arbitrableTokenList.challengePeriodDuration()
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

      let tx = await arbitrableTokenList.requestStatusChange(
        'MakerDAO',
        'MKR',
        0x2,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauThawDkME1nFNQbCu',
        { from: partyA, value: baseDeposit + arbitrationCost + (sharedStakeMultiplier * arbitrationCost)/10000}
      )
      mkrSubmissions.push(tx.logs[1].args._tokenID)
      tokenIDs.push(tx.logs[1].args._tokenID)

      tx = await arbitrableTokenList.requestStatusChange(
        'MakerDAO',
        'MKR',
        0x2,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauZhawDkME1nFNQbCu',
        { from: partyA, value: baseDeposit + arbitrationCost + (sharedStakeMultiplier * arbitrationCost)/10000 }
      )
      mkrSubmissions.push(tx.logs[1].args._tokenID)
      tokenIDs.push(tx.logs[1].args._tokenID)

      tx = await arbitrableTokenList.requestStatusChange(
        'MakerDAO',
        'MKR',
        0x2,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauQhawDkME1nFNQbCu',
        { from: partyA, value: baseDeposit + arbitrationCost + (sharedStakeMultiplier * arbitrationCost)/10000 }
      )
      mkrSubmissions.push(tx.logs[1].args._tokenID)
      tokenIDs.push(tx.logs[1].args._tokenID)
      await increaseTime(challengePeriodDuration + 1)
      for (const ID of mkrSubmissions)
        await arbitrableTokenList.executeRequest(ID, { from: partyA })

      tx = await arbitrableTokenList.requestStatusChange(
        'OmiseGO',
        'OMG',
        0x3,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauQhawDkME1nFNQbCu',
        { from: partyA, value: baseDeposit + arbitrationCost + (sharedStakeMultiplier * arbitrationCost)/10000 }
      )
      tokenIDs.push(tx.logs[1].args._tokenID)
      await increaseTime(challengePeriodDuration + 1)
      await arbitrableTokenList.executeRequest(tx.logs[1].args._tokenID, {
        from: partyA
      })

      tx = await arbitrableTokenList.requestStatusChange(
        'Binance',
        'BNB',
        0x4,
        'BcdwnVkEp8Nn41U2homNwyiVWYmPsXxEdxCUBn9V8y5AvqQaDwadDkQmwEWoyWgZxYnKsFPNauQhawDkME1nFNQbCu',
        { from: partyA, value: baseDeposit + arbitrationCost + (sharedStakeMultiplier * arbitrationCost)/10000 }
      )
      tokenIDs.push(tx.logs[1].args._tokenID)
      
      await increaseTime(challengePeriodDuration + 1)
      await arbitrableTokenList.executeRequest(tx.logs[1].args._tokenID, {
        from: partyA
      })

    })

    it('should return token submissions for address', async () => {
      const data = await arbitrableTokenList.queryTokens(
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
      const data = await arbitrableTokenList.queryTokens(
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
