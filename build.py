#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# Copyright (c) 2019 The ungoogled-chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.
"""
ungoogled-chromium build script for Microsoft Windows
"""

import sys
import time
import argparse
import os
import re
import shutil
import subprocess
import ctypes
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'ungoogled-chromium' / 'utils'))
import downloads
import domain_substitution
import prune_binaries
import patches
from _common import ENCODING, USE_REGISTRY, ExtractorEnum, get_logger
sys.path.pop(0)

_ROOT_DIR = Path(__file__).resolve().parent

# Aerium: the GN targets this project owns, as label patterns for gn check.
# Deliberately not "everything" - checking all of Chromium would be slow and
# would surface upstream's problems, which are not ours to fix in a build
# script. Keep in step with _aerium_check_targets in the Linux repo's
# scripts/shared.sh.
#
# Empty since the content blocker was dropped: every remaining Aerium change
# lands inside a target Chromium already owns, and no standalone source_set of
# ours is left to check. Kept, with the loop below, so the next target Aerium
# adds is one line away from being covered.
_AERIUM_CHECK_TARGETS = []
_PATCH_BIN_RELPATH = Path('third_party/git/usr/bin/patch.exe')

# Browser brand name (replaces "Chromium" in product name, UI strings,
# shortcuts, registry paths and the user data directory)
_BRAND_NAME = 'Aerium'
_COMPANY_NAME = 'Dioide'


def _generate_patch_manifest(source_tree):
    """Writes chrome://aerium's patch list, derived from the series files."""
    out = source_tree / 'chrome' / 'browser' / 'ui' / 'webui' / 'aerium_patch_manifest.inc'
    version = (_ROOT_DIR / 'ungoogled-chromium' / 'chromium_version.txt').read_text().strip()
    subprocess.run([
        sys.executable,
        str(_ROOT_DIR / 'devutils' / 'generate_patch_manifest.py'),
        '--series', str(_ROOT_DIR / 'ungoogled-chromium' / 'patches' / 'series'),
        str(_ROOT_DIR / 'ungoogled-chromium' / 'patches'),
        '--series', str(_ROOT_DIR / 'patches' / 'series'), str(_ROOT_DIR / 'patches'),
        '--chromium-version', version,
        '-o', str(out),
    ], check=True)


