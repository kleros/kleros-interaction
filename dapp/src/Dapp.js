import React, { Component } from 'react'
import FontAwesome from 'react-fontawesome'
import GithubCorner from 'react-github-corner'
import { Button, Jumbotron, Navbar, NavbarBrand, Nav, NavItem, NavLink, Tooltip, TooltipContent, Container, Row, Col } from 'reactstrap'
import ExampleArbitrableForm from './components/ExampleArbitrableForm'
import Menu from './components/Menu'
import Footer from './components/Footer'

import 'styles/App.scss'

class Dapp extends Component {

  state = {}

  render() {

    return (
      <div>
        <Menu />
        <Container>
          <Row>
            <Col>
              <ExampleArbitrableForm />
            </Col>
          </Row>
        </Container>
        <Footer />
      </div>
    )
  }
}

export default Dapp
