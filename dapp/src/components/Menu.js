import React, { Component } from 'react'
import { Navbar, NavbarBrand, Nav, NavItem, NavLink, Container, Row, Col } from 'reactstrap';

import 'styles/App.scss'

class Menu extends Component {

  state = {}

  render() {

    return (
      <Navbar color="faded" light full>
        <Container>
          <NavbarBrand className="float-xs-center" href="/#">EtherCourt</NavbarBrand>
          <Nav className="float-xs-right" navbar>
            <NavItem>
              <NavLink href="/#/dapp">Đapp</NavLink>
            </NavItem>
            <NavItem>
              <NavLink href="/#/docs">Documentation</NavLink>
            </NavItem>
            <NavItem>
              <NavLink href="https://www.pdf-archive.com/2016/11/25/dac-1/">White paper</NavLink>
            </NavItem>
            <NavItem>
              <NavLink href="https://hack.ether.camp/public/decentralized-court">EtherCamp</NavLink>
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
