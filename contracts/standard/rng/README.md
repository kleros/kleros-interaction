# Random Number Generation

RNG.sol proposes a standard for random number generating contracts.

BlockhashRNG.sol implements it using the simplest method of using the blockhash (not that it can be manipulated by miners not publishing blocks

BlockhashRNGFallback.sol does the same as the previous contract but fallback to returning a value if 256 blocks have passed.

TrustedRNG.sol implements a random number generator based on a trusted third party.

ConstantNG.sol implements a contracts always returning a specified number to ease testing.
