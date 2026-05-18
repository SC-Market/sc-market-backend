/**
 * Extract 3D positional data for celestial bodies and POIs from Star Citizen's p4k game files.
 *
 * Parses .socpak files (ZIP archives containing XML) to extract hierarchical position data
 * for stars, planets, moons, stations, landing zones, outposts, and other points of interest.
 *
 * Usage:
 *   npx tsx scripts/extract-positions.ts --p4k /path/to/Data.p4k --starbreaker /path/to/starbreaker
 *   npx tsx scripts/extract-positions.ts --socpak-dir /tmp/sc-socpak  # If already extracted
 */

import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import AdmZip from "adm-zip"
import * as cheerio from "cheerio"

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 ? args[idx + 1] : undefined
}

const P4K_PATH = getArg("p4k")
const STARBREAKER_BIN = getArg("starbreaker")
const SOCPAK_DIR = getArg("socpak-dir")
const OUTPUT_DIR = getArg("output") || path.join(process.cwd(), "game-data-export")
const DEEP = !args.includes("--no-deep") // Extract planet-level socpaks by default

if (!SOCPAK_DIR && (!P4K_PATH || !STARBREAKER_BIN)) {
  console.error(
    "Usage:\n" +
      "  npx tsx scripts/extract-positions.ts --p4k <Data.p4k> --starbreaker <bin>\n" +
      "  npx tsx scripts/extract-positions.ts --socpak-dir <dir>\n" +
      "\nOptions:\n" +
      "  --output <dir>     Output directory (default: game-data-export)\n" +
      "  --no-deep          Skip planet-level socpak extraction (system-level only)",
  )
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Vec3 {
  x: number
  y: number
  z: number
}

interface Quaternion {
  w: number
  x: number
  y: number
  z: number
}

type BodyType =
  | "star"
  | "planet"
  | "moon"
  | "lagrange"
  | "station"
  | "landing_zone"
  | "outpost"
  | "asteroid_base"
  | "derelict"
  | "jump_point"
  | "comm_array"
  | "other"

interface BodyNode {
  entityName: string
  guid: string | null
  starMapRecord: string | null
  class: string | null
  socpakPath: string | null
  localPosition: Vec3
  absolutePosition: Vec3
  rotation: Quaternion
  type: BodyType
  parent: string | null
  children: BodyNode[]
}

interface SystemOutput {
  name: string
  socpakPath: string
  bodies: BodyNode[]
}

interface PositionsOutput {
  extractedAt: string
  systems: SystemOutput[]
}

// ---------------------------------------------------------------------------
// Vector / Quaternion math
// ---------------------------------------------------------------------------
const IDENTITY_QUAT: Quaternion = { w: 1, x: 0, y: 0, z: 0 }

function isIdentityQuaternion(q: Quaternion, epsilon = 1e-6): boolean {
  return (
    Math.abs(q.w - 1) < epsilon &&
    Math.abs(q.x) < epsilon &&
    Math.abs(q.y) < epsilon &&
    Math.abs(q.z) < epsilon
  )
}

/** Rotate a vector by a quaternion: q * v * q^-1 */
function rotateVec3(v: Vec3, q: Quaternion): Vec3 {
  // For unit quaternions, q^-1 = conjugate
  const qx = q.x,
    qy = q.y,
    qz = q.z,
    qw = q.w
  const vx = v.x,
    vy = v.y,
    vz = v.z

  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy)
  const ty = 2 * (qz * vx - qx * vz)
  const tz = 2 * (qx * vy - qy * vx)

  // result = v + qw * t + cross(q.xyz, t)
  return {
    x: vx + qw * tx + (qy * tz - qz * ty),
    y: vy + qw * ty + (qz * tx - qx * tz),
    z: vz + qw * tz + (qx * ty - qy * tx),
  }
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

/** Multiply two quaternions: a * b */
function multiplyQuat(a: Quaternion, b: Quaternion): Quaternion {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  }
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/** Parse "x,y,z" position string to Vec3 */
function parsePos(posStr: string | undefined): Vec3 {
  if (!posStr) return { x: 0, y: 0, z: 0 }
  const parts = posStr.split(",").map((s) => parseFloat(s.trim()))
  if (parts.length !== 3 || parts.some(isNaN)) {
    console.warn(`  [WARN] Invalid position string: "${posStr}"`)
    return { x: 0, y: 0, z: 0 }
  }
  return { x: parts[0], y: parts[1], z: parts[2] }
}

/** Parse "w,x,y,z" quaternion string to Quaternion */
function parseRot(rotStr: string | undefined): Quaternion {
  if (!rotStr) return { ...IDENTITY_QUAT }
  const parts = rotStr.split(",").map((s) => parseFloat(s.trim()))
  if (parts.length !== 4 || parts.some(isNaN)) {
    console.warn(`  [WARN] Invalid rotation string: "${rotStr}"`)
    return { ...IDENTITY_QUAT }
  }
  return { w: parts[0], x: parts[1], y: parts[2], z: parts[3] }
}

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

/** Infer the body type from entity name and socpak path */
function inferType(entityName: string, socpakPath: string | null): BodyType {
  const en = (entityName || "").toLowerCase()
  const sp = (socpakPath || "").toLowerCase()
  const combined = en + " " + sp

  // Star
  if (en.includes("_star") || sp.includes("/star/") || en.endsWith("_sun")) return "star"

  // Jump point
  if (combined.includes("jumppoint") || combined.includes("jump_point")) return "jump_point"

  // Rest stop / station (check before lagrange since rest stops sit at lagrange points)
  if (
    combined.includes("reststop") ||
    combined.includes("rest_stop") ||
    /(?:^|_)rr_/i.test(en) ||
    combined.includes("cru-l") ||
    combined.includes("hur-l") ||
    combined.includes("arc-l") ||
    combined.includes("mic-l")
  )
    return "station"

  // Lagrange points: L1-L5 markers (only if not already matched as station)
  if (
    combined.includes("lagrange") ||
    /_l[1-5]($|[^a-z0-9])/i.test(en) ||
    /lagrange/i.test(sp)
  )
    return "lagrange"

  // Other stations (generic)
  if (combined.includes("station")) return "station"

  // Landing zone
  if (
    combined.includes("landingzone") ||
    combined.includes("landing_zone") ||
    combined.includes("_newbabbage") ||
    combined.includes("_lorville") ||
    combined.includes("_areacorp") ||
    combined.includes("_area18") ||
    combined.includes("_orison") ||
    combined.includes("_grim_hex") ||
    combined.includes("_grimhex") ||
    combined.includes("_ruin_station")
  )
    return "landing_zone"

  // Comm array
  if (combined.includes("commarray") || combined.includes("comm_array")) return "comm_array"

  // Asteroid base
  if (combined.includes("asteroidbase") || /\bab_/i.test(en)) return "asteroid_base"

  // Derelict
  if (combined.includes("derelict") || combined.includes("drlct")) return "derelict"

  // Outpost
  if (combined.includes("outpost") || combined.includes("_mining_") || combined.includes("_drug_lab"))
    return "outpost"

  // Moon: stanton1a, stanton_1a, stanton1b, etc. or pyro system equivalents
  // Pattern: system name followed by (optional underscore) digit then letter
  if (/(?:stanton|pyro|nyx|terra)_?\d+[a-z](?:$|[^a-z])/i.test(en)) return "moon"
  if (/(?:stanton|pyro|nyx|terra)_?\d+[a-z](?:$|[^a-z])/i.test(sp)) return "moon"

  // Planet: stanton1, stanton_1, stanton2, etc.
  if (/(?:stanton|pyro|nyx|terra)_?\d+(?:$|[^a-z0-9])/i.test(en)) return "planet"
  if (/(?:stanton|pyro|nyx|terra)_?\d+(?:$|[^a-z0-9])/i.test(sp)) return "planet"

  // Also check for explicit planet/moon references
  if (combined.includes("planet")) return "planet"
  if (combined.includes("moon")) return "moon"

  return "other"
}

// ---------------------------------------------------------------------------
// Socpak extraction and parsing
// ---------------------------------------------------------------------------

/** Check if a buffer looks like CryXmlB (binary XML) rather than text XML */
function isCryXmlB(buf: Buffer): boolean {
  // CryXmlB files start with "CryXmlB" magic bytes or a specific binary header
  if (buf.length < 7) return false
  const header = buf.subarray(0, 7).toString("ascii")
  if (header === "CryXmlB") return true
  // Also check for non-printable bytes in the first 100 characters (heuristic)
  const sample = buf.subarray(0, Math.min(100, buf.length))
  let nonPrintable = 0
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i]
    if (b < 9 || (b > 13 && b < 32)) nonPrintable++
  }
  return nonPrintable > 5
}