def _apply_branding(source_tree):
    """Renames Chromium to Aerium (by Dioide) and swaps in the Aerium logos"""
    get_logger().info('Applying %s branding...', _BRAND_NAME)

    # BRANDING: product, installer, company and copyright
    branding_path = source_tree / 'chrome' / 'app' / 'theme' / 'chromium' / 'BRANDING'
    branding_lines = []
    for line in branding_path.read_text(encoding=ENCODING).splitlines():
        if line.startswith('PRODUCT_'):
            line = line.replace('Chromium', _BRAND_NAME)
        elif line.startswith('COMPANY_FULLNAME=') or line.startswith('COMPANY_SHORTNAME='):
            line = line.split('=', 1)[0] + '=' + _COMPANY_NAME
        elif line.startswith('COPYRIGHT='):
            line = ('COPYRIGHT=Copyright @LASTCHANGE_YEAR@ {}. '
                    'All rights reserved.'.format(_COMPANY_NAME))
        branding_lines.append(line)
    branding_path.write_text('\n'.join(branding_lines) + '\n', encoding=ENCODING)

    # Product name in every UI string source (.grd/.grdp and all .xtb
    # locales). This covers not only chromium_strings.grd but also the many
    # generated_resources/components strings that hard-code "Chromium" inside
    # <if expr> branches (e.g. "About Chromium"). Note: changed source texts
    # get new grit message IDs, so affected strings fall back to English in
    # non-English locales (fallback_to_english is enabled for these grds).
    string_roots = ('chrome', 'components', 'extensions', 'ui', 'content')
    string_suffixes = ('.grd', '.grdp', '.xtb')
    replaced_count = 0
    for root in string_roots:
        root_path = source_tree / root
        if not root_path.exists():
            continue
        for path in root_path.rglob('*'):
            if path.suffix not in string_suffixes or not path.is_file():
                continue
            try:
                text = path.read_text(encoding='utf-8')
            except (UnicodeDecodeError, OSError):
                continue
            if 'Chromium' not in text and 'ungoogled-chromium' not in text:
                continue
            new_text = text.replace('The Chromium Authors', _COMPANY_NAME)
            new_text = new_text.replace('Chromium', _BRAND_NAME)
            new_text = new_text.replace(
                'ungoogled-chromium', '{} by {}'.format(_BRAND_NAME, _COMPANY_NAME))
            if new_text != text:
                path.write_text(new_text, encoding='utf-8')
                replaced_count += 1
    get_logger().info('Renamed product in %d string files', replaced_count)

    # Install-mode constants (shortcut name, ProgIDs, registry paths, user
    # data directory)
    install_modes_path = (
        source_tree / 'chrome' / 'install_static' / 'chromium_install_modes.h')
    install_modes_text = install_modes_path.read_text(encoding='utf-8')
    install_modes_path.write_text(
        install_modes_text.replace('Chromium', _BRAND_NAME), encoding='utf-8')

    # Logo assets
    brand_dir = _ROOT_DIR / 'brand'
    theme_dir = source_tree / 'chrome' / 'app' / 'theme' / 'chromium'
    shutil.copyfile(brand_dir / 'aerium.ico', theme_dir / 'win' / 'chromium.ico')
    # File-association and app-list icons still carry the Chromium logo;
    # replace them with the Aerium logo as well.
    shutil.copyfile(brand_dir / 'aerium.ico', theme_dir / 'win' / 'chromium_doc.ico')
    shutil.copyfile(brand_dir / 'aerium.ico', theme_dir / 'win' / 'chromium_pdf.ico')
    shutil.copyfile(brand_dir / 'aerium.ico', theme_dir / 'win' / 'app_list.ico')
    shutil.copyfile(brand_dir / 'product_logo.svg', theme_dir / 'product_logo.svg')
    for png_path in brand_dir.glob('product_logo_*.png'):
        shutil.copyfile(png_path, theme_dir / png_path.name)
    for tile_path in (brand_dir / 'tiles').iterdir():
        shutil.copyfile(tile_path, theme_dir / 'win' / 'tiles' / tile_path.name)
    # In-app logos used by Windows theme resources (about page, profile menu)
    for scale in ('default_100_percent', 'default_200_percent'):
        scale_src = brand_dir / 'inapp' / scale
        scale_dst = source_tree / 'chrome' / 'app' / 'theme' / scale / 'chromium'
        for png_path in scale_src.iterdir():
            shutil.copyfile(png_path, scale_dst / png_path.name)
    # WebUI logo (settings sidebar etc.)
    shutil.copyfile(brand_dir / 'chrome_logo_dark.svg',
                    source_tree / 'ui' / 'webui' / 'resources' / 'images' / 'chrome_logo_dark.svg')


# Chromium Web Store extension (https://github.com/NeverDecaf/chromium-web-store)
# Bundled as an external extension; loaded by the bundled-external-extensions
# patch from the "Extensions" directory next to chrome.dll.
_CWS_ID = 'ocaahdebbfolfmndjeplogmgcagdmblk'
_CWS_VERSION = '1.5.5.3'
_CWS_URL = ('https://github.com/NeverDecaf/chromium-web-store/releases/download/'
            'v{}/Chromium.Web.Store.crx'.format(_CWS_VERSION))
_CWS_SHA256 = '326443baec3d204b1358eba6aa025cf6bd930c08a0b98f6784e7a3236528445b'


def _provide_clang_format(source_tree):
    """
    Puts a clang-format where the build expects to find one.

    src/DEPS pulls buildtools/win-format from a GCS bucket, which a source
    tarball does not carry - the same gap that node, gperf and the Go toolchain
    already have here. Chromium 152 made it load-bearing: crubit's support
    headers, which chrome now depends on, are generated by an action that runs
    clang-format over them, so without the binary ninja rejects the whole graph
    in its first minute with "missing and no known rule to make it". The Linux
    pre-flight found that; this is the same fix on this side.

    The copy comes from the LLVM release already downloaded and unpacked into
    third_party/llvm-build, rather than from the pin in DEPS. clang-format only
    decides how a generated header is laid out before it is compiled, so a
    version difference changes whitespace in a file nobody reads - and it saves
    a fourth download to keep in step.
    """
    src = source_tree / 'third_party' / 'llvm-build' / 'Release+Asserts' / 'bin' / 'clang-format.exe'
    if not src.exists():
        raise FileNotFoundError(
            'clang-format.exe not found at {} - it should come from the LLVM '
            'release unpacked by downloads.ini. Chromium needs it to generate '
            "crubit's support headers.".format(src))
    dest_dir = source_tree / 'buildtools' / 'win-format'
    dest_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest_dir / 'clang-format.exe')
    get_logger().info('Provided buildtools/win-format/clang-format.exe')


