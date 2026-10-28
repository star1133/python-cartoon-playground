export interface PackageInfo {
  name: string;
  category: 'data' | 'math' | 'graphics' | 'utility';
  version: string;
  sizeEstimate: string;
  descriptionTh: string;
  status: 'available' | 'installed' | 'unsupported';
  limitationNoteTh?: string;
  dependencies?: string[];
  dependencyCount?: number;
  importNames?: string[];
  wheelFileName?: string;
}

export const CURATED_PACKAGES: PackageInfo[] = [
  {
    name: 'numpy',
    category: 'data',
    version: '2.4.6',
    sizeEstimate: '~2.8 MB (wheel)',
    descriptionTh: 'การคำนวณอาร์เรย์หลายมิติ คณิตศาสตร์ชั้นสูง พีชคณิตเชิงเส้น และเมทริกซ์',
    status: 'available',
    dependencies: [],
    dependencyCount: 0,
    importNames: ['numpy'],
    wheelFileName: 'numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
  },
  {
    name: 'pandas',
    category: 'data',
    version: '3.0.2',
    sizeEstimate: '~4.0 MB (wheel)',
    descriptionTh: 'การวิเคราะห์และจัดการโครงสร้างข้อมูลตาราง DataFrame และ Series',
    status: 'available',
    dependencies: ['numpy', 'python-dateutil', 'pytz'],
    dependencyCount: 3,
    importNames: ['pandas'],
    wheelFileName: 'pandas-3.0.2-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
  },
  {
    name: 'scikit-learn',
    category: 'data',
    version: '1.8.0',
    sizeEstimate: '~4.2 MB (wheel)',
    descriptionTh: 'การเรียนรู้ของเครื่อง (Machine Learning) การจำแนกประเภท การจัดกลุ่ม และการถดถอย',
    status: 'available',
    limitationNoteTh: 'ประมวลผลแบบ single-thread ใน WebAssembly ไม่รองรับ joblib parallel n_jobs > 1',
    dependencies: ['scipy', 'joblib', 'threadpoolctl'],
    dependencyCount: 3,
    importNames: ['sklearn'],
    wheelFileName: 'scikit_learn-1.8.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
  },
  {
    name: 'scipy',
    category: 'math',
    version: '1.18.0',
    sizeEstimate: '~13.4 MB (wheel)',
    descriptionTh: 'ฟังก์ชันวิทยาศาสตร์ สถิติ การปรับแต่งเส้นโค้ง การประมวลผลสัญญาณ และพีชคณิต',
    status: 'available',
    dependencies: ['numpy'],
    dependencyCount: 1,
    importNames: ['scipy'],
    wheelFileName: 'scipy-1.18.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
  },
  {
    name: 'sympy',
    category: 'math',
    version: '1.14.0',
    sizeEstimate: '~3.9 MB (wheel)',
    descriptionTh: 'การคำนวณพีชคณิตเชิงสัญลักษณ์ สมการ และแคลคูลัส (Symbolic Mathematics)',
    status: 'available',
    dependencies: ['mpmath'],
    dependencyCount: 1,
    importNames: ['sympy', 'isympy'],
    wheelFileName: 'sympy-1.14.0-py3-none-any.whl',
  },
  {
    name: 'mpmath',
    category: 'math',
    version: '1.4.1',
    sizeEstimate: '~420 KB (wheel)',
    descriptionTh: 'การคำนวณตัวเลขทศนิยมความละเอียดสูงตามต้องการ (Arbitrary-precision arithmetic)',
    status: 'available',
    dependencies: [],
    dependencyCount: 0,
    importNames: ['mpmath'],
    wheelFileName: 'mpmath-1.4.1-py3-none-any.whl',
  },
  {
    name: 'networkx',
    category: 'math',
    version: '3.6.1',
    sizeEstimate: '~1.0 MB (wheel)',
    descriptionTh: 'การสร้างและวิเคราะห์โครงสร้างข้อมูลกราฟ โหนด เส้นเชื่อม และเครือข่ายความสัมพันธ์',
    status: 'available',
    limitationNoteTh: 'การวาดกราฟเน็ตเวิร์กเชื่อมต่อกับ matplotlib backend',
    dependencies: ['decorator', 'setuptools', 'matplotlib', 'numpy'],
    dependencyCount: 4,
    importNames: ['networkx'],
    wheelFileName: 'networkx-3.6.1-py3-none-any.whl',
  },
  {
    name: 'matplotlib',
    category: 'graphics',
    version: '3.10.8',
    sizeEstimate: '~6.7 MB (wheel)',
    descriptionTh: 'การสร้างกราฟ แผนภูมิข้อมูล 2 มิติ และ visualization ผ่าน HTML Canvas / SVG',
    status: 'available',
    limitationNoteTh: 'ต้องใช้ non-interactive Agg canvas/SVG backend สำหรับ WebAssembly ไม่สามารถเปิดหน้าต่าง GUI ดั้งเดิมได้',
    dependencies: [
      'contourpy',
      'cycler',
      'fonttools',
      'kiwisolver',
      'numpy',
      'packaging',
      'pillow',
      'pyparsing',
      'python-dateutil',
      'pytz',
    ],
    dependencyCount: 10,
    importNames: ['matplotlib', 'pyplot', 'pylab', 'mpl_toolkits'],
    wheelFileName: 'matplotlib-3.10.8-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
  },
  {
    name: 'pillow',
    category: 'graphics',
    version: '12.2.0',
    sizeEstimate: '~1.0 MB (wheel)',
    descriptionTh: 'การประมวลผลรูปภาพ บันทึก ดัดแปลง และวิเคราะห์พิกเซล (PIL / Pillow)',
    status: 'available',
    dependencies: [],
    dependencyCount: 0,
    importNames: ['PIL'],
    wheelFileName: 'pillow-12.2.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
  },
  {
    name: 'regex',
    category: 'utility',
    version: '2026.3.32',
    sizeEstimate: '~195 KB (wheel)',
    descriptionTh: 'โมดูล Regular Expressions ขั้นสูง รองรับ Unicode ครบถ้วนและ Fuzzy Matching',
    status: 'available',
    dependencies: [],
    dependencyCount: 0,
    importNames: ['regex'],
    wheelFileName: 'regex-2026.3.32-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
  },
  {
    name: 'beautifulsoup4',
    category: 'utility',
    version: '4.14.3',
    sizeEstimate: '~105 KB (wheel)',
    descriptionTh: 'การแยกโครงสร้างและค้นหาข้อมูลใน HTML และ XML (HTML Parser)',
    status: 'available',
    dependencies: ['soupsieve', 'typing-extensions'],
    dependencyCount: 2,
    importNames: ['bs4'],
    wheelFileName: 'beautifulsoup4-4.14.3-py3-none-any.whl',
  },
  {
    name: 'pytz',
    category: 'utility',
    version: '2026.1.post1',
    sizeEstimate: '~500 KB (wheel)',
    descriptionTh: 'ฐานข้อมูลและการคำนวณเขตเวลาสากล (World Timezone Database)',
    status: 'available',
    dependencies: [],
    dependencyCount: 0,
    importNames: ['pytz'],
    wheelFileName: 'pytz-2026.1.post1-py2.py3-none-any.whl',
  },
  {
    name: 'python-dateutil',
    category: 'utility',
    version: '2.9.0.post0',
    sizeEstimate: '~225 KB (wheel)',
    descriptionTh: 'ส่วนขยายจัดการวันที่ แปลงรูปแบบสตริง และคำนวณช่วงเวลาแบบยืดหยุ่น',
    status: 'available',
    dependencies: ['six'],
    dependencyCount: 1,
    importNames: ['dateutil'],
    wheelFileName: 'python_dateutil-2.9.0.post0-py2.py3-none-any.whl',
  },
  {
    name: 'jinja2',
    category: 'utility',
    version: '3.1.6',
    sizeEstimate: '~135 KB (wheel)',
    descriptionTh: 'เทมเพลตเอนจินทรงพลังสำหรับสร้างข้อความและเอกสารแบบไดนามิก',
    status: 'available',
    dependencies: ['markupsafe'],
    dependencyCount: 1,
    importNames: ['jinja2'],
    wheelFileName: 'jinja2-3.1.6-py3-none-any.whl',
  },
  {
    name: 'pyyaml',
    category: 'utility',
    version: '6.0.3',
    sizeEstimate: '~115 KB (wheel)',
    descriptionTh: 'การอ่านและเขียนโครงสร้างข้อมูลรูปแบบ YAML',
    status: 'available',
    dependencies: [],
    dependencyCount: 0,
    importNames: ['yaml'],
    wheelFileName: 'pyyaml-6.0.3-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
  },
  {
    name: 'tqdm',
    category: 'utility',
    version: '4.67.3',
    sizeEstimate: '~78 KB (wheel)',
    descriptionTh: 'แสดงแถบความคืบหน้า (Progress bar) สำหรับลูปและการประมวลผล',
    status: 'available',
    dependencies: [],
    dependencyCount: 0,
    importNames: ['tqdm'],
    wheelFileName: 'tqdm-4.67.3-py3-none-any.whl',
  },
  {
    name: 'micropip',
    category: 'utility',
    version: '0.11.1',
    sizeEstimate: '~110 KB (wheel)',
    descriptionTh: 'ตัวจัดการและติดตั้งแพ็กเกจสำหรับ Pyodide WebAssembly (เฉพาะ same-origin)',
    status: 'available',
    limitationNoteTh: 'ติดตั้งได้เฉพาะแพ็กเกจจาก same-origin lock หรือแพ็กเกจที่อนุญาตภายใต้ CSP',
    dependencies: [],
    dependencyCount: 0,
    importNames: ['micropip'],
    wheelFileName: 'micropip-0.11.1-py3-none-any.whl',
  },
];

