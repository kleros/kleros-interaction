/* global artifacts */
const SortitionSumTreeFactory = artifacts.require(
  '@kleros/kleros/contracts/data-structures/SortitionSumTreeFactory.sol'
)
const ExposedSortitionSumTreeFactory = artifacts.require(
  '@kleros/kleros/contracts/data-structures/SortitionSumTreeFactory.sol'
)
const KlerosLiquid = artifacts.require(
  '@kleros/kleros/contracts/kleros/KlerosLiquid.sol'
)

module.exports = function(deployer) {
  deployer.deploy(SortitionSumTreeFactory)
  deployer.link(SortitionSumTreeFactory, [
    ExposedSortitionSumTreeFactory,
    KlerosLiquid
  ])
}