def _stage_bundled_extensions(source_tree):
    """
    Downloads the Chromium Web Store crx into out/Default/Extensions and
    writes the manifest listing it into the SOURCE tree's
    chrome/browser/extensions/default_extensions/external_extensions.json.

    The manifest must go into the source file, not out/Default: ninja's
    default_extensions copy step (chrome/browser/extensions/
    default_extensions/BUILD.gn, Windows-only) copies that source file over
    out/Default/extensions/external_extensions.json on every build, so a
    manifest staged into the out dir gets clobbered with the stock empty
    placeholder mid-build and the installer/zip silently ship an empty
    extension list (this is exactly how v150.0.7871.128-b39 shipped with a
    non-installing Web Store). The crx itself is safe in out/Default - no
    build step writes that filename - and both the installer
    (chrome.release's "Extensions\\*.*" glob) and the zip (package.py
    include_paths) pick up the pair from there.
    """
    import hashlib
    import json
    import urllib.request
    ext_dir = source_tree / 'out' / 'Default' / 'Extensions'
    ext_dir.mkdir(parents=True, exist_ok=True)
    crx_path = ext_dir / 'chromium_web_store.crx'
    if not crx_path.exists():
        get_logger().info('Downloading Chromium Web Store extension...')
        with urllib.request.urlopen(_CWS_URL) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != _CWS_SHA256:
            raise RuntimeError('Chromium Web Store crx checksum mismatch')
        crx_path.write_bytes(data)
    manifest = json.dumps(
        {
            _CWS_ID: {
                'external_crx': crx_path.name,
                'external_version': _CWS_VERSION,
            }
        }, indent=2)
    json_src = (source_tree / 'chrome' / 'browser' / 'extensions' /
                'default_extensions' / 'external_extensions.json')
    if not json_src.exists():
        raise RuntimeError(
            'default_extensions/external_extensions.json not found - upstream '
            'moved it, update _stage_bundled_extensions to match')
    if json_src.read_text(encoding=ENCODING) != manifest:
        json_src.write_text(manifest, encoding=ENCODING)


def _get_vcvars_path(name='64'):
    """
    Returns the path to the corresponding vcvars*.bat path

    As of VS 2017, name can be one of: 32, 64, all, amd64_x86, x86_amd64
    """
    vswhere_exe = '%ProgramFiles(x86)%\\Microsoft Visual Studio\\Installer\\vswhere.exe'
    result = subprocess.run(
        '"{}" -products * -prerelease -latest -property installationPath'.format(vswhere_exe),
        shell=True,
        check=True,
        stdout=subprocess.PIPE,
        universal_newlines=True)
    vcvars_path = Path(result.stdout.strip(), 'VC/Auxiliary/Build/vcvars{}.bat'.format(name))
    if not vcvars_path.exists():
        raise RuntimeError(
            'Could not find vcvars batch script in expected location: {}'.format(vcvars_path))
    return vcvars_path


def _run_build_process(*args, **kwargs):
    """
    Runs the subprocess with the correct environment variables for building
    """
    # Add call to set VC variables
    cmd_input = ['call "%s" >nul' % _get_vcvars_path()]
    cmd_input.append('set DEPOT_TOOLS_WIN_TOOLCHAIN=0')
    cmd_input.append(' '.join(map('"{}"'.format, args)))
    cmd_input.append('exit\n')
    subprocess.run(('cmd.exe', '/k'),
                   input='\n'.join(cmd_input),
                   check=True,
                   encoding=ENCODING,
                   **kwargs)


def _run_build_process_timeout(*args, timeout):
    """
    Runs the subprocess with the correct environment variables for building
    """
    # Add call to set VC variables
    cmd_input = ['call "%s" >nul' % _get_vcvars_path()]
    cmd_input.append('set DEPOT_TOOLS_WIN_TOOLCHAIN=0')
    cmd_input.append(' '.join(map('"{}"'.format, args)))
    cmd_input.append('exit\n')
    with subprocess.Popen(('cmd.exe', '/k'), encoding=ENCODING, stdin=subprocess.PIPE, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP) as proc:
        proc.stdin.write('\n'.join(cmd_input))
        proc.stdin.close()
        try:
            proc.wait(timeout)
            if proc.returncode != 0:
                raise RuntimeError('Build failed!')
        except subprocess.TimeoutExpired:
            print('Sending keyboard interrupt')
            for _ in range(3):
                ctypes.windll.kernel32.GenerateConsoleCtrlEvent(1, proc.pid)
                time.sleep(1)
            try:
                proc.wait(10)
            except:
                proc.kill()
            raise KeyboardInterrupt


