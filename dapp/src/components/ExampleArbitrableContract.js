import React, { Component } from 'react'
import GithubCorner from 'react-github-corner'
import { Button, Jumbotron, Navbar, NavbarBrand, Nav, NavItem, NavLink, Tooltip, TooltipContent, Container, Row, Col } from 'reactstrap'
import Menu from './Menu'

import '../styles/App.scss'

class ExampleArbitrableContract extends Component {

  constructor() {
    super();
  }

  componentDidMount() {}

  state = {}

  render() {

    return (
      <div>
        <div>
          <Menu />
          <Container>
            <Row>
              <Col>
                <h1 className="intro">Example Arbitrable</h1>
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
