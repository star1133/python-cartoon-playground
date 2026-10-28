/**
 * packageControl.ts
 * Validation and security guards for package installation.
 * Enforces controlled package catalog, prevents arbitrary URLs, path traversal,
 * and unsupported browser environments under WebAssembly CSP.
 */

/**
 * Mapping from Python import statements / module names to canonical Pyodide package names.
 * Ensures conservative static import detection without executing user source code.
 */
export const IMPORT_TO_PACKAGE_MAP: Record<string, string> = {
  // Common aliases & top-level import names
  sklearn: 'scikit-learn',
  pil: 'pillow',
  bs4: 'beautifulsoup4',
  yaml: 'pyyaml',
  dateutil: 'python-dateutil',
  pylab: 'matplotlib',
  mpl_toolkits: 'matplotlib',
  pyplot: 'matplotlib',
  isympy: 'sympy',
  // Canonical names mapping to themselves
  numpy: 'numpy',
  pandas: 'pandas',
  scipy: 'scipy',
  sympy: 'sympy',
  mpmath: 'mpmath',
  networkx: 'networkx',
  matplotlib: 'matplotlib',
  pillow: 'pillow',
  regex: 'regex',
  beautifulsoup4: 'beautifulsoup4',
  pytz: 'pytz',
  'python-dateutil': 'python-dateutil',
  jinja2: 'jinja2',
  pyyaml: 'pyyaml',
  tqdm: 'tqdm',
  micropip: 'micropip',
  jedi: 'jedi',
  parso: 'parso',
  'scikit-learn': 'scikit-learn',
  requests: 'requests',
};

/**
 * Unsupported native desktop / process / socket modules on WebAssembly.
 * Documented truthfully to prevent promising unavailable desktop features.
 */
export const UNSUPPORTED_BROWSER_MODULES: Record<string, string> = {
  tkinter: 'Desktop GUI toolkit is unavailable in WebAssembly; use HTML Canvas / SVG / DOM',
  pygame: 'Native desktop SDL windowing is unavailable in WebAssembly; use 3D Canvas / DOM',
  'pygame-ce': 'Native desktop SDL windowing is unavailable in WebAssembly; use 3D Canvas / DOM',
  turtle: 'Standard Tkinter-based turtle is unavailable in WebAssembly',
  multiprocessing: 'Operating system process forking is not supported in browser WebAssembly',
  subprocess: 'Operating system subprocess execution is not available in browser WebAssembly',
  socket: 'Raw TCP/UDP socket bind/listen is prohibited by browser sandbox; use HTTP fetch API under CORS',
  threading: 'Native OS threads are not supported; execution runs single-threaded in Web Worker',
};

/**
 * Allowed packages: curated packages, complete dependency closure, and recognized aliases.
 * All resolved same-origin from /runtime/ with verified SHA-256 hashes against Pyodide release lock.
 */
export const ALLOWED_PACKAGES = new Set([
  // Curated root packages
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
  // Import aliases recognized as packages
  'sklearn',
  'pil',
  'bs4',
  'yaml',
  'dateutil',
  'pylab',
  'isympy',
  // Transitive dependency closure from pyodide-lock.json
  'contourpy',
  'cycler',
  'decorator',
  'fonttools',
  'jedi',
  'joblib',
  'kiwisolver',
  'markupsafe',
  'packaging',
  'parso',
  'pyparsing',
  'setuptools',
  'six',
  'soupsieve',
  'threadpoolctl',
  'typing-extensions',
  // HTTP / network utility (subject to browser CORS/fetch rules)
  'requests',
]);

/**
 * Statically detects Python import statements from user source code.
 * Uses conservative regex matching without executing or evaluating user source.
 * Automatically maps aliases (e.g. sklearn -> scikit-learn, PIL -> pillow, bs4 -> beautifulsoup4).
 */