/**
 * Extract XML content from a .socpak file (which is a ZIP archive).
 * Returns the XML string of the main container XML file inside the socpak.
 */
function extractXmlFromSocpak(
  socpakPath: string,
  starbreaker: string | undefined,
): string | null {
  try {
    const zip = new AdmZip(socpakPath)
    const entries = zip.getEntries()

    // Find the main XML file (usually the one with .xml extension at root level)
    const xmlEntry = entries.find(
      (e) => e.entryName.endsWith(".xml") && !e.entryName.includes("/"),
    ) || entries.find((e) => e.entryName.endsWith(".xml"))

    if (!xmlEntry) {
      console.warn(`  [WARN] No XML file found in socpak: ${socpakPath}`)
      return null
    }

    const buf = xmlEntry.getData()

    // Check if it's CryXmlB (binary format)
    if (isCryXmlB(buf)) {
      if (!starbreaker) {
        console.warn(
          `  [WARN] CryXmlB detected in ${socpakPath} but no StarBreaker binary available for conversion`,
        )
        return null
      }

      // Write to temp file, convert with StarBreaker, read back
      const tmpIn = path.join(WORK_DIR, "_cryxml_in.bin")
      const tmpOut = path.join(WORK_DIR, "_cryxml_out.xml")
      fs.writeFileSync(tmpIn, buf)

      try {
        execSync(`"${starbreaker}" cryxml convert "${tmpIn}" "${tmpOut}"`, {
          stdio: "pipe",
        })
        const xml = fs.readFileSync(tmpOut, "utf-8")
        // Clean up temp files
        try {
          fs.unlinkSync(tmpIn)
        } catch {}
        try {
          fs.unlinkSync(tmpOut)
        } catch {}
        return xml
      } catch (err) {
        console.warn(
          `  [WARN] CryXml conversion failed for ${socpakPath}: ${err instanceof Error ? err.message : err}`,
        )
        // Clean up temp files on error
        try {
          fs.unlinkSync(tmpIn)
        } catch {}
        try {
          fs.unlinkSync(tmpOut)
        } catch {}
        return null
      }
    }

    return buf.toString("utf-8")
  } catch (err) {
    console.warn(
      `  [WARN] Failed to read socpak ${socpakPath}: ${err instanceof Error ? err.message : err}`,
    )
    return null
  }
}

