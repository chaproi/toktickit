# Lab 1 - Test Plan and Evidence

All automated test files are stored under `server/tests/lab-01/` and `client/tests/lab-01/`.

| Test ID | Test File                                | Tool      | Test Description                                                                      | Result |
| ------- | ---------------------------------------- | --------- | ------------------------------------------------------------------------------------- | ------ |
| API-01  | `server/tests/lab-01/health.test.ts`     | Supertest | `GET /api/health` returns HTTP 200 with `status: "ok"` and `service: "TokTickIT API"` | Passed |
| API-02  | `server/tests/lab-01/categories.test.ts` | Supertest | `GET /api/categories` returns the four seeded categories in ID order                  | Passed |
| UI-01   | `client/tests/lab-01/App.test.tsx`       | Vitest    | The TokTickIT heading renders correctly                                               | Passed |
| UI-02   | `client/tests/lab-01/App.test.tsx`       | Vitest    | The loading state changes to Online and displays all four categories                  | Passed |
| UI-03   | `client/tests/lab-01/App.test.tsx`       | Vitest    | An API failure displays Offline with a useful error message                           | Passed |

## Server Test Result

```text
Test Files  2 passed (2)
Tests       2 passed (2)
```

## Client Test Result

```text
Test Files  1 passed (1)
Tests       3 passed (3)
```

All five required tests passed. The complete test commands will also be run again on the final `main` branch before submission.
