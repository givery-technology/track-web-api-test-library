#!/usr/bin/env node

const YAML = require('yaml');
const lib = require('..');
const { docopt } = require('docopt');
const path = require('path');
const { promisify } = require('util');
const _ = lib.i18n.text;
const _fs = require('fs');

const fs = { // fs.promises is not stable in Node v10
    mkdir: promisify(_fs.mkdir),
    stat: promisify(_fs.stat),
    readFile: promisify(_fs.readFile),
    readdir: promisify(_fs.readdir),
    writeFile: promisify(_fs.writeFile),
};

const USAGE = `
Command line tool for track Web API challenges

Usage:
  track-web-api debug <test.public.yml>
  track-web-api migrate-track-yml [<track.yml> -- <test.public.yml>... -- <test.secret.yml>...]
  track-web-api -h | --help

Options:
  --clean   Remove db.sqlite before execution.
`;

(async () => {
    let args = docopt(USAGE);
    if (args['debug']) {
        await debug(args['<test.public.yml>']);
    } else if (args['migrate-track-yml']) {
        await migrateTrackYml(args['<track.yml>'], args['<test.public.yml>'], args['<test.secret.yml>']);
    }
})().then(
    () => process.exit(0),
    e => {
        console.error(e);
        process.exit(1);
    },
);

async function debug(testYaml) {
    const testcase = YAML.parse(await fs.readFile(process.stdin.fd, 'utf-8'));
    const testRunner = new lib.TestRunner(process.env.CHALLENGE_LANGUAGE, String(testYaml));
    const result = await testRunner.exec(testcase);

    const stderr = result.stderr.join('\n').trim();
    if (stderr.length > 0) {
        console.error(stderr);
    }
    const stdout = result.stdout.join('\n').trim();
    if (stdout.length > 0) {
        console.log(stdout);
    }
}

async function migrateTrackYml(trackYml, publicTestcasesYml, secretTestcasesYml) {
    trackYml = trackYml || path.join(process.cwd(), 'track.yml');
    const testdir = await fs.readdir(path.join(process.cwd(), 'test'), 'utf-8');
    publicTestcasesYml = (!!publicTestcasesYml && publicTestcasesYml.length) > 0 ? publicTestcasesYml :
        testdir
            .filter(f => f.indexOf('public') > -1 && f.endsWith('.yml'))
            .map(f => path.join(process.cwd(), 'test', f));
    secretTestcasesYml = (!!secretTestcasesYml && secretTestcasesYml.length) > 0 ? secretTestcasesYml :
        testdir
            .filter(f => f.indexOf('secret') > -1 && f.endsWith('.yml'))
            .map(f => path.join(process.cwd(), 'test', f));
    const testRunner = new lib.TestRunner(process.env.CHALLENGE_LANGUAGE, publicTestcasesYml[0]);

    const publicTestcases = (await Promise.all(publicTestcasesYml
        .map(path => fs.readFile(path, 'utf-8'))))
        .flatMap(yml => YAML.parse(yml).testcases)
        .map(testcase => testRunner.normalizeTestcase(testcase));
    const secretTestcases = (await Promise.all(secretTestcasesYml
        .map(path => fs.readFile(path, 'utf-8'))))
        .flatMap(yml => YAML.parse(yml).testcases)
        .map(testcase => testRunner.normalizeTestcase(testcase));
    const debugTestcases = publicTestcases
        .filter(testcase => testcase.debug !== false);

    const input = debugTestcases.map(testcase => toDebugInput(testcase, testRunner));
    const trackYmlContent = YAML.parse(await promisify(fs.readFile)(trackYml, 'utf-8'));
    trackYmlContent.debug = {
        command: `cat $f | node node_modules/track-web-api-test-library/bin/track-web-api.js debug ${
            path.relative(path.dirname(trackYml), publicTestcasesYml[0])
        }`,
        input: input
    };
    trackYmlContent.testcases = {
        open: publicTestcases.length,
        secret: secretTestcases.length,
    };
    await fs.writeFile(trackYml, YAML.stringify(trackYmlContent), 'utf-8');
}

function toDebugInput(testcase, testRunner) {
    testcase = testRunner.normalizeTestcase(testcase);
    const title = testRunner.render(
        testcase.title[process.env.CHALLENGE_LANGUAGE || 'ja'] || testcase.title,
        testcase.params,
    );
    const body = testRunner.render(
        {
            generate: testcase.generate,
            exec: testcase.exec,
        },
        Object.assign({ token: '{{{token}}}'}, testcase.params),
    );
    return `[${title}]${YAML.stringify(body)}`;
}