/**
 * Parse the XML from a socpak file and recursively extract child container positions.
 *
 * @param xml          - The XML string from the socpak
 * @param parentAbsPos - Absolute position of the parent
 * @param parentAbsRot - Absolute rotation of the parent
 * @param parentName   - Entity name of the parent (for reference)
 * @param depth        - Current recursion depth (for logging)
 */
function parseChildContainers(
  xml: string,
  parentAbsPos: Vec3,
  parentAbsRot: Quaternion,
  parentName: string | null,
  depth: number,
): BodyNode[] {
  const $ = cheerio.load(xml, { xml: true })
  const bodies: BodyNode[] = []

  // Find the root element's direct ChildObjectContainers
  // The XML structure is: <ObjectContainer><ChildObjectContainers><Child .../></ChildObjectContainers></ObjectContainer>
  // We need only the top-level children, not deeply nested ones
  function parseElement(container: cheerio.Cheerio<any>): BodyNode[] {
    const result: BodyNode[] = []

    // Get direct <Child> elements from direct <ChildObjectContainers>
    container.children("ChildObjectContainers").each((_i, cocEl) => {
      $(cocEl)
        .children("Child")
        .each((_j, childEl) => {
          const $el = $(childEl)
          const entityName = $el.attr("entityName") || $el.attr("entityname") || ""
          const guid = $el.attr("guid") || null
          const starMapRecord =
            $el.attr("starMapRecord") || $el.attr("starmaprecord") || null
          const className = $el.attr("class") || null
          const socpakName = $el.attr("name") || null
          const posStr = $el.attr("pos")
          const rotStr = $el.attr("rot")

          const localPos = parsePos(posStr)
          const localRot = parseRot(rotStr)

          // Compute absolute position:
          // If parent has non-identity rotation, rotate the local offset first
          let absolutePos: Vec3
          if (isIdentityQuaternion(parentAbsRot)) {
            absolutePos = addVec3(parentAbsPos, localPos)
          } else {
            const rotatedOffset = rotateVec3(localPos, parentAbsRot)
            absolutePos = addVec3(parentAbsPos, rotatedOffset)
          }

          // Absolute rotation = parent rotation * local rotation
          const absoluteRot = isIdentityQuaternion(localRot)
            ? parentAbsRot
            : isIdentityQuaternion(parentAbsRot)
              ? localRot
              : multiplyQuat(parentAbsRot, localRot)

          const bodyType = inferType(entityName, socpakName)

          const node: BodyNode = {
            entityName,
            guid,
            starMapRecord,
            class: className,
            socpakPath: socpakName,
            localPosition: localPos,
            absolutePosition: absolutePos,
            rotation: localRot,
            type: bodyType,
            parent: parentName,
            children: [],
          }

          // Recurse into nested <ChildObjectContainers> within this <Child>
          const nestedChildren = parseChildContainersFromEl(
            $,
            $el,
            absolutePos,
            absoluteRot,
            entityName,
            depth + 1,
          )
          node.children = nestedChildren

          result.push(node)
        })
    })

    return result
  }

  // Start from the root - could be ObjectContainer or the document itself
  const root = $("ObjectContainer").first()
  if (root.length > 0) {
    bodies.push(...parseElement(root))
  } else {
    // Fallback: try the document root directly
    bodies.push(...parseElement($.root()))
  }

  return bodies
}

