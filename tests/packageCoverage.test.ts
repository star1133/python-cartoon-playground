import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  CURATED_PACKAGES,
  BROWSER_UNSUPPORTED_PACKAGES,
  BROWSER_LIMITATIONS,
  getPackageInfo,
  getCompatiblePackages,
  getPackagesByCategory,
  isPackageAvailable,
} from '../src/storage/packageCatalog';

import {
  ALLOWED_PACKAGES,
  IMPORT_TO_PACKAGE_MAP,
  UNSUPPORTED_BROWSER_MODULES,
  detectImports,
  validatePackageName,
  filterAndValidatePackages,
  checkModuleCompatibility,
} from '../src/runtime/packageControl';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const lockPath = path.join(projectRoot, 'public', 'runtime', 'pyodide-lock.json');
const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

describe('Package Catalog & Truthful Pyodide Coverage', () => {
  it('provides >= 15 curated compatible packages across all domains', () => {
    expect(CURATED_PACKAGES.length).toBeGreaterThanOrEqual(15);
    const categories = new Set(CURATED_PACKAGES.map((p) => p.category));
    expect(categories.has('data')).toBe(true);
    expect(categories.has('math')).toBe(true);
    expect(categories.has('graphics')).toBe(true);
    expect(categories.has('utility')).toBe(true);
  });

  it('matches official Pyodide lockfile versions, filenames, and dependencies', () => {
    for (const pkg of CURATED_PACKAGES) {
      expect(pkg.name).toBeTruthy();
      expect(pkg.status).toBe('available');
      expect(pkg.descriptionTh).toBeTruthy();
      expect(pkg.sizeEstimate).toMatch(/MB|KB/);

      const official = lockData.packages[pkg.name];
      expect(official, `Package ${pkg.name} must exist in pyodide-lock.json`).toBeDefined();
      expect(pkg.version).toBe(official.version);
      expect(pkg.wheelFileName).toBe(official.file_name);
      expect(pkg.dependencies).toEqual(official.depends || []);
      expect(pkg.dependencyCount).toBe((official.depends || []).length);
    }
  });

  it('truthfully documents unsupported desktop, socket, and process modules', () => {
    expect(BROWSER_UNSUPPORTED_PACKAGES.length).toBeGreaterThanOrEqual(4);
    for (const unsupp of BROWSER_UNSUPPORTED_PACKAGES) {
      expect(unsupp.status).toBe('unsupported');
      expect(unsupp.limitationNoteTh).toBeTruthy();
    }

    const unsuppNames = BROWSER_UNSUPPORTED_PACKAGES.map((p) => p.name);
    expect(unsuppNames).toContain('tkinter');
    expect(unsuppNames).toContain('pygame');
    expect(unsuppNames).toContain('multiprocessing');
    expect(unsuppNames).toContain('socket');
  });

  it('covers WebAssembly, Sockets, GUI, Multiprocessing, VFS, and CSP limitations', () => {
    const titles = BROWSER_LIMITATIONS.map((l) => l.titleTh);
    expect(titles.some((t) => t.includes('WebAssembly'))).toBe(true);
    expect(titles.some((t) => t.includes('Sockets'))).toBe(true);
    expect(titles.some((t) => t.includes('GUI'))).toBe(true);
    expect(titles.some((t) => t.includes('Multiprocessing'))).toBe(true);
    expect(titles.some((t) => t.includes('VFS') || t.includes('ไฟล์เสมือน'))).toBe(true);
    expect(titles.some((t) => t.includes('CSP') || t.includes('Same-Origin'))).toBe(true);
  });

  it('supports helper queries for packages', () => {
    expect(isPackageAvailable('numpy')).toBe(true);
    expect(isPackageAvailable('scikit-learn')).toBe(true);
    expect(isPackageAvailable('tkinter')).toBe(false);

    const dataPkgs = getPackagesByCategory('data');
    expect(dataPkgs.map((p) => p.name)).toContain('pandas');
    expect(dataPkgs.map((p) => p.name)).toContain('numpy');
    expect(dataPkgs.map((p) => p.name)).toContain('scikit-learn');

    const mathPkgs = getPackagesByCategory('math');
    expect(mathPkgs.map((p) => p.name)).toContain('scipy');
    expect(mathPkgs.map((p) => p.name)).toContain('sympy');
    expect(mathPkgs.map((p) => p.name)).toContain('mpmath');
    expect(mathPkgs.map((p) => p.name)).toContain('networkx');

    const compats = getCompatiblePackages();
    expect(compats.length).toBe(CURATED_PACKAGES.length);
  });
});

