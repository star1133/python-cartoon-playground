/**
 * ข้อความและแม่แบบคำอธิบายภาษาไทยสำหรับเหตุการณ์การทำงานของ Python
 */
export const THAI_TEMPLATES = {
  // สถานะการทำงาน
  status: {
    ready: 'พร้อมสำหรับการรันโค้ด',
    initializing: 'กำลังเริ่มต้นสภาพแวดล้อม Python ในเบราว์เซอร์...',
    running: 'กำลังประมวลผลโค้ด...',
    paused: 'หยุดการทำงานชั่วคราว (กดถัดไปหรือเล่นต่อเพื่อดำเนินการ)',
    waiting_input: 'รอรับข้อมูลจากผู้ใช้งานผ่านคอนโซล...',
    completed: 'การทำงานของโปรแกรมเสร็จสิ้นอย่างสมบูรณ์',
    stopped: 'หยุดการทำงานโดยผู้ใช้',
    error: 'เกิดข้อผิดพลาดระหว่างการประมวลผล',
  },

  // เหตุการณ์ของโลกเกม 3D
  world: {
    move_forward: (x: number, y: number) => `ตัวละครก้าวไปข้างหน้า 1 ช่อง มุ่งหน้าสู่ตำแหน่ง (${x}, ${y})`,
    turn_left: (dir: string) => `ตัวละครหมุนไปทางซ้าย หันหน้าไปทางทิศ${dir}`,
    turn_right: (dir: string) => `ตัวละครหมุนไปทางขวา หันหน้าไปทางทิศ${dir}`,
    reach_goal: 'ยอดเยี่ยมมาก! ตัวละครเดินทางถึงหีบสมบัติสำเร็จแล้ว',
    blocked: 'ไม่สามารถเดินต่อไปได้เนื่องจากติดสิ่งกีดขวางหรือสุดขอบทาง',
    idle: 'ตัวละครยืนเตรียมพร้อมที่จุดเริ่มต้น',
  },

  // ทิศทาง 4 ทิศ
  directions: ['ตะวันออก', 'ใต้', 'ตะวันตก', 'เหนือ'] as const,

  // คำอธิบายคำสั่งภาษา Python
  syntax: {
    loop_for: (iter: string) => `วนลูป ${iter} ทีละตัว`,
    loop_while: 'ตรวจเงื่อนไข while — จริงหรือเปล่า?',
    condition_if: 'ตรวจเงื่อนไข if...',
    condition_elif: 'ตรวจเงื่อนไขสำรอง elif...',
    condition_else: 'เงื่อนไขไม่จริง → เข้า else',
    assign_pre: (name: string) => `กำลังตั้งค่า "${name}"...`,
    assign_done: (name: string, val: string) => `"${name}" = ${val}`,
    assign: (name: string, _val?: string) => `กำลังตั้งค่า "${name}"...`,
    call: (fn: string) => `เรียก ${fn}() → เปิด Stack Frame ใหม่`,
    return: (fn: string, val?: string) => `${fn}() คืนค่า${val ? ` ${val}` : ''} → ปิด Stack Frame`,
    import: (mod: string) => `โหลดโมดูล ${mod}`,
    print_pre: () => 'กำลัง print...',
    print: (msg?: string) => `แสดงผล${msg ? `: ${msg}` : ''}`,
    class_def: (cls: string) => `สร้างแม่แบบคลาส "${cls}"`,
    exception: (err: string) => `Error: ${err}`,
    generic_line: (line: number) => `› บรรทัดที่ ${line}`,
  },
};
