import React, { Component } from 'react'
import GithubCorner from 'react-github-corner'
import { Button, ButtonGroup, Navbar, NavbarBrand, Nav, NavItem, NavLink, Tooltip, TooltipContent, Container, Row, Col } from 'reactstrap'
import { keccak_256 } from 'js-sha3'
import Menu from './Menu'

import '../styles/App.scss'

class ExampleArbitrableContract extends Component {

  constructor() {
    super()
  }

  componentDidMount() {
    this.randomNumber()
  }

  state = {
    randomNumber: null,
  }

  action1 = () => {
    if ('undefined' === typeof web3) {
      alert("install metamask");
    } else {
      let examplearbitrableContract = web3.eth.contract([{"constant":false,"inputs":[{"name":"_secondRandom","type":"uint256"}],"name":"counterAppeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"partyA","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"requestCreator","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"partyB","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"disputeID","type":"uint256"}],"name":"ruleA","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_secondRandom","type":"uint256"}],"name":"counterRequest","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"disputeID","type":"uint256"}],"name":"ruleB","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"firstRandom","type":"uint256"}],"name":"createDispute","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_hashRandom","type":"bytes32"}],"name":"request","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"nextAppeals","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"executeA","type":"bool"}],"name":"executeDueToInactvity","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"hashRandom","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"lastAction","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"disputeID","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"n","type":"uint256"}],"name":"hash","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"state","outputs":[{"name":"","type":"uint8"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_hashRandom","type":"bytes32"}],"name":"appeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"timeToReac","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"firstRandom","type":"uint256"}],"name":"createAppeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"secondRandom","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"inputs":[{"name":"_court","type":"address"},{"name":"_partyB","type":"address"},{"name":"_timeToReac","type":"uint256"}],"payable":false,"type":"constructor"}]);
      let examplearbitrableContractInstance = examplearbitrableContract.at(this.props.params.contractAdress);
      examplearbitrableContractInstance.hash(this.state.randomNumber, {from: web3.eth.accounts[0]}, (res,err) => {
        console.log(res)
        console.log(err)
        this.setState({randomNumberHash: err})
  	  });
      examplearbitrableContractInstance.executeDueToInactvity(true, {from: web3.eth.accounts[0]}, (res,err) => {
        console.log(res)
        console.log(err)
  	  });
    }
  }

  action2 = () => {
    if ('undefined' === typeof web3) {
      alert("install metamask");
    } else {
      let examplearbitrableContract = web3.eth.contract([{"constant":false,"inputs":[{"name":"_secondRandom","type":"uint256"}],"name":"counterAppeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"partyA","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"requestCreator","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"partyB","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"disputeID","type":"uint256"}],"name":"ruleA","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_secondRandom","type":"uint256"}],"name":"counterRequest","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"disputeID","type":"uint256"}],"name":"ruleB","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"firstRandom","type":"uint256"}],"name":"createDispute","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_hashRandom","type":"bytes32"}],"name":"request","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"nextAppeals","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"executeA","type":"bool"}],"name":"executeDueToInactvity","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"hashRandom","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"lastAction","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"disputeID","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"n","type":"uint256"}],"name":"hash","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"state","outputs":[{"name":"","type":"uint8"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_hashRandom","type":"bytes32"}],"name":"appeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"timeToReac","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"firstRandom","type":"uint256"}],"name":"createAppeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"secondRandom","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"inputs":[{"name":"_court","type":"address"},{"name":"_partyB","type":"address"},{"name":"_timeToReac","type":"uint256"}],"payable":false,"type":"constructor"}]);
      let examplearbitrableContractInstance = examplearbitrableContract.at(this.props.params.contractAdress);
      examplearbitrableContractInstance.hash(this.state.randomNumber, {from: web3.eth.accounts[0]}, (res,err) => {
        console.log(res)
        console.log(err)
        this.setState({randomNumberHash: err})
      });
      examplearbitrableContractInstance.executeDueToInactvity(false, {from: web3.eth.accounts[0]}, (res,err) => {
        console.log(res)
        console.log(err)
      });
    }
  }

  randomNumber = () => {
    // TODO random number in [[1,2^256-1]]
    let randomNumber = Number(Math.floor((Math.random() * (Math.pow(2, 256) - 1)) + 1))
    this.setState({randomNumber: randomNumber})
    if ('undefined' === typeof web3) {
      alert("install metamask");
    } else {
      let examplearbitrableContract = web3.eth.contract([{"constant":false,"inputs":[{"name":"_secondRandom","type":"uint256"}],"name":"counterAppeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"partyA","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"requestCreator","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"partyB","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_secondRandom","type":"uint256"}],"name":"counterRequest","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"firstRandom","type":"uint256"}],"name":"createDispute","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_state","type":"uint8"}],"name":"setState","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_hashRandom","type":"bytes32"}],"name":"request","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"nextAppeals","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"hashRandom","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"lastAction","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"disputeID","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"n","type":"uint256"}],"name":"hash","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"state","outputs":[{"name":"","type":"uint8"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"disputeID","type":"uint256"}],"name":"executeRulingA","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_hashRandom","type":"bytes32"}],"name":"appeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"timeToReac","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"firstRandom","type":"uint256"}],"name":"createAppeal","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"disputeID","type":"uint256"}],"name":"executeRulingB","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"secondRandom","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"inputs":[{"name":"_court","type":"address"},{"name":"_partyB","type":"address"},{"name":"_timeToReac","type":"uint256"}],"payable":false,"type":"constructor"}]);
      let examplearbitrableContractInstance = examplearbitrableContract.at(this.props.params.contractAdress);
      examplearbitrableContractInstance.hash(this.state.randomNumber, {from: web3.eth.accounts[0]}, (res,err) => {
        console.log(res)
        console.log(err)
        this.setState({randomNumberHash: err})
  	  });
      examplearbitrableContractInstance.request(this.state.randomNumberHash, {from: web3.eth.accounts[0]}, (res,err) => {
        console.log(res)
        console.log(err)
  	  });
    }
  }

  render() {

    return (
      <div>
        <div>
          <Menu />
          <Container>
            <Row>
              <Col>
                <h1 className="intro">Example Arbitrable</h1>
                <p>Random number (save the number) : { this.state.randomNumber }</p>
                <p>Random number hash : { this.state.randomNumberHash }</p>
                <div className="float-xs-right">
                  <b>Execute Due To Inactvity </b>
                  <ButtonGroup>
                    <Button onClick={this.action1}>Action 1</Button>
                    <Button onClick={this.action2}>Action 2</Button>
                  </ButtonGroup>
                </div>
              </Col>
            </Row>
          </Container>
          <hr className="my-2" />
          <footer>EtherCourt.io</footer>
        </div>
        <GithubCorner href="https://github.com/ethercourt" />
      </div>
    )
  }
}

export default ExampleArbitrableContract
