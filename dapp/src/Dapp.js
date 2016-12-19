import React, { Component } from 'react'
import FontAwesome from 'react-fontawesome'
import GithubCorner from 'react-github-corner';
import { Button, Jumbotron, Navbar, NavbarBrand, Nav, NavItem, NavLink, Tooltip, TooltipContent, Container, Row, Col } from 'reactstrap';
import ExampleArbitrableForm from './components/ExampleArbitrableForm';
import Menu from './components/Menu';

import 'styles/App.scss'

class Dapp extends Component {

  state = {
      transactionLoad: false,
  }

  render() {

    return (
      <div>
        <div>
          <Menu />
          <Container>
            <Row>
              <Col>
                <h1 className="intro">Đapp</h1>
                <ExampleArbitrableForm />
              </Col>
            </Row>
            <Row>
              <Col>
                {this.state.contractAdress ?
                  <div className="alert alert-success" role="alert">
                    <strong>Contract mined!</strong> <br/>Address: {this.state.contractAdress} <br/>TransactionHash: {this.state.contractTransactionHash}
                  </div> :
                  <div></div>
                }
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

export default Dapp
