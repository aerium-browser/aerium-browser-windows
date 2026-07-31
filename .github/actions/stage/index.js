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

        // Immediately after a large download, Windows Defender's on-access
        // scanner can still hold a lock on the freshly-written zip for a
        // moment, making 7z fail with "The process cannot access the file
        // because it is being used by another process." A short retry
        // clears this transient race without masking a real extraction
        // failure (a corrupt/missing archive fails the same way on every
        // attempt).
        for (let attempt = 1; ; attempt++) {
            try {
                await exec.exec('7z', ['x', 'C:\\ungoogled-chromium-windows\\build\\artifacts.zip',
                    '-oC:\\ungoogled-chromium-windows\\build', '-y']);
                break;
            } catch (err) {
                if (attempt >= 5) {
                    throw err;
                }
                console.log(`7z extract failed (attempt ${attempt}), retrying in 5s: ${err}`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
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
    // A fast non-zero exit is either a real error (patch/gn/clone failure -
    // reproduces identically every attempt) or a crashy build action. The
    // devtools-frontend rollup bundling is the known crashy one here:
    // @rollup/wasm-node's node.exe dies with a bare 0xC0000005 access
    // violation (exit=3221225477, no stderr) on a DIFFERENT bundle target
    // each time - runs 30147140738 (issue_counter.js, 57min) and
    // 30156502322 (source_map_scopes.js, 39min) both died this way.
    //
    // Retrying in-place is the right tool: the tree persists in the
    // workspace, so ninja resumes incrementally and each attempt carries the
    // build further through the bundling phase. One retry isn't enough when
    // the crash can recur on any of the many bundle targets, so allow a few -
    // a genuine error still burns only minutes, since it re-fails instantly
    // every time rather than making progress.
    const MAX_FAST_FAIL_ATTEMPTS = 3;
    let buildStart, buildMinutes, retCode;
    for (let attempt = 1; attempt <= MAX_FAST_FAIL_ATTEMPTS; ++attempt) {
        buildStart = Date.now();
        retCode = await exec.exec('python', args, {
            cwd: 'C:\\ungoogled-chromium-windows',
            ignoreReturnCode: true
        });
        buildMinutes = (Date.now() - buildStart) / 60000;
        // Success, or a slow failure (the stage hit build.py's own 3.5h ninja
        // timeout) - either way this attempt loop is done.
        if (retCode === 0 || buildMinutes >= 60) {
            break;
        }
        if (attempt < MAX_FAST_FAIL_ATTEMPTS) {
            console.log(`build.py failed after ${buildMinutes.toFixed(1)} minutes (exit ${retCode}) - attempt ${attempt}/${MAX_FAST_FAIL_ATTEMPTS}, retrying in place (ninja resumes incrementally)...`);
        }
    }
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
        core.setFailed(`build.py failed after only ${buildMinutes.toFixed(1)} minutes (exit ${retCode}) on all ${MAX_FAST_FAIL_ATTEMPTS} attempts - real error, not a stage timeout. Not uploading a checkpoint.`);
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
                    'C:\\ungoogled-chromium-windows\\build', {retentionDays: 10, compressionLevel: 0});
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
                    'C:\\ungoogled-chromium-windows', {retentionDays: 10, compressionLevel: 0});
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
