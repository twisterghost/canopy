#!/usr/bin/env node
const os = require('os');
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const jsonfile = require('jsonfile');
const program = require('commander');
const mkdirp = require('mkdirp');
const { spawnSync } = require('child_process');
const toSlug = require('slugg');
const marked = require('marked');
const inquirer = require('inquirer');
const fuzzy = require('fuzzy');
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));
const TerminalRenderer = require('marked-terminal');
marked.setOptions({
  renderer: new TerminalRenderer(),
});

// Determine the config file location
const homedir = os.homedir();
const defaultConfigFile = path.join(homedir, '.canopyfile');
const configFile = process.env.hasOwnProperty('CANOPYFILE') ? process.env.CANOPYFILE : defaultConfigFile;

// If no config file exists, create a default config
if (!fs.existsSync(configFile) && process.argv[1] !== 'init') {
  const defaultDir = path.join(homedir, '.canopy');
  console.log(`No config file found. Creating new config at ${configFile}...`);
  jsonfile.writeFileSync(configFile, {
    wikiName: 'Wiki',
    dir: defaultDir,
    files: {},
    tags: {},
  });
}

// Load in the config
const config = jsonfile.readFileSync(configFile);
mkdirp.sync(config.dir);

function save() {
  jsonfile.writeFileSync(configFile, config);
}

async function editSync(filename, content = '') {
  const filepath = path.join(config.dir, filename);

  const editor = process.env.EDITOR || 'vim';
  const child = spawnSync(editor, [filepath], {
    stdio: 'inherit',
  });

  const newContent = fs.readFileSync(filepath, 'utf8');
  return newContent;
}

function getFileBySlug(slug) {
  if (!config.files.hasOwnProperty(slug)) {
    return undefined;
  }

  return config.files[slug];
}

function displayFile(slug) {
  if (!config.files.hasOwnProperty(slug)) {
    console.log('Article not found.');
    process.exit(1);
  }

  const entry = config.files[slug];
  const data = fs.readFileSync(path.join(config.dir, entry.filename), 'utf8');
  const fullData = `# ${entry.title}\n${data}`;
  console.log(marked(fullData));
}

function getArticlePromptOptions(tag = '') {
  if (tag.length > 0) {
    return _.map(_.filter(config.files, file => file.tags.includes(tag)), entry => ({name: entry.title, value: entry.slug}));
  }
  return _.map(config.files, entry => ({name: entry.title, value: entry.slug}));
}

function getFuzzyArticlePromptOptions(partial = '', tag = '') {
  const input = partial;
  const list = getArticlePromptOptions(tag);

  const options = {
    extract: el => el.name
  };

  return _.map(fuzzy.filter(input, list, options), 'original');
}

function getTagPromptOptions() {
  return Object.keys(config.tags);
}

function getFuzzyTagPromptOptions(partial) {
  const input = partial || '';
  const list = getTagPromptOptions();

  const options = {
    extract: el => toSlug(el),
  }

  return _.map(fuzzy.filter(input, list, options), 'original');
}

async function pickArticle(tag = '') {
  const answers = await inquirer.prompt([{
    type: 'autocomplete',
    name: 'article',
    message: 'Choose an article',
    source: (answersSoFar, input) => Promise.resolve(getFuzzyArticlePromptOptions(input, tag)),
  }]);
  return answers.article;
}

async function pickTag(suggestOnly = true) {
  const answers = await inquirer.prompt([{
    type: 'autocomplete',
    name: 'tag',
    message: 'Choose a tag',
    source: (answersSoFar, input) => Promise.resolve(getFuzzyTagPromptOptions(input)),
    suggestOnly,
  }]);
  return toSlug(answers.tag);
}

function deleteArticle(slug) {
  const file = getFileBySlug(slug);
  fs.unlinkSync(path.join(config.dir, file.filename));
  delete config.files[slug];
  jsonfile.writeFileSync(configFile, config);
}

async function getOrPromptForArticle(title, tag = '') {
  if (title) {
    const slug = toSlug(title);
    if (config.files[slug]) {
      return slug;
    }

    console.error(`No such article "${title}"`);
    process.exit(1);
  }

  return pickArticle(tag);
}

async function getOrPromptForTag(tagName, suggestOnly = true) {
  if (tagName) {
    return toSlug(tagName);
  }

  return pickTag(suggestOnly);
}

function tagArticle(articleSlug, tagSlug) {
  if (!config.files[articleSlug]) {
    console.error('Article does not exist.');
    process.exit(1);
  }

  if (tagSlug.length === 0) {
    console.error('Invalid tag name.');
    process.exit(1);
  }

  // Create the tag if it doesnt exist
  if (!config.tags[tagSlug]) {
    config.tags[tagSlug] = [];
  }

  if (!config.tags[tagSlug].includes(articleSlug)) {
    config.tags[tagSlug] = config.tags[tagSlug].concat(articleSlug);
  }

  // Add the tag on the article if its not there
  const fileData = config.files[articleSlug];
  if (!fileData.tags) {
    fileData.tags = [tagSlug];
  } else {
    fileData.tags = fileData.tags.concat(tagSlug);
  }
  save();
}

program
  .command('new <title>')
  .action(async function(title) {
    const slug = toSlug(title);
    const filename = `${slug}.md`;
    const content = editSync(filename);
    const metadata = {
      title,
      slug,
      filename: `${slug}.md`,
      tags: [],
    };
    config.files[slug] = metadata;
    jsonfile.writeFileSync(configFile, config);
    console.log(`Created new entry titled ${title} at ${filename}`);
  });

program
  .command('read [title]')
  .action(async function(title) {
    displayFile(await getOrPromptForArticle(title));
  });

program
  .command('edit [title]')
  .action(async function(title) {
    const slug = await getOrPromptForArticle(title);
    const filename = config.files[slug].filename;
    editSync(filename);
  });

program
  .command('del [title]')
  .action(async function(title) {
    deleteArticle(await getOrPromptForArticle(title));
    console.log('Deleted article.');
  });

program
  .command('tag [title] [tagName]')
  .action(async function(title, tagName) {
    const article = await getOrPromptForArticle(title);
    const tag = await getOrPromptForTag(tagName);
    console.log('Chosen tag: ' + tag);
    tagArticle(article, tag);
  });

program
  .command('browse [tagName]')
  .action(async function(tagName) {
    const tag = await getOrPromptForTag(tagName, false);
    console.log(`Browsing entries of tag "${tag}"...`);
    try {
      displayFile(await getOrPromptForArticle(undefined, tag));
    } catch (e) {
      console.error(e);
    }
  });


program.parse(process.argv);
