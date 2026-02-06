/**
 * Integration test for UEXCorp API
 * Tests real API interactions without database
 */

import { describe, it, expect } from "vitest"

const UEXCORP_BASE_URL = "https://api.uexcorp.uk/2.0"

describe("UEXCorp API Integration", () => {
  it("should fetch items by category", async () => {
    // UEX API requires id_category, id_company, or uuid parameter
    // Let's fetch all categories first
    const categoriesResponse = await fetch(`${UEXCORP_BASE_URL}/categories`, {
      headers: { accept: "application/json" },
    })

    expect(categoriesResponse.ok).toBe(true)
    const categoriesData = await categoriesResponse.json()

    expect(categoriesData).toHaveProperty("data")
    expect(Array.isArray(categoriesData.data)).toBe(true)

    if (categoriesData.data.length === 0) {
      console.log("No categories found, skipping test")
      return
    }

    const categoryId = categoriesData.data[0].id
    console.log(`Testing with category ID: ${categoryId}`)

    // Fetch items for this category
    const itemsResponse = await fetch(
      `${UEXCORP_BASE_URL}/items?id_category=${categoryId}`,
      {
        headers: { accept: "application/json" },
      },
    )

    expect(itemsResponse.ok).toBe(true)
    const itemsData = await itemsResponse.json()

    expect(itemsData).toHaveProperty("data")
    expect(Array.isArray(itemsData.data)).toBe(true)

    if (itemsData.data.length > 0) {
      const item = itemsData.data[0]
      expect(item).toHaveProperty("id")
      expect(item).toHaveProperty("name")
      console.log(`Found ${itemsData.data.length} items in category`)
    }
  })

  it("should fetch item attributes by item id", async () => {
    // Get categories first
    const categoriesResponse = await fetch(`${UEXCORP_BASE_URL}/categories`, {
      headers: { accept: "application/json" },
    })

    const categoriesData = await categoriesResponse.json()
    if (!categoriesData.data || categoriesData.data.length === 0) {
      console.log("No categories found, skipping test")
      return
    }

    // Get items from first category
    const categoryId = categoriesData.data[0].id
    const itemsResponse = await fetch(
      `${UEXCORP_BASE_URL}/items?id_category=${categoryId}`,
      {
        headers: { accept: "application/json" },
      },
    )

    const itemsData = await itemsResponse.json()
    if (!itemsData.data || itemsData.data.length === 0) {
      console.log("No items found, skipping test")
      return
    }

    const testItem = itemsData.data[0]
    console.log(`Testing attributes for: ${testItem.name} (ID: ${testItem.id})`)

    // Fetch attributes for this item
    const attrsResponse = await fetch(
      `${UEXCORP_BASE_URL}/items_attributes?id_item=${testItem.id}`,
      {
        headers: { accept: "application/json" },
      },
    )

    expect(attrsResponse.ok).toBe(true)
    const attrsData = await attrsResponse.json()

    expect(attrsData).toHaveProperty("data")
    expect(Array.isArray(attrsData.data)).toBe(true)

    if (attrsData.data.length > 0) {
      const attr = attrsData.data[0]
      expect(attr).toHaveProperty("attribute_name")
      expect(attr).toHaveProperty("value")
      console.log(`Found ${attrsData.data.length} attributes`)
    } else {
      console.log("No attributes found for this item")
    }
  })

  it("should simulate name-based search workflow", async () => {
    // Get categories
    const categoriesResponse = await fetch(`${UEXCORP_BASE_URL}/categories`, {
      headers: { accept: "application/json" },
    })

    const categoriesData = await categoriesResponse.json()
    if (!categoriesData.data || categoriesData.data.length === 0) {
      console.log("No categories found, skipping test")
      return
    }

    // Get items from first category
    const categoryId = categoriesData.data[0].id
    const itemsResponse = await fetch(
      `${UEXCORP_BASE_URL}/items?id_category=${categoryId}`,
      {
        headers: { accept: "application/json" },
      },
    )

    const itemsData = await itemsResponse.json()
    if (!itemsData.data || itemsData.data.length === 0) {
      console.log("No items found, skipping test")
      return
    }

    const testName = itemsData.data[0].name
    console.log(`Searching for item by name: ${testName}`)

    // Simulate case-insensitive name search
    const found = itemsData.data.find(
      (item: any) => item.name?.toLowerCase() === testName.toLowerCase(),
    )

    expect(found).toBeDefined()
    expect(found.name).toBe(testName)
    console.log("Successfully found item by name match")
  })
})
