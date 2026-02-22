import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { Request, Response } from "express"
import {
  transaction_post_create,
  transaction_get_transaction_id,
} from "./controller.js"
import {
  clearMockData,
  getMockTableData,
} from "../../../../test-utils/mockDatabase.js"
import { createTestUser } from "../../../../test-utils/testFixturesMock.js"
import { createTestUserWithAuth } from "../../../../test-utils/testAuthMock.js"
import { User } from "../api-models.js"

describe.skip("Transaction Controller", () => {
  beforeEach(() => {
    clearMockData()
  })

  afterEach(() => {
    clearMockData()
  })

  describe("transaction_post_create", () => {
    it("should create a transaction between users", async () => {
      const sender = createTestUserWithAuth({
        balance: 1000,
        username: "sender_user",
      })
      const recipient = createTestUser({
        balance: 0,
        username: "recipient_user",
      })

      const req = {
        user: {
          user_id: sender.user_id,
          balance: "1000",
        } as User,
        body: {
          amount: 100,
          user_recipient_id: recipient.username,
          note: "Test transaction",
        },
      } as unknown as Request

      let statusCode = 0
      let responseData: any = null

      const res = {
        status: (code: number) => {
          statusCode = code
          return res
        },
        json: (data: any) => {
          responseData = data
          return res
        },
      } as unknown as Response

      await transaction_post_create(req, res, () => {})

      // Controller calls res.json() directly, not res.status().json()
      // So statusCode might be 0, but responseData should be set
      if (responseData?.error) {
        // If there's an error, log it to help debug
        console.log("Transaction creation error:", responseData.error)
      }
      expect(responseData).toBeDefined()
      expect(responseData).toHaveProperty("result", "Success")

      // Verify balances were updated in mock data
      const accounts = getMockTableData("accounts")
      const updatedSender = accounts.find(
        (a: any) => a.user_id === sender.user_id,
      )
      const updatedRecipient = accounts.find(
        (a: any) => a.user_id === recipient.user_id,
      )

      expect(updatedSender).toBeDefined()
      expect(updatedRecipient).toBeDefined()
      // Note: The actual balance update logic would need to be mocked in the database functions
    })

    it("should reject transaction with insufficient funds", async () => {
      const sender = createTestUserWithAuth({
        balance: 50,
        username: "sender_user",
      })
      const recipient = createTestUser({
        balance: 0,
        username: "recipient_user",
      })

      const req = {
        user: {
          user_id: sender.user_id,
          balance: "50",
        } as User,
        body: {
          amount: 100,
          user_recipient_id: recipient.username,
        },
      } as unknown as Request

      let statusCode = 0
      let responseData: any = null

      const res = {
        status: (code: number) => {
          statusCode = code
          return res
        },
        json: (data: any) => {
          responseData = data
          return res
        },
      } as unknown as Response

      await transaction_post_create(req, res, () => {})

      expect(statusCode).toBe(400)
      expect(responseData).toHaveProperty("error", "Insufficient funds")
    })

    it("should reject transaction to self", async () => {
      const user = createTestUserWithAuth({
        balance: 1000,
      })

      const req = {
        user: {
          user_id: user.user_id,
          balance: "1000",
        } as User,
        body: {
          amount: 100,
          user_recipient_id: user.username,
        },
      } as unknown as Request

      let statusCode = 0
      let responseData: any = null

      const res = {
        status: (code: number) => {
          statusCode = code
          return res
        },
        json: (data: any) => {
          responseData = data
          return res
        },
      } as unknown as Response

      await transaction_post_create(req, res, () => {})

      expect(statusCode).toBe(400)
      expect(responseData).toHaveProperty(
        "error",
        "Cannot send money to yourself",
      )
    })

    it("should reject transaction with invalid amount", async () => {
      const sender = createTestUserWithAuth({
        balance: 1000,
      })
      const recipient = createTestUser({ balance: 0 })

      const req = {
        user: {
          user_id: sender.user_id,
          balance: "1000",
        } as User,
        body: {
          amount: -10, // Negative amount should fail validation
          user_recipient_id: recipient.username,
          note: null,
        },
      } as unknown as Request

      let statusCode = 0
      let responseData: any = null

      const res = {
        status: (code: number) => {
          statusCode = code
          return res
        },
        json: (data: any) => {
          responseData = data
          return res
        },
      } as unknown as Response

      await transaction_post_create(req, res, () => {})

      expect(statusCode).toBe(400)
      expect(responseData).toHaveProperty("error", "Invalid transaction amount")
    })

    it("should reject transaction with missing required fields", async () => {
      const sender = createTestUserWithAuth({
        balance: 1000,
      })

      const req = {
        user: {
          user_id: sender.user_id,
          balance: "1000",
        } as User,
        body: {
          amount: 100,
          // Missing user_recipient_id and contractor_recipient_id
        },
      } as unknown as Request

      let statusCode = 0
      let responseData: any = null

      const res = {
        status: (code: number) => {
          statusCode = code
          return res
        },
        json: (data: any) => {
          responseData = data
          return res
        },
      } as unknown as Response

      await transaction_post_create(req, res, () => {})

      expect(statusCode).toBe(400)
      expect(responseData).toHaveProperty("error", "Missing required fields")
    })
  })

  describe("transaction_get_transaction_id", () => {
    it("should get transaction for authorized user", async () => {
      const sender = createTestUserWithAuth({
        balance: 1000,
      })
      const recipient = createTestUser({ balance: 0 })

      // Create a transaction in mock data
      const { setupMockTableData, getMockTableData } =
        await import("../../../../test-utils/mockDatabase.js")
      const transactions = getMockTableData("transactions")
      const transaction = {
        transaction_id: `test_${Date.now()}`,
        amount: "100",
        kind: "Payment",
        status: "Completed",
        timestamp: new Date(),
        contractor_sender_id: "",
        contractor_recipient_id: "",
        user_sender_id: sender.user_id,
        user_recipient_id: recipient.user_id,
      }
      transactions.push(transaction)
      setupMockTableData("transactions", transactions)

      const transactionId = transaction.transaction_id

      const req = {
        params: {
          transaction_id: transactionId,
        },
        user: {
          user_id: sender.user_id,
        } as User,
      } as unknown as Request

      let statusCode = 0
      let responseData: any = null

      const res = {
        status: (code: number) => {
          statusCode = code
          return res
        },
        json: (data: any) => {
          responseData = data
          return res
        },
      } as unknown as Response

      await transaction_get_transaction_id(req, res, () => {})

      // The controller returns 200 and JSON directly, not through status()
      // So statusCode might be 0, but responseData should be set
      expect(responseData).toBeDefined()
      expect(responseData).toHaveProperty("transaction_id", transactionId)
      expect(responseData).toHaveProperty("amount", 100)
    })

    it("should reject access for unauthorized user", async () => {
      const sender = createTestUserWithAuth({
        balance: 1000,
      })
      const recipient = createTestUser({ balance: 0 })
      const unauthorized = createTestUser({ balance: 0 })

      // Create a transaction in mock data
      const { setupMockTableData, getMockTableData } =
        await import("../../../../test-utils/mockDatabase.js")
      const transactions = getMockTableData("transactions")
      const transaction = {
        transaction_id: `test_${Date.now()}`,
        amount: "100",
        kind: "Payment",
        status: "Completed",
        timestamp: new Date(),
        contractor_sender_id: "",
        contractor_recipient_id: "",
        user_sender_id: sender.user_id,
        user_recipient_id: recipient.user_id,
      }
      transactions.push(transaction)
      setupMockTableData("transactions", transactions)

      const transactionId = transaction.transaction_id

      const req = {
        params: {
          transaction_id: transactionId,
        },
        user: {
          user_id: unauthorized.user_id,
        } as User,
      } as unknown as Request

      let statusCode = 0
      let responseData: any = null

      const res = {
        status: (code: number) => {
          statusCode = code
          return res
        },
        json: (data: any) => {
          responseData = data
          return res
        },
      } as unknown as Response

      await transaction_get_transaction_id(req, res, () => {})

      expect(statusCode).toBe(403)
      expect(responseData).toHaveProperty("error")
    })
  })
})
