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
      contracts: [],
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
      let examplearbitrableContract = web3.eth.contract([{"constant":false,"inputs":[{"name":"_secondRandom","type":"uint256"}],"name":"counterAppeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"partyA","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"requestCreator","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"partyB","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"disputeID","type":"uint256"}],"name":"ruleA","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_secondRandom","type":"uint256"}],"name":"counterRequest","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"disputeID","type":"uint256"}],"name":"ruleB","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"firstRandom","type":"uint256"}],"name":"createDispute","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_hashRandom","type":"bytes32"}],"name":"request","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"nextAppeals","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"executeA","type":"bool"}],"name":"executeDueToInactvity","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"hashRandom","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"lastAction","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"disputeID","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"n","type":"uint256"}],"name":"hash","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"state","outputs":[{"name":"","type":"uint8"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_hashRandom","type":"bytes32"}],"name":"appeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"timeToReac","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"firstRandom","type":"uint256"}],"name":"createAppeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"secondRandom","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"inputs":[{"name":"_court","type":"address"},{"name":"_partyB","type":"address"},{"name":"_timeToReac","type":"uint256"}],"payable":false,"type":"constructor"}]);
      let examplearbitrable = examplearbitrableContract.new(
         _court,
         _partyB,
         _timeToReac,
         {
           from: web3.eth.accounts[0],
           data: '60606040523461000057604051606080611667833981016040528080519060200190919080519060200190919080519060200190919050505b8282825b825b80600060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505b5033600160006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555081600260006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550806003819055505b5050505b5050505b611545806101226000396000f30060606040523615610110576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff1680630dc303971461011557806310e1d8ca1461013257806313680e131461018157806329040113146101d05780632d7da8891461021f5780633b8f0ef41461023c57806341a82cc1146102595780634ac8a5291461027657806359c87d70146102935780638196e820146102b457806386eef302146102d7578063880f2cb3146102f657806389f71d5314610321578063b0a1e2b414610344578063b189fd4c14610367578063c19d93fb146103a0578063ece1de44146103ce578063ef1f0428146103ef578063f0b070ca14610412578063fd2192cb1461042f575b610000565b34610000576101306004808035906020019091905050610452565b005b346100005761013f610656565b604051808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b346100005761018e61067c565b604051808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b34610000576101dd6106a2565b604051808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b346100005761023a60048080359060200190919050506106c8565b005b34610000576102576004808035906020019091905050610732565b005b3461000057610274600480803590602001909190505061088c565b005b346100005761029160048080359060200190919050506108f6565b005b34610000576102b2600480803560001916906020019091905050610aba565b005b34610000576102c1610bee565b6040518082815260200191505060405180910390f35b34610000576102f460048080351515906020019091905050610bf4565b005b3461000057610303610f7f565b60405180826000191660001916815260200191505060405180910390f35b346100005761032e610f85565b6040518082815260200191505060405180910390f35b3461000057610351610f8b565b6040518082815260200191505060405180910390f35b34610000576103826004808035906020019091905050610f91565b60405180826000191660001916815260200191505060405180910390f35b34610000576103ad610fb1565b6040518082600281116100005760ff16815260200191505060405180910390f35b34610000576103ed600480803560001916906020019091905050610fc4565b005b34610000576103fc6111a2565b6040518082815260200191505060405180910390f35b346100005761042d60048080359060200190919050506111a8565b005b346100005761043c611413565b6040518082815260200191505060405180910390f35b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16141580156104fe5750600260009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614155b1561050857610000565b600660009054906101000a900473ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff16141561056457610000565b600060010260045460001916148061057f5750600060055414155b8061063757506008546001600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663b098bdba6007546000604051602001526040518263ffffffff167c010000000000000000000000000000000000000000000000000000000002815260040180828152602001915050602060405180830381600087803b156100005760325a03f11561000057505050604051805190500114155b1561064157610000565b81600581905550426009819055505b5b505b50565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b600660009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b600260009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614151561072457610000565b61072d81611419565b5b5b50565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16141580156107de5750600260009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614155b156107e857610000565b600660009054906101000a900473ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff16141561084457610000565b600060010260045460001916148061085f5750600060055414155b8061086d5750600060075414155b1561087757610000565b81600581905550426009819055505b5b505b50565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff161415156108e857610000565b6108f18161143e565b5b5b50565b600660009054906101000a900473ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614151561095357610000565b60045460001916826040518082815260200191505060405180910390206000191614158061098357506000600554145b806109915750600060075414155b1561099b57610000565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16634ac8a52960055484186000604051602001526040518263ffffffff167c010000000000000000000000000000000000000000000000000000000002815260040180828152602001915050602060405180830381600087803b156100005760325a03f1156100005750505060405180519050600781905550600160088190555060006001026004816000191690555060006005819055506000600660006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550426009819055505b5b5050565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614158015610b665750600260009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614155b15610b7057610000565b600060010260045460001916141580610b8c5750600060075414155b15610b9657610000565b806004816000191690555033600660006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550426009819055505b5b50565b60085481565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614158015610ca05750600260009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614155b15610caa57610000565b60035460095442031015610cbd57610000565b600660009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16148015610d1c57506000600554145b80610e395750600660009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614158015610d835750600060055414155b8015610d9157506000600754145b8015610e385750600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663788d38516000604051602001526040518163ffffffff167c0100000000000000000000000000000000000000000000000000000000028152600401809050602060405180830381600087803b156100005760325a03f11561000057505050604051805190505b5b80610f495750600660009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614158015610ea05750600060075414155b8015610f485750600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff166308b83b086000604051602001526040518163ffffffff167c0100000000000000000000000000000000000000000000000000000000028152600401809050602060405180830381600087803b156100005760325a03f1156100005750505060405180519050155b5b15610f75578015610f6457610f5f600754611419565b610f70565b610f6f60075461143e565b5b610f7a565b610000565b5b5b50565b60045481565b60095481565b60075481565b60008160405180828152602001915050604051809103902090505b919050565b600a60009054906101000a900460ff1681565b600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16141580156110705750600260009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614155b1561107a57610000565b60006001026004546000191614158061114057506008546001600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663b098bdba6007546000604051602001526040518263ffffffff167c010000000000000000000000000000000000000000000000000000000002815260040180828152602001915050602060405180830381600087803b156100005760325a03f11561000057505050604051805190500114155b1561114a57610000565b806004816000191690555033600660006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550426009819055505b5b50565b60035481565b600660009054906101000a900473ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614151561120557610000565b60045460001916826040518082815260200191505060405180910390206000191614158061123557506000600554145b806112ed57506008546001600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663b098bdba6007546000604051602001526040518263ffffffff167c010000000000000000000000000000000000000000000000000000000002815260040180828152602001915050602060405180830381600087803b156100005760325a03f11561000057505050604051805190500114155b156112f757610000565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663913b295860075460055485186040518363ffffffff167c01000000000000000000000000000000000000000000000000000000000281526004018083815260200182815260200192505050600060405180830381600087803b156100005760325a03f11561000057505050600160086000828254019250508190555060006001026004816000191690555060006005819055506000600660006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550426009819055505b5b5050565b60055481565b6007548114151561142957610000565b61143281611463565b61143a611488565b5b50565b6007548114151561144e57610000565b611457816114f4565b61145f611488565b5b50565b6001600a60006101000a81548160ff0219169083600281116100005702179055505b50565b60006001026004816000191690555060006005819055506000600660006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550600060078190555060006008819055505b565b6002600a60006101000a81548160ff0219169083600281116100005702179055505b505600a165627a7a72305820065f15ca305e56bb8c14a16592a264fe059159fd5f43972222cba046a9dc39390029',
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
          <div>List contracts:</div>
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
