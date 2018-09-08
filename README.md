# Kleros Interaction Smart Contracts

<p align="center">
  <b style="font-size: 32px;">Kleros</b>
</p>

<p align="center">
  <a href="https://standardjs.com"><img src="https://img.shields.io/badge/code_style-standard-brightgreen.svg" alt="JavaScript Style Guide"></a>
  <a href="https://travis-ci.org/kleros/kleros-interaction"><img src="https://travis-ci.org/kleros/kleros-interaction.svg?branch=master" alt="Build Status"></a>
  <a href="https://david-dm.org/kleros/kleros-interaction"><img src="https://david-dm.org/kleros/kleros-interaction.svg" alt="Dependencies"></a>
  <a href="https://david-dm.org/kleros/kleros-interaction?type=dev"><img src="https://david-dm.org/kleros/kleros-interaction/dev-status.svg" alt="Dev Dependencies"></a>
  <a href="https://github.com/trufflesuite/truffle"><img src="https://img.shields.io/badge/tested%20with-truffle-red.svg" alt="Tested with Truffle"></a>
  <a href="https://conventionalcommits.org"><img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg" alt="Conventional Commits"></a>
  <a href="http://commitizen.github.io/cz-cli/"><img src="https://img.shields.io/badge/commitizen-friendly-brightgreen.svg" alt="Commitizen Friendly"></a>
  <a href="https://github.com/prettier/prettier"><img src="https://img.shields.io/badge/styled_with-prettier-ff69b4.svg" alt="Styled with Prettier"></a>
  <a href="https://gitter.im/kleros/kleros-interaction?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge"><img src="https://badges.gitter.im/kleros/kleros-interaction.svg" alt="Chat on Gitter"></a>
</p>

Smart contracts able to interact with Kleros and standard proposals.


## Getting Started

### Setting Up The Environment

Install [Truffle Suite](https://truffleframework.com/) and [Ganache](https://truffleframework.com/ganache)

### Running Tests

Compile the project using `Truffle` suite
```
truffle compile
```
Run tests
```
truffle test
```

## Other Scripts

- `yarn run prettify` - Apply prettier to the entire project.
- `yarn run lint:sol` - Lint the entire project's .sol files.
- `yarn run lint:js` - Lint the entire project's .js files.
- `yarn run lint:sol --fix` - Fix fixable linting errors in .sol files.
- `yarn run lint:js --fix` - Fix fixable linting errors in .js files.
- `yarn run lint` - Lint the entire project's .sol and .js files.
- `yarn test` - Run the truffle tests.
- `yarn run cz` - Run commitizen.
- `yarn run build` - Compile contracts.


## Troubleshooting
> Could not connect to your Ethereum client. Please check that your Ethereum client:
    - is running
    - is accepting RPC connections (i.e., "--rpc" option is used in geth)
    - is accessible over the network
    - is properly configured in your Truffle configuration file (truffle.js)

Make sure `Ganache` is running on the port specified in `truffle.js`

## Contributing

We follow [GitHub Flow](https://guides.github.com/introduction/flow/) in this repository.

Please see [smart contract guidelines](https://github.com/kleros/kleros/wiki/Guidelines-contracts).

Feel free to ask for help on [slack](https://slack.kleros.io/).
