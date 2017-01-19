import React, { Component } from 'react'
import GithubCorner from 'react-github-corner'
import { Alert, Button, ButtonGroup, Navbar, NavbarBrand, Nav, NavItem, NavLink, Tooltip, TooltipContent, Container, Row, Col, Collapse, Card, CardBlock } from 'reactstrap'
import { keccak_256 } from 'js-sha3'
import Menu from './Menu'
import Footer from './Footer'

import '../styles/App.scss'

class CourtContract extends Component {

  constructor() {
    super()
  }

  componentDidMount() {
    setTimeout(() => {
      if (typeof web3 !== 'undefined') {
        //web3 = new Web3(web3.currentProvider);
        this.setState({web3: true})
      } else {
        alert("install Metamask or use Mist");
      }
    }, 1000)
  }

  state = {
  }

  toggle = () => {
    this.setState({ collapse: !this.state.collapse });
    if (!this.state.collapse)
      this.getDetails(this.waitingForArbitration)
  }

  render() {

    return (
      <div>
        <Menu />
        <Container>
          <Row>
            <Col>
              <h1 className="intro">Court</h1>
            </Col>
          </Row>
          <Row>
            <Col>
              <Button onClick={this.toggle} style={{ marginBottom: '1rem' }}>Details of the smart contract</Button>
              <Collapse isOpen={this.state.collapse}>
                <Card>
                  <CardBlock>
                    <p>Last action: {this.state.details.lastAction}</p>
                    <p>Time to reac: {this.state.details.timeToReac} seconds</p>
                    <p>State: {this.state.details.state}</p>
                    <p>Id dispute: {this.state.details.disputeID}</p>
                    <p>Second random number: {this.state.details.secondRandom}</p>
                    <p>Creator request: {this.state.details.requestCreator}</p>
                    <p>Party A: {this.state.details.partyA}</p>
                    <p>Party B: {this.state.details.partyB}</p>
                    <p>Random hash: {this.state.details.hashRandom}</p>
                    <p>Next appeals: {this.state.details.nextAppeals}</p>
                  </CardBlock>
                </Card>
              </Collapse>
            </Col>
          </Row>
        </Container>
        <Footer />
      </div>
    )
  }
}

export default ExampleArbitrableContract
