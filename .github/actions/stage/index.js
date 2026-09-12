import * as core from '@actions/core';
import * as io from '@actions/io';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import { DefaultArtifactClient } from '@actions/artifact';
import * as glob from '@actions/glob';

const BUILD_ROOT = 'C:\\ungoogled-chromium-windows\\build';
const NINJA_EXE = `${BUILD_ROOT}\\src\\third_party\\ninja\\ninja.exe`;
const NINJA_OUT = `${BUILD_ROOT}\\src\\out\\Default`;

// The stage log is tail-only (the API hard-caps it around 400 KB) and the
// checkpoint upload alone emits ~1700 "Uploaded bytes" lines, so anything
// printed during the compile is gone by the time anyone reads the run. That
// left "did this stage actually make progress?" answerable only by
// inference - which is exactly the question that went unanswered for 15
// stages on the Android repo while a broken checkpoint silently discarded
// every stage's work. The job summary is never truncated, so it goes there.
function appendSummary(text) {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryPath) {
        return;
    }
    try {
        fs.appendFileSync(summaryPath, `${text}\n`);
    } catch (e) {
        console.log(`could not write job summary (non-fatal): ${e}`);
    }
}

// `ninja -n` lists the edges it *would* run without running any of them, so
// its line count is a cheap exact measure of work remaining. Costs ~1 min
// (manifest load dominates) against a 3.5h compile budget. Read the pair of
// numbers as: BEFORE on stage N+1 should be close to AFTER on stage N - if
// it jumps back up, the checkpoint is not carrying the tree forward and the
// stages are redoing each other's work.
async function remainingEdges(label) {
    if (!fs.existsSync(NINJA_EXE) || !fs.existsSync(NINJA_OUT)) {
        appendSummary(`- **${label}**: n/a (no build tree yet - first stage)`);
        return null;
    }
    let lines = 0;
    try {
        const rc = await exec.exec(
            NINJA_EXE, ['-C', NINJA_OUT, '-n', 'chrome', 'chromedriver', 'mini_installer'], {
                ignoreReturnCode: true,
                silent: true,
                listeners: {
                    stdout: data => { lines += (data.toString().match(/\n/g) || []).length; },
                },
            });
        if (rc !== 0) {
            appendSummary(`- **${label}**: n/a (ninja dry run exited ${rc})`);
            return null;
        }
    } catch (e) {
        // A diagnostic must never be able to fail the stage it is measuring.
        appendSummary(`- **${label}**: n/a (${e})`);
        return null;
    }
    console.log(`[stage-diag] ${label}: ${lines} edges remaining`);
    appendSummary(`- **${label}**: ${lines} edges remaining`);
    return lines;
}

