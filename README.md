# Canopy

This is a WIP project. The goal is a small terminal based wiki.

## Installation

* Clone it
* `npm i`

## Usage

```shell
new <title>
read [title]
edit [title]
del [title]
tag [title] [tagName]
```

You can enter an interactive fuzzy-find list of entries by omitting the title on any command but `new`.

It will read from a `.canopyfile` for configuration. If one doesn't exist, it'll make it.

You can change the location of the `.canopyfile` by setting `CANOPYFILE` as a path in your env.

## Roadmap

I've open sourced this, but it's not currently my main project. It does enough to fill the role I made
it for. I would like to see it realized some day but not quite this moment.

- [ ] Tagging
- [ ] Exporting
- [ ] Search
