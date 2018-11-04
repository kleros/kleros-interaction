const should = require('chai').should()

/** Expect the promise to fail with a message
 *  @param {Promise} promise The promise
 *  @param {string} message The message to show if the promise fail
 */
async function shouldFailWithMessage(promise, message) {
  try {
    await promise
  } catch (err) {
    if (message)
      err.message.should.include(
        message,
        `Wrong failure type, expected '${message}'`
      )
    return
  }

  should.fail('Expected failure not received')
}

/** Expect the transaction to revert
 *  @param {Promise} promise The promise that transasction runs at
 */
async function reverting(promise) {
  await shouldFailWithMessage(promise, 'revert')
}

/** Expect the transaction to throw an error
 *  @param {Promise} promise The promise that transasction runs at
 */
async function throwing(promise) {
  await shouldFailWithMessage(promise, 'invalid opcode')
}

/** Expect the transaction to run out of gas
 *  @param {Promise} promise The promise that transasction runs at
 */
async function outOfGas(promise) {
  await shouldFailWithMessage(promise, 'out of gas')
}

/** Expect the promise to fail
 *  @param {Promise} promise The promise
 */
async function shouldFail(promise) {
  await shouldFailWithMessage(promise)
}

shouldFail.reverting = reverting
shouldFail.throwing = throwing
shouldFail.outOfGas = outOfGas

module.exports = shouldFail