async function run() {
    process.on('SIGINT', function() {
    })
    const finished = core.getBooleanInput('finished', {required: true});
    const stageStartMs = Date.now();
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

    // The checkpoint lives in one of two slots, alternating between stages.
    //
    // A run cannot hold two artifacts with the same name, so saving to a fixed
    // name means deleting the old checkpoint before uploading the new one -
    // and anything that interrupts that window leaves the run with no
    // checkpoint at all. That is not hypothetical: on run 33089940410 the
    // stage stopped ninja gracefully at its 3.5h limit with 2418 edges left,
    // spent 23 minutes packing the tree, deleted the previous checkpoint at
    // 02:13:12, started the upload at 02:13:13, and was killed by GitHub's
    // six-hour job cap at 02:13:22. Zero artifacts survived, auto-resume
    // correctly reported there was nothing to resume from, and five stages of
    // compiling were gone.
    //
    // With two slots the new checkpoint is written to whichever slot is not
    // holding the current one, and the old slot is deleted only after the
    // upload has actually succeeded. There is always at least one complete
    // checkpoint on disk, so the same kill loses one stage rather than all of
    // them.
    //
    // The first slot keeps the historical name, so a cross-run resume that
    // reaches back into a run made before this change still finds it.
    const artifactSlots = [artifactName, `${artifactName}-b`];

    // getArtifact() throws when the name is absent, which is an ordinary
    // answer here rather than an error - a fresh run has neither slot.
    async function findSlot(name, findBy) {
        try {
            const found = await artifact.getArtifact(name, findBy ? {findBy} : undefined);
            return found.artifact;
        } catch (e) {
            return null;
        }
    }

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
        // Whichever slot holds the newer checkpoint. Artifact ids increase
        // monotonically, so the larger id is the later upload; a run written
        // before the two-slot scheme has only the first slot and picks it.
        const found = [];
        for (const slot of artifactSlots) {
            const info = await findSlot(slot, findBy);
            if (info) {
                found.push(info);
            }
        }
        if (found.length === 0) {
            throw new Error(
                `no checkpoint to resume from: neither ${artifactSlots.join(' nor ')} exists`);
        }
        const newest = found.reduce((a, b) => (b.id > a.id ? b : a));
        console.log(`resuming from ${newest.name} (artifact ${newest.id})`);
        await artifact.downloadArtifact(newest.id, {path: 'C:\\ungoogled-chromium-windows\\build', findBy});

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
        if (fs.existsSync(NINJA_EXE)) {
            await exec.exec(NINJA_EXE, ['-C', NINJA_OUT, '-t', 'restat'], {ignoreReturnCode: true});
        }
    }

    appendSummary(`### Stage diagnostics\n`);
    const edgesBefore = await remainingEdges('before build');

    // -j 4, not the 2 inherited from upstream (ungoogled-chromium-windows
    // commit d2625ae). windows-2022 and ubuntu-latest are the same standard
    // hosted runner - 4 cores, 16 GB - and the Linux repo runs bare `ninja`
    // with no -j at all, so it self-sizes to cores+2 and keeps all four
    // busy. At -j 2 this stage was compiling on half the machine, which is
    // the bulk of why an x64 build needs 8-9 stages where Linux x86_64
    // finishes in 3 (run 31888806715: 13h28m total, vs 32h+ and unfinished
    // for run 31887907950).
    //
    // Memory is not the constraint it looks like: a clang-cl TU peaks around
    // 1-2 GB, and the genuinely hungry step - the chrome.dll ThinLTO link -
    // is serialised by GN's own concurrent_links pool regardless of -j. If a
    // compile does get OOM-killed, the retry loop below resumes ninja in
    // place rather than losing the stage.
    // How long ninja may run, rather than a fixed 3.5h.
    //
    // A stage does not start compiling when it starts: it downloads and
    // extracts a multi-gigabyte tree first, and that cost grows with the
    // tree. On run 33089940410 the restore took 1h59m, so 3.5h of ninja on
    // top of it left the 23-minute pack and the upload straddling GitHub's
    // six-hour job cap - the stage was killed eight seconds into the upload
    // and the run lost five stages of work.
    //
    // So the budget is measured, not assumed: six hours, minus what this
    // stage has already spent, minus what the checkpoint still needs. The
    // reserve covers the post-build edge count, the pack, the upload and the
    // setup steps that ran before this action did, with room to spare -
    // overrunning the cap costs a whole stage, while reserving a few minutes
    // too many costs a few minutes.
    //
    // Capped at the old 3.5h so this can only ever shorten a stage, and
    // floored at 30 minutes so a pathologically slow restore still makes some
    // progress instead of checkpointing an unchanged tree forever.
    const JOB_LIMIT_SECONDS = 6 * 60 * 60;
    const CHECKPOINT_RESERVE_SECONDS = 55 * 60;
    const MAX_NINJA_SECONDS = 3.5 * 60 * 60;
    const MIN_NINJA_SECONDS = 30 * 60;
    const spentSeconds = Math.round((Date.now() - stageStartMs) / 1000);
    const ninjaSeconds = Math.max(
        MIN_NINJA_SECONDS,
        Math.min(MAX_NINJA_SECONDS,
                 JOB_LIMIT_SECONDS - spentSeconds - CHECKPOINT_RESERVE_SECONDS));
    appendSummary(`- **compile budget**: ${(ninjaSeconds / 3600).toFixed(2)}h`
        + ` (${(spentSeconds / 60).toFixed(0)} min already spent restoring)`);

    const args = ['build.py', '--ci', '-j', '4', '--ninja-timeout', String(ninjaSeconds)]
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
    const edgesAfter = await remainingEdges('after build');
    if (edgesBefore !== null && edgesAfter !== null) {
        const done = edgesBefore - edgesAfter;
        appendSummary(`- **completed this stage**: ${done} edges in ${buildMinutes.toFixed(0)} min`
            + ` (${(done / Math.max(buildMinutes / 60, 0.01)).toFixed(0)} edges/hour)`);
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
        // Write to the free slot, keeping the existing checkpoint intact for
        // the whole of the pack-and-upload window, and only drop it once the
        // replacement is actually stored. See the slot comment above for the
        // run this is here to stop repeating.
        const current = {};
        for (const slot of artifactSlots) {
            current[slot] = await findSlot(slot);
        }
        const occupied = artifactSlots.filter(slot => current[slot]);
        let target;
        let previous = null;
        if (occupied.length === 0) {
            // Nothing to lose - first checkpoint of the run.
            target = artifactSlots[0];
        } else if (occupied.length === 1) {
            previous = occupied[0];
            target = artifactSlots.find(slot => slot !== previous);
        } else {
            // Both occupied, which means a previous stage was interrupted
            // after uploading but before it could clear the older slot.
            // Overwrite the older one and keep the newer as the fallback.
            const older = current[artifactSlots[0]].id < current[artifactSlots[1]].id
                ? artifactSlots[0] : artifactSlots[1];
            target = older;
            previous = artifactSlots.find(slot => slot !== older);
            try {
                await artifact.deleteArtifact(target);
            } catch (e) {
                // ignored - the upload below reports the real failure
            }
        }

        let uploaded = false;
        for (let i = 0; i < 5; ++i) {
            try {
                await artifact.uploadArtifact(target, ['C:\\ungoogled-chromium-windows\\artifacts.zip'],
                    'C:\\ungoogled-chromium-windows', {retentionDays: 10, compressionLevel: 0});
                uploaded = true;
                break;
            } catch (e) {
                console.error(`Upload artifact failed: ${e}`);
                // Wait 10 seconds between the attempts
                await new Promise(r => setTimeout(r, 10000));
            }
        }

        if (uploaded) {
            appendSummary(`- **checkpoint**: saved to \`${target}\``);
            if (previous) {
                try {
                    await artifact.deleteArtifact(previous);
                } catch (e) {
                    // Leaving the old slot behind costs one checkpoint of
                    // storage for its retention period and nothing else - the
                    // next stage picks the newer of the two by id.
                    console.log(`could not remove the previous checkpoint ${previous}: ${e}`);
                }
            }
        } else if (previous) {
            appendSummary(`- **checkpoint**: upload failed, resuming from \`${previous}\``);
        } else {
            appendSummary('- **checkpoint**: upload failed and there was no earlier one');
        }
        core.setOutput('finished', false);
    }
}

run().catch(err => core.setFailed(err.message));