export const BROWSER_UNSUPPORTED_PACKAGES: PackageInfo[] = [
  {
    name: 'tkinter',
    category: 'graphics',
    version: 'n/a',
    sizeEstimate: 'unsupported',
    descriptionTh: 'โมดูล GUI ดั้งเดิมของระบบเดสก์ท็อป (Tcl/Tk)',
    status: 'unsupported',
    limitationNoteTh: 'WebAssembly ไม่มีหน้าต่างระบบปฏิบัติการ ต้องแสดงผลผ่าน HTML Canvas / SVG / DOM',
  },
  {
    name: 'pygame',
    category: 'graphics',
    version: 'n/a',
    sizeEstimate: 'unsupported',
    descriptionTh: 'ไลบรารีสร้างเกม 2D ด้วย SDL เนทีฟ',
    status: 'unsupported',
    limitationNoteTh: 'ไม่รองรับ SDL windowing ดั้งเดิมบนเบราว์เซอร์ ใช้ 3D Canvas / Web Animation แทน',
  },
  {
    name: 'multiprocessing',
    category: 'utility',
    version: 'n/a',
    sizeEstimate: 'unsupported',
    descriptionTh: 'การแยกโพรเซสทำงานคู่ขนานผ่าน OS fork/spawn',
    status: 'unsupported',
    limitationNoteTh: 'WebAssembly ไม่อนุญาตให้ fork process ใน OS รองรับเฉพาะ Web Worker เดี่ยว',
  },
  {
    name: 'socket',
    category: 'utility',
    version: 'n/a',
    sizeEstimate: 'unsupported',
    descriptionTh: 'Raw TCP/UDP socket bind และเซิร์ฟเวอร์เครือข่าย',
    status: 'unsupported',
    limitationNoteTh: 'เบราว์เซอร์ sandbox ไม่อนุญาต raw socket bind การเรียกเครือข่ายต้องผ่าน fetch API ภายใต้ CORS',
  },
  {
    name: 'subprocess',
    category: 'utility',
    version: 'n/a',
    sizeEstimate: 'unsupported',
    descriptionTh: 'การสั่งรันโปรแกรมภายนอกของระบบปฏิบัติการ',
    status: 'unsupported',
    limitationNoteTh: 'เบราว์เซอร์ sandbox ไม่อนุญาตให้เข้าถึงโปรแกรมภายนอกของ OS',
  },
];

