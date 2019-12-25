#!/usr/bin/env node

const _ = require('./i18n').text;
const Diff = require('diff-match-patch');
const Mustache = require('mustache');
const YAML = require('yaml');
const codecheck = require('codecheck');
const expect = require('chai').expect;
const fs = require('fs');
const request = require('request-promise');

const app = codecheck.consoleApp(process.env.APP_COMMAND).consoleOut(false);
const diff = new Diff();

// polyfill for Node v10
if (!Array.prototype.flat) {
    Array.prototype.flat = function(depth) {
        var flattend = [];
        (function flat(array, depth) {
            for (let el of array) {
                if (Array.isArray(el) && depth > 0) {
                    flat(el, depth - 1);
                } else {
                    flattend.push(el);
                }
            }
        })(this, Math.floor(depth) || 1);
        return flattend;
    };
}
if (!Array.prototype.flatMap) {
    Array.prototype.flatMap = function() {
        return Array.prototype.map.apply(this, arguments).flat(1);
    };
}

class TestRunner {
    constructor(lang, config) {
        this.lang = lang || 'ja';
        if (!!config.testcases) {
            this.config = config;
        } else if (typeof config === 'string' && /\.ya?ml$/.test(config)) {
            this.config = YAML.parse(fs.readFileSync(config, 'utf-8'));
        } else {
            throw Error(`Unsupported config: ${config}`);
        }
    }

    async get(method, path, queries, body, params) {
        if (!/^(GET|POST|PUT|DELETE|OPTION)$/.test(method)) {
            [method, path, queries, body, params] = ['GET', method, path, queries, body];
        }
        return request({
            method,
            url: `${this.config.config.entryPoint}${path}`,
            qs: this.render(queries, params),
            body: this.render(body, params),
            json: true,
            resolveWithFullResponse: true
        }).then(x => x.body);
    }

    render(target, params) {
        if (typeof target === 'string') {
            return Mustache.render(target, params);
        } else if (Array.isArray(target)) {
            return target.map(t => this.render(t, params));
        } else if (target !== null && typeof target === 'object') {
            const result = {};
            for (let i in target) {
                if (target.hasOwnProperty(i)) {
                    result[i] = this.render(target[i], params);
                }
            }
            return result;
        } else {
            return target;
        }
    }

    async exec(testcase) {
        testcase.params = testcase.params || {}; // for debug feature
        const { token, state } = await this.get(
            'GET',
            '/_generate',
            testcase.on_generate.queries,
            testcase.on_generate.body,
            testcase.params
        );
        Object.assign(testcase.params, { token, state });
        return await app.codecheck.apply(app, this.render(testcase.on_exec.args, testcase.params) || []);
    }

    async check(testcase, actual) {
        expect(actual.code, _`Invalid exit code`).to.equal(Number(testcase.expected.code) || 0);
        if (testcase.expected.stdout) {
            if (testcase.expected.stdout.plain) {
                const stdout = actual.stdout.join('\n');
                const diffs = this.calculate_diff(
                    stdout,
                    this.render(testcase.expected.stdout.plain, testcase.params)
                );
                const {a, b} = this.format_diff(diffs);
                if (diffs.length > 0) {
                    expect.fail(`${_`Invalid stdout`}:\n### ${_`Expected`}:\n${a}\n### ${_`Actual`}:\n${b}`);
                }
            }
        }
    }

    runAll() {
        describe('', () => {
            for (let testcase of this.config.testcases) {
                testcase = this.normalizeTestcase(testcase);
                const title = this.render(testcase.title[this.lang] || testcase.title, testcase.params);
                it(title, async () => {
                    const actual = await this.exec(testcase);
                    await this.check(testcase, actual);
                });
            }
        });
    }

    normalizeTestcase(testcase) {
        const normalized = Object.assign({}, testcase);
        while (!!normalized.template) {
            const template = normalized.template;
            delete normalized.template;
            Object.assign(normalized, template);
        }
        return normalized;
    }

    calculate_diff(a, b) {
        const { chars1, chars2, lineArray } = diff.diff_linesToChars_(a, b);
        const diffs = diff.diff_main(chars1, chars2, false);
        diff.diff_charsToLines_(diffs, lineArray);
        return diffs;
    }

    format_diff(diffs, limit = 10) {
        const as = [], bs = [];
        diffs.forEach(([f, s]) => {
            if (f === 0) {
                as.push(s);
                bs.push(s);
            }
            if (f > 0) {
                as.push('\x1b[1;32m' + s + '\x1b[00m');
            }
            if (f < 0) {
                bs.push('\x1b[1;31m' + s + '\x1b[00m');
            }
        });
        return {
            a: as.join('').split('\n').slice(0, limit).join('\n'),
            b: bs.join('').split('\n').slice(0, limit).join('\n'),
        };
    }
}

module.exports = TestRunner;
