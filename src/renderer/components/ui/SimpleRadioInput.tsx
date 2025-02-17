import * as React from 'react';

import en from "../../data/en";

export default class SimpleRadioInput extends React.Component {
  readonly props: {
    label: string,
    groupName: string,
    value: string,
    keys: Array<string>,
    bold?: boolean // Default false
    bottom?: boolean // Default true
    onChange: (value: string) => void
  };

  render() {
    const bold = this.props.bold != null ? this.props.bold : false;
    const bottom = this.props.bottom != null ? this.props.bottom : true;
    return (
      <div className={`SimpleRadioInput ${bottom ? '' : 'm-no-margin-bottom'}`}>
        <label>{this.props.label}</label>
        <div>
          {this.props.keys.map((k) =>
            <span className="SimpleRadioInput__Choice" key={this.props.groupName + "-" + k}>
              <input
                type="radio"
                name={this.props.groupName}
                value={k}
                checked={this.props.value == k}
                onChange={this.onChange.bind(this)}>
              </input>
              <span onClick={this.props.onChange.bind(this, k)} style={bold && this.props.value == k ? {fontWeight: "bolder"} : {}}>
                {en.get(k) != null ? en.get(k) : k}
              </span>
            </span>
          )}
        </div>
      </div>
    );
  }

  onChange(e: React.FormEvent<HTMLSelectElement>) {
    this.props.onChange(e.currentTarget.value);
  }
}
