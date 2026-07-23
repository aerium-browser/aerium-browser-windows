import * as core from '@actions/core';
import * as io from '@actions/io';
import * as exec from '@actions/exec';
import { DefaultArtifactClient } from '@actions/artifact';
import * as glob from '@actions/glob';

async function run() {
    process.on('SIGINT', function() {
    })
    const finished = core.getBooleanInput('finished', {required: true});
    const from_artifact = core.getBooleanInput('from_artifact', {required: true});
    const resumeRunId = core.getInput('resume_run_id', {required: false});
    const githubToken = core.getInput('github_token', {required: false});
    const x86 = core.getBooleanInput('x86', {required: false})
    const arm = core.getBooleanInput('arm', {required: false})
    console.log(`finished: ${finished}, artifact: ${from_artifact}, resume_run_id: ${resumeRunId || '(none)'}`);
    if (finished) {
        core.setOutput('finished', true);
        return;
    }

    const artifact = new DefaultArtifactClient();
    const artifactName = x86 ? 'build-artifact-x86' : (arm ? 'build-artifact-arm' : 'build-artifact');

    if (from_artifact) {
        // Cross-run resume (build-1 of a fresh dispatch picking up a dead
        // run's last checkpoint) needs findBy - same-run lookups (build-2
        // onward, every normal case) use the runner's own internal token and
        // don't need it. Without this, a crashed run's progress is
        // unrecoverable: DefaultArtifactClient.getArtifact() with no findBy
        // only ever sees the CURRENT run's own artifacts.
        const findBy = resumeRunId ? {
            token: githubToken,
            workflowRunId: parseInt(resumeRunId, 10),
            repositoryOwner: process.env.GITHUB_REPOSITORY.split('/')[0],
            repositoryName: process.env.GITHUB_REPOSITORY.split('/')[1],
        } : undefined;
        const artifactInfo = await artifact.getArtifact(artifactName, findBy ? {findBy} : undefined);
        await artifact.downloadArtifact(artifactInfo.artifact.id, {path: 'C:\\ungoogled-chromium-windows\\build', findBy});
        await exec.exec('7z', ['x', 'C:\\ungoogled-chromium-windows\\build\\artifacts.zip',
            '-oC:\\ungoogled-chromium-windows\\build', '-y']);
        await io.rmRF('C:\\ungoogled-chromium-windows\\build\\artifacts.zip');
    }

    const args = ['build.py', '--ci', '-j', '2']
    if (x86)
        args.push('--x86')
    if (arm)
        args.push('--arm')
    await exec.exec('python', ['-m', 'pip', 'install', 'httplib2==0.22.0'], {
        cwd: 'C:\\ungoogled-chromium-windows',
        ignoreReturnCode: true
    });
    const retCode = await exec.exec('python', args, {
        cwd: 'C:\\ungoogled-chromium-windows',
        ignoreReturnCode: true
    });
    if (retCode === 0) {
        core.setOutput('finished', true);
        const globber = await glob.create('C:\\ungoogled-chromium-windows\\build\\aerium*',
            {matchDirectories: false});
        let packageList = await globber.glob();
        const finalArtifactName = x86 ? 'chromium-x86' : (arm ? 'chromium-arm' : 'chromium');
        for (let i = 0; i < 5; ++i) {
            try {
                await artifact.deleteArtifact(finalArtifactName);
            } catch (e) {
                // ignored
            }
            try {
                await artifact.uploadArtifact(finalArtifactName, packageList,
                    'C:\\ungoogled-chromium-windows\\build', {retentionDays: 4, compressionLevel: 0});
                break;
            } catch (e) {
                console.error(`Upload artifact failed: ${e}`);
                // Wait 10 seconds between the attempts
                await new Promise(r => setTimeout(r, 10000));
            }
        }
    } else {
        await new Promise(r => setTimeout(r, 5000));
        await exec.exec('7z', ['a', '-tzip', 'C:\\ungoogled-chromium-windows\\artifacts.zip',
            'C:\\ungoogled-chromium-windows\\build\\src', '-mx=3', '-mtc=on'], {ignoreReturnCode: true});
        for (let i = 0; i < 5; ++i) {
            try {
                await artifact.deleteArtifact(artifactName);
            } catch (e) {
                // ignored
            }
            try {
                await artifact.uploadArtifact(artifactName, ['C:\\ungoogled-chromium-windows\\artifacts.zip'],
                    'C:\\ungoogled-chromium-windows', {retentionDays: 4, compressionLevel: 0});
                break;
            } catch (e) {
                console.error(`Upload artifact failed: ${e}`);
                // Wait 10 seconds between the attempts
                await new Promise(r => setTimeout(r, 10000));
            }
        }
        core.setOutput('finished', false);
    }
}

run().catch(err => core.setFailed(err.message));