/**
 * Recursively parse child containers starting from a cheerio element.
 * This avoids re-parsing XML strings for nested elements.
 */
function parseChildContainersFromEl(
  $: cheerio.CheerioAPI,
  parentEl: cheerio.Cheerio<any>,
  parentAbsPos: Vec3,
  parentAbsRot: Quaternion,
  parentName: string | null,
  depth: number,
): BodyNode[] {
  const result: BodyNode[] = []

  parentEl.children("ChildObjectContainers").each((_i, cocEl) => {
    $(cocEl)
      .children("Child")
      .each((_j, childEl) => {
        const $el = $(childEl)
        const entityName = $el.attr("entityName") || $el.attr("entityname") || ""
        const guid = $el.attr("guid") || null
        const starMapRecord =
          $el.attr("starMapRecord") || $el.attr("starmaprecord") || null
        const className = $el.attr("class") || null
        const socpakName = $el.attr("name") || null
        const posStr = $el.attr("pos")
        const rotStr = $el.attr("rot")

        const localPos = parsePos(posStr)
        const localRot = parseRot(rotStr)

        // Compute absolute position
        let absolutePos: Vec3
        if (isIdentityQuaternion(parentAbsRot)) {
          absolutePos = addVec3(parentAbsPos, localPos)
        } else {
          const rotatedOffset = rotateVec3(localPos, parentAbsRot)
          absolutePos = addVec3(parentAbsPos, rotatedOffset)
        }

        // Absolute rotation = parent rotation * local rotation
        const absoluteRot = isIdentityQuaternion(localRot)
          ? parentAbsRot
          : isIdentityQuaternion(parentAbsRot)
            ? localRot
            : multiplyQuat(parentAbsRot, localRot)

        const bodyType = inferType(entityName, socpakName)

        const node: BodyNode = {
          entityName,
          guid,
          starMapRecord,
          class: className,
          socpakPath: socpakName,
          localPosition: localPos,
          absolutePosition: absolutePos,
          rotation: localRot,
          type: bodyType,
          parent: parentName,
          children: [],
        }

        // Recurse
        node.children = parseChildContainersFromEl(
          $,
          $el,
          absolutePos,
          absoluteRot,
          entityName,
          depth + 1,
        )

        result.push(node)
      })
  })

  return result
}

/**
 * Extract and parse a planet-level socpak for surface POIs.
 * These contain children positioned relative to the planet center.
 */
