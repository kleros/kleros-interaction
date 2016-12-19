import React from 'react';
import ReactDOM from 'react-dom';
import { Router, Route, hashHistory } from 'react-router'
import App from './App';
import Docs from './Docs';
import Dapp from './Dapp';
import ExampleArbitrableContract from './components/ExampleArbitrableContract';

ReactDOM.render((
  <Router history={hashHistory}>
    <Route path="/" component={App}/>
    <Route path="/docs" component={Docs}/>
    <Route path="/dapp" component={Dapp}/>
    <Route path="/examplearbitrable/:contractAdress" component={ExampleArbitrableContract}/>
  </Router>
), document.getElementById('root'))
