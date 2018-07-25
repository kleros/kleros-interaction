## ArbitrablePermissionList
ArbitrablePermissionList implements an arbitrator (see [ERC792](https://github.com/ethereum/EIPs/issues/792)) curated registry.

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
BlockHashRNGFallback implements a random number generator which stores the blockhash as a pseudo-random number throughout time. If the requested random number is not set by 256 blocks the contract returns the random number for the previous block. This avoids returning zero when data is not available and blocking forever contracts waiting for this random number.

### Notes
- The blockhash will become unreachable after 256 blocks so we give parties an incentive to save it. Rewards are paid from a reward pool.
- Anyone can contribute to the reward pool.
- The blockhash can be slightly manipulated by the miners (by block withholding and building upon the block of their choice in case of fork). This attack would allow miners to "reroll" the number but not to fix it to a particular value.
This makes it not suited for applications like gambling. But for others like drawing juror, it may be sufficient. As the number of jurors increases, it would be harder and harder to manipulate the RNG to create a set of juror statistically different from the underlying juror pool.