def _make_tmp_paths():
    """Creates TMP and TEMP variable dirs so ninja won't fail"""
    tmp_path = Path(os.environ['TMP'])
    if not tmp_path.exists():
        tmp_path.mkdir()
    tmp_path = Path(os.environ['TEMP'])
    if not tmp_path.exists():
        tmp_path.mkdir()


def main():
    """CLI Entrypoint"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--disable-ssl-verification',
        action='store_true',
        help='Disables SSL verification for downloading')
    parser.add_argument(
        '--7z-path',
        dest='sevenz_path',
        default=USE_REGISTRY,
        help=('Command or path to 7-Zip\'s "7z" binary. If "_use_registry" is '
              'specified, determine the path from the registry. Default: %(default)s'))
    parser.add_argument(
        '--winrar-path',
        dest='winrar_path',
        default=USE_REGISTRY,
        help=('Command or path to WinRAR\'s "winrar.exe" binary. If "_use_registry" is '
              'specified, determine the path from the registry. Default: %(default)s'))
    parser.add_argument(
        '-j',
        type=int,
        dest='thread_count',
        help=('Number of CPU threads to use for compiling'))
    parser.add_argument(
        '--ci',
        action='store_true'
    )
    parser.add_argument(
        '--ninja-timeout',
        type=float,
        default=3.5 * 60 * 60,
        dest='ninja_timeout',
        help=('Seconds to let ninja compile before stopping it gracefully so the '
              'stage can checkpoint. The stage action passes what is left of the '
              'six-hour job limit after restoring the tree, minus the time the '
              'checkpoint needs; the default is the fixed budget this used to '
              'have. Default: %(default)s'))
    parser.add_argument(
        '--x86',
        action='store_true'
    )
    parser.add_argument(
        '--arm',
        action='store_true'
    )
    parser.add_argument(
        '--tarball',
        action='store_true'
    )
    args = parser.parse_args()

    # Set common variables
    source_tree = _ROOT_DIR / 'build' / 'src'
    downloads_cache = _ROOT_DIR / 'build' / 'download_cache'

    if not args.ci or not (source_tree / 'BUILD.gn').exists():
        # Setup environment
        source_tree.mkdir(parents=True, exist_ok=True)
        downloads_cache.mkdir(parents=True, exist_ok=True)
        _make_tmp_paths()

        # Extractors
        extractors = {
            ExtractorEnum.SEVENZIP: args.sevenz_path,
            ExtractorEnum.WINRAR: args.winrar_path,
        }

        # Prepare source folder
        if args.tarball:
            # Download chromium tarball
            get_logger().info('Downloading chromium tarball...')
            download_info = downloads.DownloadInfo([_ROOT_DIR / 'ungoogled-chromium' / 'downloads.ini'])
            downloads.retrieve_downloads(download_info, downloads_cache, None, True, args.disable_ssl_verification)
            try:
                downloads.check_downloads(download_info, downloads_cache, None)
            except downloads.HashMismatchError as exc:
                get_logger().error('File checksum does not match: %s', exc)
                exit(1)

            # Unpack chromium tarball
            get_logger().info('Unpacking chromium tarball...')
            downloads.unpack_downloads(download_info, downloads_cache, None, source_tree, extractors)
        else:
            # Clone sources
            subprocess.run([sys.executable, str(Path('ungoogled-chromium', 'utils', 'clone.py')), '-o', 'build\\src', '-p', 'win32' if args.x86 else 'win-arm64' if args.arm else 'win64'], check=True)

        # Retrieve windows downloads
        get_logger().info('Downloading required files...')
        download_info_win = downloads.DownloadInfo([_ROOT_DIR / 'downloads.ini'])
        downloads.retrieve_downloads(download_info_win, downloads_cache, None, True, args.disable_ssl_verification)
        try:
            downloads.check_downloads(download_info_win, downloads_cache, None)
        except downloads.HashMismatchError as exc:
            get_logger().error('File checksum does not match: %s', exc)
            exit(1)

        # Prune binaries
        pruning_list = (_ROOT_DIR / 'ungoogled-chromium' / 'pruning.list') if args.tarball else (_ROOT_DIR  / 'pruning.list')
        unremovable_files = prune_binaries.prune_files(
            source_tree,
            pruning_list.read_text(encoding=ENCODING).splitlines()
        )
        if unremovable_files:
            get_logger().error('Files could not be pruned: %s', unremovable_files)
            parser.exit(1)

        # Unpack downloads
        DIRECTX = source_tree / 'third_party' / 'microsoft_dxheaders' / 'src'
        ESBUILD = source_tree / 'third_party' / 'devtools-frontend' / 'src' / 'third_party' / 'esbuild'
        if DIRECTX.exists():
            shutil.rmtree(DIRECTX)
            DIRECTX.mkdir()
        if ESBUILD.exists():
            shutil.rmtree(ESBUILD)
            ESBUILD.mkdir()
        get_logger().info('Unpacking downloads...')
        downloads.unpack_downloads(download_info_win, downloads_cache, None, source_tree, extractors)

        # Apply patches
        # First, ungoogled-chromium-patches
        patches.apply_patches(
            patches.generate_patches_from_series(_ROOT_DIR / 'ungoogled-chromium' / 'patches', resolve=True),
            source_tree,
            patch_bin_path=(source_tree / _PATCH_BIN_RELPATH)
        )
        # Then Windows-specific patches
        patches.apply_patches(
            patches.generate_patches_from_series(_ROOT_DIR / 'patches', resolve=True),
            source_tree,
            patch_bin_path=(source_tree / _PATCH_BIN_RELPATH)
        )

        # Substitute domains
        domain_substitution_list = (_ROOT_DIR / 'ungoogled-chromium' / 'domain_substitution.list') if args.tarball else (_ROOT_DIR  / 'domain_substitution.list')
        domain_substitution.apply_substitution(
            _ROOT_DIR / 'ungoogled-chromium' / 'domain_regex.list',
            domain_substitution_list,
            source_tree,
            None
        )

        # Apply Aerium branding
        _apply_branding(source_tree)

        # Generate the data behind chrome://aerium. After branding and domain
        # substitution, matching the Linux repo's ordering: generating earlier
        # would let domain substitution rewrite hostnames inside the patch
        # descriptions into the unreachable placeholder domain.
        _generate_patch_manifest(source_tree)

    # Check if rust-toolchain folder has been populated
    HOST_CPU_IS_64BIT = sys.maxsize > 2**32
    RUST_DIR_DST = source_tree / 'third_party' / 'rust-toolchain'
    RUST_DIR_SRC64 = source_tree / 'third_party' / 'rust-toolchain-x64'
    RUST_DIR_SRC86 = source_tree / 'third_party' / 'rust-toolchain-x86'
    RUST_DIR_SRCARM = source_tree / 'third_party' / 'rust-toolchain-arm'
    RUST_FLAG_FILE = RUST_DIR_DST / 'INSTALLED_VERSION'
    if not args.ci or not RUST_FLAG_FILE.exists():
        # Directories to copy from source to target folder
        DIRS_TO_COPY = ['bin', 'lib']

        # Loop over all source folders
        for rust_dir_src in [RUST_DIR_SRC64, RUST_DIR_SRC86, RUST_DIR_SRCARM]:
            # Loop over all dirs to copy
            for dir_to_copy in DIRS_TO_COPY:
                # Copy bin folder for host architecture
                if (dir_to_copy == 'bin') and (HOST_CPU_IS_64BIT != (rust_dir_src == RUST_DIR_SRC64)):
                    continue

                # Create target dir
                target_dir = RUST_DIR_DST / dir_to_copy
                if not os.path.isdir(target_dir):
                    os.makedirs(target_dir)

                # Loop over all subfolders of the rust source dir
                for cp_src in rust_dir_src.glob(f'*/{dir_to_copy}/*'):
                    cp_dst = target_dir / cp_src.name
                    if cp_src.is_dir():
                        shutil.copytree(cp_src, cp_dst, dirs_exist_ok=True)
                    else:
                        shutil.copy2(cp_src, cp_dst)

        # Generate version file
        with open(RUST_FLAG_FILE, 'w') as f:
            subprocess.run([source_tree / 'third_party' / 'rust-toolchain-x64' / 'rustc' / 'bin' / 'rustc.exe', '--version'], stdout=f)

    if not args.ci or not (source_tree / 'out/Default').exists():
        # Output args.gn
        (source_tree / 'out/Default').mkdir(parents=True)
        gn_flags = (_ROOT_DIR / 'ungoogled-chromium' / 'flags.gn').read_text(encoding=ENCODING)
        gn_flags += '\n'
        windows_flags = (_ROOT_DIR / 'flags.windows.gn').read_text(encoding=ENCODING)
        if args.x86:
            windows_flags = windows_flags.replace('x64', 'x86')
        elif args.arm:
            windows_flags = windows_flags.replace('x64', 'arm64')
        if args.tarball:
            windows_flags += '\nchrome_pgo_phase=0\n'
        gn_flags += windows_flags
        (source_tree / 'out/Default/args.gn').write_text(gn_flags, encoding=ENCODING)

    # Put clang-format where gn expects it. Unconditional and idempotent: a
    # restored CI tree already has it, and a copy costs nothing.
    _provide_clang_format(source_tree)

    # Stage bundled extensions (Chromium Web Store)
    _stage_bundled_extensions(source_tree)

    # Enter source tree to run build commands
    os.chdir(source_tree)

    if not args.ci or not os.path.exists('out\\Default\\gn.exe'):
        # Run GN bootstrap
        _run_build_process(
            sys.executable, 'tools\\gn\\bootstrap\\bootstrap.py', '-o', 'out\\Default\\gn.exe',
            '--skip-generate-buildfiles')

        # Run gn gen
        _run_build_process('out\\Default\\gn.exe', 'gen', 'out\\Default', '--fail-on-unused-args')

        # Aerium: verify that every #include in the targets this project owns
        # is covered by a declared dependency.
        #
        # A missing dep is close to invisible until it is expensive. //base
        # does not public_dep :i18n and //net does not include
        # net/traffic_annotation, so a target using base/i18n/time_formatting.h
        # or network_traffic_annotation.h without naming them builds fine right
        # up until it does not - at link, hours in. Both were real, in the
        # content blocker, and nothing before this caught them.
        #
        # gn check rather than a bespoke include scanner: it uses GN's own
        # notion of what a dependency permits, including public_deps chains, so
        # it cannot drift from the build the way a hand-written parser would.
        # Chromium's .gn excludes only six v8 targets from header checking, so
        # this is a supported thing to ask for - it is simply never run by
        # default. Here, right after gen, nothing has compiled yet.
        if not _AERIUM_CHECK_TARGETS:
            get_logger().info('gn check: no Aerium-owned targets to check')
        for target in _AERIUM_CHECK_TARGETS:
            # A target that does not exist is not a pass: it means the patch
            # that should have created it did not apply, and checking nothing
            # is how a guard rots into decoration.
            _run_build_process('out\\Default\\gn.exe', 'ls', 'out\\Default', target)
            _run_build_process('out\\Default\\gn.exe', 'check', 'out\\Default', target)

    if not args.ci or not os.path.exists('third_party\\rust-toolchain\\bin\\bindgen.exe'):
        # Build bindgen
        _run_build_process(
            sys.executable,
            'tools\\rust\\build_bindgen.py', '--skip-test')

    # Ninja commandline
    ninja_commandline = ['third_party\\ninja\\ninja.exe']
    if args.thread_count is not None:
        ninja_commandline.append('-j')
        ninja_commandline.append(args.thread_count)
    ninja_commandline.append('-C')
    ninja_commandline.append('out\\Default')
    ninja_commandline.append('chrome')
    ninja_commandline.append('chromedriver')
    ninja_commandline.append('mini_installer')

    # Run ninja
    if args.ci:
        # Not a constant any more: a stage spends whatever the tree restore
        # costs before it compiles anything, and that grows with the tree. On
        # run 33089940410 the restore took 1h59m, so a fixed 3.5h of ninja put
        # the checkpoint upload past GitHub's six-hour job cap and the stage
        # was killed eight seconds into it. The caller measures what is
        # actually left and passes it in.
        _run_build_process_timeout(*ninja_commandline, timeout=args.ninja_timeout)
        # package
        os.chdir(_ROOT_DIR)
        # check=True: without it a failing package.py (missing mini_installer,
        # FILES.cfg entry gone, ...) left the stage green and the release job
        # publishing nothing.
        subprocess.run([sys.executable, 'package.py', '--cpu-arch',
                        '32bit' if args.x86 else 'arm' if args.arm else '64bit'],
                       check=True)
    else:
        _run_build_process(*ninja_commandline)


if __name__ == '__main__':
    main()
