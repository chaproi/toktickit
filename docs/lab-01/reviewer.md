# Lab 1 - Peer Review Record

## Author

* **Name:** นายสิริกร ฝันนิมิตร
* **Student ID:** `67070507215`
* **GitHub:** [@chaproi](https://github.com/chaproi)

## Peer Reviewers

| Name                  | Student ID    | GitHub                                           |
| --------------------- | ------------- | ------------------------------------------------ |
| ฌาธนัชย์ อุทัยพิบูลย์ | `67070507210` | [@Chxtamos](https://github.com/Chxtamos)         |
| แพรวา สภานนท์         | `67070507213` | [@PhraewaS](https://github.com/PhraewaS)         |
| แทนบุญ เตียวสวัสดิ์   | `67070507211` | [@Tanaboonnnnn](https://github.com/Tanaboonnnnn) |

## Pull Requests I Authored

| PR                                                                             | Source Branch                  | Target Branch  |
| ------------------------------------------------------------------------------ | ------------------------------ | -------------- |
| [PR #5 - Project foundation](https://github.com/chaproi/toktickit/pull/5)      | `feature/1-project-foundation` | `lab1-staging` |
| [PR #6 - API health check](https://github.com/chaproi/toktickit/pull/6)        | `feature/2-health-check`       | `lab1-staging` |
| [PR #7 - Category model and seed](https://github.com/chaproi/toktickit/pull/7) | `feature/3-category-seed`      | `lab1-staging` |
| [PR #8 - Category list](https://github.com/chaproi/toktickit/pull/8)           | `feature/4-category-list`      | `lab1-staging` |
| [PR #9 - Final Lab 1 integration](https://github.com/chaproi/toktickit/pull/9) | `lab1-staging`                 | `main`         |

## Review History for My Pull Requests

| PR                                                   | Reviewer                                         | Review Result                         |
| ---------------------------------------------------- | ------------------------------------------------ | ------------------------------------- |
| [PR #5](https://github.com/chaproi/toktickit/pull/5) | [@PhraewaS](https://github.com/PhraewaS)         | Approved                              |
| [PR #6](https://github.com/chaproi/toktickit/pull/6) | [@PhraewaS](https://github.com/PhraewaS)         | Requested improvements, then Approved |
| [PR #6](https://github.com/chaproi/toktickit/pull/6) | [@Tanaboonnnnn](https://github.com/Tanaboonnnnn) | Approved                              |
| [PR #7](https://github.com/chaproi/toktickit/pull/7) | [@Chxtamos](https://github.com/Chxtamos)         | Approved                              |
| [PR #8](https://github.com/chaproi/toktickit/pull/8) | [@Chxtamos](https://github.com/Chxtamos)         | Approved                              |
| [PR #9](https://github.com/chaproi/toktickit/pull/9) | [@Chxtamos](https://github.com/Chxtamos)         | Approved                              |

## Comments Received on My Pull Requests

### PR #5 - Project Foundation

**Reviewer:** [@PhraewaS](https://github.com/PhraewaS)

> ตรวจสอบแล้ว PR นี้ตรงกับขอบเขตของ Issue 1 และ Target Branch เป็น `lab1-staging` ถูกต้องค่ะ README มีข้อมูลค่อนข้างครบ ทั้ง Technology Stack, วิธี Setup Frontend/Backend และวิธีรัน Tests โดยรวมผ่าน Acceptance Criteria ของ Issue 1 ค่ะ

**How I responded:** I accepted the approval, confirmed the target branch, and merged the Pull Request into `lab1-staging`.

### PR #6 - API Health Check

**Reviewer:** [@PhraewaS](https://github.com/PhraewaS)

> Health Endpoint ฝั่ง Backend ถูกต้องแล้วค่ะ แต่ตอนนี้ใน Diff มีเฉพาะ `server/src/app.ts` ยังไม่เห็นส่วนที่ React เรียก API จริงและแสดง Online/Offline ตาม Acceptance Criteria ของ Issue 2 รบกวนเพิ่มส่วน Frontend และตรวจว่า Supertest ผ่านด้วยนะคะ

**How I responded:**

> แก้ตามที่รีวิวแล้วครับ ตอนนี้เพิ่มให้หน้า React เรียก `GET /api/health` จริงแล้วครับ หน้าเว็บจะแสดง Backend Status: Online เมื่อเชื่อมต่อสำเร็จ และแสดงข้อความ Offline เมื่อปิด Backend
>
> ทดสอบ Supertest ผ่าน 1 test และ Frontend build/test ผ่านแล้วครับ แนบผลการทดสอบไว้ด้านล่าง รบกวนช่วยตรวจอีกครั้งใหม่หน่อยครับ

After the changes, [@PhraewaS](https://github.com/PhraewaS) reviewed the implementation again and approved it.

**Reviewer:** [@Tanaboonnnnn](https://github.com/Tanaboonnnnn)

> สถานะที่เกิดจากการเรียก Backend API ขึ้นเป็นตามที่ควรจะเป็นแล้ว ผ่านครับ

**How I responded:** I kept the verified implementation and merged the approved Pull Request into `lab1-staging`.

### PR #7 - Category Model and Seed

**Reviewer:** [@Chxtamos](https://github.com/Chxtamos)

The reviewer confirmed that:

* The Prisma `Category` model contains `id`, unique `name`, and `createdAt`.
* The migration creates the Category table and unique name index.
* The seed contains Account and Access, Hardware, Software, and Network.
* `prisma.category.upsert()` prevents duplicate records.
* Database credentials were not committed.
* README uses a placeholder for the database password.

**How I responded:** I accepted the approval and merged the completed Issue 3 implementation into `lab1-staging`.

### PR #8 - Category List

**Reviewer:** [@Chxtamos](https://github.com/Chxtamos)

The reviewer confirmed that:

* `GET /api/categories` uses Prisma `findMany()`.
* The API returns only `id` and `name` in ascending ID order.
* Supertest verifies HTTP 200 and all four categories.
* React calls the API through `checkSystem()` and renders the returned data.
* Loading and error states are implemented.
* Vitest covers both successful and failed API requests.
* The branch and merge target follow the required dependency workflow.

**How I responded:** I accepted the approval and merged the completed Issue 4 implementation into `lab1-staging`.

### PR #9 - Final Lab 1 Integration

**Reviewer:** [@Chxtamos](https://github.com/Chxtamos)

> โครงสร้างทุกอย่างถูกต้องหมด แล้วพร้อมสำหรับการ Merge ขึ้น Main

**How I responded:**

> ขอบคุณที่ช่วยตรวจสอบครับ ผมจะตรวจสอบไฟล์เอกสารและผลการทดสอบให้ครบก่อน Merge เข้า main

## Pull Request I Reviewed for My Partner

**Partner:** แพรวา สภานนท์ ([@PhraewaS](https://github.com/PhraewaS))
**Pull Request:** [Lab 1 Final Integration PR #9](https://github.com/PhraewaS/toktickit/pull/9)

### My Initial Verdict: Request Changes

> โดยรวมโค้ดโอเคแล้ว แต่ก่อน Merge ฝากแก้เพิ่มเติม
>
> 1. ใน README ฝากเพิ่มคำสั่ง Prisma migrate กับ seed ด้วย เพื่อให้คนอื่นตั้งฐานข้อมูลตามได้ครบ
> 2. ฝากกรอกไฟล์ `tests.md`, `reviewer.md` และ `ai_use.md` ใน `docs/lab-01` ให้เรียบร้อย
> 3. ขอผลทดสอบของ Client กับ Server แล้วก็ลองรัน seed สองรอบเพื่อเช็กว่าข้อมูลไม่ซ้ำด้วย
>
> แก้แล้ว Push ขึ้นมาได้เลย เดี๋ยวตรวจให้อีกรอบ

### Partner's Response

> แพรวาได้ตรวจสอบและได้กรอกไฟล์ตามที่บอกจนครบแล้วนะคะ รบกวนช่วยเช็คอีกรอบให้หน่อยได้ไหมคะ

### My Final Verdict: Approved

After checking the updated documentation, seed behavior, and test results, I approved the Pull Request with this comment:

> โค้ดและ Tests ผ่านแล้ว
