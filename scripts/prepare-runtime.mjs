import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const pyodideNodeDir = path.join(projectRoot, 'node_modules', 'pyodide');
const defaultRuntimeTargetDir = path.join(projectRoot, 'public', 'runtime');
const pythonTargetDir = path.join(projectRoot, 'public', 'python');

// Parse CLI options
const args = process.argv.slice(2);
function getArgValue(flag) {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  const prefix = `${flag}=`;
  const found = args.find((a) => a.startsWith(prefix));
  if (found) {
    return found.slice(prefix.length);
  }
  return null;
}

const customStageDir =
  getArgValue('--stage-dir') ||
  getArgValue('--target-dir') ||
  getArgValue('--out-dir') ||
  process.env.STAGE_DIR ||
  process.env.RUNTIME_TARGET_DIR ||
  null;

const verifyOnly = args.includes('--verify-only');
const inspectOnly = args.includes('--inspect');

const runtimeTargetDir = customStageDir
  ? path.resolve(customStageDir)
  : defaultRuntimeTargetDir;

// Core Pyodide files to copy from node_modules/pyodide
const CORE_FILES = [
  'pyodide.js',
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

// Curated root packages to include in same-origin runtime closure
const ROOT_PACKAGES = [
  'parso',
  'jedi',
  'numpy',
  'pandas',
  'scikit-learn',
  'scipy',
  'sympy',
  'mpmath',
  'networkx',
  'matplotlib',
  'pillow',
  'regex',
  'beautifulsoup4',
  'pytz',
  'python-dateutil',
  'jinja2',
  'pyyaml',
  'tqdm',
  'micropip',
];

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function computeSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

async function downloadFile(url, destPath) {
  console.log(`Downloading ${url} -> ${destPath}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
}

export async function prepareRuntime(options = {}) {
  const targetDir = options.targetDir || runtimeTargetDir;
  const isStaging = targetDir !== defaultRuntimeTargetDir;

  console.log('--- Preparing Pyodide runtime assets ---');
  console.log(`Target directory: ${targetDir} ${isStaging ? '(STAGING MODE: live public/runtime untouched)' : '(DEFAULT PUBLIC MODE)'}`);
  if (verifyOnly) console.log('Mode: VERIFY ONLY (no network downloads)');

  await ensureDir(targetDir);
  if (!isStaging) {
    await ensureDir(pythonTargetDir);
  }

  // 1. Core Pyodide assets
  const sourceNodeDir = fs.existsSync(pyodideNodeDir)
    ? pyodideNodeDir
    : fs.existsSync(defaultRuntimeTargetDir)
    ? defaultRuntimeTargetDir
    : null;

  if (!sourceNodeDir) {
    throw new Error(`No Pyodide source found at ${pyodideNodeDir} or ${defaultRuntimeTargetDir}`);
  }

  let version = '314.0.7';
  const pkgJsonPath = path.join(pyodideNodeDir, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    const pkgData = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    version = pkgData.version || version;
  }
  console.log(`Detected Pyodide version: ${version}`);

  for (const file of CORE_FILES) {
    const src = path.join(sourceNodeDir, file);
    const dest = path.join(targetDir, file);
    if (fs.existsSync(src)) {
      if (src !== dest) {
        fs.copyFileSync(src, dest);
        console.log(`Staged core file ${file} -> ${targetDir}`);
      }
    } else if (fs.existsSync(path.join(defaultRuntimeTargetDir, file))) {
      fs.copyFileSync(path.join(defaultRuntimeTargetDir, file), dest);
      console.log(`Copied core file ${file} from default runtime -> ${targetDir}`);
    } else {
      console.warn(`Warning: core file ${file} not found in source directory`);
    }
  }

  // 2. Read pyodide-lock.json for dependency closure resolution
  const lockPath = path.join(targetDir, 'pyodide-lock.json');
  if (!fs.existsSync(lockPath)) {
    throw new Error(`pyodide-lock.json not found in ${targetDir}`);
  }

  const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

  // Compute transitive dependency closure
  const closure = new Set();
  const queue = [...ROOT_PACKAGES];
  while (queue.length > 0) {
    const pkg = queue.shift();
    if (closure.has(pkg)) continue;
    closure.add(pkg);
    const info = lockData.packages?.[pkg];
    if (info && Array.isArray(info.depends)) {
      for (const dep of info.depends) {
        if (!closure.has(dep)) {
          queue.push(dep);
        }
      }
    }
  }

  const packagesToPrepare = Array.from(closure).sort();
  console.log(
    `Resolved transitive dependency closure (${packagesToPrepare.length} packages):\n  ${packagesToPrepare.join(', ')}`
  );

  if (inspectOnly) {
    console.log('--- Inspection completed ---');
    return { targetDir, packages: packagesToPrepare, lockData };
  }

  const baseUrl = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
  const stagedManifest = {
    pyodideVersion: version,
    preparedAt: new Date().toISOString(),
    isStaging,
    targetDir,
    totalPackages: packagesToPrepare.length,
    packages: [],
    totalSizeBytes: 0,
  };

  let downloadedCount = 0;
  let copiedFromPublicCount = 0;
  let cachedCount = 0;

  for (const pkgName of packagesToPrepare) {
    const pkgInfo = lockData.packages?.[pkgName];
    if (!pkgInfo) {
      console.warn(`Package ${pkgName} not found in pyodide-lock.json`);
      continue;
    }

    const fileName = pkgInfo.file_name;
    const dest = path.join(targetDir, fileName);
    const expectedSha256 = pkgInfo.sha256;

    let needDownload = true;

    // Check if destination already has verified wheel
    if (fs.existsSync(dest)) {
      const currentSha = computeSha256(dest);
      if (currentSha === expectedSha256) {
        needDownload = false;
        cachedCount++;
      } else {
        console.warn(`File ${fileName} in target has SHA mismatch, re-staging...`);
      }
    }

    // In staging mode, check if already verified in public/runtime to save download bandwidth
    if (needDownload && isStaging) {
      const publicPath = path.join(defaultRuntimeTargetDir, fileName);
      if (fs.existsSync(publicPath)) {
        const publicSha = computeSha256(publicPath);
        if (publicSha === expectedSha256) {
          fs.copyFileSync(publicPath, dest);
          console.log(`Copied verified wheel ${fileName} from public/runtime -> stage dir`);
          needDownload = false;
          copiedFromPublicCount++;
        }
      }
    }

    // Download if needed
    if (needDownload) {
      if (verifyOnly) {
        throw new Error(`Wheel missing in verify-only mode: ${fileName}`);
      }
      const url = `${baseUrl}${fileName}`;
      await downloadFile(url, dest);
      const downloadedSha = computeSha256(dest);
      if (downloadedSha !== expectedSha256) {
        fs.unlinkSync(dest);
        throw new Error(
          `Sha256 mismatch for ${fileName}! Expected ${expectedSha256}, got ${downloadedSha}`
        );
      }
      console.log(`Verified SHA-256 for newly downloaded ${fileName}`);
      downloadedCount++;
    }

    const stat = fs.statSync(dest);
    stagedManifest.totalSizeBytes += stat.size;
    stagedManifest.packages.push({
      name: pkgName,
      version: pkgInfo.version,
      fileName,
      sizeBytes: stat.size,
      sha256: expectedSha256,
      depends: pkgInfo.depends || [],
      imports: pkgInfo.imports || [],
    });
  }

  // Write staging manifest
  const manifestPath = path.join(targetDir, 'staged-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(stagedManifest, null, 2), 'utf8');

  console.log('--- Pyodide runtime preparation completed successfully ---');
  console.log(`Total packages in closure: ${packagesToPrepare.length}`);
  console.log(`Cached / already verified: ${cachedCount}`);
  console.log(`Copied from local cache: ${copiedFromPublicCount}`);
  console.log(`Downloaded & verified: ${downloadedCount}`);
  console.log(`Total payload size: ${(stagedManifest.totalSizeBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Manifest saved to: ${manifestPath}`);

  return stagedManifest;
}

// Direct CLI invocation
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  prepareRuntime().catch((err) => {
    console.error('Error preparing runtime:', err);
    process.exit(1);
  });
}
