import * as React from "react";
import rimraf from "rimraf";
import Sortable from "sortablejs";
import {remote} from "electron";

import {arrayMove, getCachePath, getFileGroup, getSourceType} from "../../data/utils";
import {SF, ST} from "../../data/const";
import LibrarySource from "../library/LibrarySource";
import Tag from "../library/Tag";
import Config from "../../data/Config";
import SimpleOptionPicker from "../ui/SimpleOptionPicker";

export default class SourceList extends React.Component {
  readonly props: {
    sources: Array<LibrarySource>,
    config: Config,
    isSelect: boolean,
    emptyMessage: string,
    yOffset: number,
    filters: Array<string>,
    selected: Array<string>,
    onUpdateSources(sources: Array<LibrarySource>): void,
    addSources(sources: Array<string>): void,
    onUpdateSelected(selected: Array<string>): void,
    onStartEdit(isEditing: number): void,
    savePosition?(yOffset: number, filters: Array<string>, selected: Array<string>): void,
    onOpenLibraryImport?(): void,
    onPlay?(source: LibrarySource): void,
  };

  readonly state = {
    isEditing: -1,
    sortable: Sortable,
  };

  render() {
    const filtering = this.props.filters.length > 0;
    return (
      <div className="SourceList" style={{width: `${this.props.isSelect ? '143px' : '357px'}`}}>
        <div className="SourceList__Buttons u-float-right">
          {!this.props.isSelect && (
            <div className="SourceList__AddButtons">
              <div className={`u-button ${this.props.filters.length > 0 ? 'u-disabled' : 'u-clickable'}`} onClick={this.props.filters.length > 0 ? this.nop : this.onAdd.bind(this)}>+ Add local files</div>
              <div className={`u-button ${this.props.filters.length > 0 ? 'u-disabled' : 'u-clickable'}`} onClick={this.props.filters.length > 0 ? this.nop : this.onAddURL.bind(this)}>+ Add URL</div>
              {this.props.onOpenLibraryImport && (
                <div className="u-button u-clickable" onClick={this.props.onOpenLibraryImport.bind(this)}>+ Add From Library</div>
              )}
            </div>
          )}
          <SimpleOptionPicker
            label=""
            value="Sort Sources"
            disableFirst={true}
            keys={["Sort Sources"].concat(Object.values(SF))}
            onChange={this.onSort.bind(this)}
          />
        </div>

        <div id="sources" className={`SourceList__Sources ${this.props.isSelect ? 'm-select' : ''}`}>
          {this.props.sources.length == 0 && (
            <div className="SourceList__Empty">
              {filtering ? "No results" : this.props.emptyMessage}
            </div>
          )}
          {this.props.sources.map((source) =>
            <div className={`SourceList__Source ${source.offline ? 'm-offline' : ''} ${source.untagged ? 'm-untagged' : ''}`}
                 key={source.id}>
              {this.props.isSelect && (
                <input type="checkbox" value={source.url} onChange={this.onSelect.bind(this)}
                       checked={this.props.selected.includes(source.url)}/>
              )}
              {this.state.isEditing != source.id && (
                <div className="SourceList__SourceTitle u-clickable"
                     onClick={this.props.onPlay ? this.onPlay.bind(this, source) : this.onEdit.bind(this, source.id)}>
                  {source.url}
                </div>
              )}
              {this.state.isEditing == source.id && (
                <form className="SourceList__SourceTitle" onSubmit={this.onEdit.bind(this, -1)}>
                  <input
                    autoFocus
                    type="text"
                    value={source.url}
                    onBlur={this.onEdit.bind(this, -1)}
                    onChange={this.onEditSource.bind(this, source.id)}/>
                </form>
              )}
              {source.tags && this.props.onPlay &&  (
                <div id={`tags-${source.id}`} className="SourceList__SourceTags">
                  {source.tags.map((tag) =>
                    <span className="SourceList__SourceTag" key={tag.id}>{tag.name}</span>
                  )}
                </div>
              )}

              <div className="u-button u-small-icon-button u-clickable"
                   onClick={this.onRemove.bind(this, source.id)}
                   title="Remove">
                <div className="u-delete"/>
              </div>
              {this.props.config.caching.enabled && getSourceType(source.url) != ST.local && (
                <div className="u-button u-small-icon-button u-clean u-clickable"
                     onClick={this.onClean.bind(this, source.id)}
                     title="Clear cache">
                  <div className="u-clean"/>
                </div>)}
              <div className="u-button u-small-icon-button u-clickable"
                   onClick={this.onEdit.bind(this, source.id)}
                   title="Edit">
                <div className="u-edit"/>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  nop() {}

  componentDidMount() {
    this.setState({sortable:
        Sortable.create(document.getElementById('sources'), {
          animation: 150,
          easing: "cubic-bezier(1, 0, 0, 1)",
          onEnd: this.onEnd.bind(this),
        })
    });
    document.getElementById("sources").scrollTo(0, this.props.yOffset);
  }

  shouldComponentUpdate(props:any, state: any) {
    return ((this.props.isSelect !== props.isSelect) ||
      (this.props.filters !== props.filters) ||
      (this.props.selected.length !== props.selected.length) ||
      (this.props.sources !== props.sources))
  }

  componentDidUpdate(): void {
    this.state.sortable.option("disabled", this.props.filters.length > 0);
  }

  componentWillUnmount() {
    if (this.props.savePosition) {
      this.props.savePosition(document.getElementById("sources").scrollTop, this.props.filters, this.props.selected);
    }
  }

  onEnd(evt: any) {
    let newSources = this.props.sources;
    arrayMove(newSources, evt.oldIndex, evt.newIndex);
    this.props.onUpdateSources(newSources);
  }

  onPlay(source: LibrarySource) {
    this.props.savePosition(document.getElementById("sources").scrollTop, this.props.filters, this.props.selected);
    this.props.onPlay(source);
  }

  onSelect(event: any) {
    const source = event.currentTarget.value;
    let newSelected = Array.from(this.props.selected);
    if (newSelected.includes(source)) {
      newSelected.splice(newSelected.indexOf(source), 1)
    } else {
      newSelected.push(source);
    }
    this.props.onUpdateSelected(newSelected);
  }

  onAdd() {
    let result = remote.dialog.showOpenDialog(remote.getCurrentWindow(), {properties: ['openDirectory', 'multiSelections']});
    if (!result) return;
    this.props.addSources(result);
  }

  onAddURL() {
    let id = this.props.sources.length + 1;
    this.props.sources.forEach((s) => {
      id = Math.max(s.id + 1, id);
    });
    let newLibrary = Array.from(this.props.sources);
    newLibrary.unshift(new LibrarySource({
      url: "",
      id: id,
      tags: new Array<Tag>(),
    }));
    this.props.onUpdateSources(newLibrary);

    if (this.props.onPlay) {
      this.props.onStartEdit(id);
    } else {
      this.setState({isEditing: id});
    }
  }

  onEdit(sourceID: number, e: Event) {
    if (this.props.onPlay) { // This is the Library, open the Modal
      this.props.onStartEdit(sourceID);
    } else { // Otherwise, just use the simple text input
      e.preventDefault();
      this.setState({isEditing: sourceID});
      // If user left input blank, remove it from list of sources
      // Also prevent user from inputing duplicate source
      // If new entry is a duplicate, make sure we remove the new entry
      const newSources = Array<LibrarySource>();
      for (let source of this.props.sources) {
        if (source.url != "") {
          if (!newSources.map((s) => s.url).includes(source.url)) {
            newSources.push(source);
          } else {
            for (let existingSource of newSources) {
              if (existingSource.url == source.url) {
                if (existingSource.id > source.id) {
                  newSources[newSources.indexOf(existingSource)] = source;
                }
                break;
              }
            }
          }
        }
      }
      this.props.onUpdateSources(newSources);
    }
  }

  onEditSource(sourceID: number, e: React.FormEvent<HTMLInputElement>) {
    this.props.onUpdateSources(this.props.sources.map(
      function map(source: LibrarySource) {
        if (source.id == sourceID) {
          source.offline = false;
          source.lastCheck = null;
          source.url = e.currentTarget.value;
        }
        return source;
      })
    );
  }

  onClean(sourceID: number) {
    const sourceURL = this.props.sources.find((s) => s.id == sourceID).url;
    const fileType = getSourceType(sourceURL);
    if (fileType != ST.local) {
      const cachePath = getCachePath(sourceURL, this.props.config);
      if (!confirm("Are you SURE you want to delete " + cachePath + "?")) return;
      rimraf.sync(cachePath);
    }
  }

  onRemove(sourceID: number) {
    this.props.onUpdateSources(this.props.sources.filter((s) => s.id != sourceID));
  }

  onSort(algorithm: string) {
    const sources = Array.from(this.props.sources);
    switch (algorithm) {
      case SF.alphaA:
        this.props.onUpdateSources(sources.sort((a, b) => {
          const aName = getFileGroup(a.url).toLowerCase();
          const bName = getFileGroup(b.url).toLowerCase();
          if (aName < bName) {
            return -1;
          } else if (aName > bName) {
            return 1;
          } else {
            const aType = getSourceType(a.url);
            const bType = getSourceType(b.url);
            if (aType > bType) {
              return -1;
            } else if (aType < bType) {
              return 1;
            } else {
              return 0;
            }
          }
        }));
        break;
      case SF.alphaD:
        this.props.onUpdateSources(sources.sort((a, b) => {
          const aName = getFileGroup(a.url).toLowerCase();
          const bName = getFileGroup(b.url).toLowerCase();
          if (aName > bName) {
            return -1;
          } else if (aName < bName) {
            return 1;
          } else {
            const aType = getSourceType(a.url);
            const bType = getSourceType(b.url);
            if (aType > bType) {
              return -1;
            } else if (aType < bType) {
              return 1;
            } else {
              return 0;
            }
          }
        }));
        break;
      case SF.alphaFullA:
        this.props.onUpdateSources(sources.sort((a, b) => {
          const aUrl = a.url.toLowerCase();
          const bUrl = b.url.toLocaleLowerCase();
          if (aUrl < bUrl) {
            return -1;
          } else if (aUrl > bUrl) {
            return 1;
          } else {
            return 0;
          }
        }));
        break;
      case SF.alphaFullD:
        this.props.onUpdateSources(sources.sort((a, b) => {
          const aUrl = a.url.toLowerCase();
          const bUrl = b.url.toLocaleLowerCase();
          if (aUrl > bUrl) {
            return -1;
          } else if (aUrl < bUrl) {
            return 1;
          } else {
            return 0;
          }
        }));
        break;
      case SF.dateA:
        this.props.onUpdateSources(sources.sort((a, b) => {
          if (a.id < b.id) {
            return -1;
          } else if (a.id > b.id) {
            return 1;
          } else {
            return 0;
          }
        }));
        break;
      case SF.dateD:
        this.props.onUpdateSources(sources.sort((a, b) => {
          if (a.id > b.id) {
            return -1;
          } else if (a.id < b.id) {
            return 1;
          } else {
            return 0;
          }
        }));
        break;
      case SF.type:
        this.props.onUpdateSources(sources.sort((a, b) => {
          const aType = getSourceType(a.url);
          const bType = getSourceType(b.url);
          if (aType > bType) {
            return -1;
          } else if (aType < bType) {
            return 1;
          } else {
            return 0;
          }
        }));
        break;
    }
  }
}