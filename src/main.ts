import * as core from '@actions/core';
import { EOL } from 'os';
import Setup from './lib/setup';
import Package from './lib/package';
import Tag from './lib/tag';
import Regex from './lib/regex';
import Dockerfile from './lib/docker';
import { context, getOctokit } from '@actions/github';
import { githubToken } from './lib/envs';

const pattern = core.getInput('regex_pattern', { required: false });

function getVersion(strategy: string, root: string) {

    switch (strategy) {
        case 'docker':
            return (new Dockerfile(root)).version;

        case 'package':
            // Extract using the package strategy (this is the default strategy)
            return (new Package(root)).version;

        case 'regex':
            return (new Regex(root, new RegExp(pattern, 'gim'))).version;

        default:
            core.setFailed(`"${strategy}" is not a recognized tagging strategy. Choose from: 'package' (package.json), 'docker' (uses Dockerfile), or 'regex' (JS-based RegExp).`);

            return null;
    }
}

    async function run() {
        try {
            Setup.debug();
            Setup.requireAnyEnv();

            // Configure the default output
            core.setOutput('tagcreated', 'no');

            // Identify the tag parsing strategy
            const root = core.getInput('root', { required: false }) || core.getInput('package_root', { required: false }) || './';
            const strategy = (core.getInput('regex_pattern', { required: false }) || '').trim().length > 0 ? 'regex' : ((core.getInput('strategy', { required: false }) || 'package').trim().toLowerCase());

            const version = getVersion(strategy, root);

            const msg = ` using the ${strategy} extraction${strategy === 'regex' ? ' with the /' + pattern + '/gim pattern.' : ''}.`;

            if (!version) {
                throw new Error(`No version identified${msg}`);
            }

            core.warning(`Recognized "${version}"${msg}`);
            core.setOutput('version', version);
            core.debug(` Detected version ${version}`);

            const github = await getOctokit(githubToken());
            const repo = context.repo;

            // Configure a tag using the identified version
            const tag = new Tag(
                github,
                repo,
                core.getInput('tag_prefix', { required: false }),
                version,
                core.getInput('tag_suffix', { required: false })
            );

            core.warning(`Attempting to create ${tag.name} tag.`);
            core.setOutput('tagrequested', tag.name);
            core.setOutput('prerelease', tag.prerelease ? 'yes' : 'no');
            core.setOutput('build', tag.build ? 'yes' : 'no');

            // Check for existance of tag and abort (short circuit) if it already exists.
            if (await tag.exists()) {
                core.warning(`"${tag.name}" tag already exists.` + EOL);
                core.setOutput('tagname', '');
                return;
            }

            // The tag setter will autocorrect the message if necessary.
            tag.message = core.getInput('tag_message', { required: false }).trim();
            await tag.push();

            core.setOutput('tag', tag.stringify);
            core.setOutput('tagcreated', 'yes');
        } catch (error) {
            core.warning(error as Error);
            core.setOutput('tagname', '');
            core.setOutput('tagsha', '');
            core.setOutput('taguri', '');
            core.setOutput('tagmessage', '');
            core.setOutput('tagref', '');
            core.setOutput('tagcreated', 'no');
            core.setFailed(error as Error);
        }
    }


    run();
