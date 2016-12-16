import React from 'react';
import ReactDOM from 'react-dom';
import { Router, Route, hashHistory } from 'react-router'
import App from './App';
import Docs from './Docs';
import Dapp from './Dapp';

ReactDOM.render((
  <Router history={hashHistory}>
    <Route path="/" component={App}/>
    <Route path="/docs" component={Docs}/>
    <Route path="/dapp" component={Dapp}/>
  </Router>
), document.getElementById('root'))
