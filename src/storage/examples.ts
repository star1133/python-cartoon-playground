export interface CodeExample {
  id: string;
  title: string;
  category: 'world' | 'general';
  description: string;
  code: string;
}

export const EXAMPLES: CodeExample[] = [
  {
    id: 'visual_names', title: 'ดูด้วยภาพ — ชื่อเดิม ค่าใหม่', category: 'general',
    description: 'ลองทายค่าที่พิมพ์: = ผูกชื่อกับข้อมูลใหม่ ไม่ใช่การเปรียบเทียบ ==',
    code: `score = 4
score = 9
bonus = score + 2
print(score)
print(bonus)
`,
  },
  {
    id: 'visual_range', title: 'ดูด้วยภาพ — range และการเยื้อง', category: 'general',
    description: 'สังเกต step เริ่มที่ 0 ไม่รวม 4; บรรทัดนอกลูปทำครั้งเดียว',
    code: `for step in range(4):
    print("รอบ", step)
print("จบแล้ว")
`,
  },
  {
    id: 'visual_while', title: 'ดูด้วยภาพ — ตรวจซ้ำ เปลี่ยนค่า หยุด', category: 'general',
    description: 'สังเกต counter ที่เปลี่ยนก่อนย้อนกลับไป while โดยไม่คำนวณเงื่อนไขซ้ำในภาพ',
    code: `counter = 0
while counter < 3:
    print("รอบ", counter)
    counter += 1
print("ออกจากลูป", counter)
`,
  },
  {
    id: 'visual_instances', title: 'ดูด้วยภาพ — แบบเดียวกัน คนละอ็อบเจกต์', category: 'general',
    description: 'สร้างอ็อบเจกต์จากคลาสเดียวกันแล้วแก้ค่าของชิ้นหนึ่ง อีกชิ้นยังมีค่าของตัวเอง',
    code: `class Counter:
    def __init__(self, value):
        self.value = value

first = Counter(2)
second = Counter(8)
first.value += 1
print(first.value, second.value)
`,
  },
  {
    id: 'visual_name_error', title: 'ดูด้วยภาพ — ใช้ชื่อก่อนสร้างจะเกิดอะไร', category: 'general',
    description: 'ตัวอย่างนี้ตั้งใจให้เกิด NameError ลองเพิ่ม missing = 6 ก่อน print แล้วรันอีกครั้ง',
    code: `known = 6
print(known)
print(missing)
`,
  },
  {
    id: 'general_shopping',
    title: 'Python ทั่วไป — คำนวณยอดสินค้า',
    category: 'general',
    description: 'เขียน Python ตามปกติ ไม่ต้องใช้คำสั่งพิเศษ แล้วดูตัวแปรและการทำงานด้วยภาพ',
    code: `prices = [120, 80, 50]
total = 0

for price in prices:
    total += price

print("ยอดรวม:", total)
`,
  },
  {
    id: 'world_loop',
    title: '1. ผจญภัยสู่หีบสมบัติ (World Loop)',
    category: 'world',
    description: 'ตัวอย่างพื้นฐาน: วนลูปเดิน 4 ก้าวในฉาก 3 มิติ มุ่งหน้าสู่หีบสมบัติ',
    code: `from playground_world import move_forward

print("เริ่มต้นการเดินทางสู่หีบสมบัติ!")
for step in range(4):
    print(f"ก้าวที่ {step + 1}")
    move_forward()

print("ยินดีด้วย! คุณมาถึงหีบสมบัติแล้ว")
`,
  },
  {
    id: 'world_maze',
    title: '2. เขาวงกตและการเลี้ยว (Navigation)',
    category: 'world',
    description: 'ตัวอย่างการเลี้ยวซ้าย-ขวา เดินผ่านทางแยกในโลก 3 มิติ',
    code: `from playground_world import move_forward, turn_left, turn_right

print("เริ่มภารกิจเดินผ่านเส้นทางเลี้ยว...")
move_forward()
move_forward()

turn_right()
move_forward()
move_forward()

turn_left()
move_forward()
print("ถึงจุดหมายปลายทางเรียบร้อย!")
`,
  },
  {
    id: 'general_list',
    title: '3. ลิสต์และการวนซ้ำ (List & Loops)',
    category: 'general',
    description: 'สร้างรายการ คำนวณผลรวม หาค่าเฉลี่ย และคัดกรองเลขคู่',
    code: `# การจัดการข้อมูลด้วย List ใน Python
numbers = [12, 45, 78, 23, 56, 89, 90]
total = 0
evens = []

for num in numbers:
    total += num
    if num % 2 == 0:
        evens.append(num)

average = total / len(numbers)
print(f"ผลรวม: {total}")
print(f"ค่าเฉลี่ย: {average:.2f}")
print(f"เลขคู่ทั้งหมด: {evens}")
`,
  },
  {
    id: 'general_functions',
    title: '4. ฟังก์ชันและ Call Stack (Recursion)',
    category: 'general',
    description: 'จำลองการทำงานของ Call Stack ด้วยฟังก์ชันเรียกซ้ำ Factorial',
    code: `# ฟังก์ชันเรียกซ้ำเพื่อสังเกต Call Stack
def factorial(n):
    print(f"กำลังคำนวณ factorial({n})")
    if n <= 1:
        return 1
    result = n * factorial(n - 1)
    return result

target = 4
answer = factorial(target)
print(f"ผลลัพธ์ของ {target}! คือ {answer}")
`,
  },
  {
    id: 'general_json',
    title: '5. การประมวลผลข้อมูล (JSON & Dict)',
    category: 'general',
    description: 'แปลง JSON เป็นพจนานุกรม วนลูปสรุปผลและคิดเกรด',
    code: `import json

raw_json = '''
[
  {"name": "สมชาย", "score": 85, "role": "Warrior"},
  {"name": "สุดา", "score": 92, "role": "Mage"},
  {"name": "อนันต์", "score": 78, "role": "Archer"}
]
'''

students = json.loads(raw_json)
print(f"ประมวลผลข้อมูลทั้งหมด {len(students)} คน:")

for s in students:
    grade = "A" if s["score"] >= 80 else "B"
    print(f"- {s['name']} ({s['role']}): คะแนน {s['score']} -> เกรด {grade}")
`,
  },
  {
    id: 'general_classes',
    title: '6. คลาสและอ็อบเจกต์ (Classes & OOP)',
    category: 'general',
    description: 'สร้างคลาส RobotHero มีแอตทริบิวต์และเมธอดอัปเลเวล',
    code: `class RobotHero:
    def __init__(self, name: str, battery: int = 100):
        self.name = name
        self.battery = battery
        self.level = 1

    def train(self, hours: int):
        cost = hours * 15
        self.battery -= cost
        self.level += 1
        print(f"[{self.name}] ซ้อม {hours} ชม. -> เลเวล {self.level} (แบตเตอรี่คงเหลือ {self.battery}%)")

bot = RobotHero("บลูมี่ (BlueBot)")
bot.train(2)
bot.train(3)
print(f"สถานะสุดท้าย: {bot.name} เลเวล {bot.level}")
`,
  },
];
