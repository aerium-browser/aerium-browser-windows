import * as core from '@actions/core';
import * as io from '@actions/io';
import * as exec from '@actions/exec';
import * as fs from 'fs';
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

        // The restored tree came from a different machine via a zip
        // round-trip. 7z's -mtc=on preserves NTFS timestamps, but ninja's
        // incremental correctness still rests on each output's current mtime
        // matching what .ninja_log recorded - `-t restat` re-syncs the log
        // to the files' actual on-disk state without rebuilding anything
        // (https://ninja-build.org/manual.html#_extra_tools). Cheap
        // insurance against any mtime drift in the archive round-trip; a
        // no-op when the tree is already consistent.
        const ninjaExe = 'C:\\ungoogled-chromium-windows\\build\\src\\third_party\\ninja\\ninja.exe';
        if (fs.existsSync(ninjaExe)) {
            await exec.exec(ninjaExe, ['-C', 'C:\\ungoogled-chromium-windows\\build\\src\\out\\Default',
                '-t', 'restat'], {ignoreReturnCode: true});
        }
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
    const buildStart = Date.now();
    const retCode = await exec.exec('python', args, {
        cwd: 'C:\\ungoogled-chromium-windows',
        ignoreReturnCode: true
    });
    const buildMinutes = (Date.now() - buildStart) / 60000;
    // build.py's internal ninja timeout is 3.5h, so a stage that exits
    // non-zero after only minutes did NOT time out - it hit a real error
    // (clone failure, patch failure, gn failure). Without this check every
    // such error gets checkpointed and "resumed" by the next stage, which
    // re-fails the same way in minutes, silently burning all 24 stages
    // (run 29987588482 lost ~4h to a depot_tools patch failure this way,
    // with every stage reporting success). A genuine compile error later
    // than the threshold still gets caught: the NEXT stage restores the
    // tree, re-hits the error within minutes, and trips this. Skipping the
    // checkpoint upload on fast-fail also keeps a broken tree from
    // overwriting the last good checkpoint on resumed runs.
    if (retCode !== 0 && buildMinutes < 60) {
        core.setFailed(`build.py failed after only ${buildMinutes.toFixed(1)} minutes (exit ${retCode}) - real error, not a stage timeout. Not uploading a checkpoint.`);
        return;
    }
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
