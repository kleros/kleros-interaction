import React, { Component } from 'react'
import FontAwesome from 'react-fontawesome'
import GithubCorner from 'react-github-corner'
import { keccak_256 } from 'js-sha3'
import { Button, Jumbotron, Navbar, NavbarBrand, Nav, NavItem, NavLink, Tooltip, TooltipContent, Container, Row, Col } from 'reactstrap'
import { Link } from 'react-router'


import '../styles/App.scss'

class ExampleArbitrableForm extends Component {

  constructor() {
    super();
  }

  componentDidMount() {}

  state = {
      contractAdress: null,
      contractTransactionHash: null,
      partyB: '',
      errPartyB: false,
      submitValueValid: false,
      transactionLoad: false,
      contracts: ['0x00'],
  }

    /**
   * Checks if the given string is an address
   *
   * @method isAddress
   * @param {String} address the given HEX adress
   * @return {Boolean}
  */
  isAddress = (address) => {
      if (!/^(0x)?[0-9a-f]{40}$/i.test(address)) {
          // check if it has the basic requirements of an address
          return false;
      } else if (/^(0x)?[0-9a-f]{40}$/.test(address) || /^(0x)?[0-9A-F]{40}$/.test(address)) {
          // If it's all small caps or all all caps, return true
          return true;
      } else {
          // Otherwise check each case
          return this.isChecksumAddress(address);
      }
  };

  /**
   * Checks if the given string is a checksummed address
   *
   * @method isChecksumAddress
   * @param {String} address the given HEX adress
   * @return {Boolean}
  */
  isChecksumAddress = (address) => {
      // Check each case
      address = address.replace('0x','');
      let addressHash = keccak_256(address.toLowerCase());
      for (var i = 0; i < 40; i++ ) {
          // the nth letter should be uppercase if the nth digit of casemap is 1
          if ((parseInt(addressHash[i], 16) > 7 && address[i].toUpperCase() !== address[i]) || (parseInt(addressHash[i], 16) <= 7 && address[i].toLowerCase() !== address[i])) {
              return false;
          }
      }
      return true;
  };

  submitValid = () => {
    if (!this.state.errPartyB || partyB == '') {
      this.setState({submitValueValid: true});
    } else {
      this.setState({submitValueValid: true});
    }
  }

  handleChangePartyB = (event) => {
    event.preventDefault()
    this.setState({partyB: event.target.value});
    if ('' !== event.target.value && !this.isAddress(event.target.value)) {
      this.setState({errPartyB: true});
    } else {
      this.setState({errPartyB: false});
    }
    this.submitValid()
  }

