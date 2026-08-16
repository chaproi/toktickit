# Lab 1 - AI Use and Reflection

## AI Model and Agent Environment

* **LLM / Model:** GPT-5-based model
* **AI Agent:** OpenAI Codex through ChatGPT Work
* **Agent role:** ช่วยวิเคราะห์ข้อกำหนด วางแผนขั้นตอน แนะนำการเขียนโค้ด แก้ปัญหา ตรวจสอบ Pull Request และจัดทำเอกสาร

## Selected Key Prompts

| # | Actual Prompt Text                                                                                                                                     | What I Did with the Result                                                                                          |
| - | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 1 | ช่วยอ่านข้อกำหนด TokTickIT Lab 1 ทั้งหมด อธิบายสิ่งที่ต้องทำอย่างละเอียด และวางแผนแยกงานตาม Issues ทั้ง 4 ข้อ                                          | ใช้สรุปขอบเขตของแต่ละ Issue, ลำดับ dependencies, tests และหลักฐานที่ต้องส่งก่อนเริ่มพัฒนา                           |
| 2 | ช่วยอธิบายขั้นตอนสร้าง `main`, `lab1-staging` และ feature branches แบบไม่ข้ามขั้น โดยให้ทุก Feature PR เข้า `lab1-staging` ไม่ใช่ `main`               | ใช้เตรียม Git workflow และตรวจสอบ branch ปัจจุบันทุกครั้งก่อนแก้ไขหรือ Commit                                       |
| 3 | ช่วยตรวจ Project Foundation ของ Issue 1 ว่าต้องติดตั้งและทดสอบ Frontend, Backend, PostgreSQL และ Prisma อย่างไร                                        | ทำตามคำแนะนำทีละขั้น แล้วตรวจสอบ Client build, Server build, `.gitignore`, `.env.example` และ README ด้วยตนเอง      |
| 4 | Implement `GET /api/health` ให้คืน HTTP 200 และ JSON `{"status":"ok","service":"TokTickIT API"}` โดยทำเฉพาะ Issue 2 และไม่เพิ่ม Category feature       | ใช้เป็นแนวทางสร้าง Health endpoint และ Supertest จากนั้นตรวจผลใน Browser และทดสอบ Online/Offline ด้วยตนเอง          |
| 5 | สร้าง Prisma `Category` model และ seed ข้อมูล Account and Access, Hardware, Software และ Network โดย seed ต้องรันซ้ำแล้วไม่เกิดข้อมูลซ้ำ               | ใช้ทำ Issue 3 และตรวจด้วยตนเองว่า Model มี `id`, unique `name`, `createdAt` รวมถึงใช้ `upsert` และรัน seed สองครั้ง |
| 6 | Implement `GET /api/categories` ให้ดึงข้อมูลจาก PostgreSQL ผ่าน Prisma เรียงตาม `id` และส่งกลับเฉพาะ `id` กับ `name`                                   | ใช้ทำ Category API และ Supertest จากนั้นตรวจสอบว่าผลลัพธ์มีสี่หมวดหมู่และเรียงลำดับถูกต้อง                          |
| 7 | สร้าง React UI สำหรับปุ่ม Check System ที่มี Loading, Online, Offline และแสดง Category ทั้ง 4 รายการ พร้อมเขียน Vitest สำหรับ success และ error states | ใช้เป็นแนวทางแก้ `api.ts`, `App.tsx` และ `App.test.tsx` แล้วรัน Client tests, production build และทดสอบหน้าเว็บจริง |
| 8 | ช่วยตรวจ Pull Request เทียบกับ Acceptance Criteria และช่วยเรียบเรียงข้อความ Review แบบสุภาพและเข้าใจง่าย                                               | ใช้ช่วยตรวจ Files changed ก่อน Approve หรือ Request changes และตรวจแยกขอบเขตของแต่ละ Issue ไม่ให้ปนกัน              |
| 9 | ช่วยตรวจงานทั้งหมดก่อน Merge เข้า `main` ว่าขาด Tests, Reviewer record, AI use, README, PR links หรือหลักฐานอะไรบ้าง                                   | ใช้เป็น Checklist สำหรับแก้ `tests.md`, `reviewer.md`, `ai_use.md` และเตรียมรันทดสอบซ้ำบน final `main` branch       |

## Reflection

ช่วงแรกผมใช้ Prompt ที่สั้นเกินไป ทำให้คำแนะนำบางครั้งรวมงานหลาย Issue เข้าด้วยกัน หลังจากนั้นผมจึงระบุหมายเลข Issue, branch, Acceptance Criteria, ผลลัพธ์ และ tests ที่ต้องการให้ชัดเจนขึ้น ทำให้คำตอบตรงกับขอบเขตของงานมากกว่าเดิม ผมไม่ได้ใช้ผลลัพธ์จาก AI ทันทีทั้งหมด แต่ตรวจ Files changed, ทดสอบโปรแกรม และแก้หรือปฏิเสธคำแนะนำที่ทำให้งานของ Issue อื่นปะปนเข้ามาก่อน Commit และ Merge ทุกครั้ง