function extractPlanetPOIs(
  planetSocpakRelPath: string,
  planetAbsPos: Vec3,
  planetAbsRot: Quaternion,
  planetEntityName: string,
  extractDir: string,
): BodyNode[] {
  // Determine the full path of the planet socpak
  const socpakFullPath = path.join(extractDir, planetSocpakRelPath)

  if (!fs.existsSync(socpakFullPath)) {
    // The planet socpak may need to be extracted from p4k
    if (P4K_PATH && STARBREAKER_BIN) {
      console.log(`    Extracting planet socpak: ${planetSocpakRelPath}`)
      try {
        execSync(
          `SC_DATA_P4K="${P4K_PATH}" "${STARBREAKER_BIN}" p4k extract -o "${extractDir}" --filter '${planetSocpakRelPath}' --convert cryxml`,
          { stdio: "pipe" },
        )
      } catch (err) {
        console.warn(
          `    [WARN] Failed to extract ${planetSocpakRelPath}: ${err instanceof Error ? err.message : err}`,
        )
        return []
      }
    }

    if (!fs.existsSync(socpakFullPath)) {
      console.warn(`    [WARN] Planet socpak not found: ${socpakFullPath}`)
      return []
    }
  }

  const xml = extractXmlFromSocpak(socpakFullPath, STARBREAKER_BIN)
  if (!xml) return []

  const pois = parseChildContainers(xml, planetAbsPos, planetAbsRot, planetEntityName, 2)
  const poiCount = countBodies(pois)
  if (poiCount > 0) {
    console.log(`    Found ${poiCount} POIs in ${path.basename(planetSocpakRelPath)}`)
  }
  return pois
}

/** Count total bodies in a tree (recursive) */
function countBodies(bodies: BodyNode[]): number {
  let count = bodies.length
  for (const b of bodies) {
    count += countBodies(b.children)
  }
  return count
}

/** Flatten a body tree for summary stats */
function flattenBodies(bodies: BodyNode[]): BodyNode[] {
  const result: BodyNode[] = []
  for (const b of bodies) {
    result.push(b)
    result.push(...flattenBodies(b.children))
  }
  return result
}

// ---------------------------------------------------------------------------
// Main extraction pipeline
// ---------------------------------------------------------------------------

// Working directory for temp files
const WORK_DIR = SOCPAK_DIR || path.join(OUTPUT_DIR, "socpak_extract")
fs.mkdirSync(WORK_DIR, { recursive: true })
fs.mkdirSync(OUTPUT_DIR, { recursive: true })

console.log("=== Star Citizen Position Extractor ===\n")