describe('Package Control Validation and Canonicalization', () => {
  it('validates canonical package names', () => {
    expect(validatePackageName('numpy')).toBe('numpy');
    expect(validatePackageName('pandas')).toBe('pandas');
    expect(validatePackageName('matplotlib')).toBe('matplotlib');
    expect(validatePackageName('scipy')).toBe('scipy');
    expect(validatePackageName('sympy')).toBe('sympy');
    expect(validatePackageName('scikit-learn')).toBe('scikit-learn');
    expect(validatePackageName('pillow')).toBe('pillow');
    expect(validatePackageName('networkx')).toBe('networkx');
    expect(validatePackageName('mpmath')).toBe('mpmath');
    expect(validatePackageName('beautifulsoup4')).toBe('beautifulsoup4');
    expect(validatePackageName('jinja2')).toBe('jinja2');
    expect(validatePackageName('pyyaml')).toBe('pyyaml');
    expect(validatePackageName('tqdm')).toBe('tqdm');
  });

  it('canonicalizes common aliases to official package names', () => {
    expect(validatePackageName('sklearn')).toBe('scikit-learn');
    expect(validatePackageName('PIL')).toBe('pillow');
    expect(validatePackageName('bs4')).toBe('beautifulsoup4');
    expect(validatePackageName('yaml')).toBe('pyyaml');
    expect(validatePackageName('dateutil')).toBe('python-dateutil');
    expect(validatePackageName('pylab')).toBe('matplotlib');
  });

  it('rejects arbitrary URLs, wheels, and archives', () => {
    expect(() => validatePackageName('https://evil.org/pkg.whl')).toThrow(
      /Arbitrary package URLs or files are prohibited/
    );
    expect(() => validatePackageName('http://test.com/payload.tar.gz')).toThrow(
      /Arbitrary package URLs or files are prohibited/
    );
    expect(() => validatePackageName('bad.zip')).toThrow(
      /Arbitrary package URLs or files are prohibited/
    );
  });

  it('rejects path traversal and unauthorized packages', () => {
    expect(() => validatePackageName('../../../etc/passwd')).toThrow();
    expect(() => validatePackageName('malicious/pkg')).toThrow();
    expect(() => validatePackageName('unknown_random_package_xyz')).toThrow(
      /not in the curated allowed catalog/
    );
  });

  it('rejects unsupported browser modules with explicit WebAssembly guidance', () => {
    expect(() => validatePackageName('tkinter')).toThrow(/not supported in browser WebAssembly/);
    expect(() => validatePackageName('pygame')).toThrow(/not supported in browser WebAssembly/);
    expect(() => validatePackageName('multiprocessing')).toThrow(
      /not supported in browser WebAssembly/
    );
    expect(() => validatePackageName('socket')).toThrow(/not supported in browser WebAssembly/);
    expect(() => validatePackageName('subprocess')).toThrow(/not supported in browser WebAssembly/);
  });

  it('batch validates packages with filterAndValidatePackages', () => {
    const validated = filterAndValidatePackages(['numpy', 'sklearn', 'PIL', 'sympy']);
    expect(validated).toEqual(['numpy', 'scikit-learn', 'pillow', 'sympy']);
  });

  it('checks module compatibility with checkModuleCompatibility', () => {
    const comp1 = checkModuleCompatibility('numpy');
    expect(comp1.compatible).toBe(true);
    expect(comp1.package).toBe('numpy');

    const comp2 = checkModuleCompatibility('sklearn');
    expect(comp2.compatible).toBe(true);
    expect(comp2.package).toBe('scikit-learn');

    const unsupp = checkModuleCompatibility('tkinter');
    expect(unsupp.compatible).toBe(false);
    expect(unsupp.reason).toContain('Desktop GUI');
  });
});

describe('Static Import Detection', () => {
  it('detects standard and aliased imports accurately without executing code', () => {
    const code = `
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from PIL import Image, ImageDraw
import bs4
from bs4 import BeautifulSoup
import yaml
from dateutil.parser import parse
import matplotlib.pyplot as plt
import networkx as nx
import sympy as sp
from mpmath import mp
import regex as re
from jinja2 import Template
from tqdm import tqdm
`;
    const detected = detectImports(code);
    expect(detected).toContain('numpy');
    expect(detected).toContain('pandas');
    expect(detected).toContain('scikit-learn');
    expect(detected).toContain('pillow');
    expect(detected).toContain('beautifulsoup4');
    expect(detected).toContain('pyyaml');
    expect(detected).toContain('python-dateutil');
    expect(detected).toContain('matplotlib');
    expect(detected).toContain('networkx');
    expect(detected).toContain('sympy');
    expect(detected).toContain('mpmath');
    expect(detected).toContain('regex');
    expect(detected).toContain('jinja2');
    expect(detected).toContain('tqdm');
  });

  it('handles multi-package import statements', () => {
    const code = 'import numpy as np, pandas as pd, scipy.stats as stats\n';
    const detected = detectImports(code);
    expect(detected).toContain('numpy');
    expect(detected).toContain('pandas');
    expect(detected).toContain('scipy');
  });

  it('handles indented imports inside functions and blocks', () => {
    const code = `
def analyze():
    import sympy
    from PIL import Image
    return True
`;
    const detected = detectImports(code);
    expect(detected).toContain('sympy');
    expect(detected).toContain('pillow');
  });

  it('ignores comments and does not falsely detect commented imports', () => {
    const code = `
# import sklearn
# from PIL import Image
import numpy as np # numeric computations
`;
    const detected = detectImports(code);
    expect(detected).toContain('numpy');
    expect(detected).not.toContain('scikit-learn');
    expect(detected).not.toContain('pillow');
  });

  it('ignores standard library modules', () => {
    const code = `
import sys, os, math, json, random
from collections import defaultdict
from itertools import count
`;
    const detected = detectImports(code);
    expect(detected).toEqual([]);
  });

  it('does not falsely include unsupported modules in detected package list', () => {
    const code = `
import tkinter
import pygame
import socket
import multiprocessing
`;
    const detected = detectImports(code);
    expect(detected).toEqual([]);
  });
});
