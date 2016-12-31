import React, { Component } from 'react'
import GithubCorner from 'react-github-corner';

import 'styles/App.scss'

class Footer extends Component {

  state = {}

  render() {

    return (
      <div>
        <hr className="my-2" />
        <footer>EtherCourt.io</footer>
        <GithubCorner href="https://github.com/ethercourt" />
      </div>
    )
  }
}

export default Footer
