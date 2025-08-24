/**
 * Example usage of the Spectrum API client
 * This file demonstrates how to use the various functions provided by the Spectrum API client
 */

import {
  getSpectrumUserId,
  fetchSpectrumMemberByHandle,
  fetchSpectrumMemberById,
  SpectrumAPIClient,
} from "./spectrum.js"
import {
  getSpectrumUserIdByHandle,
  getSpectrumMemberInfo,
  batchGetSpectrumUserIds,
  validateSpectrumHandle,
} from "../../api/routes/v1/util/spectrum.js"

/**
 * Example 1: Get a user's Spectrum ID from their RSI handle
 * This is the main functionality you requested
 */
async function exampleGetSpectrumUserId() {
  console.log("=== Example 1: Get Spectrum User ID ===")

  try {
    // Using the convenience function
    const spectrumId = await getSpectrumUserId("Khuzdul")

    if (spectrumId) {
      console.log(`✅ Found Spectrum user ID: ${spectrumId}`)
    } else {
      console.log("❌ User not found")
    }
  } catch (error) {
    console.error("❌ Error:", error)
  }
}

/**
 * Example 2: Get detailed member information
 */
async function exampleGetMemberInfo() {
  console.log("\n=== Example 2: Get Member Info ===")

  try {
    const memberInfo = await fetchSpectrumMemberByHandle("Khuzdul")

    if (memberInfo.success && memberInfo.data) {
      console.log("✅ Member info retrieved:")
      console.log(`  - ID: ${memberInfo.data.member.id}`)
      console.log(`  - Handle: ${memberInfo.data.member.nickname}`)
      console.log(`  - Display Name: ${memberInfo.data.member.displayname}`)
      console.log(
        `  - Avatar: ${memberInfo.data.member.avatar || "Not available"}`,
      )
    } else {
      console.log("❌ Failed to get member info")
    }
  } catch (error) {
    console.error("❌ Error:", error)
  }
}

/**
 * Example 3: Using the utility functions
 */
async function exampleUtilityFunctions() {
  console.log("\n=== Example 3: Utility Functions ===")

  try {
    // Validate a handle
    const isValid = await validateSpectrumHandle("Khuzdul")
    console.log(`✅ Handle validation: ${isValid ? "Valid" : "Invalid"}`)

    // Get member info using utility function
    const memberInfo = await getSpectrumMemberInfo("Khuzdul")
    if (memberInfo) {
      console.log(`✅ Member info via utility: ${memberInfo.display_name}`)
    }
  } catch (error) {
    console.error("❌ Error:", error)
  }
}

/**
 * Example 4: Batch lookup multiple handles
 */
async function exampleBatchLookup() {
  console.log("\n=== Example 4: Batch Lookup ===")

  try {
    const handles = ["Khuzdul", "Nobody", "TestUser"]
    const results = await batchGetSpectrumUserIds(handles)

    console.log("✅ Batch lookup results:")
    for (const [handle, spectrumId] of Object.entries(results)) {
      console.log(`  - ${handle}: ${spectrumId || "Not found"}`)
    }
  } catch (error) {
    console.error("❌ Error:", error)
  }
}

/**
 * Example 5: Using the client instance directly
 */
async function exampleDirectClientUsage() {
  console.log("\n=== Example 5: Direct Client Usage ===")

  try {
    // Create a custom client instance
    const customClient = new SpectrumAPIClient(
      "your-rsi-token",
      "your-device-id",
    )

    // Use the client methods
    const spectrumId = await customClient.getSpectrumUserId("Khuzdul")
    console.log(`✅ Custom client result: ${spectrumId || "Not found"}`)
  } catch (error) {
    console.error("❌ Error:", error)
  }
}

/**
 * Main function to run all examples
 */
async function runExamples() {
  console.log("🚀 Running Spectrum API Client Examples\n")

  await exampleGetSpectrumUserId()
  await exampleGetMemberInfo()
  await exampleUtilityFunctions()
  await exampleBatchLookup()
  await exampleDirectClientUsage()

  console.log("\n✨ All examples completed!")
}

// Export the examples for use in other files
export {
  exampleGetSpectrumUserId,
  exampleGetMemberInfo,
  exampleUtilityFunctions,
  exampleBatchLookup,
  exampleDirectClientUsage,
  runExamples,
}

// Uncomment the line below to run examples when this file is executed directly
// runExamples().catch(console.error)
