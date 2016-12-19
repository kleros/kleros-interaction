import React, { Component } from 'react'
import FontAwesome from 'react-fontawesome'
import GithubCorner from 'react-github-corner';
import { Button, Jumbotron, Tooltip, TooltipContent, Container, Row, Col } from 'reactstrap';
import Menu from './components/Menu';

import 'styles/App.scss'



class Docs extends Component {

  state = {}

  render() {

    return (
      <div>
      <div>
        <Menu />
        <Container>
          <Row>
            <Col>
              <h1 className="intro">Introduction</h1>
              <p>
                All our real world economics is based on contracts and the
                system enforcing those contracts - courts and enforcement
                agencies.
                <br/>With the invention of blockchain technology we are moving
                to an age where enforcing contracts is automatic via smart $
                contracts moving real assets on blockchain.
                <br/>
                But nowdays real-world contracts can not be presented as
                smart-contracts on blockchain due to the lack of reliable
                connections between real-world and blockchain. And the only way
                to make such a connection is consensus. Even a publick price of
                DJI can be  feed to blockchain  reliably only by consensus of
                human reporting.
              </p>
              <p>
                So, we havе brave new technology and oldschool plain text
                contracts everybody is used to.
                <br/>Why not connect them via human consensus?
                <br/>Here we comes to
              </p>
              <blockquote className="blockquote">
                <strong>Decentralised court (DCourt)</strong> - <em>an opt-in
                option to enforce ANY plain text contract on a blockchain with
                ruling made by human arbiters selected randomly or by some
                criteria.</em>
              </blockquote>
              <p>
                Take a notice that real-world contract are also interpreted by
                humans  (courts) before they get enforced. And there are opt-in
                international arbitration courts where you can choose arbiters
                to judge your claim.
              </p>
              <hr className="my-2" />
              <h1>Usecase workflow:</h1>
              <ol>
                <li>
                  Two parties agree on a real plain-text contract
                </li>
                <li>
                  They put 2-of-3 signatures smart-contract on blockchain, containing:
                  <ul>
                    <li> Hash of the text contract to preserve privacy</li>
                    <li>Values of assets (digital currency or tokens)  to put
                    on contract by every party for contract to start working</li>
                    <li>Implied distribution of assets if no claims</li>
                    <li>Due date after which arbitration is possible</li>
                    <li>Address of Dcourt smart-contract that have 3-d signature rights</li>
                    <li>Filter (language, scope of knowledge for example) for choosing arbiters to rule dispute</li>
                  </ul>
                </li>
                <li>
                  If both parties are satisfied then they sign predefined
                  transaction with implied distribution. Cost is almost zero
                  in this case - note that real-world escrow agents takes
                  percentage from every contract, no matter parties agree or
                  not.
                </li>
                <li>
                  After Due date any of the partys can fire a claim to DCourt
                  presenting:
                  <ul>
                    <li>Plain text contract (court checks the hash of text contract)</li>
                    <li>Desired funds distribution</li>
                    <li>Evidences</li>
                  </ul>
                  Other party is notified about started dispute and asked to present:
                  <ul>
                    <li>Desired funds distribution</li>
                    <li>Evidences</li>
                  </ul>
                </li>
                <li>
                  DCourt randomly choses Arbiters by filters predefined in smart-contract.
                </li>
                <li>
                  In multi-step process Arbiters decide on distribution of fund on smart-contract.
                </li>
                <li>
                  Loosing party can appeal to higher number of Arbiters, starting new ruling process.
                </li>
                  <li>
                  If no apellation within specified period of time then Dcourt sign transaction with one of the parties (not necessary with those who claimed initially).
                </li>
              </ol>
              <hr className="my-2" />
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

export default Docs
