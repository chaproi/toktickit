# CPE334 Lab4 — ร่างรายงานสำหรับจัด PDF

นายสิริกร ฝันนิมิตร · รหัสนักศึกษา67070507215 · GitHub chaproi

**ยังไม่ใช่รายงานส่งฉบับสุดท้าย:** ต้องเติม final main,ผลตรวจ final main,reflection ที่นักศึกษาเขียนเอง และตรวจภาพ/ลิงก์ใน PDF ก่อนส่ง ผลด้านล่างเป็นหลักฐานที่ทำและได้รับรีวิวแล้ว โดยยังคง revision และข้อจำกัดเดิม

## Answer Part 1 — Git Use with Engineering Workflow (10)

พัฒนางานผ่าน feature branches และ PR เข้า lab4-staging ก่อนนำไปรวม main งาน Final Hardening อยู่ใน [PR58](https://github.com/chaproi/toktickit/pull/58) ซึ่ง cottonlnwza [Approve](https://github.com/chaproi/toktickit/pull/58#pullrequestreview-5769874363) ที่ commit `4eecb5f0ede2688c8fbe4a9b5a55502ea504144e` และ merge เป็น `7fde762d61f25c67335269a9c768bd0dcd1f8ae5` แล้ว ทั้งสอง commit มี Git tree เดียวกัน จึงไม่มีไฟล์เปลี่ยนจากการ merge นี้

**เติมก่อนส่ง:** PR staging→main,ลิงก์ review และ final main SHA จริง ปัจจุบันยังไม่อ้างว่า Lab4 อยู่ใน main แล้ว

## Answer Part 2 — Specification-Driven Development (5)

[Specification](specification.md),[API](api-spec.md) และ [UI](ui-spec.md) แยกข้อกำหนดอาจารย์ ข้อกำหนดสืบทอด SDS และ design decisions มี31FR/46BR/45AC/55planned scenarios สำหรับ traceability รายละเอียด D-12/D-13 ที่นักศึกษารับแล้วใช้ explicit locks ร่วมกับ READ COMMITTED ตามขอบเขตที่รีวิว และเก็บข้อความ/ผลการทดลองเดิมไว้

การอนุมัติ contract กับการตรวจ implementation เป็นคนละเหตุการณ์ หลักฐาน peer review implementation รอบล่าสุดคือ review ของ PR58 ข้างต้น

## Answer Part 3 — Test-Driven Development and Traceability (10)

ตัวอย่าง tests-first ที่บันทึกจริง: Dashboard Navigation RED [09414f9](https://github.com/chaproi/toktickit/commit/09414f9ac39bdcfdaf83e10e5e8661a7bb79dc54) แล้ว GREEN [f81da7f](https://github.com/chaproi/toktickit/commit/f81da7fe0c7ee0f6f77485cc52318585eae71fd1) รายละเอียด initial authoring failures,compatibility corrections และ execution revisions อยู่ใน [tests.md](tests.md) ไม่สร้าง RED เพิ่มสำหรับการจัดเอกสาร

| ชุดหลักฐานก่อน release | ผลที่บันทึกจริง |
| --- | --- |
| Server correctness | 99files/2,110passed แยกเฉพาะ T-47 ออก |
| Client | 24files/352passed และ build ผ่าน ตาม revision ใน ledger |
| Normal comprehensive E2E ล่าสุด | 16files/77passed,0failed/skipped ที่65f4bb1 |
| Performance | B2ผ่านครบหนึ่งรอบ; B3/A4ยังไม่ผ่านบางเกณฑ์และเก็บผลไว้ตามจริง |

[Release handoff](release-handoff-2026-11-04.md) และ [all55 mapping](hardening-closeout-2026-11-04.md) ระบุ source/results/limitations ผลในตารางนี้ไม่ใช่ผลรัน final main **เติมผล final main จริงก่อนส่ง**

## Answer Part 4 — AI Use with Reflection (5)

ใช้ Codex ช่วยวิเคราะห์ contract,ร่าง tests/implementation,ตรวจหลักฐาน และจัดเอกสาร โดยเก็บกิจกรรมและข้อจำกัดใน [ai-use.md](ai-use.md) ตัวอย่าง prompt ที่บันทึกจริงคือ “Act as the specification agent for TokTickIT Lab 4, Issue #41.” และคำขอจัด draft contract ใน P-02 ไม่แต่ง prompt/model/output เพิ่มจากประวัติ

AI image inspection กับการใช้งาน Narrator ของนักศึกษาแยกกัน ผล automated ไม่ถูกเขียนเป็นเสียงที่ AI ได้ยิน

**Reflection — รอคำตอบของนักศึกษา:** อธิบายด้วยคำของตนเองว่าใช้ AI ช่วยอะไร,มีจุดใดต้องตรวจ/แก้ด้วยตนเอง และได้เรียนรู้อะไรจากการทำ Lab4 ไม่ใส่ข้อความแทนนักศึกษาล่วงหน้า

## Answer Part 5 — Working IT Staff Dashboard UI (5)

Staff/Admin มี dashboard สำหรับ Ticket ที่ยังไม่มอบหมาย/ของตนเอง,status,IT priority,recent updates/resolutions และ Actions ที่ assign ให้ผู้ใช้ปัจจุบัน ตัวกรองและ drill-down ต้องใช้ predicate เดียวกับรายการปลายทาง พร้อมข้อมูลขอบเขตเวลาและ empty/error states

หลักฐาน domain/API/component/browser อยู่ใน [tests.md](tests.md) และ [ui-spec.md](ui-spec.md) **เลือกภาพ Staff Dashboard จากหลักฐานเดิมที่อ่านได้ชัด พร้อมระบุ revision/fixture จริงก่อนจัด PDF**

## Answer Part 6 — Working Actions Taken UI (10)

Staff/Admin สร้าง แก้ไข มอบหมาย เริ่ม ทำเสร็จ และยกเลิก Action ตาม state/eligibility guards แยก Created by/Assigned to/Performed by ออกจาก Ticket Owner ใช้ข้อความธรรมดาสำหรับ Attachment Notes และแสดง history แบบอ่านอย่างเดียว Requester เห็นเฉพาะข้อมูลที่อนุญาตบน Ticket ของตนเอง

[Actions evidence](../../artifacts/lab-04/screenshots/actions-taken/evidence.md) และ [gallery](../../artifacts/lab-04/hardening/t37-visual-review-2026-11-04/gallery.md) มีภาพและผลตรวจ **ใช้ภาพพร้อมคำอธิบายตาม capture จริง ไม่อ้างเป็นภาพ final main หากไม่ได้ถ่ายที่ revision นั้น**

## Answer Part 7 — Working Ticket Workflow (5)

Backend บังคับ transition matrix ของ Ticket พร้อม expected token,authorization และ history การ Resolve/Close ต้องไม่มี Action ที่ PLANNED หรือ IN_PROGRESS โดยไม่เพิ่มเงื่อนไขบังคับให้มี completed Action อย่างน้อยหนึ่งรายการ การ Cancel มี cascade สำหรับ unfinished Actions ตาม contract และต้องรักษาประวัติเดิม

[Workflow evidence](../../artifacts/lab-04/screenshots/ticket-workflow/evidence.md),[API contract](api-spec.md) และ [real blocker/retry verification](browser-closeout-2026-11-04.md) เชื่อม direct API/UI assertions และการรักษาสถานะเมื่อ reject

## Answer Part 8 — Working Requester Dashboard and Final Regression UI (5)

Requester dashboard แสดงข้อมูลเฉพาะ Ticket ของผู้ใช้,metric/recent lists และ drill-down ที่ตรงกับตัวกรองเดิม พร้อมคงพฤติกรรม Labs1–3 ด้าน auth,ownership,Comments,private Notes,Attachments และ User Management ตามส่วนที่อนุญาต

[Requester evidence](../../artifacts/lab-04/screenshots/requester-dashboard/evidence.md) และ [student observations](student-requester-observations-2026-11-04.md) บันทึกการใช้งานจริง **เติมตาราง final-main regression และ SHA ก่อนส่ง**

## Answer Part 9 — Zen Green UI, Responsive, Accessibility and Final Polish (5)

มีหลักฐานที่390×844,834×1112,1440×900 และ genuine200% tab zoom พร้อม geometry,keyboard,labels/errors,dialog focus/inertness/return และภาพที่ตรวจแล้ว [Checklist](t37-t38-decision-checklist.md) แยก actual student audio reports,AI visual inspection และ automated evidence ผู้รีวิวรับหลักฐานนี้ว่าเพียงพอในระดับ Lab และไม่พบ blocking defect จาก V48 spacing observation

Browser scope ที่รับแล้วคือ Chrome/Chromium + Microsoft Edge ส่วน engine/OS/AT combinations อื่นยังไม่ได้ตรวจ ไม่อ้าง certified WCAG หรือทุก combination ผ่าน

## ข้อจำกัดและรายการเติมก่อนส่ง

T-47 รับ B2เป็นหนึ่ง complete pass (aggregate p95=401.518ms,18/18targets) โดยเก็บ B3 CREATE p95=506.970ms และ A4 aggregate p95=963.614ms ว่าไม่ผ่าน เกณฑ์ p95<500ms ไม่เปลี่ยน รายละเอียด telemetry,retention และ dependency findings ตาม [hardening audit](hardening-audit.md) ยังคงอยู่ ไม่อ้าง production readiness

ก่อนส่งต้องเติม final main/PR/review/ผลตรวจจริง,ภาพที่อ่านได้พร้อม provenance,reflection ของนักศึกษา และตรวจ PDF ทั้งภาพกับลิงก์ การส่งงานยังไม่ได้ดำเนินการ