// Step 1: Extract system-level socpak files from p4k
if (!SOCPAK_DIR && P4K_PATH && STARBREAKER_BIN) {
  console.log("Step 1: Listing system-level socpak files in Data.p4k...")

  // Known system socpak paths — discovered from p4k directory structure
  const KNOWN_SYSTEM_SOCPAKS = [
    "Data/ObjectContainers/PU/system/stanton/stantonsystem.socpak",
    "Data/ObjectContainers/PU/system/pyro/pyrosystem.socpak",
  ]
  const KNOWN_BODY_SOCPAKS = [
    "Data/ObjectContainers/PU/system/stanton/stanton1.socpak",
    "Data/ObjectContainers/PU/system/stanton/stanton2b.socpak",
    "Data/ObjectContainers/PU/system/stanton/stanton3.socpak",
    "Data/ObjectContainers/PU/system/stanton/stanton4.socpak",
    "Data/ObjectContainers/PU/system/stanton/stanton1a.socpak",
    "Data/ObjectContainers/PU/system/stanton/stanton1b.socpak",
    "Data/ObjectContainers/PU/system/stanton/stanton1c.socpak",
    "Data/ObjectContainers/PU/system/stanton/stanton1d.socpak",
    "Data/ObjectContainers/PU/system/stanton/stanton2a.socpak",
    "Data/ObjectContainers/PU/system/stanton/stanton2c.socpak",
    "Data/ObjectContainers/PU/system/stanton/stanton3a.socpak",
    "Data/ObjectContainers/PU/system/stanton/stanton3b.socpak",
    "Data/ObjectContainers/PU/system/stanton/stanton4a.socpak",
    "Data/ObjectContainers/PU/system/stanton/stanton4b.socpak",
    "Data/ObjectContainers/PU/system/stanton/stanton4c.socpak",
  ]

  // Extract all known socpaks from p4k
  const allPaths = [...KNOWN_SYSTEM_SOCPAKS, ...KNOWN_BODY_SOCPAKS]
  console.log(`  Extracting ${allPaths.length} socpak files from Data.p4k...`)
  for (const socPath of allPaths) {
    // StarBreaker uses backslash paths internally; convert forward slashes
    const filterPath = socPath.replace(/\//g, "\\")
    try {
      execSync(
        `SC_DATA_P4K="${P4K_PATH}" "${STARBREAKER_BIN}" p4k extract -o "${WORK_DIR}" --filter "${filterPath}"`,
        { encoding: "utf-8", stdio: "pipe" },
      )
    } catch {
      console.warn(`  [WARN] Could not extract: ${socPath}`)
    }
  }

  // List what we actually extracted
  let socpakList: string
  try {
    socpakList = execSync(
      `find "${WORK_DIR}" -name "*.socpak" -type f`,
      { encoding: "utf-8" },
    )
  } catch (err) {
    console.error(
      `Failed to list extracted socpak files: ${err instanceof Error ? err.message : err}`,
    )
    process.exit(1)
  }

  const allSocpaks = socpakList
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".socpak"))

  console.log(`  Found ${allSocpaks.length} socpak files total`)

  // Identify system-level socpaks (e.g., stantonsystem.socpak, pyrosystem.socpak)
  const systemSocpaks = allSocpaks.filter((p) => /system\.socpak$/i.test(p))
  console.log(`  System-level socpaks: ${systemSocpaks.length}`)
  for (const s of systemSocpaks) console.log(`    - ${s}`)

  // Also identify planet/moon socpaks for deep extraction
  // These are one level below the system directory (e.g., stanton/stanton1.socpak)
  const planetSocpaks = DEEP
    ? allSocpaks.filter((p) => {
        // Match: .../system/<system>/<name>.socpak but NOT <name>system.socpak
        const basename = path.basename(p)
        return !basename.endsWith("system.socpak") && !basename.startsWith(".")
      })
    : []

  if (DEEP) {
    console.log(`  Planet/moon socpaks to extract: ${planetSocpaks.length}`)
  }

  // Build the extraction filter: extract system socpaks + planet socpaks
  const toExtract = [...systemSocpaks]
  if (DEEP) toExtract.push(...planetSocpaks)

  if (systemSocpaks.length === 0) {
    console.error("No system-level socpak files found!")
    process.exit(1)
  }

  console.log(`\nStep 2: Extraction complete (${allSocpaks.length} files on disk).`)
} else if (SOCPAK_DIR) {
  console.log(`Step 1-2: Using pre-extracted socpak directory: ${SOCPAK_DIR}`)
} else {
  console.error("No extraction source specified")
  process.exit(1)
}

// Step 3: Discover system socpak files on disk
console.log("\nStep 3: Discovering system socpak files...")

function findSocpakFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results

  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name.startsWith("._")) continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (pattern.test(entry.name)) {
        results.push(full)
      }
    }
  }

  walk(dir)
  return results
}

const systemSocpakFiles = findSocpakFiles(WORK_DIR, /system\.socpak$/i)

if (systemSocpakFiles.length === 0) {
  console.error(`No system socpak files found in ${WORK_DIR}`)
  console.error("Expected files like stantonsystem.socpak, pyrosystem.socpak, etc.")
  process.exit(1)
}

console.log(`  Found ${systemSocpakFiles.length} system socpak(s):`)
for (const f of systemSocpakFiles) {
  console.log(`    - ${path.relative(WORK_DIR, f)}`)
}

// Step 4: Parse each system socpak
console.log("\nStep 4: Parsing system socpak files...\n")

const systems: SystemOutput[] = []

