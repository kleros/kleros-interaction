/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

const BigNumber = web3.BigNumber;
const {
  expectThrow
} = require('../helpers/utils');
const ArbitrablePermissionList = artifacts.require('./ArbitrablePermissionList.sol');
const CentralizedArbitrator = artifacts.require('./CentralizedArbitrator.sol');


contract('ArbitrablePermissionList', function(accounts) {

  const arbitrator = accounts[1];
  const partyA = accounts[2];
  const partyB = accounts[3];
  const arbitratorExtraData = 0x08575;
  const arbitrationFee = 4;
  const stake = 10;
  const timeToChallenge = 0;
  const metaEvidence = "evidence";

  let centralizedArbitrator;
  let arbitrablePermissionList;
  let arbitrationCost;

  const ITEM_STATUS = {
    ABSENT: 0,
    CLEARED: 1,
    RESUBMITTED: 2,
    REGISTERED: 3,
    SUBMITTED: 4,
    CLEARING_REQUESTED: 5,
    PREVENTIVE_CLEARING_REQUESTED: 6
  };

  const RULING = {
    OTHER: 0,
    REGISTER: 1,
    CLEAR: 2
  };

  const ARBITRARY_NUMBER = 123;
  const ARBITRARY_STRING = "abc";

  describe('queryItems', function() {
    before('setup contract for each test', async () => {
      centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {
        from: arbitrator
      });

      blacklist = true;
      appendOnly = false;
      rechallengePossible = false;

      arbitrablePermissionList = await ArbitrablePermissionList.new(
        centralizedArbitrator.address,
        arbitratorExtraData,
        metaEvidence,
        blacklist,
        appendOnly,
        rechallengePossible,
        stake,
        timeToChallenge, {
          from: arbitrator
        }
      );

      arbitrationCost = (await centralizedArbitrator.arbitrationCost.call("as", {
        from: arbitrator
      })).toNumber();
    });

    before('populate the list', async function() {
      await arbitrablePermissionList.requestRegistration(ARBITRARY_STRING, {
        from: partyA,
        value: stake + arbitrationCost
      })
    })

    it('should succesfully retrieve mySubmissions', async function() {
      const cursor = 0;
      const count = 1;

      const pending = false;
      const challenged = false;
      const accepted = false;
      const rejected = false;
      const mySubmissions = true;
      const myChallenges = false;

      const filter = [pending, challenged, accepted, rejected, mySubmissions, myChallenges];
      const sort = true;

      const item = (await arbitrablePermissionList.queryItems(cursor, count, filter, sort, {
        from: partyA
      }))[0];

      assert.equal(web3.toUtf8(item[0]), ARBITRARY_STRING);
    })

    it('should succesfully retrieve pending', async function() {
      const cursor = 0;
      const count = 1;

      const pending = true;
      const challenged = false;
      const accepted = false;
      const rejected = false;
      const mySubmissions = false;
      const myChallenges = false;

      const filter = [pending, challenged, accepted, rejected, mySubmissions, myChallenges];
      const sort = true;

      const item = (await arbitrablePermissionList.queryItems(cursor, count, filter, sort, {
        from: partyA
      }))[0];

      assert.equal(web3.toUtf8(item[0]), ARBITRARY_STRING);
    })

    it('should revert when not cursor < itemsList.length', async function() {

      const cursor = 1;
      const count = 1;

      const pending = true;
      const challenged = false;
      const accepted = false;
      const rejected = false;
      const mySubmissions = false;
      const myChallenges = false;

      const filter = [pending, challenged, accepted, rejected, mySubmissions, myChallenges];
      const sort = true;

      await expectThrow(arbitrablePermissionList.queryItems(cursor, count, filter, sort, {
        from: partyA
      }));

    })

  })

  for (const appendOnly of [true, false]) {
    for (const blacklist of [true, false]) {
      for (const rechallengePossible of [true, false]) {
        describe('When appendOnly=' + appendOnly + ', blacklist=' + blacklist + ', rechallengePossible=' + rechallengePossible, function() {

          beforeEach('setup contract for each test', async () => {
            centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {
              from: arbitrator
            });

            arbitrablePermissionList = await ArbitrablePermissionList.new(
              centralizedArbitrator.address,
              arbitratorExtraData,
              metaEvidence,
              blacklist,
              appendOnly,
              rechallengePossible,
              stake,
              timeToChallenge, {
                from: arbitrator
              }
            );

            arbitrationCost = (await centralizedArbitrator.arbitrationCost.call("as", {
              from: arbitrator
            })).toNumber();
          });

          it('should be constructed correctly', async () => {
            assert.equal(await arbitrablePermissionList.arbitrator(), centralizedArbitrator.address);
            assert.equal(await arbitrablePermissionList.arbitratorExtraData(), arbitratorExtraData)
            assert.equal(await arbitrablePermissionList.blacklist(), blacklist)
            assert.equal(await arbitrablePermissionList.appendOnly(), appendOnly)
            assert.equal(await arbitrablePermissionList.rechallengePossible(), rechallengePossible)
            assert.equal(await arbitrablePermissionList.stake(), stake);
            assert.equal(await arbitrablePermissionList.timeToChallenge(), timeToChallenge);
          });

          describe('msg.value restrictions', function() {
            describe('Should revert when msg.value < stake+arbitratorCost', function() {

              it('requestRegistration', async () => {
                await expectThrow(arbitrablePermissionList.requestRegistration(
                  ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost - 1
                  }))
              });

              it('requestClearing', async () => {
                await expectThrow(arbitrablePermissionList.requestClearing(
                  ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost - 1
                  }))
              });

              it('challengeRegistration', async () => {
                await expectThrow(arbitrablePermissionList.challengeRegistration(
                  ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost - 1
                  }))
              });

              it('challengeClearing', async () => {
                await expectThrow(arbitrablePermissionList.challengeRegistration(
                  ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost - 1
                  }))
              })
            })
          });

          describe('When item.disputed', function() {

            beforeEach('prepare pre-conditions to satisfy other requirements', async function() {
              await arbitrablePermissionList.requestRegistration(ARBITRARY_STRING, {
                from: arbitrator,
                value: stake + arbitrationCost
              }); // To satisfy `require(item.status==ItemStatus.Resubmitted || item.status==ItemStatus.Submitted)`

              await arbitrablePermissionList.challengeRegistration(ARBITRARY_STRING, {
                from: arbitrator,
                value: stake + arbitrationCost
              }) // To dissatisfy `require(!item.disputed)`
            });

            beforeEach('assert pre-conditions', async function() {
              assert.ok((await arbitrablePermissionList.items(ARBITRARY_STRING))[0] == ITEM_STATUS.SUBMITTED || (await arbitrablePermissionList.items(ARBITRARY_STRING))[0] == ITEM_STATUS.RESUBMITTED);

              assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[5], true)
            });
            it('challengeRegistration', async () => {
              await expectThrow(arbitrablePermissionList.challengeRegistration(
                ARBITRARY_STRING, {
                  from: arbitrator,
                  value: stake + arbitrationCost
                }))
            });

            it('challengeClearing', async () => {
              await expectThrow(arbitrablePermissionList.challengeClearing(
                ARBITRARY_STRING, {
                  from: arbitrator,
                  value: stake + arbitrationCost
                }))
            })
          });

          describe('When !(item.status==ItemStatus.ClearingRequested || item.status==ItemStatus.PreventiveClearingRequested))', function() {

            beforeEach('assert pre-conditions', async function() {
              assert.ok((await arbitrablePermissionList.items(ARBITRARY_STRING))[0] < ITEM_STATUS.CLEARING_REQUESTED)
            });

            it('challengeRegistration', async function() {
              await expectThrow(arbitrablePermissionList.challengeRegistration(
                ARBITRARY_STRING, {
                  from: arbitrator,
                  value: stake + arbitrationCost
                }))
            });

            it('challengeClearing', async function() {
              await expectThrow(arbitrablePermissionList.challengeClearing(
                ARBITRARY_STRING, {
                  from: arbitrator,
                  value: stake + arbitrationCost
                }))
            })
          });

          if (!rechallengePossible) {


            describe('When item in absent state', function() {

              beforeEach('assert pre-conditions', async function() {
                assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0], ITEM_STATUS.ABSENT)

              });

              it('calling isPermitted should return ' + (blacklist), async () => {
                assert.equal((await arbitrablePermissionList.isPermitted(ARBITRARY_STRING)), blacklist)
              });

              it('calling requestRegistration should move item into the submitted state', async () => {
                await arbitrablePermissionList.requestRegistration(ARBITRARY_STRING, {
                  from: arbitrator,
                  value: stake + arbitrationCost
                });

                assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0], ITEM_STATUS.SUBMITTED);
              });

              if (!appendOnly) {
                it('calling requestClearing should move item into the preventive clearing requested state', async () => {
                  await arbitrablePermissionList.requestClearing(ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost
                  });

                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.PREVENTIVE_CLEARING_REQUESTED)
                })
              } else {
                it('calling requestClearing should revert', async () => {
                  await expectThrow(arbitrablePermissionList.requestClearing(ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost
                  }))
                })
              }


              it('calling challangeBlacklisting should revert', async () => {
                await expectThrow(arbitrablePermissionList.challengeRegistration(ARBITRARY_STRING, {
                  from: arbitrator,
                  value: stake + arbitrationCost
                }))
              });

              it('calling challangeClearing should revert', async () => {
                await expectThrow(arbitrablePermissionList.challengeClearing(ARBITRARY_STRING, {
                  from: arbitrator,
                  value: stake + arbitrationCost
                }))
              });

              it('calling executeRequest should revert', async () => {
                await expectThrow(arbitrablePermissionList.executeRequest(ARBITRARY_STRING, {
                  from: arbitrator
                }))
              })
            });

            if (!appendOnly) {
              describe('When item in cleared state', function() {

                beforeEach('prepare pre-conditions', async function() {
                  await arbitrablePermissionList.requestRegistration(ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost
                  });
                  await arbitrablePermissionList.executeRequest(ARBITRARY_STRING, {
                    from: arbitrator
                  });
                  await arbitrablePermissionList.requestClearing(ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost
                  });
                  await arbitrablePermissionList.executeRequest(ARBITRARY_STRING, {
                    from: arbitrator
                  })
                });

                beforeEach('assert pre-conditions', async function() {
                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0], ITEM_STATUS.CLEARED)
                });

                it('calling isPermitted should return ' + (blacklist), async () => {
                  assert.equal((await arbitrablePermissionList.isPermitted(ARBITRARY_STRING)), blacklist)
                });

                it('calling requestRegistration should move item into the resubmitted state', async () => {
                  await arbitrablePermissionList.requestRegistration(ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost
                  });

                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.RESUBMITTED)
                });

                it('calling requestClearing should revert', async () => {
                  await expectThrow(arbitrablePermissionList.requestClearing(ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost
                  }))
                });

                it('calling challangeBlacklisting should revert', async () => {
                  await expectThrow(arbitrablePermissionList.challengeRegistration(ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost
                  }))
                });

                it('calling challangeClearing should revert', async () => {
                  await expectThrow(arbitrablePermissionList.challengeClearing(ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost
                  }))
                });

                it('calling executeRequest should revert', async () => {
                  await expectThrow(arbitrablePermissionList.executeRequest(ARBITRARY_STRING, {
                    from: arbitrator
                  }))
                })
              });
            }


            if (!appendOnly) {
              describe('When item in resubmitted state', function() {

                beforeEach('prepare pre-conditions', async function() {
                  await arbitrablePermissionList.requestRegistration(ARBITRARY_STRING, {
                    from: partyA,
                    value: stake + arbitrationCost
                  });
                  await arbitrablePermissionList.executeRequest(ARBITRARY_STRING, {
                    from: partyA
                  });
                  await arbitrablePermissionList.requestClearing(ARBITRARY_STRING, {
                    from: partyB,
                    value: stake + arbitrationCost
                  });
                  await arbitrablePermissionList.executeRequest(ARBITRARY_STRING, {
                    from: partyB
                  });
                  await arbitrablePermissionList.requestRegistration(ARBITRARY_STRING, {
                    from: partyA,
                    value: stake + arbitrationCost
                  })
                });

                beforeEach('assert pre-conditions', async function() {
                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.RESUBMITTED)

                });

                it('calling isPermitted should return true ' + (blacklist), async () => {
                  assert.equal((await arbitrablePermissionList.isPermitted(ARBITRARY_STRING)), blacklist)
                });

                it('calling requestRegistration should revert', async () => {
                  await expectThrow(arbitrablePermissionList.requestRegistration(ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost
                  }))
                });

                it('calling requestClearing should revert', async function() {
                  await expectThrow(arbitrablePermissionList.requestClearing(ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost
                  }))
                });

                it('calling challengeBlacklisting should create a dispute', async function() {
                  let itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4].toNumber();

                  await arbitrablePermissionList.challengeRegistration(ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost
                  });

                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[3].toString(), arbitrator);
                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[4].toNumber(), itemBalance + stake);
                  let disputeID = (await arbitrablePermissionList.items(ARBITRARY_STRING))[6].toNumber();
                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[5], true);
                  assert.equal(web3.toUtf8(await arbitrablePermissionList.disputeIDToItem(disputeID)), ARBITRARY_STRING)
                });

                it('calling challengeClearing should revert', async () => {
                  await expectThrow(arbitrablePermissionList.challengeClearing(ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost
                  }))
                });

                it('calling executeRequest should move item into the blacklisted state', async function() {
                  await arbitrablePermissionList.executeRequest(ARBITRARY_STRING, {
                    from: arbitrator
                  });

                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.REGISTERED)
                });

                describe('executeRuling', async function() {
                  let disputeID;

                  beforeEach('create a dispute', async function() {
                    await arbitrablePermissionList.challengeRegistration(ARBITRARY_STRING, {
                      from: partyB,
                      value: stake + arbitrationCost
                    });

                    disputeID = (await arbitrablePermissionList.items(ARBITRARY_STRING))[6].toNumber();
                  });

                  it('calling executeRuling with REGISTER should send item.balance to submitter', async function() {
                    const submitter = (await arbitrablePermissionList.items(ARBITRARY_STRING))[2];
                    const submitterBalance = web3.eth.getBalance(submitter);
                    const itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4];

                    const hash = await centralizedArbitrator.giveRuling(disputeID, RULING.REGISTER, {
                      from: arbitrator
                    });


                    const actualBalanceOfSubmitter = web3.eth.getBalance(submitter);
                    const expectedBalanceOfSubmitter = submitterBalance.plus(itemBalance).minus(new BigNumber(stake).mul(4)).minus(new BigNumber(arbitrationFee).mul(3));

                    assert(actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter), "Difference: " + (actualBalanceOfSubmitter.minus(expectedBalanceOfSubmitter)).toNumber());
                    assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.REGISTERED)
                  });

                  it('calling executeRuling with CLEAR should send item.balance to challenger', async function() {
                    const challenger = (await arbitrablePermissionList.items(ARBITRARY_STRING))[3];
                    const challengerBalance = web3.eth.getBalance(challenger);
                    const itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4];

                    await centralizedArbitrator.giveRuling(disputeID, RULING.CLEAR, {
                      from: arbitrator
                    });

                    const actualBalanceOfChallenger = web3.eth.getBalance(challenger);
                    const expectedBalanceOfChallenger = itemBalance.plus(challengerBalance).minus(new BigNumber(stake).mul(4)).minus(new BigNumber(arbitrationFee).mul(3));

                    assert(actualBalanceOfChallenger.equals(expectedBalanceOfChallenger), "Difference: " + (actualBalanceOfChallenger.minus(expectedBalanceOfChallenger)).toNumber());

                    assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARED)
                  });

                  it('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the cleared state', async function() {

                    const submitter = (await arbitrablePermissionList.items(ARBITRARY_STRING))[2];
                    const challenger = (await arbitrablePermissionList.items(ARBITRARY_STRING))[3];
                    const submitterBalance = web3.eth.getBalance(submitter);
                    const challengerBalance = web3.eth.getBalance(challenger);
                    const itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4];

                    await centralizedArbitrator.giveRuling(disputeID, RULING.OTHER, {
                      from: arbitrator
                    });

                    const actualBalanceOfSubmitter = web3.eth.getBalance(submitter);
                    const actualBalanceOfChallenger = web3.eth.getBalance(challenger);
                    const expectedBalanceOfSubmitter = itemBalance.dividedBy(new BigNumber(2)).plus(submitterBalance);
                    const expectedBalanceOfChallenger = itemBalance.dividedBy(new BigNumber(2)).plus(challengerBalance).minus(new BigNumber(stake).mul(2)).minus(new BigNumber(arbitrationFee).mul(3).dividedBy(2));

                    assert(actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter), "Actual: " + actualBalanceOfSubmitter + "\t0Expected: " + expectedBalanceOfSubmitter)
                    assert(actualBalanceOfChallenger.equals(expectedBalanceOfChallenger), "1Differece: " + actualBalanceOfChallenger.minus(expectedBalanceOfChallenger))

                    assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARED)

                  })
                })
              });
            }

            describe('When item in registered state', function() {

              beforeEach('prepare pre-conditions', async function() {
                await arbitrablePermissionList.requestRegistration(ARBITRARY_STRING, {
                  from: arbitrator,
                  value: stake + arbitrationCost
                });
                await arbitrablePermissionList.executeRequest(ARBITRARY_STRING, {
                  from: arbitrator
                })
              });

              beforeEach('assert pre-conditions', async function() {
                assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0], ITEM_STATUS.REGISTERED)
              });

              it('calling isPermitted should return ' + (!blacklist), async () => {
                assert.equal((await arbitrablePermissionList.isPermitted(ARBITRARY_STRING)), !blacklist)
              });

              it('calling requestRegistration should revert', async () => {
                await expectThrow(arbitrablePermissionList.requestRegistration(ARBITRARY_STRING, {
                  from: arbitrator,
                  value: stake + arbitrationCost
                }))
              });

              if (!appendOnly) {
                it('calling requestClearing should move item into the clearing requested state', async () => {
                  await arbitrablePermissionList.requestClearing(ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost
                  });

                  assert.equal(
                    (await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(),
                    ITEM_STATUS.CLEARING_REQUESTED)
                })
              } else {
                it('calling requestClearing should revert', async () => {
                  await expectThrow(arbitrablePermissionList.requestClearing(ARBITRARY_STRING, {
                    from: arbitrator,
                    value: stake + arbitrationCost
                  }))
                })
              }

              it('calling challengeRegistration should revert', async () => {
                await expectThrow(arbitrablePermissionList.challengeRegistration(ARBITRARY_STRING, {
                  from: arbitrator,
                  value: stake + arbitrationCost
                }))
              });

              it('calling challengeClearing should revert', async () => {
                await expectThrow(arbitrablePermissionList.challengeClearing(ARBITRARY_STRING, {
                  from: arbitrator,
                  value: stake + arbitrationCost
                }))
              });

              it('calling executeRequest should revert', async function() {
                await expectThrow(arbitrablePermissionList.executeRequest(ARBITRARY_STRING, {
                  from: arbitrator
                }))
              })
            });
          }

          describe('When item in submitted state', function() {

            beforeEach('prepare pre-conditions', async function() {
              await arbitrablePermissionList.requestRegistration(ARBITRARY_STRING, {
                from: arbitrator,
                value: stake + arbitrationCost
              })
            });

            beforeEach('assert pre-conditions', async function() {
              assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.SUBMITTED)
            });

            it('calling isPermitted should return ' + (!blacklist), async () => {
              assert.equal((await arbitrablePermissionList.isPermitted(ARBITRARY_STRING)), !blacklist)
            });

            it('calling requestRegistration should revert', async () => {
              await expectThrow(arbitrablePermissionList.requestRegistration(ARBITRARY_STRING, {
                from: arbitrator,
                value: stake + arbitrationCost
              }))
            });

            it('calling requestClearing should move item into the clearing requested state', async () => {
              await expectThrow(arbitrablePermissionList.requestClearing(ARBITRARY_STRING, {
                from: arbitrator,
                value: stake + arbitrationCost
              }))
            });

            it('calling challangeBlacklisting should create a dispute', async function() {
              let itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4].toNumber();

              await arbitrablePermissionList.challengeRegistration(ARBITRARY_STRING, {
                from: arbitrator,
                value: stake + arbitrationCost
              });

              let disputeID = (await arbitrablePermissionList.items(ARBITRARY_STRING))[6].toNumber();

              assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[3].toString(), arbitrator);
              assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[4].toNumber(), itemBalance + stake);
              assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[5], true);
              assert.equal(web3.toUtf8(await arbitrablePermissionList.disputeIDToItem(disputeID)), ARBITRARY_STRING)
            });

            it('calling challengeClearing should revert', async () => {
              await expectThrow(arbitrablePermissionList.challengeClearing(ARBITRARY_STRING, {
                from: arbitrator,
                value: stake + arbitrationCost
              }))
            });

            it('calling executeRequest should move item into the blacklisted state', async function() {
              await arbitrablePermissionList.executeRequest(ARBITRARY_STRING, {
                from: arbitrator
              });

              assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.REGISTERED)
            });

            describe('executeRuling', async function() {
              let disputeID;

              beforeEach('create a dispute', async function() {
                await arbitrablePermissionList.challengeRegistration(ARBITRARY_STRING, {
                  from: partyB,
                  value: stake + arbitrationCost
                });

                disputeID = (await arbitrablePermissionList.items(ARBITRARY_STRING))[6].toNumber();
              });

              it('calling executeRuling with REGISTER should send item.balance to submitter', async function() {
                const submitter = (await arbitrablePermissionList.items(ARBITRARY_STRING))[2];
                const submitterBalance = web3.eth.getBalance(submitter);
                const itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4];


                const hash = await centralizedArbitrator.giveRuling(disputeID, RULING.REGISTER, {
                  from: arbitrator
                });
                const gasUsed = hash.receipt.gasUsed;
                const gasCost = gasUsed * Math.pow(10, 11); // Test environment doesn't care what the gasPrice is, spent value is always gasUsed * 10^11

                const actualBalanceOfSubmitter = web3.eth.getBalance(submitter);
                let expectedBalanceOfSubmitter
                let expectedItemStatus

                if (!rechallengePossible) {
                  expectedBalanceOfSubmitter = submitterBalance.plus(itemBalance).plus(arbitrationFee).minus(gasCost);
                  expectedItemStatus = ITEM_STATUS.REGISTERED
                } else {
                  expectedBalanceOfSubmitter = submitterBalance.plus(itemBalance).minus(stake).minus(gasCost);
                  expectedItemStatus = ITEM_STATUS.SUBMITTED
                }

                assert(actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter), "Actual: " + actualBalanceOfSubmitter + "\tExpected: " + expectedBalanceOfSubmitter);

                assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), expectedItemStatus)
              });

              it('calling executeRuling with CLEAR should send item.balance to challenger', async function() {
                const challenger = (await arbitrablePermissionList.items(ARBITRARY_STRING))[3];
                const challengerBalance = web3.eth.getBalance(challenger);
                const itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4];

                await centralizedArbitrator.giveRuling(disputeID, RULING.CLEAR, {
                  from: arbitrator
                });

                const actualBalanceOfChallenger = web3.eth.getBalance(challenger);
                const expectedBalanceOfChallenger = challengerBalance.plus(itemBalance);

                assert(actualBalanceOfChallenger.equals(expectedBalanceOfChallenger), "Actual: " + actualBalanceOfChallenger + "\tExpected: " + expectedBalanceOfChallenger)

                assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARED)
              });

              it('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the absent state', async function() {
                const submitter = (await arbitrablePermissionList.items(ARBITRARY_STRING))[2];
                const challenger = (await arbitrablePermissionList.items(ARBITRARY_STRING))[3];
                const submitterBalance = web3.eth.getBalance(submitter);
                const challengerBalance = web3.eth.getBalance(challenger);
                const itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4];
                const disputeID = (await arbitrablePermissionList.items(ARBITRARY_STRING))[6];

                const hash = await centralizedArbitrator.giveRuling(disputeID, RULING.OTHER, {
                  from: arbitrator
                });
                const gasUsed = hash.receipt.gasUsed;
                const gasCost = gasUsed * Math.pow(10, 11); // Test environment doesn't care what the gasPrice is, spent value is always gasUsed * 10^11

                const actualBalanceOfSubmitter = web3.eth.getBalance(submitter);
                const actualBalanceOfChallenger = web3.eth.getBalance(challenger);
                const expectedBalanceOfSubmitter = itemBalance.dividedBy(new BigNumber(2)).plus(submitterBalance).plus(arbitrationFee).minus(gasCost);
                const expectedBalanceOfChallenger = itemBalance.dividedBy(new BigNumber(2)).plus(challengerBalance);

                assert(actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter), "Actual: " + actualBalanceOfSubmitter + "\tExpected: " + expectedBalanceOfSubmitter)
                assert(actualBalanceOfChallenger.equals(expectedBalanceOfChallenger), "Actual: " + actualBalanceOfChallenger + "\tExpected: " + expectedBalanceOfChallenger)
                assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.ABSENT)
              })
            })
          });

          if (!rechallengePossible) {

            if (!appendOnly) {
              describe('When item in clearing requested state', function() {

                beforeEach('prepare pre-conditions', async function() {
                  await arbitrablePermissionList.requestRegistration(ARBITRARY_STRING, {
                    from: partyA,
                    value: stake + arbitrationCost
                  });
                  await arbitrablePermissionList.executeRequest(ARBITRARY_STRING, {
                    from: partyA
                  });
                  await arbitrablePermissionList.requestClearing(ARBITRARY_STRING, {
                    from: partyB,
                    value: stake + arbitrationCost
                  })
                });

                beforeEach('assert pre-conditions', async function() {
                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARING_REQUESTED)
                });

                it('calling isPermitted should return ' + (!blacklist), async () => {
                  assert.equal((await arbitrablePermissionList.isPermitted(ARBITRARY_STRING)), !blacklist)
                });

                it('calling requestRegistration should revert', async () => {
                  await expectThrow(arbitrablePermissionList.requestRegistration(ARBITRARY_STRING, {
                    from: partyA,
                    value: stake + arbitrationCost
                  }))
                });

                it('calling requestClearing should revert', async function() {
                  await expectThrow(arbitrablePermissionList.requestClearing(ARBITRARY_STRING, {
                    from: partyB,
                    value: stake + arbitrationCost
                  }))
                });

                it('calling challengeRegistration should revert', async () => {
                  await expectThrow(arbitrablePermissionList.challengeRegistration(ARBITRARY_STRING, {
                    from: partyB,
                    value: stake + arbitrationCost
                  }))
                });

                it('calling challangeClearing should create a dispute', async function() {
                  let itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4].toNumber();

                  await arbitrablePermissionList.challengeClearing(ARBITRARY_STRING, {
                    from: partyA,
                    value: stake + arbitrationCost
                  });
                  let disputeID = (await arbitrablePermissionList.items(ARBITRARY_STRING))[6].toNumber();

                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[3].toString(), partyA);
                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[4].toNumber(), itemBalance + stake);
                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[5], true);
                  assert.equal(web3.toUtf8(await arbitrablePermissionList.disputeIDToItem(disputeID)), ARBITRARY_STRING)
                });

                it('calling executeRequest should move item into the blacklisted state', async function() {
                  await arbitrablePermissionList.executeRequest(ARBITRARY_STRING, {
                    from: partyA
                  });

                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARED)
                });

                describe('executeRuling', async function() {
                  let disputeID;

                  beforeEach('create a dispute', async function() {
                    await arbitrablePermissionList.challengeClearing(ARBITRARY_STRING, {
                      from: partyB,
                      value: stake + arbitrationCost
                    });

                    disputeID = (await arbitrablePermissionList.items(ARBITRARY_STRING))[6].toNumber();
                  });

                  it('calling executeRuling with REGISTER should send item.balance to challenger', async function() {
                    const challenger = (await arbitrablePermissionList.items(ARBITRARY_STRING))[3];
                    const challengerBalance = web3.eth.getBalance(challenger);
                    const itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4];

                    await centralizedArbitrator.giveRuling(disputeID, RULING.REGISTER, {
                      from: arbitrator
                    });

                    const actualBalanceOfChallenger = web3.eth.getBalance(challenger);
                    const expectedBalanceOfChallenger = challengerBalance.plus(itemBalance).minus(new BigNumber(stake).mul(3)).minus(new BigNumber(arbitrationFee).mul(2));

                    assert(actualBalanceOfChallenger.equals(expectedBalanceOfChallenger), "Difference: " + actualBalanceOfChallenger.minus(expectedBalanceOfChallenger));

                    // assert.equal(web3.eth.getBalance(challenger).toNumber(), challengerBalance + itemBalance);
                    assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.REGISTERED)
                  });

                  it('calling executeRuling with CLEAR should send item.balance to submitter', async function() {
                    const submitter = (await arbitrablePermissionList.items(ARBITRARY_STRING))[2];
                    const submitterBalance = web3.eth.getBalance(submitter);
                    const itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4];

                    await centralizedArbitrator.giveRuling(disputeID, RULING.CLEAR, {
                      from: arbitrator
                    });

                    const actualBalanceOfSubmitter = web3.eth.getBalance(submitter);
                    const expectedBalanceOfSubmitter = submitterBalance.plus(itemBalance).minus(new BigNumber(stake).mul(3)).minus(new BigNumber(arbitrationFee).mul(2));

                    assert(actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter), "Difference: " + actualBalanceOfSubmitter.minus(expectedBalanceOfSubmitter));

                    //assert.equal(web3.eth.getBalance(submitter).toNumber(), submitterBalance + itemBalance);
                    assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARED)
                  });

                  it('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the registered state', async function() {
                    const submitter = (await arbitrablePermissionList.items(ARBITRARY_STRING))[2];
                    const challenger = (await arbitrablePermissionList.items(ARBITRARY_STRING))[3];
                    const submitterBalance = web3.eth.getBalance(submitter);
                    const challengerBalance = web3.eth.getBalance(challenger);
                    const itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4];
                    const disputeID = (await arbitrablePermissionList.items(ARBITRARY_STRING))[6];

                    await centralizedArbitrator.giveRuling(disputeID, RULING.OTHER, {
                      from: arbitrator
                    });

                    const actualBalanceOfSubmitter = web3.eth.getBalance(submitter);
                    const actualBalanceOfChallenger = web3.eth.getBalance(challenger);
                    const expectedBalanceOfSubmitter = itemBalance.dividedBy(2).plus(submitterBalance);
                    const expectedBalanceOfChallenger = itemBalance.dividedBy(2).plus(challengerBalance);

                    assert(actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter), "Difference: " + actualBalanceOfSubmitter.minus(expectedBalanceOfSubmitter));
                    assert(actualBalanceOfChallenger.equals(expectedBalanceOfChallenger), "Difference: " + actualBalanceOfChallenger.minus(expectedBalanceOfChallenger));

                    assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.REGISTERED);
                  })
                })
              });
            }
            if (!appendOnly) {
              describe('When item in preventive clearing requested state', function() {

                beforeEach('prepare pre-conditions', async function() {
                  await arbitrablePermissionList.requestClearing(ARBITRARY_STRING, {
                    from: partyB,
                    value: stake + arbitrationCost
                  })
                });

                beforeEach('assert pre-conditions', async function() {
                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.PREVENTIVE_CLEARING_REQUESTED)
                });

                it('calling isPermitted on a not-disputed item should return ' + (blacklist), async () => {
                  assert.equal((await arbitrablePermissionList.isPermitted(ARBITRARY_STRING)), blacklist)
                });

                it('calling isPermitted on a disputed item should return ' + (blacklist), async () => {
                  await arbitrablePermissionList.challengeClearing(ARBITRARY_STRING, {
                    from: partyA,
                    value: stake + arbitrationCost
                  }); // To satisfy disputed pre-condition

                  assert.equal((await arbitrablePermissionList.isPermitted(ARBITRARY_STRING)), !blacklist)
                });

                it('calling requestRegistration should revert', async () => {
                  await expectThrow(arbitrablePermissionList.requestRegistration(ARBITRARY_STRING, {
                    from: partyA,
                    value: stake + arbitrationCost
                  }))
                });

                it('calling requestClearing should revert', async function() {
                  await expectThrow(arbitrablePermissionList.requestClearing(ARBITRARY_STRING, {
                    from: partyB,
                    value: stake + arbitrationCost
                  }))
                });

                it('calling challengeRegistration should revert', async () => {
                  await expectThrow(arbitrablePermissionList.challengeRegistration(ARBITRARY_STRING, {
                    from: partyB,
                    value: stake + arbitrationCost
                  }))
                });

                it('calling challangeClearing should create a dispute', async function() {
                  let itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4].toNumber();

                  await arbitrablePermissionList.challengeClearing(ARBITRARY_STRING, {
                    from: partyA,
                    value: stake + arbitrationCost
                  });

                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[3].toString(), partyA);
                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[4].toNumber(), itemBalance + stake);
                  let disputeID = (await arbitrablePermissionList.items(ARBITRARY_STRING))[6].toNumber();
                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[5], true);
                  assert.equal(web3.toUtf8(await arbitrablePermissionList.disputeIDToItem(disputeID)), ARBITRARY_STRING)
                });

                it('calling executeRequest should move item into the blacklisted state', async function() {
                  await arbitrablePermissionList.executeRequest(ARBITRARY_STRING, {
                    from: arbitrator
                  });

                  assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARED)
                });

                describe('executeRuling', async function() {
                  let disputeID;

                  beforeEach('create a dispute', async function() {
                    await arbitrablePermissionList.challengeClearing(ARBITRARY_STRING, {
                      from: partyB,
                      value: stake + arbitrationCost
                    });

                    disputeID = (await arbitrablePermissionList.items(ARBITRARY_STRING))[6].toNumber();
                  });

                  it('calling executeRuling with REGISTER should send item.balance to challenger', async function() {
                    const challenger = (await arbitrablePermissionList.items(ARBITRARY_STRING))[3];
                    const challengerBalance = web3.eth.getBalance(challenger);
                    const itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4];

                    await centralizedArbitrator.giveRuling(disputeID, RULING.REGISTER, {
                      from: arbitrator
                    });

                    const actualBalanceOfChallenger = web3.eth.getBalance(challenger);
                    const expectedBalanceOfChallenger = challengerBalance.plus(itemBalance);

                    assert(actualBalanceOfChallenger.equals(expectedBalanceOfChallenger));
                    assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.REGISTERED)
                  });

                  it('calling executeRuling with CLEAR should send item.balance to submitter', async function() {
                    const submitter = (await arbitrablePermissionList.items(ARBITRARY_STRING))[2];
                    const submitterBalance = web3.eth.getBalance(submitter);
                    const itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4];

                    await centralizedArbitrator.giveRuling(disputeID, RULING.CLEAR, {
                      from: arbitrator
                    });

                    const actualBalanceOfSubmitter = web3.eth.getBalance(submitter);
                    const expectedBalanceOfSubmitter = itemBalance.plus(submitterBalance);

                    assert(actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter));
                    assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.CLEARED)
                  });

                  it('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the absent state', async function() {
                    const submitter = (await arbitrablePermissionList.items(ARBITRARY_STRING))[2];
                    const challenger = (await arbitrablePermissionList.items(ARBITRARY_STRING))[3];
                    const submitterBalance = web3.eth.getBalance(submitter);
                    const challengerBalance = web3.eth.getBalance(challenger);
                    const itemBalance = (await arbitrablePermissionList.items(ARBITRARY_STRING))[4];
                    const disputeID = (await arbitrablePermissionList.items(ARBITRARY_STRING))[6];

                    await centralizedArbitrator.giveRuling(disputeID, RULING.OTHER, {
                      from: arbitrator
                    });

                    const actualBalanceOfSubmitter = web3.eth.getBalance(submitter);
                    const actualBalanceOfChallenger = web3.eth.getBalance(challenger);
                    const expectedBalanceOfSubmitter = itemBalance.dividedBy(2).plus(submitterBalance).plus(new BigNumber(stake)).plus(new BigNumber(arbitrationFee).dividedBy(2));
                    const expectedBalanceOfChallenger = itemBalance.dividedBy(2).plus(challengerBalance).plus(new BigNumber(stake)).plus(new BigNumber(arbitrationFee).dividedBy(2));;

                    assert(actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter), "Difference: " + actualBalanceOfSubmitter.minus(expectedBalanceOfSubmitter));
                    assert(actualBalanceOfChallenger.equals(expectedBalanceOfChallenger), "Difference: " + actualBalanceOfChallenger.minus(expectedBalanceOfChallenger));

                    assert.equal((await arbitrablePermissionList.items(ARBITRARY_STRING))[0].toNumber(), ITEM_STATUS.ABSENT);
                  })
                })
              })
            }
          }
        })
      }
    }
  }
});
