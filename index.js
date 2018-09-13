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
    tags: [],
  });
}

// Load in the config
const config = jsonfile.readFileSync(configFile);
mkdirp.sync(config.dir);

async function editSync(filename, content = '') {
  fs.writeFileSync(filename, content, 'utf8');

  const editor = process.env.EDITOR || 'vim';
  const child = spawnSync(editor, [filename], {
    stdio: 'inherit',
  });

  const newContent = fs.readFileSync(filename, 'utf8');
  fs.writeFileSync(path.join(config.dir, filename), newContent, 'utf8');
  fs.unlinkSync(filename);
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

function getArticlePromptOptions() {
  return _.map(config.files, entry => ({name: entry.title, value: entry.slug}));
}

function getFuzzyArticlePromptOptions(partial) {
  const input = partial || '';
  const list = getArticlePromptOptions();

  const options = {
    extract: el => el.name
  };

  return _.map(fuzzy.filter(input, list, options), 'original');
}

async function pickArticle() {
  const answers = await inquirer.prompt([{
    type: 'autocomplete',
    name: 'article',
    message: 'Choose an article',
    source: (answersSoFar, input) => Promise.resolve(getFuzzyArticlePromptOptions(input)),
  }]);
  return answers.article;
}

function deleteArticle(slug) {
  const file = getFileBySlug(slug);
  fs.unlinkSync(path.join(config.dir, file.filename));
  delete config.files[slug];
  jsonfile.writeFileSync(configFile, config);
}

getFuzzyArticlePromptOptions('the');

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
    };
    config.files[slug] = metadata;
    jsonfile.writeFileSync(configFile, config);
    console.log(`Created new entry titled ${title} at ${filename}`);
  });

program
  .command('read [title]')
  .action(async function(title) {
    if (title) {
      displayFile(toSlug(title));
    } else {
      displayFile(await pickArticle());
    }
  });

program
  .command('del [title]')
  .action(async function(title) {
    if (title) {
      const slug = toSlug(title);
      if (config.files[slug]) {
        deleteArticle(slug);
        console.log(`Deleted article "${title}"`);
      } else {
        console.log(`No such article "${title}"`);
      }
    } else {
      const slug = await pickArticle();
      deleteArticle(slug);
      console.log('Deleted article.');
    }
  });


program.parse(process.argv);