export function detectImports(code: string): string[] {
  const detected = new Set<string>();
  const lines = code.split(/\r?\n/);

  for (const rawLine of lines) {
    // Strip inline and line comments
    const commentIndex = rawLine.indexOf('#');
    const line = (commentIndex !== -1 ? rawLine.slice(0, commentIndex) : rawLine).trim();
    if (!line) continue;

    // Pattern 1: import a, b as c, d.e as f
    const importMatch = /^[ \t]*import\s+([a-zA-Z0-9_., \t]+)$/.exec(line);
    if (importMatch && importMatch[1]) {
      const parts = importMatch[1].split(',');
      for (const part of parts) {
        const item = part.trim().split(/\s+/)[0]?.split('.')[0]?.toLowerCase();
        if (item) {
          const canonical = IMPORT_TO_PACKAGE_MAP[item] || item;
          if (ALLOWED_PACKAGES.has(canonical) && !UNSUPPORTED_BROWSER_MODULES[item]) {
            detected.add(canonical);
          }
        }
      }
      continue;
    }

    // Pattern 2: from a.b import c
    const fromMatch = /^[ \t]*from\s+([a-zA-Z0-9_]+)(?:\.[a-zA-Z0-9_]+)*\s+import/.exec(line);
    if (fromMatch && fromMatch[1]) {
      const item = fromMatch[1].trim().toLowerCase();
      const canonical = IMPORT_TO_PACKAGE_MAP[item] || item;
      if (ALLOWED_PACKAGES.has(canonical) && !UNSUPPORTED_BROWSER_MODULES[item]) {
        detected.add(canonical);
      }
    }
  }

  return Array.from(detected);
}

/**
 * Validates and canonicalizes a package name before installation in Pyodide.
 * Throws explicit errors on arbitrary URLs, path traversal, unsupported desktop modules,
 * or packages outside the curated same-origin catalog.
 */
export function validatePackageName(pkg: string): string {
  const clean = pkg.trim().toLowerCase();
  if (!clean) {
    throw new Error('Package name cannot be empty');
  }

  // Reject URLs, wheels, path traversal
  if (
    clean.includes('://') ||
    clean.includes('/') ||
    clean.includes('\\') ||
    clean.endsWith('.whl') ||
    clean.endsWith('.tar.gz') ||
    clean.endsWith('.zip')
  ) {
    throw new Error(`Arbitrary package URLs or files are prohibited: "${pkg}"`);
  }

  // Validate allowed characters (alphanumeric, hyphens, underscores)
  if (!/^[a-z0-9_-]+$/.test(clean)) {
    throw new Error(`Invalid package name format: "${pkg}"`);
  }

  // Check if explicitly unsupported desktop/socket module
  if (UNSUPPORTED_BROWSER_MODULES[clean]) {
    throw new Error(
      `Package "${pkg}" is not supported in browser WebAssembly: ${UNSUPPORTED_BROWSER_MODULES[clean]}`
    );
  }

  // Canonicalize via IMPORT_TO_PACKAGE_MAP if alias provided
  const canonical = IMPORT_TO_PACKAGE_MAP[clean] || clean;

  if (!ALLOWED_PACKAGES.has(clean) && !ALLOWED_PACKAGES.has(canonical)) {
    throw new Error(`Package "${pkg}" is not in the curated allowed catalog`);
  }

  return canonical;
}

/**
 * Batch validates a list of package names.
 */
export function filterAndValidatePackages(packages: string[]): string[] {
  return packages.map(validatePackageName);
}

/**
 * Checks whether a module or package is supported in the browser sandbox.
 */
export function checkModuleCompatibility(moduleOrPkg: string): {
  compatible: boolean;
  package?: string;
  reason?: string;
} {
  const clean = moduleOrPkg.trim().toLowerCase();
  if (UNSUPPORTED_BROWSER_MODULES[clean]) {
    return {
      compatible: false,
      reason: UNSUPPORTED_BROWSER_MODULES[clean],
    };
  }

  const canonical = IMPORT_TO_PACKAGE_MAP[clean] || clean;
  if (ALLOWED_PACKAGES.has(canonical)) {
    return {
      compatible: true,
      package: canonical,
    };
  }

  return {
    compatible: false,
    reason: `Module or package "${moduleOrPkg}" is not in the curated same-origin catalog`,
  };
}