export interface BrowserLimitation {
  titleTh: string;
  severity: 'info' | 'warning' | 'restricted';
  detailTh: string;
}

export const BROWSER_LIMITATIONS: BrowserLimitation[] = [
  {
    titleTh: 'การทำงานในสภาพแวดล้อมเบราว์เซอร์ (WebAssembly)',
    severity: 'info',
    detailTh: 'โค้ด Python ประมวลผลบนเครื่องของคุณ 100% ผ่าน Pyodide WebAssembly โดยไม่มีการส่งโค้ดไปยังเซิร์ฟเวอร์ภายนอก',
  },
  {
    titleTh: 'ข้อจำกัดด้านเน็ตเวิร์กและ Raw Sockets',
    severity: 'restricted',
    detailTh: 'ไม่รองรับ socket.bind() หรือการเปิดเซิร์ฟเวอร์รับการเชื่อมต่อ การเรียก HTTP ต้องผ่าน fetch API และติดข้อจำกัด CORS ของเบราว์เซอร์',
  },
  {
    titleTh: 'ไม่รองรับ Desktop GUI ดั้งเดิม',
    severity: 'restricted',
    detailTh: 'โมดูล GUI ดั้งเดิมอย่าง Tkinter, PyQt หรือ Pygame ไม่สามารถเปิดหน้าต่างระบบได้ การแสดงผลทำผ่าน Canvas 3D และ Web DOM เท่านั้น',
  },
  {
    titleTh: 'การประมวลผลแบบ Multiprocessing',
    severity: 'warning',
    detailTh: 'WebAssembly ไม่รองรับการ fork process ในระบบปฏิบัติการ โมดูล multiprocessing จึงไม่พร้อมใช้งาน (รองรับ Single-thread และ Web Worker)',
  },
  {
    titleTh: 'ระบบไฟล์เสมือน (Virtual In-Memory VFS)',
    severity: 'info',
    detailTh: 'การเปิดหรือเขียนไฟล์ด้วย open() จะเกิดขึ้นในหน่วยความจำเบราว์เซอร์ ไม่กระทบไฟล์จริงในเครื่องคอมพิวเตอร์ของคุณ',
  },
  {
    titleTh: 'ความปลอดภัย Same-Origin และ Content Security Policy (CSP)',
    severity: 'info',
    detailTh: 'แพ็กเกจทั้งหมดโหลดจาก Same-Origin /runtime/ พร้อมตรวจสอบ SHA-256 เทียบกับ Pyodide Lockfile ทางการ ป้องกันมัลแวร์จากล้อภายนอก',
  },
];

export function getPackageInfo(name: string): PackageInfo | undefined {
  const clean = name.trim().toLowerCase();
  return (
    CURATED_PACKAGES.find((p) => p.name.toLowerCase() === clean) ||
    BROWSER_UNSUPPORTED_PACKAGES.find((p) => p.name.toLowerCase() === clean)
  );
}

export function getCompatiblePackages(): PackageInfo[] {
  return CURATED_PACKAGES.filter((p) => p.status === 'available');
}

export function getPackagesByCategory(category: PackageInfo['category']): PackageInfo[] {
  return CURATED_PACKAGES.filter((p) => p.category === category);
}

export function isPackageAvailable(name: string): boolean {
  const info = getPackageInfo(name);
  return !!info && info.status === 'available';
}
