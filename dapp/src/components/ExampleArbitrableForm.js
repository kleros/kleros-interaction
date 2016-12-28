import React, { Component } from 'react'
import FontAwesome from 'react-fontawesome'
import GithubCorner from 'react-github-corner'
import { keccak_256 } from 'js-sha3'
import { Button, Jumbotron, Navbar, NavbarBrand, Nav, NavItem, NavLink, Tooltip, TooltipContent, Container, Row, Col } from 'reactstrap'
import { Link } from 'react-router'
import axios from 'axios'

import '../styles/App.scss'

class ExampleArbitrableForm extends Component {

  constructor() {
    super();
  }

  componentDidMount() {
    setTimeout(() => {
      if (typeof web3 !== 'undefined') {
        web3 = new Web3(web3.currentProvider);
        this.setState({web3: true})
      }
      this.serverRequest =
        axios
          .get("http://138.197.44.168:3000/twoPartyArbitrable/" + web3.eth.accounts[0])
          .then((result) => {
              this.setState({
                data: result.data
            });
          })
    }, 1000)
  }

  state = {
      contractAdress: null,
      contractTransactionHash: null,
      partyB: '',
      errPartyB: false,
      submitValueValid: false,
      transactionLoad: false,
      contracts: [],
      data: [],
      isWeb3: false,
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

  listContracts = () => {
    axios
      .get("http://138.197.44.168:3000/twoPartyArbitrable/" + web3.eth.accounts[0])
      .then((result) => {
          this.setState({
            data: result.data
        });
      })
  }

  deploySmartContract = (event) => {
    event.preventDefault();
    if ('undefined' === typeof web3) {
      alert("install metamask");
    } else if(!this.state.errCourt && !this.state.errPartyB && !this.state.errTimeToReact) {
      let _court = "0x4666F54695Df986D58a70089e87422d2462a6799";
      let _partyB = this.state.partyB;
      let _timeToReac = "30";
      let examplearbitrableContract = web3.eth.contract([{"constant":false,"inputs":[{"name":"executeA","type":"bool"}],"name":"executeDueToInactivity","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_secondRandom","type":"uint256"}],"name":"counterAppeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"partyA","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"requestCreator","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"partyB","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"disputeID","type":"uint256"}],"name":"ruleA","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_secondRandom","type":"uint256"}],"name":"counterRequest","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"disputeID","type":"uint256"}],"name":"ruleB","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"firstRandom","type":"uint256"}],"name":"createDispute","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_hashRandom","type":"bytes32"}],"name":"request","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"nextAppeals","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"hashRandom","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"lastAction","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"disputeID","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"n","type":"uint256"}],"name":"hash","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"state","outputs":[{"name":"","type":"uint8"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_hashRandom","type":"bytes32"}],"name":"appeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"timeToReac","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"firstRandom","type":"uint256"}],"name":"createAppeal","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"secondRandom","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"inputs":[{"name":"_court","type":"address"},{"name":"_partyB","type":"address"},{"name":"_timeToReac","type":"uint256"}],"payable":false,"type":"constructor"}]);
      let examplearbitrable = examplearbitrableContract.new(
         _court,
         _partyB,
         _timeToReac,
         {
           from: web3.eth.accounts[0],
           data: '60606040523461000057604051606080610c858339810160409081528151602083015191909201515b8282825b825b60008054600160a060020a031916600160a060020a0383161790555b5060018054600160a060020a03338116600160a060020a031992831617909255600280549285169290911691909117905560038190555b5050505b5050505b610bed806100986000396000f300606060405236156100f65763ffffffff60e060020a6000350416630358071281146100fb5780630dc303971461010f57806310e1d8ca1461012157806313680e131461014a57806329040113146101735780632d7da8891461019c5780633b8f0ef4146101ae57806341a82cc1146101c05780634ac8a529146101d257806359c87d70146101e45780638196e820146101f6578063880f2cb31461021557806389f71d5314610234578063b0a1e2b414610253578063b189fd4c14610272578063c19d93fb14610294578063ece1de44146102c2578063ef1f0428146102d4578063f0b070ca146102f3578063fd2192cb14610305575b610000565b346100005761010d6004351515610324565b005b346100005761010d600435610502565b005b346100005761012e610606565b60408051600160a060020a039092168252519081900360200190f35b346100005761012e610615565b60408051600160a060020a039092168252519081900360200190f35b346100005761012e610624565b60408051600160a060020a039092168252519081900360200190f35b346100005761010d600435610633565b005b346100005761010d60043561065c565b005b346100005761010d6004356106e7565b005b346100005761010d600435610710565b005b346100005761010d60043561080d565b005b3461000057610203610889565b60408051918252519081900360200190f35b346100005761020361088f565b60408051918252519081900360200190f35b3461000057610203610895565b60408051918252519081900360200190f35b346100005761020361089b565b60408051918252519081900360200190f35b34610000576102036004356108a1565b60408051918252519081900360200190f35b34610000576102a16108b9565b6040518082600281116100005760ff16815260200191505060405180910390f35b346100005761010d6004356108c2565b005b34610000576102036109b7565b60408051918252519081900360200190f35b346100005761010d6004356109bd565b005b3461000057610203610b2c565b60408051918252519081900360200190f35b60015433600160a060020a03908116911614801590610352575060025433600160a060020a03908116911614155b1561035c57610000565b6003546009544203101561036f57610000565b60065433600160a060020a03908116911614801561038d5750600554155b80610431575060065433600160a060020a039081169116148015906103b3575060055415155b80156103bf5750600754155b80156104315750600060009054906101000a9004600160a060020a0316600160a060020a031663788d38516000604051602001526040518163ffffffff1660e060020a028152600401809050602060405180830381600087803b156100005760325a03f1156100005750506040515190505b5b806104cb575060065433600160a060020a03908116911614801590610458575060075415155b80156104cb5750600060009054906101000a9004600160a060020a0316600160a060020a03166308b83b086000604051602001526040518163ffffffff1660e060020a028152600401809050602060405180830381600087803b156100005760325a03f115610000575050604051511590505b5b156100f65780156104e7576104e2600754610b32565b6104f2565b6104f2600754610b55565b5b6104fd565b610000565b5b5b50565b60015433600160a060020a03908116911614801590610530575060025433600160a060020a03908116911614155b1561053a57610000565b600654600160a060020a0390811690331681141561055757610000565b6004541580610567575060055415155b806105ec5750600854600060009054906101000a9004600160a060020a0316600160a060020a031663b098bdba6007546000604051602001526040518263ffffffff1660e060020a02815260040180828152602001915050602060405180830381600087803b156100005760325a03f115610000575050506040518051905060010114155b156105f657610000565b6005829055426009555b5b505b50565b600154600160a060020a031681565b600654600160a060020a031681565b600254600160a060020a031681565b60005433600160a060020a0390811691161461064e57610000565b6104fd81610b32565b5b5b50565b60015433600160a060020a0390811691161480159061068a575060025433600160a060020a03908116911614155b1561069457610000565b600654600160a060020a039081169033168114156106b157610000565b60045415806106c1575060055415155b806105ec575060075415155b156105f657610000565b6005829055426009555b5b505b50565b60005433600160a060020a0390811691161461070257610000565b6104fd81610b55565b5b5b50565b600654600160a060020a03908116903316811461072c57610000565b60045460408051848152905190819003602001902014158061074e5750600554155b8061075a575060075415155b1561076457610000565b6000805460055460408051602090810185905281517f4ac8a52900000000000000000000000000000000000000000000000000000000815292871860048401529051600160a060020a0390931693634ac8a529936024808501949192918390030190829087803b156100005760325a03f115610000575050604051516007555060016008556000600481905560055560068054600160a060020a0319169055426009555b5b5050565b60015433600160a060020a0390811691161480159061083b575060025433600160a060020a03908116911614155b1561084557610000565b600454151580610856575060075415155b1561086057610000565b600481905560068054600160a060020a03191633600160a060020a0316179055426009555b5b50565b60085481565b60045481565b60095481565b60075481565b6040805182815290519081900360200190205b919050565b600a5460ff1681565b60015433600160a060020a039081169116148015906108f0575060025433600160a060020a03908116911614155b156108fa57610000565b6004541515806108565750600854600060009054906101000a9004600160a060020a0316600160a060020a031663b098bdba6007546000604051602001526040518263ffffffff1660e060020a02815260040180828152602001915050602060405180830381600087803b156100005760325a03f115610000575050506040518051905060010114155b1561086057610000565b600481905560068054600160a060020a03191633600160a060020a0316179055426009555b5b50565b60035481565b600654600160a060020a0390811690331681146109d957610000565b6004546040805184815290519081900360200190201415806109fb5750600554155b80610a805750600854600060009054906101000a9004600160a060020a0316600160a060020a031663b098bdba6007546000604051602001526040518263ffffffff1660e060020a02815260040180828152602001915050602060405180830381600087803b156100005760325a03f115610000575050506040518051905060010114155b15610a8a57610000565b60008054600754600554604080517f913b29580000000000000000000000000000000000000000000000000000000081526004810193909352908618602483015251600160a060020a039092169263913b29589260448084019382900301818387803b156100005760325a03f115610000575050600880546001019055506000600481905560055560068054600160a060020a0319169055426009555b5b5050565b60055481565b6007548114610b4057610000565b610b4981610b78565b6104fd610b89565b5b50565b6007548114610b6357610000565b610b4981610bb0565b6104fd610b89565b5b50565b600a805460ff191660011790555b50565b60006004819055600581905560068054600160a060020a031916905560078190556008555b565b600a805460ff191660021790555b505600a165627a7a72305820045f213866c4386de07ceb80926a960544d1dae800b54470ab7d68283e4668f80029',
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

             let config = {
               headers: {"Content-Type": "application/json"}
             }

             axios
              .post("http://138.197.44.168:3000/twoPartyArbitrable", {
                 adressUser: web3.eth.accounts[0],
                 adressContract: contract.address
                 }, config)
                 .then((response) => {
                   console.log(response);
                   let data = this.state.data
                   data.push({adressUser: web3.eth.accounts[0], adressContract: contract.address})
                   this.setState({
                     data: data
                   })
                 })
                 .catch((error) => {
                   console.log(error);
               })
          }
       })
    }
  }

  render() {
    const isWeb3 = this.state.web3
    return (
      <div>
        <div id="preload">
          <img src="https://github.com/n1c01a5/workspace/blob/master/dapp/src/public/images/loading.gif?raw=true" width="1" height="1" alt="Image 01" />
        </div>
        {!isWeb3 ? (
          <div className="not-log-in">Web3 account not found</div>
        ) : (
          <div className="log-in">Log in {web3.eth.accounts[0]}</div>
        )}
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
                {this.state.submitValueValid ?
                  <Button color="primary" onClick={this.deploySmartContract}>
                    Deploy the smart contract
                  </Button>
                  :
                  <Button disabled>
                    Deploy the smart contract
                  </Button>
                }
              </div>
          </form>
        }
        {this.state.contractAdress ?
          <div className="alert alert-success" role="alert">
            <strong>Contract mined!</strong> <br/>Address: {this.state.contractAdress} <br/>TransactionHash: {this.state.contractTransactionHash}
          </div>
          : <div></div>
        }
        <div>
          <div>List contracts:</div>
            <ul>
              {this.listContracts && this.state.data.map((party, key) => (
                <li key={key}><Link to={`/examplearbitrable/${party.adressContract}`}>{party.adressContract}</Link></li>
              ))}
            </ul>
          </div>
        </div>
      )
  }
}

export default ExampleArbitrableForm
