## ArbitrablePermissionList
ArbitrablePermissionList implements an arbitrator curated registry.

### Notes
- Anyone can post an item with a deposit.
- If no one complains within a defined time period, the item is added to the registry.
- Anyone can complain and also post a deposit. If someone does, a dispute is created. The winner of the dispute gets the deposit of the other party and the item is added or removed accordingly.
- To make a request, parties have to deposit a stake and the arbitration fees.
- In case the arbitrator refuses to rule, the item is put in the initial absent status and the balance is split equally between parties.

### Notes on security
- In some cases we use `send` instead of `transfer` on purpose to prevent someone from blocking the contract.
- We avoid using SafeMath in numeric operation, as it is redundant.

## BlockhashRNGFallback
BlockHashRNGFallback implements a random number generator which stores the randomness safely throughout time.

### Notes
- The blockhash will become unreachable after 256 blocks so we give parties an incentive to save it. Rewards are paid from a reward pool
- Anyone can contribute to the reward pool