  deploySmartContract = (event) => {
    event.preventDefault();
    if ('undefined' === typeof web3) {
      alert("install metamask");
    } else if(!this.state.errCourt && !this.state.errPartyB && !this.state.errTimeToReact) {
      let _court = "0x4666F54695Df986D58a70089e87422d2462a6799";
      let _partyB = this.state.partyB;
      let _timeToReac = "30";
      let examplearbitrableContract = web3.eth.contract([{"constant":false,"inputs":[{"name":"_secondRandom","type":"uint256"}],"name":"counterAppeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"partyA","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"requestCreator","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"partyB","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_secondRandom","type":"uint256"}],"name":"counterRequest","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"firstRandom","type":"uint256"}],"name":"createDispute","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_state","type":"uint8"}],"name":"setState","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_hashRandom","type":"bytes32"}],"name":"request","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"nextAppeals","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"hashRandom","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"lastAction","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"disputeID","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"n","type":"uint256"}],"name":"hash","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"state","outputs":[{"name":"","type":"uint8"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"disputeID","type":"uint256"}],"name":"executeRulingA","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_hashRandom","type":"bytes32"}],"name":"appeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"timeToReac","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"firstRandom","type":"uint256"}],"name":"createAppeal","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"disputeID","type":"uint256"}],"name":"executeRulingB","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"secondRandom","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"inputs":[{"name":"_court","type":"address"},{"name":"_partyB","type":"address"},{"name":"_timeToReac","type":"uint256"}],"payable":false,"type":"constructor"}]);
      let examplearbitrable = examplearbitrableContract.new(
         _court,
         _partyB,
         _timeToReac,
         {
           from: web3.eth.accounts[0],
           data: '0x6060604052346100005760405160608061136b833981016040528080519060200190919080519060200190919080519060200190919050505b825b80600060006101000a81548173ffffffffffffffffffffffffffffffffffffffff02191690836c010000000000000000000000009081020402179055505b5033600160006101000a81548173ffffffffffffffffffffffffffffffffffffffff02191690836c0100000000000000000000000090810204021790555081600260006101000a81548173ffffffffffffffffffffffffffffffffffffffff02191690836c01000000000000000000000000908102040217905550806008819055505b5050505b61125e8061010d6000396000f36060604052361561010a576000357c0100000000000000000000000000000000000000000000000000000000900480630dc303971461010f57806310e1d8ca1461012c57806313680e1314610165578063290401131461019e5780633b8f0ef4146101d75780634ac8a529146101f457806356de96db1461021157806359c87d701461022e5780638196e8201461024b578063880f2cb31461026e57806389f71d5314610295578063b0a1e2b4146102b8578063b189fd4c146102db578063c19d93fb14610310578063d06834281461033b578063ece1de4414610358578063ef1f042814610375578063f0b070ca14610398578063f7ffc366146103b5578063fd2192cb146103d2575b610000565b346100005761012a60048080359060200190919050506103f5565b005b34610000576101396105f6565b604051808273ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b346100005761017261061c565b604051808273ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b34610000576101ab610642565b604051808273ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b34610000576101f26004808035906020019091905050610668565b005b346100005761020f60048080359060200190919050506107c2565b005b346100005761022c600480803590602001909190505061096e565b005b34610000576102496004808035906020019091905050610b5d565b005b3461000057610258610c89565b6040518082815260200191505060405180910390f35b346100005761027b610c8f565b604051808260001916815260200191505060405180910390f35b34610000576102a2610c95565b6040518082815260200191505060405180910390f35b34610000576102c5610c9b565b6040518082815260200191505060405180910390f35b34610000576102f66004808035906020019091905050610ca1565b604051808260001916815260200191505060405180910390f35b346100005761031d610cc1565b60405180826002811161000057815260200191505060405180910390f35b34610000576103566004808035906020019091905050610cd4565b005b34610000576103736004808035906020019091905050610d83565b005b3461000057610382610f56565b6040518082815260200191505060405180910390f35b34610000576103b36004808035906020019091905050610f5c565b005b34610000576103d060048080359060200190919050506111a9565b005b34610000576103df611258565b6040518082815260200191505060405180910390f35b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16141580156104a15750600260009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614155b156104ab57610000565b600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff16141561050757610000565b60006001026003546000191614806105225750600060045414155b806105d757506009546001600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663b098bdba600754600060405160200152604051827c010000000000000000000000000000000000000000000000000000000002815260040180828152602001915050602060405180830381600087803b156100005760325a03f11561000057505050604051805190602001500114155b156105e157610000565b81600481905550426006819055505b5b505b50565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b600260009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16141580156107145750600260009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614155b1561071e57610000565b600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff16141561077a57610000565b60006001026003546000191614806107955750600060045414155b806107a35750600060075414155b156107ad57610000565b81600481905550426006819055505b5b505b50565b600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614151561081f57610000565b6003546000191682604051808281526020019150506040518091039020600019161415806108505750600060075414155b1561085a57610000565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16634ac8a5296004548418600060405160200152604051827c010000000000000000000000000000000000000000000000000000000002815260040180828152602001915050602060405180830381600087803b156100005760325a03f11561000057505050604051805190602001506007819055506001600981905550600060010260038190555060006004819055506000600560006101000a81548173ffffffffffffffffffffffffffffffffffffffff02191690836c01000000000000000000000000908102040217905550426006819055505b5b5050565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614158015610a1a5750600260009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614155b15610a2457610000565b60085460065442031015610a3757610000565b600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16148015610a9657506000600454145b80610b0c5750600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614158015610afd5750600060045414155b8015610b0b57506000600754145b5b15610b535780600060146101000a81548160ff02191690837f0100000000000000000000000000000000000000000000000000000000000000908102040217905550610b58565b610000565b5b5b50565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614158015610c095750600260009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614155b15610c1357610000565b600060010260035460001916141580610c2f5750600060075414155b15610c3957610000565b8060038190555033600560006101000a81548173ffffffffffffffffffffffffffffffffffffffff02191690836c01000000000000000000000000908102040217905550426006819055505b5b50565b60095481565b60035481565b60065481565b60075481565b60008160405180828152602001915050604051809103902090505b919050565b600060149054906101000a900460ff1681565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16141515610d3057610000565b60006004541415610d4057610000565b6001600060146101000a81548160ff02191690837f01000000000000000000000000000000000000000000000000000000000000009081020402179055505b5b50565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614158015610e2f5750600260009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614155b15610e3957610000565b600060010260035460001916141580610efc57506009546001600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663b098bdba600754600060405160200152604051827c010000000000000000000000000000000000000000000000000000000002815260040180828152602001915050602060405180830381600087803b156100005760325a03f11561000057505050604051805190602001500114155b15610f0657610000565b8060038190555033600560006101000a81548173ffffffffffffffffffffffffffffffffffffffff02191690836c01000000000000000000000000908102040217905550426006819055505b5b50565b60085481565b600560009054906101000a900473ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff16141515610fb957610000565b60035460001916826040518082815260200191505060405180910390206000191614158061109157506009546001600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663b098bdba600754600060405160200152604051827c010000000000000000000000000000000000000000000000000000000002815260040180828152602001915050602060405180830381600087803b156100005760325a03f11561000057505050604051805190602001500114155b1561109b57610000565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663913b29586007546004548518604051837c01000000000000000000000000000000000000000000000000000000000281526004018083815260200182815260200192505050600060405180830381600087803b156100005760325a03f115610000575050506001600960008282540192505081905550600060010260038190555060006004819055506000600560006101000a81548173ffffffffffffffffffffffffffffffffffffffff02191690836c01000000000000000000000000908102040217905550426006819055505b5b5050565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614151561120557610000565b6000600454141561121557610000565b6002600060146101000a81548160ff02191690837f01000000000000000000000000000000000000000000000000000000000000009081020402179055505b5b50565b6004548156',
           gas: '4700000'
         }, (e, contract, state) => {
           console.log(e, contract);
           if(e instanceof Error) {
             this.setState({ transactionLoad: false})
           } else {
             this.setState({ transactionLoad: true})
           }
           if (contract && typeof contract.address !== 'undefined') {
             this.setState({ transactionLoad: false})
             console.log('Contract mined! address: ' + contract.address + ' transactionHash: ' + contract.transactionHash);
             this.setState({ contractAdress: contract.address })
             this.setState({ contractTransactionHash: contract.transactionHash })
             let contracts = this.state.contracts;
             contracts.push(contract.address)
             this.setState({ contracts: contracts})
          }
       })
    }
  }

  render() {

    return (
      <div>
        {'undefined' === typeof web3 ? <div className="not-log-in">Web3 account not found</div> : <div className="log-in">Log in {web3.eth.accounts[0]}</div>}
        {this.state.transactionLoad ?
          <figure>
            <img
              src="https://github.com/n1c01a5/workspace/blob/master/dapp/src/public/images/loading.gif?raw=true"
              alt="loading contract mining"
              className="mx-auto d-block" />
            <figcaption className="text-xs-center">
              contract mining (~ 20 seconds) ...
            </figcaption>
          </figure> :
          <form>
              <div className={this.state.errPartyB ? 'form-group has-error' : 'form-group'}>
                <input type="text" required value={this.state.partyB} onChange={this.handleChangePartyB} />
                <label htmlFor="input" className="control-label">address partyB</label>
                <i className="bar"></i>
                {this.state.errPartyB ?
                  <legend className="legend">Address not valid</legend> :
                  <div></div>
                }
              </div>
              <div className="float-xs-right">
                <button className={this.state.submitValueValid ? "button text-right valid" : "button text-right"} onClick={this.deploySmartContract}>
                  Deploy the smart contract
                </button>
              </div>
          </form>
        }
        {this.state.contractAdress ?
          <div className="alert alert-success" role="alert">
            <strong>Contract mined!</strong> <br/>Address: {this.state.contractAdress} <br/>TransactionHash: {this.state.contractTransactionHash}
          </div> :
          <div></div>
        }
        <div>
          <div>Contracts:</div>
          <ul>
            {this.state.contracts.map(item => (
              <li key={item}><Link to={`/examplearbitrable/${item}`}>{item}</Link></li>
            ))}
          </ul>
        </div>
      </div>
    )
  }
}

export default ExampleArbitrableForm
