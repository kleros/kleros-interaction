import React, { Component } from 'react'
import { Navbar, NavbarBrand, Nav, NavItem, NavLink, Container, Row, Col } from 'reactstrap';

import 'styles/App.scss'

class Menu extends Component {

  state = {}

  render() {

    return (
      <Navbar color="faded" light full>
        <Container>
          <NavbarBrand className="float-xs-center" href="/#">EtherCourt <sup style={{fontVariant: 'small-caps', fontWeight: 'bolder'}}>alpha</sup></NavbarBrand>
          <Nav className="float-xs-right" navbar>
            <NavItem>
              <NavLink href="/#/dapp">Đapp</NavLink>
            </NavItem>
            <NavItem>
              <NavLink href="https://github.com/ethercourt/workspace/raw/master/decentralized-court/whitePaper/DAC.pdf">White paper</NavLink>
            </NavItem>
            <NavItem>
              <NavLink href="https://twitter.com/ethercourt">Twitter</NavLink>
            </NavItem>
          </Nav>
        </Container>
      </Navbar>
    )
  }
}

export default Menu