for (const socpakFile of systemSocpakFiles) {
  // Derive system name from filename (e.g., "stantonsystem.socpak" -> "Stanton")
  const basename = path.basename(socpakFile, ".socpak")
  const systemName = basename.replace(/system$/i, "")
  const displayName = systemName.charAt(0).toUpperCase() + systemName.slice(1)

  console.log(`--- Processing system: ${displayName} ---`)
  console.log(`  File: ${socpakFile}`)

  const xml = extractXmlFromSocpak(socpakFile, STARBREAKER_BIN)
  if (!xml) {
    console.warn(`  [WARN] Failed to extract XML from ${socpakFile}, skipping`)
    continue
  }

  console.log(`  XML size: ${(xml.length / 1024).toFixed(1)} KB`)

  // Parse the system-level children
  const origin: Vec3 = { x: 0, y: 0, z: 0 }
  const bodies = parseChildContainers(xml, origin, IDENTITY_QUAT, null, 0)

  console.log(`  Top-level bodies: ${bodies.length}`)

  // Step 5: Deep extraction - parse planet-level socpaks for surface POIs
  if (DEEP) {
    console.log("  Deep extraction: looking for planet/moon socpaks...")

    function deepExtractRecursive(nodes: BodyNode[], extractDir: string) {
      for (const node of nodes) {
        if (
          node.socpakPath &&
          (node.type === "planet" || node.type === "moon" || node.type === "star")
        ) {
          // Convert the socpak reference name to a filesystem path
          // The name attribute contains the relative path like
          //   "ObjectContainers/PU/system/stanton/stanton1"
          // The actual file would be at that path + ".socpak"
          let socpakRelPath = node.socpakPath
          if (!socpakRelPath.startsWith("Data/")) {
            socpakRelPath = "Data/" + socpakRelPath
          }
          if (!socpakRelPath.endsWith(".socpak")) {
            socpakRelPath = socpakRelPath + ".socpak"
          }

          const pois = extractPlanetPOIs(
            socpakRelPath,
            node.absolutePosition,
            node.rotation,
            node.entityName,
            extractDir,
          )

          if (pois.length > 0) {
            // Merge POIs as children of this node
            node.children.push(...pois)
          }
        }

        // Recurse into existing children (e.g., moons that are children of planets)
        if (node.children.length > 0) {
          deepExtractRecursive(node.children, extractDir)
        }
      }
    }

    deepExtractRecursive(bodies, WORK_DIR)
  }

  // Build summary
  const allBodies = flattenBodies(bodies)
  const typeCounts = new Map<string, number>()
  for (const b of allBodies) {
    typeCounts.set(b.type, (typeCounts.get(b.type) || 0) + 1)
  }

  console.log(`  Total bodies (including children): ${allBodies.length}`)
  for (const [type, count] of [...typeCounts.entries()].sort()) {
    console.log(`    ${type}: ${count}`)
  }

  // Log non-identity rotations for debugging
  const nonIdentityRotations = allBodies.filter((b) => !isIdentityQuaternion(b.rotation))
  if (nonIdentityRotations.length > 0) {
    console.log(
      `  Bodies with non-identity rotation: ${nonIdentityRotations.length}`,
    )
    for (const b of nonIdentityRotations.slice(0, 5)) {
      console.log(
        `    ${b.entityName}: rot=(${b.rotation.w.toFixed(4)}, ${b.rotation.x.toFixed(4)}, ${b.rotation.y.toFixed(4)}, ${b.rotation.z.toFixed(4)})`,
      )
    }
    if (nonIdentityRotations.length > 5) {
      console.log(`    ... and ${nonIdentityRotations.length - 5} more`)
    }
  }

  const socpakRelPath = path.relative(WORK_DIR, socpakFile)
  systems.push({
    name: displayName,
    socpakPath: socpakRelPath,
    bodies,
  })

  console.log()
}

// Step 6: Write output
console.log("Step 5: Writing output...")

const output: PositionsOutput = {
  extractedAt: new Date().toISOString(),
  systems,
}

const outputPath = path.join(OUTPUT_DIR, "positions.json")
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))

const fileSize = fs.statSync(outputPath).size
const totalBodies = systems.reduce((sum, s) => sum + countBodies(s.bodies), 0)

console.log(`\n=== Extraction Complete ===`)
console.log(`Output: ${outputPath} (${(fileSize / 1024).toFixed(1)} KB)`)
console.log(`Systems: ${systems.length}`)
console.log(`Total bodies: ${totalBodies}`)
for (const sys of systems) {
  const sysBodies = flattenBodies(sys.bodies)
  console.log(`  ${sys.name}: ${sysBodies.length} bodies`)
}
